const mongoose = require('mongoose');

const agentPolicySchema = new mongoose.Schema({
  policyKey: { type: String, required: true, unique: true, default: 'default-workspace' },
  maxPerOrderUsd: { type: Number, default: 250, min: 1, max: 5000 },
  dailyCapUsd: { type: Number, default: 750, min: 1, max: 20000 },
  stepUpThresholdUsd: { type: Number, default: 100, min: 1, max: 5000 },
  agentMode: {
    type: String,
    enum: ['SUPERVISED', 'AUTONOMOUS_UNDER_CAP', 'FROZEN'],
    default: 'SUPERVISED'
  },
  autoPauseOnAnomaly: { type: Boolean, default: true },
  allowedCategories: {
    type: [String],
    default: ['Laptops', 'Phones', 'Audio', 'Accessories', 'Monitors', 'Products', 'Software']
  }
}, { timestamps: true });

module.exports = mongoose.models.AgentPolicy || mongoose.model('AgentPolicy', agentPolicySchema);
