import crypto from 'node:crypto';

const API_BASE = process.env.PAYOS_API_BASE || 'https://api-merchant.payos.vn';

export const payosConfigured = Boolean(
  process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY && process.env.PAYOS_CHECKSUM_KEY
);

function hmac(value) {
  return crypto.createHmac('sha256', process.env.PAYOS_CHECKSUM_KEY || '').update(value).digest('hex');
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
    'x-client-id': process.env.PAYOS_CLIENT_ID || '',
    'x-api-key': process.env.PAYOS_API_KEY || ''
  };
}

async function payosFetch(path, options = {}) {
  if (!payosConfigured) {
    const e = new Error('payOS chưa được cấu hình. Hãy thêm PAYOS_CLIENT_ID, PAYOS_API_KEY và PAYOS_CHECKSUM_KEY trên Vercel.');
    e.code = 'PAYOS_NOT_CONFIGURED';
    e.status = 503;
    throw e;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...requestHeaders(), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.code && payload.code !== '00') {
    const e = new Error(payload?.desc || payload?.message || `payOS HTTP ${response.status}`);
    e.code = payload?.code || 'PAYOS_API_ERROR';
    e.status = response.status || 502;
    e.payload = payload;
    throw e;
  }
  return payload;
}

export function buildPaymentDescription(orderCode) {
  // payOS may limit description to 9 chars when the bank account is not linked through payOS.
  return `LH${String(orderCode).slice(-7)}`;
}

export async function createPayosPayment({ orderCode, amount, description, returnUrl, cancelUrl, buyerEmail, itemName, expiredAt }) {
  const body = {
    orderCode: Number(orderCode),
    amount: Number(amount),
    description,
    buyerEmail: buyerEmail || undefined,
    items: [{ name: String(itemName || 'Goi luong huu').slice(0, 120), quantity: 1, price: Number(amount) }],
    cancelUrl,
    returnUrl,
    expiredAt: Number(expiredAt),
  };
  body.signature = hmac(sortedDataString({
    amount: body.amount,
    cancelUrl: body.cancelUrl,
    description: body.description,
    orderCode: body.orderCode,
    returnUrl: body.returnUrl
  }));
  const payload = await payosFetch('/v2/payment-requests', { method: 'POST', body: JSON.stringify(body) });
  return payload.data;
}

export async function getPayosPayment(id) {
  const payload = await payosFetch(`/v2/payment-requests/${encodeURIComponent(id)}`, { method: 'GET' });
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
