# PayPulse AI 2.1 — Commerce Intelligence + PayPal Sandbox Operations

**Search less. Understand better. Compare intelligently. Buy confidently.**

React 19 / Vite 8 + JavaScript + Node / Express + MongoDB + PayPal Sandbox + optional Gemini + optional Google Shopping (SerpApi) + optional eBay Browse API. This updates the supplied PayPulse codebase rather than replacing it with an unrelated template.

> **Status (12 November 2026): advanced hackathon / evaluation build. NOT an independently audited production shopping and payment service.** Live marketplace credentials, payment approvals, merchant agreements, user authentication, operational security, legal and privacy review, and production deployment still need completion. Do not expose real funds or personal customer data to it.

## What has changed

- **Unified monochrome UI:** Discover, Scanner, Compare, Saved, Decision Lab, Demand Circles, and the entire Payment Intelligence area now use the same layout, typography, buttons, cards and light/dark theme. The old payment dashboard is retained as a source reference only and is *not* the visible UI.
- **Live product discovery:** A server-side SerpApi Google Shopping adapter returns source-linked listings with titles, prices, images, sellers, ratings and snippets *when provided by upstream*. Optional eBay Browse search supports US/GB after eBay API access is approved. Search can consider a user's budget and needs. Upstream errors never turn into fake "live" items.
- **Explicit sample mode:** No provider key? The UI tells you to add `SERPAPI_KEY`. The fiction-based demo catalogue is available only when explicitly selected. Demo listings cannot be mistaken for real retailer offers.
- **Camera and image scanner:** Browser camera; native BarcodeDetector when available; `@zxing/browser` barcode fallback; barcode detection from an uploaded photo; Open Food Facts lookup for food product barcodes; Gemini multimodal identification of consumer objects. AI outputs **suggested search terms**, which can be sent to the live product search (user must confirm exact model). When no key, photo recognition reports NOT_CONNECTED instead of pretending to work.
- **Evidence-based result cards:** Product photos, store identity, provider price and currency, available specs, ranking, saved lists, comparators, real outbound source links. No unauthorized retailer checkout, payment capture or iframe.
- **Protected operations:** A new `ADMIN_API_KEY` protects payment/admin API routes. Sandbox checkout, records, verified webhooks, investigations, manual reconciliation and development-only reliability simulation are available inside the redesigned Payment Intelligence page. This is still not a replacement for full identity/tenant management.
- **Decision tools and buyer notes:** Ownership cost, cost per use, repair-versus-replace, subscriptions, warranty notes, etc. Local notes are browser-based; they are NOT cloud synced.
- **Demand Circles:** explicitly simulated group purchasing. Public mutation endpoints are disabled in production mode. Not real multi-buyer contracting or escrow.
- **Webhook ordering:** out-of-order notifications cannot downgrade a COMPLETED or REFUNDED payment state; capture remains PayPal-verified. Existing webhook signature validation remains.

## Minimum Windows setup (PowerShell)

From the **top-level project folder** containing both `client/` and `server/`, not from inside `server/`:

```powershell
(Get-Content .\package.json | ConvertFrom-Json).name
# Expected: paypulse-ai
Copy-Item server\.env.example server\.env
# If server\.env already exists, KEEP it, do not overwrite. Manually add new variables.
notepad server\.env
npm install
npm run dev
```

Frontend: **http://localhost:5173**. Health: **http://localhost:5000/api/health**. Node **22.12+** recommended (Node 24 also works with recent Vite). Add MongoDB Atlas `MONGODB_URI` to the `.env` or use Docker: `docker compose up -d mongo`. `node_modules/` and `server/.env` are intentionally excluded.

**If your existing `server/.env` is already configured**, add only the missing variables from `server/.env.example`. Keep your previous PayPal Sandbox and MongoDB values. Do not share or commit secrets.

### `.env` checklist

| Variable | Required for | Action |
|---|---|---|
| `SERPAPI_KEY` | **Real shopping search** | Get key from https://serpapi.com/ and add to `.env` |
| `GEMINI_API_KEY` | **Photo identification and AI explanations** | Get key from Google AI Studio |
| `ADMIN_API_KEY` | **Payment Intelligence admin access** | Generate random 64-character hex below |
| `MONGODB_URI` | **Payment database and events** | Keep your existing MongoDB Atlas URI or start local MongoDB |
| `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` | **Sandbox test checkout** | Keep Sandbox credentials, NOT Live keys |
| `PAYPAL_WEBHOOK_ID` | **Verified webhook recording** | Copy the webhook ID from the same Sandbox app |
| `SHOPPING_COUNTRY` | Shopping currency/country | Set IN, US or GB (default IN) |
| `EBAY_CLIENT_ID` / `EBAY_CLIENT_SECRET` | Optional US/GB eBay listings | Requires separate approved eBay access |
| `PRODUCT_USER_AGENT` | Open Food Facts barcode API | Set **your own** project contact email or URL per provider policy |

Generate `ADMIN_API_KEY` securely:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the output after `ADMIN_API_KEY=` in **server/.env**. Restart `npm run dev`. When entering **Payment Intelligence**, paste the same key into the admin-key dialog. It is stored only in the active browser session (not localStorage).

**Important:** No additional `.env` file is needed for frontend client keys. All providers are accessed from the Node backend; the client receives only server responses. The PayPal public Client ID is deliberately sent to the SDK.

## How to test the new real-data journey

1. Add `SERPAPI_KEY`, restart server.
2. In **Discover**, select **Live listings**, country **India**, and search `Laptop for coding and editing under ₹60000`.
3. Results should contain provider-reported merchant photos/prices and a **View listing** action. Click a source link and verify it. Availability and prices are not guaranteed until merchant checkout.
4. In **Smart Scanner**, upload a clear photo (max 12 MB before automatic compression) with `GEMINI_API_KEY` configured. Confirm the AI-proposed item. Click **Find live listings**. For food EAN/UPC barcodes, Open Food Facts may identify the product with no Gemini key. For other barcodes, use **Search this barcode as text**.
5. Compare up to four, save a product, try Decision Lab. These notes persist **locally in your browser**.
6. In Payment Intelligence, enter `ADMIN_API_KEY`, then test the Sandbox checkout using a **Sandbox Personal buyer** and the **Sandbox Business seller** belonging to the configured REST app. Check capture status and webhook evidence.

### Ngrok for Sandbox webhooks (optional)

```powershell
ngrok http 5000
```

Add `https://YOUR-TUNNEL.ngrok-free.app/api/webhooks/paypal` to the **same PayPal Sandbox REST app**, subscribe to approved/capture events, copy the resulting webhook ID into `.env`, then restart the API. Never share the admin key or expose a public admin session over an untrusted development tunnel.

## Architecture

```text
paypulse-ai/
├── client/
│   └── src/
│       ├── App.jsx                 # Commerce shell; live and explicit sample modes
│       ├── commerce.css            # Shared monochrome design
│       ├── upgrades.css            # UI refinements and operations theming
│       └── components/
│           ├── Operations.jsx      # New fully redesigned payment intelligence
│           ├── Scanner.jsx         # ZXing + camera + Gemini + search handoff
│           ├── DecisionLab.jsx     # Existing explainable calculators
│           ├── Circles.jsx         # Existing interactive simulation
│           └── PayPalCheckout.jsx  # Existing Sandbox buttons
├── server/
│   ├── .env.example
│   ├── src/
│   │   ├── services/liveCommerceService.js  # Live provider logic and normalization
│   │   ├── services/commerceService.js      # Intent/relevance/vision/explanations
│   │   ├── routes/commerceRoutes.js         # API entrypoints
│   │   ├── middleware/requireAdmin.js       # API gate for operations
│   │   ├── services/paypalService.js        # Preserved PayPal Orders v2
│   │   └── ...                             # Payment/webhooks/models/fixtures
│   └── test/                               # Unit, mocks and API smoke tests
├── docs/
├── README.md
└── package.json
```

### API highlights

- `POST /api/commerce/assistant` — `{query,mode:'live'|'demo',country:'IN'|'US'|'GB'}` → products, intent, provider evidence, AI summary, errors.
- `POST /api/commerce/search` — same parameters; no Gemini required.
- `GET /api/commerce/providers` — honest credential readiness flags.
- `POST /api/commerce/scan-image` — base64 JPEG/PNG/WebP + MIME; returns suggested identification or failure reason.
- `GET /api/commerce/barcode/:code` — Open Food Facts food barcode or labelled sample lookup.
- `POST /api/commerce/decision/:tool` — previous deterministic decision tools.
- `/api/payments/*`, `/api/dashboard/*`, `/api/dev/*` — require the `X-Admin-Key` header; frontend handles it within Payment Intelligence.
- `/api/webhooks/paypal` — provider-signed webhook, not admin-key login.

## Quality checks performed here

- **27 unit/mock tests passed**: intent, sample mode, live provider mapping, upstream failures, URI filtering, photo Gemini request formatting and fallback, admin key checks, payment-state transitions and decision calculators.
- **9 frontend JS/JSX files parsed** with TypeScript's JSX parser; zero syntax diagnostics.
- **Not verified in this build environment:** `npm install` (the npm registry DNS is unavailable), full Vite production build, browser rendering and interaction tests, external SerpApi/Gemini/eBay/Open Food Facts network calls, PayPal buyer approval/capture, MongoDB-connected webhook and end-to-end workflows. These must be run after installing dependencies on your own machine.
- Run `npm test`, `npm run build`, and `npm audit` after `npm install`. Address audit findings deliberately; avoid `npm audit fix --force` without reviewing breaking upgrades.

## Market launch blockers (do not skip)

This build is **NOT safe for public live-money processing**. Before a market launch: implement user sign-in/roles and proper sessions, durable user/product persistence, tenant-specific merchant onboarding, merchant terms/licensing and product data permissions, payments and refunds for authorized merchants only, verified buyer workflows, abuse prevention, GDPR/India privacy compliance as applicable, observability, reliable queues/webhook outbox, external security review, data retention policy, legal/tax consultation, and live integration/regression tests. All PayPal actions in this package deliberately remain **Sandbox-only**. Amazon and Flipkart checkout are not integrated; links go to their own authorized listing pages when a data provider actually returns them.

## Official provider references

- SerpApi Google Shopping: https://serpapi.com/google-shopping-api
- eBay Browse API: https://developer.ebay.com/api-docs/buy/static/api-browse.html
- Open Food Facts: https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/
- Gemini API: https://ai.google.dev/gemini-api/docs
- PayPal Checkout: https://developer.paypal.com/checkout/integrate

## PayPulse LIFE OS & Future of PayPal

- **PayPulse LIFE OS (`/api/life-os/*`, `LifeOS.jsx`)**: AI goal-to-outcome orchestration platform persisted in MongoDB (`LifeGoal` model) with 5 specialized agents (**Planner**, **Sourcing**, **Negotiation Copilot**, **Execution Monitor**, **Payment Prep**), PII redaction before Gemini prompts, exponential backoff retries, task dependency enforcement, RBAC (`X-Life-Role`: `OWNER` | `OPERATOR` | `VIEWER`), human approval gates (`PROVIDER_OUTREACH`, `PURCHASE_COMMITMENT`, `PAYMENT_AUTHORIZATION` requiring `X-Admin-Key`), and a complete flagship demo: **“Launch a small restaurant within a fixed budget and deadline”** (`POST /api/life-os/demo/restaurant`).
- **Future of PayPal (`/api/future/*`, `FuturePayPal.jsx`)**: Agentic Spend Guardrails, Programmable Smart Escrow milestones, Cross-Border FX & PYUSD Split-Pay estimator, and AI Fraud Shield & Self-Healing Ledger Reconciliation.
- **Required `server/.env` variables**: `MONGODB_URI`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_CURRENCY=USD`, `ADMIN_API_KEY` (32+ chars), `GEMINI_API_KEY` (optional; rules fallback active when missing/rate-limited), `SERPAPI_KEY` (optional; explicit planning estimates used when missing).

PayPulse AI is an independent project and is **not endorsed by or affiliated with PayPal**.
