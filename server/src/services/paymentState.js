function statusFromOrder(order) {
  const captures = order?.purchase_units?.flatMap((unit) => unit.payments?.captures || []) || [];
  if (captures.some((capture) => capture.status === 'COMPLETED')) return 'COMPLETED';
  if (captures.some((capture) => capture.status === 'PENDING')) return 'PENDING';
  if (captures.some((capture) => capture.status === 'DENIED')) return 'DENIED';
  if (order?.status === 'APPROVED') return 'APPROVED';
  if (order?.status === 'COMPLETED') return 'COMPLETED';
  if (order?.status === 'VOIDED') return 'FAILED';
  return 'UNKNOWN';
}

function captureFromOrder(order) {
  return order?.purchase_units?.flatMap((unit) => unit.payments?.captures || [])?.[0] || null;
}

function statusFromWebhook(eventType) {
  const map = {
    'CHECKOUT.ORDER.APPROVED': 'APPROVED',
    'PAYMENT.CAPTURE.PENDING': 'PENDING',
    'PAYMENT.CAPTURE.COMPLETED': 'COMPLETED',
    'PAYMENT.CAPTURE.DENIED': 'DENIED',
    'PAYMENT.CAPTURE.REFUNDED': 'REFUNDED',
    'PAYMENT.CAPTURE.REVERSED': 'REFUNDED'
  };
  return map[eventType] || null;
}

function shouldApplyWebhookStatus(current, incoming) {
  if (!incoming) return false;
  if (current === 'REFUNDED' && incoming !== 'REFUNDED') return false;
  if (current === 'COMPLETED' && !['COMPLETED', 'REFUNDED'].includes(incoming)) return false;
  if (['DENIED', 'FAILED'].includes(current) && ['CREATED', 'APPROVED'].includes(incoming)) return false;
  return true;
}

function severityForStatus(status) {
  if (status === 'DENIED' || status === 'FAILED') return 'HIGH';
  if (status === 'PENDING') return 'MEDIUM';
  if (status === 'REFUNDED') return 'LOW';
  return 'LOW';
}

function makePayPalRequestId(prefix, identifier) {
  const safe = String(identifier).replace(/[^a-zA-Z0-9]/g, '').slice(-28);
  return `${prefix}_${safe}`.slice(0, 38);
}

module.exports = { statusFromOrder, captureFromOrder, statusFromWebhook, shouldApplyWebhookStatus, severityForStatus, makePayPalRequestId };
