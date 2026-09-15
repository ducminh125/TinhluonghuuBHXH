import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || '';
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseConfigured = Boolean(url && secret);
export const supabaseAdmin = supabaseConfigured
  ? createClient(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })
  : null;

function configuredAdminEmails() {
  return new Set(
    String(process.env.ADMIN_EMAILS || '')
      .split(/[;,\s]+/)
      .map(v => v.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return Boolean(normalized && configuredAdminEmails().has(normalized));
}

export function publicSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''
  };
}

export function normalizeDatabaseError(error) {
  const message = String(error?.message || error || '');
  const code = String(error?.code || '');
  const missing = code === '42P01' || code === 'PGRST205' || code === 'PGRST202' ||
    /schema cache|could not find the table|could not find the function|relation .* does not exist/i.test(message);
  if (!missing) return error;
  const e = new Error('Cơ sở dữ liệu của ứng dụng chưa được cài đặt đầy đủ. Hãy kiểm tra migration v3.1.2 trong Supabase; bản v3.2 có thể chạy tương thích mà không bắt buộc migration bổ sung.');
  e.code = 'DATABASE_SETUP_REQUIRED';
  e.status = 503;
  e.original = error;
  return e;
}

async function singleOrThrow(query) {
  const { data, error } = await query;
  if (error) throw normalizeDatabaseError(error);
  return data;
}

export async function getProfile(userId) {
  if (!supabaseAdmin) return null;
  return singleOrThrow(supabaseAdmin.from('profiles').select('*').eq('user_id', userId).maybeSingle());
}

export async function getWallet(userId) {
  if (!supabaseAdmin) return null;
  return singleOrThrow(supabaseAdmin.from('wallets').select('*').eq('user_id', userId).maybeSingle());
}

export async function ensureUserAccount(user) {
  if (!supabaseAdmin || !user?.id) return { profile: null, wallet: null };
  let profile = await getProfile(user.id);
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || null;
  const shouldBeAdmin = isAdminEmail(user.email);

  if (!profile) {
    const { error } = await supabaseAdmin.from('profiles').upsert({
      user_id: user.id,
      display_name: displayName,
      role: shouldBeAdmin ? 'admin' : 'user',
      status: 'active'
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) throw normalizeDatabaseError(error);
    profile = await getProfile(user.id);
  } else if (shouldBeAdmin && profile.role !== 'admin') {
    profile = await singleOrThrow(
      supabaseAdmin.from('profiles').update({ role: 'admin', updated_at: new Date().toISOString() })
        .eq('user_id', user.id).select('*').single()
    );
  }

  let wallet = await getWallet(user.id);
  if (!wallet) {
    const { error } = await supabaseAdmin.from('wallets').upsert({
      user_id: user.id,
      direct_credits: 3,
      file_credits: 0,
      history_credits: 3
    }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) throw normalizeDatabaseError(error);
    wallet = await getWallet(user.id);
  }
  return { profile, wallet };
}

export async function databaseStatus() {
  if (!supabaseAdmin) return { configured: false, ready: false, missing: ['Supabase environment'] };
  const tables = ['profiles','wallets','plans','orders','usage_events','calculation_history','import_jobs','admin_audit_logs'];
  const missing = [];
  for (const table of tables) {
    const { error } = await supabaseAdmin.from(table).select('*', { head: true, count: 'exact' }).limit(1);
    if (error && normalizeDatabaseError(error)?.code === 'DATABASE_SETUP_REQUIRED') missing.push(table);
    else if (error) missing.push(`${table} (${error.code || 'error'})`);
  }
  return { configured: true, ready: missing.length === 0, missing, schemaVersion: missing.length ? null : '3.1.2-compatible' };
}

export async function requireUser(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ code: 'AUTH_NOT_CONFIGURED', error: 'Hệ thống tài khoản chưa được cấu hình.' });
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  try {
    const { profile, wallet } = await ensureUserAccount(data.user);
    if (profile?.status === 'suspended') return res.status(403).json({ error: 'Tài khoản đang tạm khóa. Vui lòng liên hệ quản trị viên.' });
    req.user = data.user;
    req.profile = profile || { user_id: data.user.id, role: 'user', status: 'active' };
    req.wallet = wallet || null;
    next();
  } catch (err) {
    const e = normalizeDatabaseError(err);
    return res.status(e.status || 500).json({ code: e.code || 'ACCOUNT_LOAD_FAILED', error: e.message || 'Không tải được tài khoản.' });
  }
}

export async function requireAdmin(req, res, next) {
  await requireUser(req, res, async () => {
    if (req.profile?.role !== 'admin') return res.status(403).json({
      code: 'ADMIN_REQUIRED',
      error: 'Tài khoản này chưa có quyền quản trị. Hãy thêm email của bạn vào biến ADMIN_EMAILS trên Vercel rồi đăng nhập lại.'
    });
    next();
  });
}

export async function consumeCredit(userId, bucket, action, metadata = {}) {
  const { data, error } = await supabaseAdmin.rpc('consume_credit', {
    p_user_id: userId,
    p_bucket: bucket,
    p_action: action,
    p_metadata: metadata
  });
  if (error) {
    const normalized = normalizeDatabaseError(error);
    if (normalized?.code === 'DATABASE_SETUP_REQUIRED') throw normalized;
    if (/NO_CREDIT/i.test(error.message || '')) {
      const e = new Error('Không còn lượt sử dụng phù hợp. Vui lòng mua thêm gói.');
      e.code = 'NO_CREDIT';
      throw e;
    }
    throw error;
  }
  return Array.isArray(data) ? data[0] : data;
}


export async function consumeImportCredit(userId, jobId, sourceCount = 1) {
  const { data, error } = await supabaseAdmin.rpc('consume_import_credit_once', {
    p_user_id: userId,
    p_job_id: jobId,
    p_source_count: Math.max(1, Number(sourceCount || 1))
  });
  if (!error) return Array.isArray(data) ? data[0] : data;

  // v3.2 hardening migration is optional. Fall back to the existing v3.1 credit RPC.
  const normalized = normalizeDatabaseError(error);
  const missingNewRpc = normalized?.code === 'DATABASE_SETUP_REQUIRED' || error?.code === 'PGRST202' || /consume_import_credit_once/i.test(error?.message || '');
  if (missingNewRpc) {
    return consumeCredit(userId, 'file', 'file_import_started', {
      jobId, sourceCount: Math.max(1, Number(sourceCount || 1)), compatibilityMode: 'v3.1'
    });
  }
  if (/NO_CREDIT/i.test(error.message || '')) {
    const e = new Error('Không còn lượt đọc hồ sơ. Vui lòng mua thêm gói.');
    e.code = 'NO_CREDIT';
    throw e;
  }
  throw error;
}

export async function refundImportCreditOnce(userId, jobId, reason = 'import_failed') {
  const { data, error } = await supabaseAdmin.rpc('refund_import_credit_once', {
    p_user_id: userId,
    p_job_id: jobId,
    p_reason: String(reason || 'import_failed').slice(0, 500)
  });
  if (!error) return data || { refunded: false, outcome: 'unknown', wallet: null };

  // Compatibility fallback for existing v3.1 databases: one request can enter this branch only once.
  const normalized = normalizeDatabaseError(error);
  const missingNewRpc = normalized?.code === 'DATABASE_SETUP_REQUIRED' || error?.code === 'PGRST202' || /refund_import_credit_once/i.test(error?.message || '');
  if (missingNewRpc) {
    const wallet = await refundCredit(userId, 'file', 'file_import_refund', {
      jobId, reason: String(reason || 'import_failed').slice(0, 500), compatibilityMode: 'v3.1'
    });
    return { refunded: true, outcome: 'legacy_refund', wallet };
  }
  throw error;
}

export async function refundCredit(userId, bucket, action, metadata = {}) {
  const { data, error } = await supabaseAdmin.rpc('refund_credit', {
    p_user_id: userId,
    p_bucket: bucket,
    p_action: action,
    p_metadata: metadata
  });
  if (error) throw normalizeDatabaseError(error);
  return Array.isArray(data) ? data[0] : data;
}
