const crypto = require('node:crypto');
const mongoose = require('mongoose');
const LifeGoal = require('../models/LifeGoal');
const Payment = require('../models/Payment');
const env = require('../config/env');
const { liveSearch } = require('./liveCommerceService');
const { createOrder, getOrder, extractApproveUrl, ensurePayPalConfigured } = require('./paypalService');
const { statusFromOrder, captureFromOrder } = require('./paymentState');
const { writeAudit } = require('./auditService');
const { FX_TO_USD } = require('./futureService');

const ALLOWED_COUNTRIES = ['IN', 'US', 'GB'];
const ALLOWED_CURRENCIES = ['INR', 'USD', 'GBP'];
const ALLOWED_CATEGORIES = ['PERMITS', 'EQUIPMENT', 'TECH_POS', 'FURNITURE', 'SUPPLY_LAUNCH', 'SERVICES'];

// In-memory store used only when DB is disconnected during isolated unit tests
const memoryGoals = [];

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

// Privacy safeguard: redact emails, phone numbers, card-like numbers, and token strings before LLM calls
function redactPII(input) {
  return String(input || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(?:\+?\d[\s-]?){8,15}/g, '[REDACTED_PHONE]')
    .replace(/\b(?:sk-|AIza|ghp_|xox[baprs]-)[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_KEY]')
    .replace(/[<>]/g, ' ')
    .trim();
}

function cleanText(input, max = 300) {
  return String(input || '').replace(/[<>\x00-\x1f]/g, ' ').trim().slice(0, max);
}

function toSandboxUsd(amount, currency = 'INR') {
  const rate = FX_TO_USD[String(currency || 'INR').toUpperCase()] || 1;
  const raw = Number((Number(amount || 0) * rate).toFixed(2));
  return {
    rawUsd: raw,
    sandboxUsd: Number(Math.min(5000, Math.max(0.01, raw || 1)).toFixed(2)),
    capped: raw > 5000,
    rate
  };
}

// Exponential backoff retry wrapper for Gemini & external API calls
async function withRetry(fn, { retries = 2, baseDelayMs = 350 } = {}) {
  let attempt = 0;
  let lastError;
  while (attempt <= retries) {
    try {
      const value = await fn(attempt);
      return { value, attempts: attempt + 1, retriesUsed: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      const delay = baseDelayMs * (2 ** attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt += 1;
    }
  }
  const err = lastError || new Error('Operation failed after retries.');
  err.retriesUsed = attempt;
  throw err;
}

async function callGeminiJson(prompt, payload, { timeoutMs = 15000 } = {}) {
  if (!env.geminiApiKey) return { data: null, provider: 'RULES', retriesUsed: 0 };
  const safePayload = JSON.parse(redactPII(JSON.stringify(payload)));
  try {
    const res = await withRetry(async () => {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nINPUT:\n${JSON.stringify(safePayload)}` }] }],
            generationConfig: { responseMimeType: 'application/json' }
          }),
          signal: AbortSignal.timeout(timeoutMs)
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const e = new Error(body.error?.message || `Gemini HTTP ${response.status}`);
        e.status = response.status;
        throw e;
      }
      const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!text) throw new Error('Empty Gemini response.');
      return JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
    }, { retries: 2, baseDelayMs: 300 });
    return { data: res.value, provider: 'GEMINI', retriesUsed: res.retriesUsed };
  } catch (error) {
    console.warn('[life-os] Gemini fallback to RULES:', error.message);
    return { data: null, provider: 'RULES', retriesUsed: error.retriesUsed || 0 };
  }
}

function validateGoalInput(body = {}) {
  const title = cleanText(body.title, 140);
  const description = cleanText(body.description || body.title, 1200);
  const location = cleanText(body.location || 'Bengaluru, India', 100);
  const country = ALLOWED_COUNTRIES.includes(String(body.country || 'IN').toUpperCase())
    ? String(body.country || 'IN').toUpperCase()
    : 'IN';
  const defaultCur = country === 'IN' ? 'INR' : country === 'GB' ? 'GBP' : 'USD';
  const currency = ALLOWED_CURRENCIES.includes(String(body.currency || defaultCur).toUpperCase())
    ? String(body.currency || defaultCur).toUpperCase()
    : defaultCur;
  const totalBudget = Number(body.totalBudget);
  const deadline = body.deadline ? new Date(body.deadline) : new Date(Date.now() + 60 * 86400000);

  if (title.length < 5) {
    throw Object.assign(new Error('Goal title must be at least 5 characters.'), { status: 400 });
  }
  if (!Number.isFinite(totalBudget) || totalBudget < 10 || totalBudget > 100000000) {
    throw Object.assign(new Error('Budget must be a valid positive number.'), { status: 400 });
  }
  if (Number.isNaN(deadline.getTime())) {
    throw Object.assign(new Error('Provide a valid target deadline date.'), { status: 400 });
  }
  return { title, description, location, country, currency, totalBudget: Number(totalBudget.toFixed(2)), deadline };
}

function buildFallbackMilestones({ title, totalBudget, deadline }) {
  const isRestaurant = /restaurant|cafe|kitchen|bistro|food|dining/i.test(title);
  const now = Date.now();
  const span = Math.max(7 * 86400000, deadline.getTime() - now);
  const atPct = (pct) => new Date(now + span * pct);

  if (isRestaurant) {
    return {
      plannerSummary: '5-stage restaurant launch blueprint balancing compliance gating before capital equipment commitments.',
      milestones: [
        {
          code: 'M1',
          title: 'Permits, FSSAI & Lease Compliance',
          description: 'Complete local municipal trade license, FSSAI registration, and fire safety clearance before ordering heavy equipment.',
          category: 'PERMITS',
          dependsOn: [],
          allocatedBudget: Math.round(totalBudget * 0.12),
          dueDate: atPct(0.2),
          status: 'IN_PROGRESS',
          procurementItems: [
            { id: 'item-m1-1', name: 'FSSAI & Municipal Licensing Consulting', searchQuery: 'FSSAI registration service', itemType: 'SERVICE', estimatedCost: Math.round(totalBudget * 0.07) },
            { id: 'item-m1-2', name: 'Fire Safety Extinguisher & Signage Kit', searchQuery: 'commercial fire extinguisher ABC 6kg', itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.05) }
          ]
        },
        {
          code: 'M2',
          title: 'Commercial Kitchen Equipment Sourcing',
          description: 'Procure refrigeration, commercial induction/gas burners, and stainless prep tables after permit clearance.',
          category: 'EQUIPMENT',
          dependsOn: ['M1'],
          allocatedBudget: Math.round(totalBudget * 0.40),
          dueDate: atPct(0.45),
          status: 'PENDING',
          procurementItems: [
            { id: 'item-m2-1', name: 'Commercial Double Door Refrigerator', searchQuery: 'commercial stainless steel refrigerator kitchen', itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.22) },
            { id: 'item-m2-2', name: 'Commercial Gas Stove & Exhaust Hood', searchQuery: 'commercial 2 burner gas range stainless steel', itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.18) }
          ]
        },
        {
          code: 'M3',
          title: 'POS Hardware, Billing & PayPal Integration',
          description: 'Deploy thermal receipt printer, tablet POS terminal, and PayPal Sandbox checkout workflow.',
          category: 'TECH_POS',
          dependsOn: ['M1'],
          allocatedBudget: Math.round(totalBudget * 0.14),
          dueDate: atPct(0.6),
          status: 'PENDING',
          procurementItems: [
            { id: 'item-m3-1', name: '80mm Thermal POS Receipt Printer', searchQuery: 'thermal receipt printer 80mm USB POS', itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.05) },
            { id: 'item-m3-2', name: 'Android Tablet POS Terminal', searchQuery: 'business tablet stand POS billing', itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.09) }
          ]
        },
        {
          code: 'M4',
          title: 'Dining Furniture & Lighting Setup',
          description: 'Source durable 4-seater dining sets, warm pendant lighting, and tableware.',
          category: 'FURNITURE',
          dependsOn: ['M2'],
          allocatedBudget: Math.round(totalBudget * 0.22),
          dueDate: atPct(0.82),
          status: 'PENDING',
          procurementItems: [
            { id: 'item-m4-1', name: 'Cafe & Restaurant Dining Chair Sets', searchQuery: 'cafe dining chair table set commercial', itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.16) },
            { id: 'item-m4-2', name: 'Kitchen & Dining Installation Contractor', searchQuery: 'restaurant interior lighting fitting service', itemType: 'SERVICE', estimatedCost: Math.round(totalBudget * 0.06) }
          ]
        },
        {
          code: 'M5',
          title: 'Soft Launch & Initial Inventory Readiness',
          description: 'Stock packaging, dry ingredients, and run final dry-run checkout before opening day.',
          category: 'SUPPLY_LAUNCH',
          dependsOn: ['M2', 'M3', 'M4'],
          allocatedBudget: Math.round(totalBudget * 0.12),
          dueDate: atPct(0.98),
          status: 'PENDING',
          procurementItems: [
            { id: 'item-m5-1', name: 'Eco-Friendly Takeaway Packaging Bundle', searchQuery: 'kraft food packaging containers wholesale', itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.07) },
            { id: 'item-m5-2', name: 'Opening Week Local Launch Marketing', searchQuery: 'local restaurant launch campaign', itemType: 'SERVICE', estimatedCost: Math.round(totalBudget * 0.05) }
          ]
        }
      ]
    };
  }

  return {
    plannerSummary: '4-stage dependency-ordered goal execution plan keeping procurement within your stated budget.',
    milestones: [
      {
        code: 'M1',
        title: 'Scope, Compliance & Foundation',
        description: 'Confirm requirements, local rules, and vendor criteria before committing funds.',
        category: 'SERVICES',
        dependsOn: [],
        allocatedBudget: Math.round(totalBudget * 0.15),
        dueDate: atPct(0.25),
        status: 'IN_PROGRESS',
        procurementItems: [
          { id: 'item-m1-1', name: 'Initial Planning & Compliance Check', searchQuery: `${title} compliance service`, itemType: 'SERVICE', estimatedCost: Math.round(totalBudget * 0.15) }
        ]
      },
      {
        code: 'M2',
        title: 'Core Equipment & Product Sourcing',
        description: 'Discover and compare live merchant offers for primary equipment.',
        category: 'EQUIPMENT',
        dependsOn: ['M1'],
        allocatedBudget: Math.round(totalBudget * 0.45),
        dueDate: atPct(0.55),
        status: 'PENDING',
        procurementItems: [
          { id: 'item-m2-1', name: `Primary Equipment for ${title.slice(0, 40)}`, searchQuery: cleanText(title, 60), itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.45) }
        ]
      },
      {
        code: 'M3',
        title: 'Operations Tooling & Payment Setup',
        description: 'Set up tracking, billing, and authorized PayPal Sandbox checkout.',
        category: 'TECH_POS',
        dependsOn: ['M1'],
        allocatedBudget: Math.round(totalBudget * 0.20),
        dueDate: atPct(0.78),
        status: 'PENDING',
        procurementItems: [
          { id: 'item-m3-1', name: 'Workspace Operations Hardware', searchQuery: 'business tablet POS scanner', itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.20) }
        ]
      },
      {
        code: 'M4',
        title: 'Verification & Final Launch',
        description: 'Complete quality verification and final acceptance.',
        category: 'SUPPLY_LAUNCH',
        dependsOn: ['M2', 'M3'],
        allocatedBudget: Math.round(totalBudget * 0.20),
        dueDate: atPct(0.98),
        status: 'PENDING',
        procurementItems: [
          { id: 'item-m4-1', name: 'Launch Readiness Supplies', searchQuery: 'packaging supplies starter kit', itemType: 'PRODUCT', estimatedCost: Math.round(totalBudget * 0.20) }
        ]
      }
    ]
  };
}

// Agent 1: Planner Agent (Gemini + rules fallback)
async function runPlannerAgent(goalInput) {
  const prompt = [
    'You are the PayPulse LIFE OS Planner Agent.',
    'Decompose the user goal into 4 to 5 realistic sequential milestones with task dependencies, budget allocations summing <= totalBudget, and itemized procurement needs.',
    'Each procurementItem must specify itemType: "PRODUCT" (searchable on shopping APIs) or "SERVICE" (permits, labor, consulting).',
    'Never invent fake vendor names or fake prices; estimatedCost is strictly a planning budget allocation.',
    'Return ONLY valid JSON: { "plannerSummary": string, "milestones": [{ "code": "M1", "title": string, "description": string, "category": "PERMITS"|"EQUIPMENT"|"TECH_POS"|"FURNITURE"|"SUPPLY_LAUNCH"|"SERVICES", "dependsOn": string[], "allocatedBudget": number, "daysFromNow": number, "procurementItems": [{ "name": string, "searchQuery": string, "itemType": "PRODUCT"|"SERVICE", "estimatedCost": number }] }] }'
  ].join('\n');

  const geminiRes = await callGeminiJson(prompt, {
    title: goalInput.title,
    description: goalInput.description,
    location: goalInput.location,
    currency: goalInput.currency,
    totalBudget: goalInput.totalBudget,
    daysUntilDeadline: Math.max(7, Math.round((goalInput.deadline.getTime() - Date.now()) / 86400000))
  });

  const fallback = buildFallbackMilestones(goalInput);
  if (!geminiRes.data || !Array.isArray(geminiRes.data.milestones) || geminiRes.data.milestones.length < 2) {
    return { ...fallback, provider: 'RULES', retriesUsed: geminiRes.retriesUsed };
  }

  const now = Date.now();
  const maxDays = Math.max(7, Math.round((goalInput.deadline.getTime() - now) / 86400000));
  const milestones = geminiRes.data.milestones.slice(0, 6).map((m, idx) => {
    const code = `M${idx + 1}`;
    const validDeps = Array.isArray(m.dependsOn)
      ? m.dependsOn.map(String).filter((d) => /^M[1-6]$/.test(d) && d !== code)
      : [];
    const days = Math.min(maxDays, Math.max(1, Number(m.daysFromNow) || Math.round(((idx + 1) / geminiRes.data.milestones.length) * maxDays)));
    const items = (Array.isArray(m.procurementItems) ? m.procurementItems : []).slice(0, 4).map((it, iIdx) => ({
      id: `item-${code.toLowerCase()}-${iIdx + 1}`,
      name: cleanText(it.name || 'Item', 120),
      searchQuery: cleanText(it.searchQuery || it.name || goalInput.title, 120),
      itemType: it.itemType === 'SERVICE' ? 'SERVICE' : 'PRODUCT',
      estimatedCost: Math.max(0, Number(it.estimatedCost) || 0),
      selectedQuoteId: null
    }));
    return {
      code,
      title: cleanText(m.title || `Milestone ${idx + 1}`, 120),
      description: cleanText(m.description || '', 450),
      category: ALLOWED_CATEGORIES.includes(m.category) ? m.category : 'EQUIPMENT',
      dependsOn: validDeps,
      allocatedBudget: Math.max(0, Number(m.allocatedBudget) || Math.round(goalInput.totalBudget / geminiRes.data.milestones.length)),
      dueDate: new Date(now + days * 86400000),
      status: idx === 0 ? 'IN_PROGRESS' : 'PENDING',
      procurementItems: items
    };
  });

  return {
    plannerSummary: cleanText(geminiRes.data.plannerSummary || fallback.plannerSummary, 400),
    milestones,
    provider: 'GEMINI',
    retriesUsed: geminiRes.retriesUsed
  };
}

function appendLog(goal, { actorRole = 'SYSTEM', agent = 'ORCHESTRATOR', action, summary, level = 'INFO' }) {
  goal.activityLogs.unshift({
    at: new Date(),
    actorRole,
    agent,
    action,
    summary: cleanText(summary, 380),
    level
  });
  if (goal.activityLogs.length > 80) goal.activityLogs = goal.activityLogs.slice(0, 80);
}

function computeGoalMetrics(goal) {
  const totalMilestones = goal.milestones.length || 1;
  const completedCount = goal.milestones.filter((m) => m.status === 'COMPLETED').length;
  const progressPct = Math.round((completedCount / totalMilestones) * 100);
  const allocatedBudget = goal.milestones.reduce((s, m) => s + Number(m.allocatedBudget || 0), 0);
  const approvedCommitment = goal.approvals
    .filter((a) => a.status === 'APPROVED' && a.type !== 'PROVIDER_OUTREACH')
    .reduce((s, a) => s + Number(a.amount || 0), 0);
  const sandboxPaidUsd = goal.transactions
    .filter((t) => ['COMPLETED', 'APPROVED', 'CREATED', 'STAGED'].includes(t.status))
    .reduce((s, t) => s + Number(t.amountUsd || 0), 0);
  const pendingApprovals = goal.approvals.filter((a) => a.status === 'PENDING').length;
  const daysRemaining = Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000);
  return {
    totalMilestones,
    completedCount,
    progressPct,
    allocatedBudget,
    approvedCommitment,
    remainingBudget: Math.max(0, Number(goal.totalBudget) - approvedCommitment),
    sandboxPaidUsd: Number(sandboxPaidUsd.toFixed(2)),
    pendingApprovals,
    daysRemaining
  };
}

async function saveGoalDoc(goal) {
  if (isDbReady() && typeof goal.save === 'function') {
    await goal.save();
    return goal.toObject();
  }
  return goal;
}

async function findGoalById(id) {
  if (isDbReady()) {
    const query = mongoose.Types.ObjectId.isValid(id) ? { $or: [{ _id: id }, { goalRef: id }] } : { goalRef: id };
    const doc = await LifeGoal.findOne(query);
    if (doc) return doc;
  }
  return memoryGoals.find((g) => g._id === id || g.goalRef === id) || null;
}

async function listGoals() {
  if (isDbReady()) {
    const docs = await LifeGoal.find().sort({ createdAt: -1 }).limit(25).lean();
    return docs.map((g) => ({ ...g, metrics: computeGoalMetrics(g) }));
  }
  return memoryGoals.map((g) => ({ ...g, metrics: computeGoalMetrics(g) }));
}

async function getGoal(id) {
  const doc = await findGoalById(id);
  if (!doc) throw Object.assign(new Error('Goal not found.'), { status: 404 });
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return { ...plain, metrics: computeGoalMetrics(plain) };
}

async function createGoal(body, actorRole = 'OWNER') {
  const input = validateGoalInput(body);
  const plan = await runPlannerAgent(input);
  const goalRef = `LIFE-${crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;

  const approvals = [];
  const firstProductMilestone = plan.milestones.find((m) => m.procurementItems.some((i) => i.itemType === 'PRODUCT'));
  if (firstProductMilestone) {
    const fx = toSandboxUsd(firstProductMilestone.allocatedBudget, input.currency);
    approvals.push({
      approvalId: `APR-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      type: 'PROVIDER_OUTREACH',
      milestoneCode: firstProductMilestone.code,
      title: `Approve outreach for ${firstProductMilestone.code}: ${firstProductMilestone.title}`,
      summary: 'Human approval required before contacting external vendors or sharing RFQ specifications.',
      amount: firstProductMilestone.allocatedBudget,
      currency: input.currency,
      sandboxUsdAmount: fx.sandboxUsd,
      status: 'PENDING',
      requestedBy: 'PLANNER_AGENT'
    });
  }

  const payload = {
    goalRef,
    ...input,
    status: 'ACTIVE',
    isDemo: Boolean(body.isDemo),
    aiProvider: plan.provider,
    agentInsights: {
      plannerSummary: plan.plannerSummary,
      executionRisk: 'Initial milestone ready. Complete prerequisite tasks and approve sourcing before committing funds.',
      riskLevel: 'LOW',
      lastAnalyzedAt: new Date(),
      retryCount: plan.retriesUsed || 0
    },
    milestones: plan.milestones,
    quotes: [],
    approvals,
    transactions: [],
    activityLogs: [
      {
        at: new Date(),
        actorRole,
        agent: 'PLANNER_AGENT',
        action: 'GOAL_DECOMPOSED',
        summary: `Decomposed "${input.title}" into ${plan.milestones.length} milestones via ${plan.provider}.`,
        level: 'SUCCESS'
      }
    ]
  };

  if (isDbReady()) {
    const created = await LifeGoal.create(payload);
    await writeAudit({ action: 'LIFE_GOAL_CREATED', actor: actorRole, entityType: 'LifeGoal', entityId: created.id, details: { goalRef, provider: plan.provider } }).catch(() => {});
    const plain = created.toObject();
    return { ...plain, metrics: computeGoalMetrics(plain) };
  }

  const mem = { _id: goalRef, ...payload, createdAt: new Date().toISOString() };
  memoryGoals.unshift(mem);
  return { ...mem, metrics: computeGoalMetrics(mem) };
}

// Complete Flagship Working Demonstration: "Launch a small restaurant within a fixed budget and deadline."
async function seedRestaurantDemo(actorRole = 'OWNER') {
  if (isDbReady()) {
    const existing = await LifeGoal.findOne({ isDemo: true, title: /Launch a small restaurant/i }).sort({ createdAt: -1 });
    if (existing) {
      const plain = existing.toObject();
      return { ...plain, metrics: computeGoalMetrics(plain), reusedExisting: true };
    }
  }

  const deadline = new Date(Date.now() + 60 * 86400000);
  const budget = 850000;
  const plan = buildFallbackMilestones({ title: 'Launch a small restaurant within a fixed budget and deadline', totalBudget: budget, deadline });
  const goalRef = `LIFE-REST-${crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()}`;

  const approvals = [
    {
      approvalId: 'APR-DEMO-OUTREACH',
      type: 'PROVIDER_OUTREACH',
      milestoneCode: 'M2',
      title: 'Approve Kitchen Equipment Vendor Outreach (M2)',
      summary: 'Review AI-drafted RFQ message before contacting commercial kitchen suppliers.',
      amount: 340000,
      currency: 'INR',
      sandboxUsdAmount: toSandboxUsd(340000, 'INR').sandboxUsd,
      status: 'PENDING',
      requestedBy: 'NEGOTIATION_COPILOT'
    },
    {
      approvalId: 'APR-DEMO-COMMIT',
      type: 'PURCHASE_COMMITMENT',
      milestoneCode: 'M3',
      title: 'Approve POS & Thermal Printer Commitment (M3)',
      summary: 'Confirm hardware specs and total cost before staging payment.',
      amount: 119000,
      currency: 'INR',
      sandboxUsdAmount: toSandboxUsd(119000, 'INR').sandboxUsd,
      status: 'PENDING',
      requestedBy: 'SOURCING_AGENT'
    },
    {
      approvalId: 'APR-DEMO-PAY',
      type: 'PAYMENT_AUTHORIZATION',
      milestoneCode: 'M1',
      title: 'Authorize Fire Safety Kit Sandbox Deposit (M1)',
      summary: 'Pre-stage $49.99 USD PayPal Sandbox deposit test for M1 fire safety & compliance kit.',
      amount: 4250,
      currency: 'INR',
      sandboxUsdAmount: 49.99,
      status: 'PENDING',
      requestedBy: 'PAYMENT_PREP_AGENT'
    }
  ];

  // Explicitly labeled unverified planning estimates for non-retail SERVICE items
  const quotes = [
    {
      quoteId: 'Q-EST-FSSAI',
      milestoneCode: 'M1',
      itemId: 'item-m1-1',
      itemName: 'FSSAI & Municipal Licensing Consulting',
      title: 'Planning Estimate: FSSAI Basic + Trade License Filing',
      provider: 'Planning Benchmark (Not a live merchant quote)',
      source: 'PLANNING_ESTIMATE',
      isRealProvider: false,
      price: 59500,
      currency: 'INR',
      url: null,
      notes: 'Simulated planning estimate for municipal/compliance fees. Request real local CA quote after human approval.',
      selected: false,
      fetchedAt: new Date()
    }
  ];

  const payload = {
    goalRef,
    title: 'Launch a small restaurant within a fixed budget and deadline',
    description: 'Open a 24-seat neighbourhood quick-service restaurant with compliant kitchen equipment, POS billing, dining furniture, and initial inventory inside ₹8,50,000 INR within 60 days.',
    location: 'Bengaluru, India',
    country: 'IN',
    currency: 'INR',
    totalBudget: budget,
    deadline,
    status: 'ACTIVE',
    isDemo: true,
    aiProvider: 'RULES',
    agentInsights: {
      plannerSummary: plan.plannerSummary,
      executionRisk: 'M1 compliance & fire safety is active. M2 kitchen sourcing depends on M1 completion. Run "Source Real Providers" on M2/M3 to pull live Google Shopping offers.',
      riskLevel: 'LOW',
      lastAnalyzedAt: new Date(),
      retryCount: 0
    },
    milestones: plan.milestones,
    quotes,
    approvals,
    transactions: [],
    activityLogs: [
      {
        at: new Date(),
        actorRole,
        agent: 'PLANNER_AGENT',
        action: 'DEMO_RESTAURANT_SEEDED',
        summary: 'Initialized flagship restaurant launch orchestration with 5 interdependent milestones and 3 human approval gates.',
        level: 'SUCCESS'
      }
    ]
  };

  if (isDbReady()) {
    const created = await LifeGoal.create(payload);
    const plain = created.toObject();
    return { ...plain, metrics: computeGoalMetrics(plain) };
  }
  const mem = { _id: goalRef, ...payload, createdAt: new Date().toISOString() };
  memoryGoals.unshift(mem);
  return { ...mem, metrics: computeGoalMetrics(mem) };
}

async function updateMilestoneStatus(goalId, code, nextStatus, actorRole = 'OPERATOR') {
  const allowed = ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];
  const status = String(nextStatus || '').toUpperCase();
  if (!allowed.includes(status)) {
    throw Object.assign(new Error(`Status must be one of: ${allowed.join(', ')}`), { status: 400 });
  }
  const goal = await findGoalById(goalId);
  if (!goal) throw Object.assign(new Error('Goal not found.'), { status: 404 });

  const milestone = goal.milestones.find((m) => m.code === code);
  if (!milestone) throw Object.assign(new Error(`Milestone ${code} not found.`), { status: 404 });

  if (['IN_PROGRESS', 'COMPLETED'].includes(status) && milestone.dependsOn?.length) {
    const unmet = milestone.dependsOn.filter((dep) => {
      const parent = goal.milestones.find((m) => m.code === dep);
      return parent && parent.status !== 'COMPLETED';
    });
    if (unmet.length) {
      throw Object.assign(
        new Error(`Dependency blocked: complete ${unmet.join(', ')} before setting ${code} to ${status}.`),
        { status: 409 }
      );
    }
  }

  milestone.status = status;
  const allCompleted = goal.milestones.every((m) => m.status === 'COMPLETED');
  if (allCompleted) goal.status = 'COMPLETED';
  else if (goal.status === 'COMPLETED') goal.status = 'ACTIVE';

  appendLog(goal, {
    actorRole,
    agent: 'EXECUTION_MONITOR',
    action: 'MILESTONE_STATUS_UPDATED',
    summary: `Milestone ${code} (${milestone.title}) moved to ${status}.`,
    level: status === 'COMPLETED' ? 'SUCCESS' : 'INFO'
  });

  const saved = await saveGoalDoc(goal);
  return { ...saved, metrics: computeGoalMetrics(saved) };
}

// Agent 2: Sourcing Agent (connects to real liveCommerceService without fabricating quotes)
async function runSourcingAgent(goalId, milestoneCode, actorRole = 'OPERATOR', { searchFn = liveSearch } = {}) {
  const goal = await findGoalById(goalId);
  if (!goal) throw Object.assign(new Error('Goal not found.'), { status: 404 });
  const milestone = goal.milestones.find((m) => m.code === milestoneCode);
  if (!milestone) throw Object.assign(new Error(`Milestone ${milestoneCode} not found.`), { status: 404 });

  const newQuotes = [];
  const providerSummary = { liveHits: 0, simulatedEstimates: 0, providerErrors: [] };

  for (const item of milestone.procurementItems) {
    if (item.itemType === 'SERVICE') {
      newQuotes.push({
        quoteId: `Q-EST-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        milestoneCode,
        itemId: item.id,
        itemName: item.name,
        title: `Planning Estimate: ${item.name}`,
        provider: 'Planning Estimate (Service — Not live quoted)',
        source: 'PLANNING_ESTIMATE',
        isRealProvider: false,
        price: Number(item.estimatedCost || 0),
        currency: goal.currency,
        url: null,
        notes: 'Service item cannot be auto-quoted via retail APIs. Obtain a real vendor quote after human outreach approval.',
        selected: false,
        fetchedAt: new Date()
      });
      providerSummary.simulatedEstimates += 1;
      continue;
    }

    try {
      const res = await searchFn(item.searchQuery, { country: goal.country });
      if (res.items?.length) {
        for (const p of res.items.slice(0, 3)) {
          newQuotes.push({
            quoteId: `Q-LIVE-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
            milestoneCode,
            itemId: item.id,
            itemName: item.name,
            title: cleanText(p.name, 200),
            provider: cleanText(p.store || p.provider || 'Live Marketplace', 90),
            source: p.source === 'EBAY' ? 'EBAY' : 'GOOGLE_SHOPPING',
            isRealProvider: true,
            price: Number(p.price),
            currency: p.currency || goal.currency,
            url: p.url || null,
            image: p.image || null,
            rating: p.rating || null,
            notes: cleanText(p.explanation || 'Real upstream provider listing; verify seller terms before purchase.', 350),
            selected: false,
            fetchedAt: new Date()
          });
          providerSummary.liveHits += 1;
        }
      } else {
        providerSummary.simulatedEstimates += 1;
        newQuotes.push({
          quoteId: `Q-EST-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
          milestoneCode,
          itemId: item.id,
          itemName: item.name,
          title: `Unquoted Planning Target: ${item.name}`,
          provider: res.sourceInfo?.mode === 'NOT_CONNECTED' ? 'Shopping API not connected (Planning target only)' : 'No live listings matched (Planning target only)',
          source: 'PLANNING_ESTIMATE',
          isRealProvider: false,
          price: Number(item.estimatedCost || 0),
          currency: goal.currency,
          url: null,
          notes: res.sourceInfo?.message || 'No live listings found; planning estimate shown transparently.',
          selected: false,
          fetchedAt: new Date()
        });
      }
      if (res.errors?.length) providerSummary.providerErrors.push(...res.errors);
    } catch (error) {
      providerSummary.providerErrors.push({ item: item.name, message: error.message });
    }
  }

  // Replace previous un-selected quotes for this milestone while keeping any already-selected quote
  const preservedSelected = goal.quotes.filter((q) => q.milestoneCode === milestoneCode && q.selected);
  const otherMilestones = goal.quotes.filter((q) => q.milestoneCode !== milestoneCode);
  goal.quotes = [...otherMilestones, ...preservedSelected, ...newQuotes];

  appendLog(goal, {
    actorRole,
    agent: 'SOURCING_AGENT',
    action: 'PROVIDERS_SOURCED',
    summary: `Sourced ${milestoneCode}: ${providerSummary.liveHits} real provider listing(s), ${providerSummary.simulatedEstimates} labeled planning estimate(s).`,
    level: providerSummary.liveHits > 0 ? 'SUCCESS' : 'WARNING'
  });

  const saved = await saveGoalDoc(goal);
  return { goal: { ...saved, metrics: computeGoalMetrics(saved) }, providerSummary };
}

async function selectQuote(goalId, quoteId, actorRole = 'OPERATOR') {
  const goal = await findGoalById(goalId);
  if (!goal) throw Object.assign(new Error('Goal not found.'), { status: 404 });

  const quote = goal.quotes.find((q) => q.quoteId === quoteId);
  if (!quote) throw Object.assign(new Error('Quote not found.'), { status: 404 });

  // Deselect other quotes for the same procurement item
  goal.quotes.forEach((q) => {
    if (q.itemId === quote.itemId) q.selected = q.quoteId === quoteId;
  });

  const milestone = goal.milestones.find((m) => m.code === quote.milestoneCode);
  const pItem = milestone?.procurementItems?.find((i) => i.id === quote.itemId);
  if (pItem) pItem.selectedQuoteId = quoteId;

  // Automatically create a pending PURCHASE_COMMITMENT approval if none exists for this quote
  const existingApr = goal.approvals.find((a) => a.quoteId === quoteId && a.type === 'PURCHASE_COMMITMENT');
  if (!existingApr) {
    const fx = toSandboxUsd(quote.price, quote.currency);
    goal.approvals.unshift({
      approvalId: `APR-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      type: 'PURCHASE_COMMITMENT',
      milestoneCode: quote.milestoneCode,
      quoteId,
      title: `Commit offer: ${cleanText(quote.title, 90)}`,
      summary: `${quote.isRealProvider ? 'Live provider listing' : 'Unverified planning estimate'} from ${quote.provider} at ${quote.price} ${quote.currency}. Human approval required before payment prep.`,
      amount: quote.price,
      currency: quote.currency,
      sandboxUsdAmount: fx.sandboxUsd,
      status: 'PENDING',
      requestedBy: 'SOURCING_AGENT'
    });
  }

  appendLog(goal, {
    actorRole,
    agent: 'SOURCING_AGENT',
    action: 'QUOTE_SELECTED',
    summary: `Selected "${quote.title}" (${quote.price} ${quote.currency}) and staged human purchase commitment approval.`,
    level: 'INFO'
  });

  const saved = await saveGoalDoc(goal);
  return { ...saved, metrics: computeGoalMetrics(saved) };
}

// Agent 3: Negotiation Copilot Agent
async function runNegotiationAgent(goalId, quoteId, actorRole = 'OPERATOR') {
  const goal = await findGoalById(goalId);
  if (!goal) throw Object.assign(new Error('Goal not found.'), { status: 404 });
  const quote = goal.quotes.find((q) => q.quoteId === quoteId);
  if (!quote) throw Object.assign(new Error('Quote not found.'), { status: 404 });

  const targetPrice = Math.round(quote.price * 0.92);
  const prompt = [
    'You are the PayPulse LIFE OS Negotiation Copilot.',
    'Draft a polite, realistic vendor outreach & RFQ negotiation message for a buyer to review and send manually.',
    'Never claim a merchant already agreed or that any discount is guaranteed.',
    'Return ONLY valid JSON: { "script": string (<= 650 chars), "targetCounterOffer": number, "keyTermsToVerify": string[] }'
  ].join('\n');

  const geminiRes = await callGeminiJson(prompt, {
    goalTitle: goal.title,
    location: goal.location,
    item: quote.title,
    provider: quote.provider,
    listedPrice: quote.price,
    currency: quote.currency,
    suggestedTargetPrice: targetPrice
  });

  const script = geminiRes.data?.script
    ? cleanText(geminiRes.data.script, 750)
    : `DRAFT OUTREACH (HUMAN APPROVAL REQUIRED): Hello ${quote.provider} team — we are launching a project in ${goal.location} and sourcing "${quote.title}" (listed at ${quote.price} ${quote.currency}). Could you share your commercial quote, warranty terms, and delivery lead time if we target ${targetPrice} ${quote.currency} on confirmed payment?`;

  quote.negotiationScript = `[${geminiRes.provider}] ${script}`;

  // Ensure a PROVIDER_OUTREACH approval gate exists before contacting provider
  const hasOutreachApproval = goal.approvals.some((a) => a.quoteId === quoteId && a.type === 'PROVIDER_OUTREACH');
  if (!hasOutreachApproval) {
    const fx = toSandboxUsd(quote.price, quote.currency);
    goal.approvals.unshift({
      approvalId: `APR-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      type: 'PROVIDER_OUTREACH',
      milestoneCode: quote.milestoneCode,
      quoteId,
      title: `Approve outreach to ${cleanText(quote.provider, 60)}`,
      summary: 'Human confirmation required before sending AI-drafted RFQ/negotiation message to external vendor.',
      amount: quote.price,
      currency: quote.currency,
      sandboxUsdAmount: fx.sandboxUsd,
      status: 'PENDING',
      requestedBy: 'NEGOTIATION_COPILOT'
    });
  }

  appendLog(goal, {
    actorRole,
    agent: 'NEGOTIATION_COPILOT',
    action: 'NEGOTIATION_DRAFTED',
    summary: `Drafted vendor RFQ script for ${quote.provider} via ${geminiRes.provider}; awaiting human outreach approval.`,
    level: 'INFO'
  });

  const saved = await saveGoalDoc(goal);
  return { goal: { ...saved, metrics: computeGoalMetrics(saved) }, quoteId, script: quote.negotiationScript, provider: geminiRes.provider };
}

async function requestApproval(goalId, body = {}, actorRole = 'OPERATOR') {
  const allowedTypes = ['PROVIDER_OUTREACH', 'PURCHASE_COMMITMENT', 'PAYMENT_AUTHORIZATION'];
  const type = String(body.type || '').toUpperCase();
  if (!allowedTypes.includes(type)) {
    throw Object.assign(new Error(`Approval type must be one of: ${allowedTypes.join(', ')}`), { status: 400 });
  }
  const title = cleanText(body.title, 150);
  const summary = cleanText(body.summary || body.title, 450);
  const amount = Math.max(0, Number(body.amount) || 0);
  if (title.length < 4) throw Object.assign(new Error('Approval title is required.'), { status: 400 });

  const goal = await findGoalById(goalId);
  if (!goal) throw Object.assign(new Error('Goal not found.'), { status: 404 });

  const fx = toSandboxUsd(amount, goal.currency);
  const approval = {
    approvalId: `APR-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
    type,
    milestoneCode: body.milestoneCode || null,
    quoteId: body.quoteId || null,
    title,
    summary,
    amount,
    currency: goal.currency,
    sandboxUsdAmount: Number(body.sandboxUsdAmount) > 0 ? Math.min(5000, Number(body.sandboxUsdAmount)) : fx.sandboxUsd,
    status: 'PENDING',
    requestedBy: actorRole,
    createdAt: new Date()
  };

  goal.approvals.unshift(approval);
  appendLog(goal, {
    actorRole,
    agent: 'ORCHESTRATOR',
    action: 'APPROVAL_REQUESTED',
    summary: `Requested ${type.replaceAll('_', ' ')} approval: ${title}.`,
    level: 'INFO'
  });

  const saved = await saveGoalDoc(goal);
  return { goal: { ...saved, metrics: computeGoalMetrics(saved) }, approval };
}

async function decideApproval(goalId, approvalId, body = {}, actorRole = 'OWNER') {
  const decision = String(body.decision || '').toUpperCase();
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    throw Object.assign(new Error('Decision must be APPROVED or REJECTED.'), { status: 400 });
  }
  const goal = await findGoalById(goalId);
  if (!goal) throw Object.assign(new Error('Goal not found.'), { status: 404 });

  const apr = goal.approvals.find((a) => a.approvalId === approvalId);
  if (!apr) throw Object.assign(new Error('Approval request not found.'), { status: 404 });

  apr.status = decision;
  apr.decidedByRole = actorRole;
  apr.decisionNote = cleanText(body.note || '', 280);
  apr.decidedAt = new Date();

  // If a PURCHASE_COMMITMENT is approved, automatically queue a PAYMENT_AUTHORIZATION gate if one isn't present
  if (decision === 'APPROVED' && apr.type === 'PURCHASE_COMMITMENT') {
    const hasPayAuth = goal.approvals.some((a) => a.quoteId && a.quoteId === apr.quoteId && a.type === 'PAYMENT_AUTHORIZATION');
    if (!hasPayAuth) {
      goal.approvals.unshift({
        approvalId: `APR-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        type: 'PAYMENT_AUTHORIZATION',
        milestoneCode: apr.milestoneCode,
        quoteId: apr.quoteId,
        title: `Authorize PayPal Sandbox payment: ${cleanText(apr.title, 80)}`,
        summary: 'Explicit human payment authorization required before staging or creating a PayPal Sandbox order.',
        amount: apr.amount,
        currency: apr.currency,
        sandboxUsdAmount: apr.sandboxUsdAmount || toSandboxUsd(apr.amount, apr.currency).sandboxUsd,
        status: 'PENDING',
        requestedBy: 'PAYMENT_PREP_AGENT',
        createdAt: new Date()
      });
    }
  }

  appendLog(goal, {
    actorRole,
    agent: 'HUMAN_GOVERNANCE',
    action: `APPROVAL_${decision}`,
    summary: `${actorRole} ${decision} ${apr.type}: "${apr.title}".`,
    level: decision === 'APPROVED' ? 'SUCCESS' : 'WARNING'
  });

  if (isDbReady()) {
    await writeAudit({
      action: `LIFE_APPROVAL_${decision}`,
      actor: actorRole,
      entityType: 'LifeGoal',
      entityId: goal.id || goal.goalRef,
      details: { approvalId, type: apr.type, amount: apr.amount }
    }).catch(() => {});
  }

  const saved = await saveGoalDoc(goal);
  return { ...saved, metrics: computeGoalMetrics(saved) };
}

// Agent 4: Execution Monitor Agent
async function runExecutionMonitor(goalId, actorRole = 'OPERATOR') {
  const goal = await findGoalById(goalId);
  if (!goal) throw Object.assign(new Error('Goal not found.'), { status: 404 });

  const metrics = computeGoalMetrics(goal);
  const blockedByDeps = goal.milestones.filter((m) =>
    m.status !== 'COMPLETED' && (m.dependsOn || []).some((d) => goal.milestones.find((p) => p.code === d)?.status !== 'COMPLETED')
  ).map((m) => m.code);

  const prompt = [
    'You are the PayPulse LIFE OS Execution Monitor Agent.',
    'Assess milestone progress, dependency bottlenecks, budget headroom, and deadline risk using only the supplied JSON.',
    'Return ONLY valid JSON: { "riskLevel": "LOW"|"MEDIUM"|"HIGH", "executionRisk": string (<= 320 chars), "nextRecommendedActions": string[] }'
  ].join('\n');

  const geminiRes = await callGeminiJson(prompt, {
    title: goal.title,
    currency: goal.currency,
    totalBudget: goal.totalBudget,
    metrics,
    blockedMilestones: blockedByDeps,
    milestones: goal.milestones.map((m) => ({ code: m.code, title: m.title, status: m.status, dependsOn: m.dependsOn, allocatedBudget: m.allocatedBudget }))
  });

  const fallbackRisk = metrics.daysRemaining < 10 && metrics.progressPct < 70
    ? 'HIGH'
    : metrics.pendingApprovals > 0 || blockedByDeps.length > 0
      ? 'MEDIUM'
      : 'LOW';

  const riskLevel = ['LOW', 'MEDIUM', 'HIGH'].includes(geminiRes.data?.riskLevel) ? geminiRes.data.riskLevel : fallbackRisk;
  const executionRisk = geminiRes.data?.executionRisk
    ? cleanText(geminiRes.data.executionRisk, 360)
    : `Progress at ${metrics.progressPct}% (${metrics.completedCount}/${metrics.totalMilestones} milestones), ${metrics.daysRemaining} day(s) to deadline, ${metrics.pendingApprovals} pending human approval(s).`;

  goal.agentInsights = {
    ...(goal.agentInsights || {}),
    executionRisk,
    riskLevel,
    lastAnalyzedAt: new Date(),
    retryCount: (goal.agentInsights?.retryCount || 0) + (geminiRes.retriesUsed || 0)
  };
  if (riskLevel === 'HIGH' && goal.status === 'ACTIVE') goal.status = 'AT_RISK';

  appendLog(goal, {
    actorRole,
    agent: 'EXECUTION_MONITOR',
    action: 'EXECUTION_MONITORED',
    summary: `Monitor evaluated goal (${geminiRes.provider}): risk ${riskLevel}, progress ${metrics.progressPct}%.`,
    level: riskLevel === 'HIGH' ? 'WARNING' : 'INFO'
  });

  const saved = await saveGoalDoc(goal);
  return {
    goal: { ...saved, metrics: computeGoalMetrics(saved) },
    monitor: {
      provider: geminiRes.provider,
      riskLevel,
      executionRisk,
      nextRecommendedActions: Array.isArray(geminiRes.data?.nextRecommendedActions)
        ? geminiRes.data.nextRecommendedActions.slice(0, 4).map((x) => cleanText(x, 180))
        : ['Clear pending human approvals before payment prep', 'Source real provider offers for active milestones']
    }
  };
}

// Agent 5: Payment Prep Agent (requires APPROVED PAYMENT_AUTHORIZATION + Admin Key)
async function preparePayPalPayment(goalId, approvalId, { createSandboxOrder = false } = {}, actorRole = 'OWNER') {
  const goal = await findGoalById(goalId);
  if (!goal) throw Object.assign(new Error('Goal not found.'), { status: 404 });

  const apr = goal.approvals.find((a) => a.approvalId === approvalId);
  if (!apr) throw Object.assign(new Error('Approval record not found.'), { status: 404 });
  if (apr.type !== 'PAYMENT_AUTHORIZATION') {
    throw Object.assign(new Error('Only PAYMENT_AUTHORIZATION approvals can initiate PayPal payment preparation.'), { status: 400 });
  }
  if (apr.status !== 'APPROVED') {
    throw Object.assign(new Error('Human approval is required (status must be APPROVED) before initiating PayPal payment.'), { status: 409 });
  }

  const fx = toSandboxUsd(apr.amount, apr.currency);
  const amountUsd = Number(apr.sandboxUsdAmount) > 0 ? Math.min(5000, Number(apr.sandboxUsdAmount)) : fx.sandboxUsd;
  const description = cleanText(`LIFE OS ${apr.milestoneCode || ''}: ${apr.title}`, 120);

  let orderResult = null;
  if (createSandboxOrder) {
    ensurePayPalConfigured();
    if (!isDbReady()) {
      throw Object.assign(new Error('Database connection required to persist PayPal Sandbox orders.'), { status: 503 });
    }
    const merchantReference = `LIFE-${crypto.randomUUID().replaceAll('-', '').slice(0, 14).toUpperCase()}`;
    const payment = await Payment.create({
      merchantReference,
      amount: amountUsd,
      currency: env.paypalCurrency,
      description,
      status: 'CREATED',
      source: 'PAYPAL'
    });
    try {
      const order = await createOrder({ amount: amountUsd, currency: env.paypalCurrency, description, merchantReference });
      payment.orderId = order.id;
      payment.rawCreateResponse = order;
      payment.status = statusFromOrder(order) === 'UNKNOWN' ? 'CREATED' : statusFromOrder(order);
      payment.lastSyncedAt = new Date();
      await payment.save();
      orderResult = {
        orderId: order.id,
        status: payment.status,
        approveUrl: extractApproveUrl(order),
        merchantReference
      };
    } catch (err) {
      payment.status = 'FAILED';
      payment.lastError = err.message;
      await payment.save();
      throw err;
    }
  }

  const txRef = `TX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const txRecord = {
    txRef,
    approvalId: apr.approvalId,
    milestoneCode: apr.milestoneCode,
    paypalOrderId: orderResult?.orderId || null,
    captureId: null,
    amountUsd,
    currency: 'USD',
    status: orderResult ? orderResult.status : 'STAGED_FOR_CHECKOUT',
    sandboxOnly: true,
    note: fx.capped ? 'Original amount converted & capped at $5,000.00 PayPal Sandbox ceiling.' : 'PayPal Sandbox USD test authorization.',
    recordedAt: new Date()
  };

  goal.transactions.unshift(txRecord);
  appendLog(goal, {
    actorRole,
    agent: 'PAYMENT_PREP_AGENT',
    action: orderResult ? 'SANDBOX_ORDER_CREATED' : 'PAYMENT_STAGED',
    summary: orderResult
      ? `Created PayPal Sandbox order ${orderResult.orderId} ($${amountUsd} USD) for ${apr.milestoneCode || 'goal'}.`
      : `Staged $${amountUsd} USD PayPal Sandbox checkout draft from approved authorization ${apr.approvalId}.`,
    level: 'SUCCESS'
  });

  const saved = await saveGoalDoc(goal);
  return {
    goal: { ...saved, metrics: computeGoalMetrics(saved) },
    stagedCheckout: { amount: amountUsd, description, currency: 'USD', approvalId: apr.approvalId },
    paypalOrder: orderResult,
    transaction: txRecord
  };
}

async function linkPayPalTransaction(goalId, { paypalOrderId, approvalId }, actorRole = 'OWNER') {
  if (!isDbReady()) throw Object.assign(new Error('Database connection required.'), { status: 503 });
  const orderId = cleanText(paypalOrderId, 80);
  if (!orderId) throw Object.assign(new Error('PayPal Order ID is required.'), { status: 400 });

  const goal = await findGoalById(goalId);
  if (!goal) throw Object.assign(new Error('Goal not found.'), { status: 404 });

  const payment = await Payment.findOne({ orderId, source: 'PAYPAL' });
  if (!payment) throw Object.assign(new Error('PayPal Sandbox order not found in Payment ledger.'), { status: 404 });

  const providerOrder = await getOrder(orderId).catch(() => null);
  if (providerOrder) {
    const providerStatus = statusFromOrder(providerOrder);
    const capture = captureFromOrder(providerOrder);
    payment.status = providerStatus === 'UNKNOWN' ? payment.status : providerStatus;
    payment.captureId = capture?.id || payment.captureId;
    payment.rawLastOrder = providerOrder;
    payment.lastSyncedAt = new Date();
    await payment.save();
  }

  let tx = goal.transactions.find((t) => t.paypalOrderId === orderId);
  if (tx) {
    tx.status = payment.status;
    tx.captureId = payment.captureId || tx.captureId;
  } else {
    tx = {
      txRef: `TX-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      approvalId: approvalId || 'MANUAL_LINK',
      milestoneCode: null,
      paypalOrderId: orderId,
      captureId: payment.captureId || null,
      amountUsd: payment.amount,
      currency: payment.currency || 'USD',
      status: payment.status,
      sandboxOnly: true,
      note: 'Synced from PayPal Sandbox Payment ledger.',
      recordedAt: new Date()
    };
    goal.transactions.unshift(tx);
  }

  appendLog(goal, {
    actorRole,
    agent: 'PAYMENT_PREP_AGENT',
    action: 'TRANSACTION_SYNCED',
    summary: `Synced PayPal Sandbox order ${orderId} (${payment.status}${payment.captureId ? ` · Capture ${payment.captureId}` : ''}).`,
    level: payment.status === 'COMPLETED' ? 'SUCCESS' : 'INFO'
  });

  const saved = await saveGoalDoc(goal);
  return { goal: { ...saved, metrics: computeGoalMetrics(saved) }, transaction: tx };
}

function getLifeOsStatus() {
  return {
    database: isDbReady() ? 'connected' : 'disconnected',
    geminiConfigured: Boolean(env.geminiApiKey),
    shoppingConfigured: Boolean(env.serpapiKey || (env.ebayClientId && env.ebayClientSecret)),
    paypalSandboxConfigured: env.paypalConfigured,
    adminKeyConfigured: Boolean(env.adminApiKey && env.adminApiKey.length >= 24),
    requiredEnvVars: [
      { key: 'MONGODB_URI', purpose: 'Persist goals, milestones, quotes, approvals, activity logs, and transaction refs', configured: Boolean(env.mongoUri) },
      { key: 'GEMINI_API_KEY', purpose: 'AI goal decomposition, negotiation copilot, and execution risk monitor (rules fallback if missing)', configured: Boolean(env.geminiApiKey) },
      { key: 'SERPAPI_KEY', purpose: 'Real Google Shopping provider discovery (explicit planning estimates if missing)', configured: Boolean(env.serpapiKey) },
      { key: 'PAYPAL_CLIENT_ID & PAYPAL_CLIENT_SECRET', purpose: 'PayPal Sandbox checkout orders & captures (USD only, max $5,000)', configured: env.paypalConfigured },
      { key: 'ADMIN_API_KEY', purpose: 'RBAC gate for human approvals and PayPal payment authorization', configured: Boolean(env.adminApiKey && env.adminApiKey.length >= 24) }
    ]
  };
}

module.exports = {
  redactPII,
  withRetry,
  validateGoalInput,
  toSandboxUsd,
  getLifeOsStatus,
  listGoals,
  getGoal,
  createGoal,
  seedRestaurantDemo,
  updateMilestoneStatus,
  runSourcingAgent,
  selectQuote,
  runNegotiationAgent,
  requestApproval,
  decideApproval,
  runExecutionMonitor,
  preparePayPalPayment,
  linkPayPalTransaction
};
