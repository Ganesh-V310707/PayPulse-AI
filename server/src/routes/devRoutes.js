const express = require('express');
const { createScenario, clearLocalScenarios } = require('../controllers/devController');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();
router.use(requireDatabase);
router.post('/scenarios', createScenario);
router.delete('/scenarios', clearLocalScenarios);
module.exports = router;
