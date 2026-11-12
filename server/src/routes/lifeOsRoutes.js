const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/lifeOsController');
const { attachRole, requireRole } = require('../middleware/requireRole');

const router = express.Router();
const lifeLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });

router.use(lifeLimit, attachRole);

router.get('/status', controller.status);
router.get('/goals', requireRole(['OWNER', 'OPERATOR', 'VIEWER']), controller.listGoals);
router.get('/goals/:id', requireRole(['OWNER', 'OPERATOR', 'VIEWER']), controller.getGoal);

router.post('/goals', requireRole(['OWNER', 'OPERATOR']), controller.createGoal);
router.post('/demo/restaurant', requireRole(['OWNER', 'OPERATOR']), controller.seedRestaurantDemo);
router.post('/goals/:id/milestones/:code/status', requireRole(['OWNER', 'OPERATOR']), controller.updateMilestoneStatus);
router.post('/goals/:id/milestones/:code/source', requireRole(['OWNER', 'OPERATOR']), controller.sourceMilestone);
router.post('/goals/:id/quotes/:quoteId/select', requireRole(['OWNER', 'OPERATOR']), controller.selectQuote);
router.post('/goals/:id/quotes/:quoteId/negotiate', requireRole(['OWNER', 'OPERATOR']), controller.negotiateQuote);
router.post('/goals/:id/approvals', requireRole(['OWNER', 'OPERATOR']), controller.requestApproval);
router.post('/goals/:id/monitor', requireRole(['OWNER', 'OPERATOR']), controller.monitorGoal);

// Financial & governance gates require OWNER/OPERATOR role AND Admin API key
router.post('/goals/:id/approvals/:approvalId/decide', requireRole(['OWNER', 'OPERATOR'], { requireAdminKey: true }), controller.decideApproval);
router.post('/goals/:id/payments/prepare', requireRole(['OWNER', 'OPERATOR'], { requireAdminKey: true }), controller.preparePayment);
router.post('/goals/:id/payments/link', requireRole(['OWNER', 'OPERATOR'], { requireAdminKey: true }), controller.linkTransaction);

module.exports = router;
