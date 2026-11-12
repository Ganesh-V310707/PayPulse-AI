const mongoose = require('mongoose');

const procurementItemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true, maxlength: 140 },
  searchQuery: { type: String, required: true, maxlength: 160 },
  itemType: { type: String, enum: ['PRODUCT', 'SERVICE'], default: 'PRODUCT' },
  estimatedCost: { type: Number, default: 0 },
  selectedQuoteId: { type: String, default: null }
}, { _id: false });

const milestoneSchema = new mongoose.Schema({
  code: { type: String, required: true },
  title: { type: String, required: true, maxlength: 140 },
  description: { type: String, default: '', maxlength: 500 },
  category: {
    type: String,
    enum: ['PERMITS', 'EQUIPMENT', 'TECH_POS', 'FURNITURE', 'SUPPLY_LAUNCH', 'SERVICES'],
    default: 'EQUIPMENT'
  },
  dependsOn: { type: [String], default: [] },
  allocatedBudget: { type: Number, required: true, min: 0 },
  dueDate: Date,
  status: {
    type: String,
    enum: ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'],
    default: 'PENDING'
  },
  procurementItems: { type: [procurementItemSchema], default: [] }
}, { _id: false });

const quoteSchema = new mongoose.Schema({
  quoteId: { type: String, required: true },
  milestoneCode: { type: String, required: true },
  itemId: { type: String, required: true },
  itemName: { type: String, required: true },
  title: { type: String, required: true, maxlength: 220 },
  provider: { type: String, required: true, maxlength: 100 },
  source: {
    type: String,
    enum: ['GOOGLE_SHOPPING', 'EBAY', 'PLANNING_ESTIMATE'],
    required: true
  },
  isRealProvider: { type: Boolean, default: false },
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  url: { type: String, default: null },
  image: { type: String, default: null },
  rating: { type: Number, default: null },
  notes: { type: String, default: '', maxlength: 400 },
  selected: { type: Boolean, default: false },
  negotiationScript: { type: String, default: '' },
  fetchedAt: { type: Date, default: Date.now }
}, { _id: false });

const approvalSchema = new mongoose.Schema({
  approvalId: { type: String, required: true },
  type: {
    type: String,
    enum: ['PROVIDER_OUTREACH', 'PURCHASE_COMMITMENT', 'PAYMENT_AUTHORIZATION'],
    required: true
  },
  milestoneCode: { type: String, default: null },
  quoteId: { type: String, default: null },
  title: { type: String, required: true, maxlength: 160 },
  summary: { type: String, required: true, maxlength: 500 },
  amount: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'INR' },
  sandboxUsdAmount: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  requestedBy: { type: String, default: 'AGENT_ORCHESTRATOR' },
  decidedByRole: { type: String, default: null },
  decisionNote: { type: String, default: '', maxlength: 300 },
  decidedAt: Date,
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const transactionRefSchema = new mongoose.Schema({
  txRef: { type: String, required: true },
  approvalId: { type: String, required: true },
  milestoneCode: { type: String, default: null },
  paypalOrderId: { type: String, default: null },
  captureId: { type: String, default: null },
  amountUsd: { type: Number, required: true, min: 0.01 },
  currency: { type: String, default: 'USD' },
  status: { type: String, default: 'STAGED' },
  sandboxOnly: { type: Boolean, default: true },
  note: { type: String, default: '', maxlength: 300 },
  recordedAt: { type: Date, default: Date.now }
}, { _id: false });

const activityLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  actorRole: { type: String, default: 'SYSTEM' },
  agent: { type: String, default: 'ORCHESTRATOR' },
  action: { type: String, required: true },
  summary: { type: String, required: true, maxlength: 400 },
  level: { type: String, enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR'], default: 'INFO' }
}, { _id: false });

const lifeGoalSchema = new mongoose.Schema({
  goalRef: { type: String, required: true, unique: true, index: true },
  title: { type: String, required: true, maxlength: 140 },
  description: { type: String, required: true, maxlength: 1200 },
  location: { type: String, required: true, maxlength: 100 },
  country: { type: String, enum: ['IN', 'US', 'GB'], default: 'IN' },
  currency: { type: String, enum: ['INR', 'USD', 'GBP'], default: 'INR' },
  totalBudget: { type: Number, required: true, min: 1 },
  deadline: { type: Date, required: true },
  status: { type: String, enum: ['PLANNING', 'ACTIVE', 'AT_RISK', 'COMPLETED'], default: 'ACTIVE' },
  isDemo: { type: Boolean, default: false },
  aiProvider: { type: String, enum: ['GEMINI', 'RULES'], default: 'RULES' },
  agentInsights: {
    plannerSummary: String,
    executionRisk: String,
    riskLevel: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'LOW' },
    lastAnalyzedAt: Date,
    retryCount: { type: Number, default: 0 }
  },
  milestones: { type: [milestoneSchema], default: [] },
  quotes: { type: [quoteSchema], default: [] },
  approvals: { type: [approvalSchema], default: [] },
  transactions: { type: [transactionRefSchema], default: [] },
  activityLogs: { type: [activityLogSchema], default: [] }
}, { timestamps: true });

lifeGoalSchema.index({ createdAt: -1 });

module.exports = mongoose.models.LifeGoal || mongoose.model('LifeGoal', lifeGoalSchema);
