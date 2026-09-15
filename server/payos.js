import crypto from 'node:crypto';

const DEFAULT_API_BASE = 'https://api-merchant.payos.vn';
const API_BASE = String(process.env.PAYOS_API_BASE || DEFAULT_API_BASE).trim().replace(/\/$/, '');
const CLIENT_ID = String(process.env.PAYOS_CLIENT_ID || '').trim();
const API_KEY = String(process.env.PAYOS_API_KEY || '').trim();
const CHECKSUM_KEY = String(process.env.PAYOS_CHECKSUM_KEY || '').trim();
const REQUEST_TIMEOUT_MS = Math.max(3000, Math.min(30000, Number(process.env.PAYOS_TIMEOUT_MS || 12000)));

export const payosConfigured = Boolean(CLIENT_ID && API_KEY && CHECKSUM_KEY);


export function buildVietQrImageUrl({ bin, accountNumber, amount, description, accountName, template = 'compact' } = {}) {
  const bankId = String(bin || '').trim();
  const account = String(accountNumber || '').trim();
  const value = Math.trunc(Number(amount || 0));
  if (!bankId || !account || !Number.isInteger(value) || value <= 0) return '';
  const safeTemplate = ['compact','compact2','qr_only','print'].includes(String(template)) ? String(template) : 'compact';
  const base = `https://img.vietqr.io/image/${encodeURIComponent(bankId)}-${encodeURIComponent(account)}-${safeTemplate}.png`;
  const params = new URLSearchParams({ amount: String(value) });
  const addInfo = String(description || '').trim();
  const name = String(accountName || '').trim();
  if (addInfo) params.set('addInfo', addInfo);
  if (name) params.set('accountName', name);
  return `${base}?${params.toString()}`;
}

function hmac(value) {
  return crypto.createHmac('sha256', CHECKSUM_KEY).update(value).digest('hex');
}

function signatureValue(value) {
  if (value === null || value === undefined || value === 'null' || value === 'undefined') return '';
  if (Array.isArray(value)) {
    const normalized = value.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      return Object.keys(item).sort().reduce((acc, key) => { acc[key] = item[key]; return acc; }, {});
    });
    return JSON.stringify(normalized);
  }
  if (typeof value === 'object') {
    const normalized = Object.keys(value).sort().reduce((acc, key) => { acc[key] = value[key]; return acc; }, {});
    return JSON.stringify(normalized);
  }
  return String(value);
}

function sortedDataString(data = {}) {
  return Object.keys(data).sort().map(key => `${key}=${signatureValue(data[key])}`).join('&');
}

function requestHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-client-id': CLIENT_ID,
    'x-api-key': API_KEY
  };
}

function parseMaybeJson(text) {
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 1000) }; }
}

function classifyPayosFailure(response, payload) {
  const providerCode = String(payload?.code || '').trim();
  const providerMessage = String(payload?.desc || payload?.message || '').trim();
  let code = providerCode || `PAYOS_HTTP_${response.status}`;
  let message = providerMessage || `payOS HTTP ${response.status}`;

  if (response.status === 401) {
    code = 'PAYOS_AUTH_FAILED';
    message = 'payOS từ chối thông tin kết nối. Hãy kiểm tra Client ID, API Key và Checksum Key có cùng thuộc một kênh thanh toán hay không.';
  } else if (response.status === 429) {
    code = 'PAYOS_RATE_LIMIT';
    message = 'payOS đang giới hạn tần suất yêu cầu. Vui lòng thử lại sau ít phút.';
  } else if (/signature|chữ ký|checksum/i.test(providerMessage)) {
    code = 'PAYOS_SIGNATURE_REJECTED';
    message = 'payOS báo chữ ký tạo đơn không hợp lệ. Hãy kiểm tra Checksum Key của đúng kênh thanh toán.';
  } else if (/order.?code|mã đơn/i.test(providerMessage) && /exist|tồn tại|duplicate|trùng/i.test(providerMessage)) {
    code = 'PAYOS_ORDER_CODE_DUPLICATE';
    message = 'Mã đơn thanh toán đã tồn tại trên payOS. Hệ thống sẽ tạo mã mới khi bạn thử lại.';
  }

  const error = new Error(message);
  error.code = code;
  error.status = response.status >= 500 ? 502 : (response.status || 400);
  error.providerStatus = response.status;
  error.providerCode = providerCode || null;
  error.providerMessage = providerMessage || null;
  return error;
}

async function payosFetch(path, options = {}) {
  if (!payosConfigured) {
    const e = new Error('payOS chưa được cấu hình. Hãy thêm PAYOS_CLIENT_ID, PAYOS_API_KEY và PAYOS_CHECKSUM_KEY trên Vercel rồi Redeploy.');
    e.code = 'PAYOS_NOT_CONFIGURED';
    e.status = 503;
    throw e;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: options.signal || controller.signal,
      headers: { ...requestHeaders(), ...(options.headers || {}) }
    });
    const text = await response.text();
    const payload = parseMaybeJson(text);
    if (!response.ok || (payload?.code && payload.code !== '00')) {
      throw classifyPayosFailure(response, payload);
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const e = new Error(`payOS không phản hồi trong ${Math.round(REQUEST_TIMEOUT_MS / 1000)} giây. Vui lòng thử lại.`);
      e.code = 'PAYOS_TIMEOUT';
      e.status = 504;
      throw e;
    }
    if (error?.code) throw error;
    const e = new Error('Không kết nối được tới payOS. Hãy kiểm tra kết nối Internet của Vercel và thử lại.');
    e.code = 'PAYOS_NETWORK_ERROR';
    e.status = 502;
    e.cause = error;
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function buildPaymentDescription(orderCode) {
  // payOS documents a 9-character limit when the receiving account is not linked through payOS.
  const digits = String(Math.trunc(Number(orderCode) || 0)).replace(/\D/g, '');
  return `LH${digits.slice(-7).padStart(7, '0')}`;
}

export function createPaymentRequestSignature({ amount, cancelUrl, description, orderCode, returnUrl }) {
  return hmac(sortedDataString({
    amount: Number(amount),
    cancelUrl: String(cancelUrl),
    description: String(description),
    orderCode: Number(orderCode),
    returnUrl: String(returnUrl)
  }));
}

export function getPayosDiagnostics() {
  return {
    configured: payosConfigured,
    apiBase: API_BASE,
    timeoutMs: REQUEST_TIMEOUT_MS,
    clientIdPresent: Boolean(CLIENT_ID),
    apiKeyPresent: Boolean(API_KEY),
    checksumKeyPresent: Boolean(CHECKSUM_KEY)
  };
}

export async function createPayosPayment({ orderCode, amount, description, returnUrl, cancelUrl, expiredAt }) {
  const parsedOrderCode = Number(orderCode);
  const parsedAmount = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(parsedOrderCode) || parsedOrderCode <= 0) {
    const e = new Error('Mã đơn thanh toán không hợp lệ.');
    e.code = 'PAYOS_INVALID_ORDER_CODE'; e.status = 400; throw e;
  }
  if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
    const e = new Error('Số tiền thanh toán không hợp lệ.');
    e.code = 'PAYOS_INVALID_AMOUNT'; e.status = 400; throw e;
  }
  for (const [name, value] of [['returnUrl', returnUrl], ['cancelUrl', cancelUrl]]) {
    try {
      const u = new URL(String(value));
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocol');
    } catch {
      const e = new Error(`${name} gửi sang payOS không hợp lệ. Hãy kiểm tra APP_URL trên Vercel.`);
      e.code = 'PAYOS_INVALID_RETURN_URL'; e.status = 500; throw e;
    }
  }

  // Keep the request minimal: only fields required by payOS plus expiry.
  // Optional buyer/items fields are deliberately omitted to reduce validation failures.
  const body = {
    orderCode: parsedOrderCode,
    amount: parsedAmount,
    description: String(description || '').slice(0, 9),
    cancelUrl: String(cancelUrl),
    returnUrl: String(returnUrl)
  };
  if (Number.isInteger(Number(expiredAt)) && Number(expiredAt) > 0) body.expiredAt = Number(expiredAt);
  body.signature = createPaymentRequestSignature(body);

  const payload = await payosFetch('/v2/payment-requests', { method: 'POST', body: JSON.stringify(body) });
  if (!payload?.data?.qrCode || !payload?.data?.checkoutUrl) {
    const e = new Error('payOS đã phản hồi nhưng chưa trả về QR/link thanh toán. Vui lòng kiểm tra kênh thanh toán payOS.');
    e.code = 'PAYOS_INCOMPLETE_RESPONSE'; e.status = 502; throw e;
  }
  return payload.data;
}

export async function getPayosPayment(id) {
  const payload = await payosFetch(`/v2/payment-requests/${encodeURIComponent(id)}`, { method: 'GET' });
  return payload.data;
}

export async function cancelPayosPayment(id, cancellationReason = 'Admin cancelled') {
  const payload = await payosFetch(`/v2/payment-requests/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancellationReason: String(cancellationReason || 'Admin cancelled').slice(0, 255) })
  });
  return payload.data;
}

export function verifyPayosWebhook(payload) {
  if (!payosConfigured) throw Object.assign(new Error('payOS chưa được cấu hình.'), { code: 'PAYOS_NOT_CONFIGURED' });
  const data = payload?.data || {};
  const signature = String(payload?.signature || '');
  if (!signature) throw Object.assign(new Error('Webhook payOS thiếu chữ ký.'), { code: 'PAYOS_SIGNATURE_MISSING' });
  const expected = hmac(sortedDataString(data));
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw Object.assign(new Error('Chữ ký webhook payOS không hợp lệ.'), { code: 'PAYOS_SIGNATURE_INVALID' });
  }
  return data;
}

export async function confirmPayosWebhook(webhookUrl) {
  const payload = await payosFetch('/confirm-webhook', {
    method: 'POST',
    body: JSON.stringify({ webhookUrl })
  });
  return payload.data;
}
