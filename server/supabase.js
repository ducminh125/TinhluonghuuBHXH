import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || '';
const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseConfigured = Boolean(url && secret);
export const supabaseAdmin = supabaseConfigured
  ? createClient(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })
  : null;

export function publicSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''
  };
}

export async function getProfile(userId) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getWallet(userId) {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.from('wallets').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function requireUser(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ error: 'Hệ thống tài khoản chưa được cấu hình.' });
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
  const profile = await getProfile(data.user.id);
  if (profile?.status === 'suspended') return res.status(403).json({ error: 'Tài khoản đang tạm khóa. Vui lòng liên hệ quản trị viên.' });
  req.user = data.user;
  req.profile = profile || { user_id: data.user.id, role: 'user', status: 'active' };
  next();
}

export async function requireAdmin(req, res, next) {
  await requireUser(req, res, async () => {
    if (req.profile?.role !== 'admin') return res.status(403).json({ error: 'Chỉ quản trị viên được phép truy cập.' });
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
    if (/NO_CREDIT/i.test(error.message || '')) {
      const e = new Error('Không còn lượt sử dụng phù hợp. Vui lòng mua thêm gói.');
      e.code = 'NO_CREDIT';
      throw e;
    }
    throw error;
  }
  return Array.isArray(data) ? data[0] : data;
}

export async function refundCredit(userId, bucket, action, metadata = {}) {
  const { data, error } = await supabaseAdmin.rpc('refund_credit', {
    p_user_id: userId,
    p_bucket: bucket,
    p_action: action,
    p_metadata: metadata
  });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}
