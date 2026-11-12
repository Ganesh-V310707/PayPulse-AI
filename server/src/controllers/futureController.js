const future = require('../services/futureService');

async function getGuardrails(_req, res, next) {
  try {
    res.json({ policy: await future.getGuardrails() });
  } catch (e) { next(e); }
}

async function putGuardrails(req, res, next) {
  try {
    res.json({ policy: await future.updateGuardrails(req.body || {}) });
  } catch (e) { next(e); }
}

async function evaluateGuardrails(req, res, next) {
  try {
    res.json(await future.evaluateGuardrails(req.body || {}));
  } catch (e) { next(e); }
}

async function listEscrows(_req, res, next) {
  try {
    const items = await future.listEscrows();
    res.json({ items, count: items.length });
  } catch (e) { next(e); }
}

async function createEscrow(req, res, next) {
  try {
    const escrow = await future.createEscrow(req.body || {});
    res.status(201).json({ escrow });
  } catch (e) { next(e); }
}

async function advanceEscrow(req, res, next) {
  try {
    const escrow = await future.advanceEscrow(req.params.id, req.params.action || req.body?.action, req.body || {});
    res.json({ escrow });
  } catch (e) { next(e); }
}

function fxSplit(req, res, next) {
  try {
    res.json(future.calculateFxSplit(req.body || {}));
  } catch (e) { next(e); }
}

async function riskScore(req, res, next) {
  try {
    res.json(await future.scoreRiskAndProtection(req.body || {}));
  } catch (e) { next(e); }
}

async function reconcileBatch(req, res, next) {
  try {
    res.json(await future.batchReconcileSandboxOrders(req));
  } catch (e) { next(e); }
}

module.exports = {
  getGuardrails,
  putGuardrails,
  evaluateGuardrails,
  listEscrows,
  createEscrow,
  advanceEscrow,
  fxSplit,
  riskScore,
  reconcileBatch
};
