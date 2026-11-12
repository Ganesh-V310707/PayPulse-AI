# PayPulse AI + PayPulse LIFE OS — Complete System & Hackathon Guide

> **Purpose of this document:** Written for both **hackathon judges/presenters** and **AI systems/coding agents** to immediately understand everything PayPulse AI does, how its frontend, backend, AI agents, MongoDB persistence, and PayPal Sandbox payment pipelines fit together, and where its real vs. simulated boundaries lie.

---

## 1. Executive Summary (What PayPulse AI Does)

**PayPulse AI** is a full-stack **Commerce Intelligence, Goal-to-Outcome Orchestration, and PayPal Sandbox Payment Operations** platform built with **React 19 + Vite 8**, **Node.js + Express 5**, **MongoDB + Mongoose**, **Google Gemini**, **SerpApi / eBay Browse / Open Food Facts**, and **PayPal Checkout v2 Sandbox**.

It combines three unified pillars in one consistent monochrome/slate UI (`DM Sans` + `Manrope`, light & dark modes):

1. **Commerce Intelligence (`Discover`, `Smart Scanner`, `Compare Studio`, `Saved`, `Decision Lab`, `Demand Circles`)**
   - Natural-language shopping search across `IN` (`INR`), `US` (`USD`), and `GB` (`GBP`) using live product APIs (SerpApi Google Shopping / eBay Browse) or an explicitly labeled sample catalogue.
   - Camera/photo barcode scanning (`BarcodeDetector` + `@zxing/browser` + Open Food Facts) and Gemini Vision product identification.
   - 9 transparent ownership/financial calculators + local Decision Journal & Warranty Passport.
2. **PayPulse LIFE OS (`Life OS` — Flagship Goal-to-Outcome Orchestration)**
   - Users define a real-world goal, fixed budget, location, and deadline (e.g., the built-in flagship demo: **“Launch a small restaurant within a fixed budget and deadline”**).
   - A 5-agent AI pipeline (**Planner**, **Sourcing**, **Negotiation Copilot**, **Execution Monitor**, **Payment Prep**) decomposes the goal into dependency-ordered milestones, fetches real product offers via `liveCommerceService`, drafts vendor RFQ scripts, enforces **Human-in-the-Loop Approvals** (`PROVIDER_OUTREACH`, `PURCHASE_COMMITMENT`, `PAYMENT_AUTHORIZATION`), and executes authorized **PayPal Sandbox** orders—persisted in MongoDB with RBAC and PII redaction.
3. **Future of PayPal & Payment Intelligence (`Future of PayPal`, `Payment Intelligence`)**
   - **4 Next-Gen PayPal Features**: Agentic Spend Guardrails, Programmable Smart Escrow, Cross-Border FX & PYUSD Split-Pay Router, and AI Fraud Shield & Self-Healing Reconciliation Copilot.
   - **Hardened PayPal Sandbox Operations**: Order creation (`CREATED` with `approveUrl`), PayPal JS SDK Buttons + redirect/link fallback, idempotent server-side capture, live order reconciliation, verified webhook ingestion, AI incident investigation, and local failure simulations.

---

## 2. Tech Stack & Directory Map

```text
paypulse-ai/
├── package.json                          # Monorepo workspaces: client, server
├── README.md                             # Setup, API highlights, .env checklist
├── PAYPULSE_AI_OVERVIEW.md               # This complete system & AI overview
├── client/                               # React 19 + Vite 8 + Tailwind CSS v4 + Lucide
│   ├── index.html                        # DM Sans & Manrope font imports
│   ├── vite.config.js                    # Proxies /api -> http://localhost:5000
│   └── src/
│       ├── main.jsx                      # App entry + CSS imports
│       ├── App.jsx                       # Shell, sidebar nav, Discover, Compare, Saved, Modal
│       ├── commerce.css                  # Core design tokens & layout
│       ├── upgrades.css                  # Architectural light/dark surfaces, Future & Life OS styles
│       ├── lib/api.js                    # Axios instance; injects X-Admin-Key & X-Life-Role headers
│       └── components/
│           ├── LifeOS.jsx                # Flagship Goal-to-Outcome OS + Restaurant Demo
│           ├── FuturePayPal.jsx          # 4 Future-of-PayPal capabilities
│           ├── Operations.jsx            # Protected Payment Intelligence dashboard
│           ├── PayPalCheckout.jsx        # PayPal JS SDK + 3-step tracker + fallback capture
│           ├── Scanner.jsx               # Camera/photo barcode + Gemini Vision scanner
│           ├── DecisionLab.jsx           # 9 calculators + Decision Journal + Warranty Passport
│           └── Circles.jsx               # Simulated demand-first group buying
└── server/                               # Node.js + Express 5 + Mongoose 9
    ├── .env.example                      # Template of environment variables (never share .env)
    ├── src/
    │   ├── server.js                     # Connects MongoDB & starts Express server
    │   ├── app.js                        # Helmet, CORS, rate limiting, health/config, route mounting
    │   ├── config/
    │   │   ├── env.js                    # Loads .env; hard-locks PayPal to Sandbox
    │   │   └── database.js               # Mongoose connection manager
    │   ├── middleware/
    │   │   ├── requireAdmin.js           # Constant-time X-Admin-Key verification
    │   │   ├── requireRole.js            # RBAC (OWNER | OPERATOR | VIEWER) + optional Admin Key
    │   │   ├── requireDatabase.js        # Returns 503 if MongoDB is disconnected
    │   │   ├── requestContext.js         # Request ID correlation
    │   │   └── errorHandler.js           # JSON 404 & safe error formatting
    │   ├── models/
    │   │   ├── LifeGoal.js               # Goals, milestones, quotes, approvals, tx refs, logs
    │   │   ├── AgentPolicy.js            # Agentic Spend Guardrails configuration
    │   │   ├── EscrowContract.js         # Programmable Smart Escrow milestones & audit trail
    │   │   ├── Payment.js                # PayPal & local simulation payment ledger
    │   │   ├── WebhookEvent.js           # Verified PayPal & simulated webhook deliveries
    │   │   ├── Incident.js               # Payment exceptions & AI investigation records
    │   │   └── AuditLog.js               # Security & operational audit trail
    │   ├── services/
    │   │   ├── lifeOsService.js          # 5 AI agents, PII redaction, retry, demo & PayPal prep
    │   │   ├── futureService.js          # Guardrails, Escrow, FX/PYUSD split, Fraud & Batch Sync
    │   │   ├── paypalService.js          # PayPal OAuth2, v2 Orders, Capture, Get, Webhook Verify
    │   │   ├── paymentState.js           # State mapping, deterministic request IDs, non-regression
    │   │   ├── liveCommerceService.js    # SerpApi Google Shopping, eBay Browse, Open Food Facts
    │   │   ├── commerceService.js        # Intent extraction, demo search, Gemini summaries/vision
    │   │   ├── decisionService.js        # 9 deterministic calculators
    │   │   ├── circlesService.js         # In-memory simulated demand circles
    │   │   ├── aiService.js              # Payment incident AI investigation + rules fallback
    │   │   ├── incidentService.js        # Upserts payment incidents
    │   │   └── auditService.js           # Writes AuditLog records
    │   ├── controllers/                  # lifeOsController, futureController, paymentController, webhookController, devController
    │   └── routes/                       # lifeOsRoutes, futureRoutes, commerceRoutes, paymentRoutes, dashboardRoutes, webhookRoutes, devRoutes, circlesRoutes
    └── test/                             # Node test runner suite (42 automated tests)
```

---

## 3. Complete Feature Breakdown (All 9 Workspace Views)

### A. PayPulse LIFE OS (`LifeOS.jsx` · `/api/life-os/*`)
An AI-powered **Goal-to-Outcome Orchestration Platform** persisted in MongoDB:
1. **Goal Decomposition (`Planner Agent`)**: Takes a user's goal, budget, location, country (`IN`/`US`/`GB`), and deadline; strips PII via `redactPII()`; calls Gemini with exponential-backoff retries (`withRetry`, falling back cleanly to `RULES` if unavailable); produces 4–6 milestones with task dependencies (`dependsOn`), allocated budgets, and `PRODUCT` vs. `SERVICE` procurement items.
2. **Dependency Enforcement**: Milestones cannot transition to `IN_PROGRESS` or `COMPLETED` until prerequisite `dependsOn` milestones are `COMPLETED` (returns `409 Conflict` if violated).
3. **Real Provider Discovery (`Sourcing Agent`)**: Queries `liveCommerceService.liveSearch` for `PRODUCT` items and stores real merchant listings (`GOOGLE_SHOPPING` / `EBAY`, `isRealProvider: true`) alongside explicitly labeled unverified `PLANNING_ESTIMATE` entries for `SERVICE` items or offline searches.
4. **Negotiation Copilot (`Negotiation Copilot Agent`)**: Drafts vendor RFQ and counter-offer outreach scripts for any quote, strictly gated behind a `PROVIDER_OUTREACH` human approval before sending.
5. **Human-in-the-Loop Governance**: Three explicit approval types stored in MongoDB:
   - `PROVIDER_OUTREACH` (before contacting vendors)
   - `PURCHASE_COMMITMENT` (before committing to a selected quote)
   - `PAYMENT_AUTHORIZATION` (required before initiating any PayPal Sandbox order)
6. **Execution Monitor (`Execution Monitor Agent`)**: Calculates progress %, budget headroom, days remaining, dependency blockers, and AI risk level (`LOW`/`MEDIUM`/`HIGH`).
7. **Authorized PayPal Sandbox Execution (`Payment Prep Agent`)**: Converts approved `INR`/`GBP`/`USD` amounts to `USD` (capped at the `$5,000.00` PayPal Sandbox limit), stages or creates real PayPal Sandbox orders, and syncs transaction references (`orderId`, `captureId`, `status`) onto the `LifeGoal`.
8. **Flagship Working Demo**: One-click **“Launch a small restaurant within a fixed budget and deadline”** (`₹8,50,000 INR`, `Bengaluru, India`, 60 days, 5 interdependent milestones, 3 human approval gates).
9. **RBAC & Security**: `X-Life-Role` header (`OWNER` | `OPERATOR` | `VIEWER`) blocks `VIEWER` mutations (`403`), and approval decisions + PayPal execution additionally enforce `X-Admin-Key` (`401`).

### B. Future of PayPal (`FuturePayPal.jsx` · `/api/future/*`)
Four programmable commerce and payment-rail features:
1. **Agentic Spend Guardrails**: User-configured per-order cap, 24h daily cap, step-up threshold, and execution mode (`SUPERVISED`, `AUTONOMOUS_UNDER_CAP`, `FROZEN`) evaluated against real 24h MongoDB `Payment` velocity before staging Sandbox checkout.
2. **Programmable Smart Escrow**: Milestone-based conditional settlement contracts (`DRAFT` → `FUNDED_SANDBOX` → `DISPATCH_VERIFIED` → `RELEASED` or `DISPUTE_HOLD`) with per-milestone unlock/release and full audit trail.
3. **Cross-Border FX & PYUSD Split-Pay Router**: Converts `INR`/`GBP`/`USD` budgets into per-buyer `USD` shares (including loading active Demand Circles), compares **PYUSD Programmable Rail (Simulated)** vs. **PayPal Direct** vs. **Legacy Card FX**, and stages the per-person share into PayPal Sandbox Checkout.
4. **AI Fraud Shield & Self-Healing Copilot**: Scores pre-checkout or `orderId`-linked chargeback risk & PayPal Seller Protection eligibility (Gemini + rules fallback), plus admin-protected **Batch Sandbox Reconciliation** (`POST /api/future/reconcile-batch`) to repair stale open orders against live PayPal Sandbox state.

### C. Payment Intelligence & PayPal Sandbox Checkout (`Operations.jsx`, `PayPalCheckout.jsx`)
- Protected by `X-Admin-Key` (`requireAdmin`, constant-time comparison, stored in `sessionStorage` only).
- **PayPal Sandbox Checkout**:
  - Creates v2 Orders (`intent: 'CAPTURE'`, `application_context` returning `CREATED` + `approveUrl`).
  - Supports `@paypal/react-paypal-js` `<PayPalButtons>` popup approval (with ref-backed live amount/description and `forceReRender`), plus redirect return handling (`?paypal=approved&token=...`), **Open PayPal Approval** link fallback, **Check Status** reconciliation, and **Verify & Capture**.
  - **Idempotent Server Capture**: Checks provider state via `GET /v2/checkout/orders/:id` before capturing with deterministic `PayPal-Request-Id` (`cap_<orderId>`); never double-captures.
- **Webhook Monitor**: Verifies PayPal webhook signatures via `/v1/notifications/verify-webhook-signature`, deduplicates deliveries by `eventId` with lease recovery, and enforces monotonic status transitions (`shouldApplyWebhookStatus`).
- **AI Incident Investigation & Reliability Lab**: Gemini/rules root-cause analysis on payment exceptions + 5 local failure simulations (`capture-db-gap`, `duplicate-webhook`, `pending-capture`, `denied-capture`, `missing-webhook`).

### D. Commerce Discovery, Scanner, Compare, Saved, Decision Lab & Demand Circles
- **Discover (`App.jsx`)**: Natural-language intent extraction (`INR`/`USD`/`GBP`), live Google Shopping (SerpApi) & eBay Browse adapters, explicit sample catalogue mode, relevance/price sorting, Gemini grounded summary, and **Test in PayPal Guardrails** action in the product modal.
- **Smart Scanner (`Scanner.jsx`)**: Live camera (`BarcodeDetector` + `@zxing/browser`), photo barcode extraction, Open Food Facts lookup, and Gemini Vision item suggestion.
- **Compare Studio & Saved (`App.jsx`)**: Side-by-side comparison of up to 4 listings + browser-persisted shortlist (`localStorage`).
- **Decision Lab (`DecisionLab.jsx`)**: 9 deterministic calculators (true ownership cost, cost per use, need vs. want, subscription leak detector, savings timeline, resale scenario, repair vs. replace, return risk, repair lifetime extender) + Decision Journal & Warranty Passport.
- **Demand Circles (`Circles.jsx`)**: Explicitly simulated demand-first group buying circles & demo merchant quotes (mutations disabled in `production`).

---

## 4. Complete API Surface (For AI / Developer Reference)

| Prefix | Auth / Role | Key Endpoints |
|---|---|---|
| `/api/health`, `/api/config/public` | Public (no secrets) | Service & integration readiness, public PayPal Client ID & currency |
| `/api/commerce/*` | Public (rate-limited) | `POST /assistant`, `POST /search`, `GET /providers`, `GET /barcode/:code`, `POST /scan-image`, `POST /decision/:tool`, `POST /compare`, `GET /demo/products` |
| `/api/circles/*` | Public (dev only writes) | `GET /`, `POST /`, `POST /:id/join`, `POST /:id/bids` |
| `/api/payments/*` | `X-Admin-Key` + DB | `GET /`, `GET /:orderId`, `POST /orders`, `POST /:orderId/capture`, `POST /:orderId/reconcile`, `POST /:orderId/investigate` |
| `/api/dashboard/*` | `X-Admin-Key` + DB | `GET /summary`, `GET /incidents`, `PATCH /incidents/:id`, `GET /events` |
| `/api/dev/*` | `X-Admin-Key` + DB (non-prod) | `POST /scenarios`, `DELETE /scenarios` |
| `/api/webhooks/paypal` | PayPal Signature + DB | `POST /paypal` (raw body signature verified) |
| `/api/future/*` | Public / `X-Admin-Key` | `GET/PUT /guardrails`, `POST /guardrails/evaluate`, `GET/POST /escrows`, `POST /escrows/:id/:action`, `POST /fx-split`, `POST /risk-score`, `POST /reconcile-batch` (`X-Admin-Key`) |
| `/api/life-os/*` | `X-Life-Role` (+ `X-Admin-Key` on approve/pay) | `GET /status`, `GET/POST /goals`, `POST /demo/restaurant`, `GET /goals/:id`, `POST /goals/:id/milestones/:code/status`, `POST /goals/:id/milestones/:code/source`, `POST /goals/:id/quotes/:quoteId/select`, `POST /goals/:id/quotes/:quoteId/negotiate`, `POST /goals/:id/approvals`, `POST /goals/:id/approvals/:approvalId/decide`, `POST /goals/:id/monitor`, `POST /goals/:id/payments/prepare`, `POST /goals/:id/payments/link` |

---

## 5. Security, Privacy & Truthfulness Guarantees

- **Sandbox-Locked Payments**: `server/src/config/env.js` forces `paypalBaseUrl = 'https://api-m.sandbox.paypal.com'` regardless of env overrides.
- **No Credential Leakage**: Secrets live solely in `server/.env` (never bundled into `client/`, never returned by `/api/health` or `/api/config/public`).
- **PII Redaction**: `lifeOsService.redactPII()` strips emails, phone numbers, and token strings before sending text to Gemini.
- **Honest Data Provenance**:
  - Live shopping results come strictly from SerpApi/eBay with real outbound links; missing API keys or non-retail service items show clearly labeled `PLANNING_ESTIMATE` / `DEMO` badges—never fabricated quotes.
  - Negotiation Copilot outputs are drafts requiring human approval—never claiming a vendor agreed.
  - PYUSD & FX estimates are clearly labeled as indicative hackathon estimates; actual PayPal Sandbox checkout runs in `USD` up to `$5,000.00`.

---

## 6. Required `server/.env` Variables & Running Commands

Never commit or share `server/.env`. Use `server/.env.example` as the template:
- `MONGODB_URI` — MongoDB connection string (goals, milestones, payments, escrows, policies, audit logs)
- `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_CURRENCY=USD`, `PAYPAL_WEBHOOK_ID`
- `ADMIN_API_KEY` — 32+ char secret unlocking Payment Intelligence, batch reconciliation, and Life OS approvals/payments
- `GEMINI_API_KEY`, `GEMINI_MODEL=gemini-2.5-flash` — AI planning, negotiation drafts, vision, risk & incident analysis (deterministic rules fallback when unavailable)
- `SERPAPI_KEY`, `SHOPPING_COUNTRY=IN` (plus optional `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET`, `PRODUCT_USER_AGENT`)

### Run & Verify
```powershell
npm install
npm test        # Runs all 42 Node tests across server/test/*.test.js
npm run build   # Builds client/dist via Vite
npm run dev     # Starts API (:5000) and Web (:5173) concurrently
```

---

## 7. 2-Minute Hackathon Judge Demo Script

1. **Discover (`:5173`)**: Search *"Laptop for coding under ₹60,000"* in Live listings to show real provider cards, budgets, and Gemini/explainable intelligence.
2. **PayPulse LIFE OS**: Click **Life OS** → click **Restaurant Demo** (*"Launch a small restaurant within a fixed budget and deadline"*, `₹8,50,000 INR`, 5 interdependent milestones).
   - Try completing `M2` before `M1` to demonstrate dependency protection (`409`).
   - Click **Source Real Providers** on `M2` or `M3` to pull live Google Shopping offers alongside labeled service estimates.
   - Click **AI Negotiation Copilot** on an offer to draft an RFQ script.
   - Open **Human Approvals**, unlock with `ADMIN_API_KEY`, and approve `PAYMENT_AUTHORIZATION` (`OWNER` role).
   - Open **PayPal Sandbox & Integrations** → **Create Sandbox Order Now** (or **Stage in PayPal Checkout**) to create a real PayPal Sandbox order linked to the goal!
3. **Future of PayPal**: Show **Agentic Spend Guardrails**, **Programmable Smart Escrow** milestone release/dispute hold, **PYUSD FX & Split-Pay**, and **AI Fraud Shield + Self-Healing Batch Sync**.
4. **Payment Intelligence**: Show live 3-step PayPal Sandbox Checkout (`Created` → `Approved` → `Captured`), webhook monitor, and AI incident investigation.
