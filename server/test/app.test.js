const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');

const app = createApp();

test('health endpoint reports service status without exposing credentials', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.service, 'paypulse-api');
  assert.ok(response.body.integrations);
  assert.equal(Object.hasOwn(response.body, 'paypalClientSecret'), false);
});

test('public configuration never returns the PayPal client secret', async () => {
  const response = await request(app).get('/api/config/public').expect(200);
  assert.equal(Object.hasOwn(response.body, 'paypalClientSecret'), false);
  assert.equal(Object.hasOwn(response.body, 'geminiApiKey'), false);
});

test('unknown routes return a JSON 404 response', async () => {
  const response = await request(app).get('/api/does-not-exist').expect(404);
  assert.equal(response.body.error, 'NOT_FOUND');
});
