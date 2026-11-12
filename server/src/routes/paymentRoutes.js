const express = require('express');
const rateLimit = require('express-rate-limit');
const controller = require('../controllers/paymentController');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();
const paymentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 35, standardHeaders: 'draft-8', legacyHeaders: false });

router.use(requireDatabase);
router.get('/', controller.listPayments);
router.get('/:orderId', controller.getPayment);
router.post('/orders', paymentLimiter, controller.createPayPalOrder);
router.post('/:orderId/capture', paymentLimiter, controller.capturePayPalOrder);
router.post('/:orderId/reconcile', paymentLimiter, controller.reconcilePayment);
router.post('/:orderId/investigate', controller.investigate);

module.exports = router;
