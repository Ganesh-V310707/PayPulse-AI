const lifeOs = require('../services/lifeOsService');

async function status(_req, res, next) {
  try {
    res.json(lifeOs.getLifeOsStatus());
  } catch (e) { next(e); }
}

async function listGoals(_req, res, next) {
  try {
    const items = await lifeOs.listGoals();
    res.json({ items, count: items.length });
  } catch (e) { next(e); }
}

async function getGoal(req, res, next) {
  try {
    res.json({ goal: await lifeOs.getGoal(req.params.id) });
  } catch (e) { next(e); }
}

async function createGoal(req, res, next) {
  try {
    const goal = await lifeOs.createGoal(req.body || {}, req.lifeRole);
    res.status(201).json({ goal });
  } catch (e) { next(e); }
}

async function seedRestaurantDemo(req, res, next) {
  try {
    const goal = await lifeOs.seedRestaurantDemo(req.lifeRole);
    res.status(201).json({ goal });
  } catch (e) { next(e); }
}

async function updateMilestoneStatus(req, res, next) {
  try {
    const goal = await lifeOs.updateMilestoneStatus(req.params.id, req.params.code, req.body?.status, req.lifeRole);
    res.json({ goal });
  } catch (e) { next(e); }
}

async function sourceMilestone(req, res, next) {
  try {
    res.json(await lifeOs.runSourcingAgent(req.params.id, req.params.code, req.lifeRole));
  } catch (e) { next(e); }
}

async function selectQuote(req, res, next) {
  try {
    const goal = await lifeOs.selectQuote(req.params.id, req.params.quoteId, req.lifeRole);
    res.json({ goal });
  } catch (e) { next(e); }
}

async function negotiateQuote(req, res, next) {
  try {
    res.json(await lifeOs.runNegotiationAgent(req.params.id, req.params.quoteId, req.lifeRole));
  } catch (e) { next(e); }
}

async function requestApproval(req, res, next) {
  try {
    res.status(201).json(await lifeOs.requestApproval(req.params.id, req.body || {}, req.lifeRole));
  } catch (e) { next(e); }
}

async function decideApproval(req, res, next) {
  try {
    const goal = await lifeOs.decideApproval(req.params.id, req.params.approvalId, req.body || {}, req.lifeRole);
    res.json({ goal });
  } catch (e) { next(e); }
}

async function monitorGoal(req, res, next) {
  try {
    res.json(await lifeOs.runExecutionMonitor(req.params.id, req.lifeRole));
  } catch (e) { next(e); }
}

async function preparePayment(req, res, next) {
  try {
    res.json(await lifeOs.preparePayPalPayment(req.params.id, req.body?.approvalId, { createSandboxOrder: Boolean(req.body?.createSandboxOrder) }, req.lifeRole));
  } catch (e) { next(e); }
}

async function linkTransaction(req, res, next) {
  try {
    res.json(await lifeOs.linkPayPalTransaction(req.params.id, req.body || {}, req.lifeRole));
  } catch (e) { next(e); }
}

module.exports = {
  status,
  listGoals,
  getGoal,
  createGoal,
  seedRestaurantDemo,
  updateMilestoneStatus,
  sourceMilestone,
  selectQuote,
  negotiateQuote,
  requestApproval,
  decideApproval,
  monitorGoal,
  preparePayment,
  linkTransaction
};
