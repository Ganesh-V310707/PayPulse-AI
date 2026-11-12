const test = require('node:test');
const assert = require('node:assert/strict');
const {
  statusFromOrder,
  captureFromOrder,
  statusFromWebhook,
  shouldApplyWebhookStatus,
  makePayPalRequestId
} = require('../src/services/paymentState');

 test('completed capture is the strongest order state', () => {
  const order = {
    status: 'APPROVED',
    purchase_units: [{ payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED' }] } }]
  };
  assert.equal(statusFromOrder(order), 'COMPLETED');
  assert.equal(captureFromOrder(order).id, 'CAP-1');
});

test('pending and denied captures map to explicit non-success states', () => {
  assert.equal(statusFromOrder({ purchase_units: [{ payments: { captures: [{ status: 'PENDING' }] } }] }), 'PENDING');
  assert.equal(statusFromOrder({ purchase_units: [{ payments: { captures: [{ status: 'DENIED' }] } }] }), 'DENIED');
});

test('approved order without captures remains approved', () => {
  assert.equal(statusFromOrder({ status: 'APPROVED', purchase_units: [] }), 'APPROVED');
});

test('unknown provider state is not treated as completed', () => {
  assert.equal(statusFromOrder({ status: 'CREATED', purchase_units: [] }), 'UNKNOWN');
});

test('webhook event types map to expected payment states', () => {
  assert.equal(statusFromWebhook('PAYMENT.CAPTURE.COMPLETED'), 'COMPLETED');
  assert.equal(statusFromWebhook('PAYMENT.CAPTURE.PENDING'), 'PENDING');
  assert.equal(statusFromWebhook('PAYMENT.CAPTURE.DENIED'), 'DENIED');
  assert.equal(statusFromWebhook('SOME.UNKNOWN.EVENT'), null);
});

test('capture request ID is deterministic and bounded for safe retries', () => {
  const first = makePayPalRequestId('cap', 'ORDER-123456');
  const second = makePayPalRequestId('cap', 'ORDER-123456');
  assert.equal(first, second);
  assert.ok(first.length <= 38);
});

test('stale or reordered webhooks cannot regress completed or refunded payments', () => {
  assert.equal(shouldApplyWebhookStatus('COMPLETED','APPROVED'),false);
  assert.equal(shouldApplyWebhookStatus('COMPLETED','PENDING'),false);
  assert.equal(shouldApplyWebhookStatus('COMPLETED','DENIED'),false);
  assert.equal(shouldApplyWebhookStatus('COMPLETED','REFUNDED'),true);
  assert.equal(shouldApplyWebhookStatus('REFUNDED','COMPLETED'),false);
});
