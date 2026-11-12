const express = require('express');
const controller = require('../controllers/paymentController');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();
router.use(requireDatabase);
router.get('/summary', controller.dashboardSummary);
router.get('/incidents', controller.listIncidents);
router.patch('/incidents/:id', controller.updateIncident);
router.get('/events', controller.listEvents);

module.exports = router;
