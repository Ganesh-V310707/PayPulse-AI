const express = require('express');
const { receivePayPalWebhook } = require('../controllers/webhookController');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();
router.post('/paypal', requireDatabase, receivePayPalWebhook);
module.exports = router;
