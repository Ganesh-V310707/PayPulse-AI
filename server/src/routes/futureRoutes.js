const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/futureController');
const { requireAdmin } = require('../middleware/requireAdmin');

const router = express.Router();
const futureLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 80, standardHeaders: 'draft-8', legacyHeaders: false });

router.use(futureLimit);
router.get('/guardrails', controller.getGuardrails);
router.put('/guardrails', controller.putGuardrails);
router.post('/guardrails/evaluate', controller.evaluateGuardrails);

router.get('/escrows', controller.listEscrows);
router.post('/escrows', controller.createEscrow);
router.post('/escrows/:id/:action', controller.advanceEscrow);

router.post('/fx-split', controller.fxSplit);
router.post('/risk-score', controller.riskScore);
router.post('/reconcile-batch', requireAdmin, controller.reconcileBatch);

module.exports = router;
