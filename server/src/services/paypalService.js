const crypto = require('node:crypto');
const env = require('../config/env');

let cachedToken = null;
let tokenExpiresAt = 0;

class PayPalApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'PayPalApiError';
    this.status = status || 502;
    this.details = details;
  }
}

function ensurePayPalConfigured() {
  if (!env.paypalConfigured) {
    const error = new Error('PayPal Sandbox credentials are not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to server/.env.');
    error.status = 503;
    throw error;
  }
}

async function getAccessToken(forceRefresh = false) {
  ensurePayPalConfigured();
  if (!forceRefresh && cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken;

  const auth = Buffer.from(`${env.paypalClientId}:${env.paypalClientSecret}`).toString('base64');
  const response = await fetch(`${env.paypalBaseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PayPalApiError(data.error_description || data.message || 'PayPal OAuth request failed.', response.status, data);
  }
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in) || 300) * 1000;
  return cachedToken;
}

async function paypalRequest(path, options = {}, retryAuth = true) {
  const token = await getAccessToken();
  const response = await fetch(`${env.paypalBaseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(20000)
  });
  if (response.status === 401 && retryAuth) {
    await getAccessToken(true);
    return paypalRequest(path, options, false);
  }
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const issue = data.details?.[0]?.description || data.details?.[0]?.issue || data.message || data.name || 'PayPal API request failed.';
    throw new PayPalApiError(issue, response.status, data);
  }
  return data;
}

function createRequestId(prefix = 'pp') {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 30)}`.slice(0, 38);
}

function stableCaptureRequestId(orderId) {
  const safe = String(orderId).replace(/[^a-zA-Z0-9]/g, '').slice(-28);
  return `cap_${safe}`.slice(0, 38);
}

function extractApproveUrl(order) {
  const links = Array.isArray(order?.links) ? order.links : [];
  return links.find((l) => l.rel === 'approve')?.href
    || links.find((l) => l.rel === 'payer-action')?.href
    || null;
}

async function createOrder({ amount, currency, description, merchantReference }) {
  const clientBase = String(env.clientUrl || 'http://localhost:5173').replace(/\/+$/, '');
  return paypalRequest('/v2/checkout/orders', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': createRequestId('ord') },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: merchantReference,
        custom_id: merchantReference,
        description: String(description || 'PayPulse Sandbox checkout').slice(0, 127),
        amount: { currency_code: currency, value: Number(amount).toFixed(2) }
      }],
      application_context: {
        brand_name: 'PayPulse AI Demo',
        landing_page: 'LOGIN',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        return_url: `${clientBase}/?paypal=approved`,
        cancel_url: `${clientBase}/?paypal=cancelled`
      }
    })
  });
}

async function captureOrder(orderId, requestId = stableCaptureRequestId(orderId)) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: { 'PayPal-Request-Id': requestId },
    body: JSON.stringify({})
  });
}

async function getOrder(orderId) {
  return paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
}

async function verifyWebhook(headers, event) {
  if (!env.paypalWebhookId) {
    const error = new Error('PAYPAL_WEBHOOK_ID is not configured. Add the webhook ID from your PayPal app settings before accepting live webhook events.');
    error.status = 503;
    throw error;
  }
  const payload = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: env.paypalWebhookId,
    webhook_event: event
  };
  const result = await paypalRequest('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return result.verification_status === 'SUCCESS';
}

module.exports = {
  PayPalApiError,
  ensurePayPalConfigured,
  getAccessToken,
  createOrder,
  captureOrder,
  getOrder,
  verifyWebhook,
  createRequestId,
  stableCaptureRequestId,
  extractApproveUrl
};
