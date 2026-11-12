# PayPulse AI — Payment Reliability Workbench

PayPulse AI is a hackathon-ready, single-merchant prototype for payment operations. It connects to **PayPal Sandbox** for real test orders and captures, stores payment state and webhook deliveries in MongoDB, and uses Gemini (with a rules-based fallback) to investigate transaction exceptions.

> **Important:** PayPulse is a prototype, not a payment processor. PayPal is the payment provider and source of truth for its order/capture state. Local test scenarios are explicitly labelled `LOCAL SIMULATION`; they are not PayPal transactions, and their events are not verified PayPal webhooks.

## What is included

- **React + Vite + Tailwind CSS dashboard:** Overview, payment ledger, incidents, webhook event monitor and integration readiness, with a custom payment-operations visual system.
- **PayPal JavaScript SDK:** Renders PayPal checkout buttons in the browser.
- **PayPal REST Orders v2:** Server-side OAuth, order creation, capture and retrieval.
- **Webhook receiver:** Verifies PayPal webhook signatures through PayPal's verification API, stores event IDs, and ignores duplicate event processing while recording repeat deliveries.
- **Reconciliation:** Re-queries the PayPal order before changing the local payment ledger. A timeout is never treated as proof of failure or success.
- **AI investigation:** Gemini can summarize evidence and recommend next steps. Without a Gemini key, a deterministic rules-based explanation is used.
- **Reliability Lab:** Local fixtures for capture/database gaps, duplicate webhook deliveries, pending captures, denied captures and missing webhook events.
- **MongoDB models:** Payments, webhook events, incidents and audit logs.
- **Security basics:** server-side secrets, Helmet, restricted CORS, rate limits, JSON body limit, amount/currency validation, request IDs, webhook signature verification and production-disabled local fixtures.
- **Tests:** Node's built-in test runner and Supertest smoke tests for health/config endpoints, plus payment-state unit tests.

## Requirements

- Node.js **20.19+ or 22.12+** (Node 22 LTS recommended) and npm. These ranges satisfy the Vite 8 runtime requirement.
- MongoDB 7+ locally, or a MongoDB Atlas connection string.
- PayPal Developer Sandbox REST app credentials for real sandbox checkout.
- Optional Gemini API key for model-based incident analysis. The application still works with the rules-based investigator without this key.

## Quick start

### 1. Extract and install

Open a terminal in the extracted `paypulse-ai` folder:

```bash
npm install
```

### 2. Start MongoDB

Choose **one** option.

**Option A — Docker (quickest):**

```bash
docker compose up -d mongo
```

**Option B — MongoDB Atlas:** create a database user, allow your development IP in Network Access, and use the cluster connection string. Do not commit the connection string.

### 3. Configure server environment

Copy the template:

```bash
# macOS / Linux
cp server/.env.example server/.env

# Windows PowerShell
Copy-Item server/.env.example server/.env
```

Edit `server/.env` and set:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
MONGODB_URI=mongodb://127.0.0.1:27017/paypulse_ai
PAYPAL_ENV=sandbox
PAYPAL_CLIENT_ID=YOUR_SANDBOX_CLIENT_ID
PAYPAL_CLIENT_SECRET=YOUR_SANDBOX_CLIENT_SECRET
PAYPAL_WEBHOOK_ID=
PAYPAL_CURRENCY=USD
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Use the **Sandbox** Client ID and Secret from PayPal Developer Dashboard → Apps & Credentials → Sandbox. Do not put the Client Secret in any `client/` file. This starter is intentionally hard-locked to PayPal Sandbox: even if `PAYPAL_ENV=live` is entered by mistake, the server will not call PayPal Live. Never use live credentials in this prototype.

### 4. Run the application

From the project root:

```bash
npm run dev
```

Open:

- Frontend: <http://localhost:5173>
- Backend health: <http://localhost:5000/api/health>

The dashboard's Integrations page tells you whether PayPal, Gemini, MongoDB and webhook credentials are configured. If MongoDB is not connected, payment storage and the Reliability Lab will show a clear setup warning.

### 5. Make a Sandbox payment

1. Confirm `PAYPAL_ENV=sandbox` and that the server health endpoint reports PayPal `configured`.
2. Open the dashboard Overview.
3. Enter an amount and description in **Test a payment**.
4. Approve the PayPal button using a Sandbox **Personal (buyer)** account from Developer Dashboard → Testing Tools → Sandbox Accounts.
5. The browser approval callback calls the Express capture endpoint. The backend checks the order with PayPal and captures only an approved order.
6. Confirm the transaction appears as `COMPLETED` in PayPulse and in the Sandbox Business account.

The React checkout uses PayPal React SDK 8.8.3 with the classic JavaScript SDK v5 `PayPalScriptProvider` / `PayPalButtons` interface. PayPal also publishes a newer JavaScript SDK v6 API; this starter deliberately pins the v8 React wrapper to keep the familiar Orders v2 button flow simple for the first Sandbox prototype. The application uses USD by default. The backend currently accepts only the currency configured by `PAYPAL_CURRENCY` and caps checkout amounts at 5,000 units for this demonstration. Update the allow-list and test account/currency compatibility deliberately if changing the currency.

## PayPal webhook setup

PayPal must be able to reach a public HTTPS URL. `localhost` is not reachable by PayPal. For local experiments, use a secure HTTPS tunnel you control (for example, a tunnel tool) or deploy the API. Do not expose a development API without understanding the risks.

1. Deploy the API at an HTTPS origin.
2. In the PayPal Developer Dashboard, open the same Sandbox REST app used for checkout.
3. Add the webhook URL: `https://YOUR_API_HOST/api/webhooks/paypal`.
4. Subscribe to at least:
   - `CHECKOUT.ORDER.APPROVED`
   - `PAYMENT.CAPTURE.PENDING`
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.REFUNDED`
5. Copy the Webhook ID into `PAYPAL_WEBHOOK_ID` in `server/.env` and restart the API.
6. The endpoint verifies each event using PayPal's `verify-webhook-signature` API before updating records.

A PayPal webhook event must be associated with the same REST app used for the transaction. PayPal retries non-2xx deliveries; keep the endpoint healthy and return 2xx only after the event is safely recorded/handled.

## Reliability Lab scenarios

Open **Overview → Try a failure scenario** or **Incidents → Test missing event**. These endpoints work only when `NODE_ENV` is not `production`.

| Scenario | What it demonstrates |
|---|---|
| Capture / DB gap | Provider-state fixture says completed while merchant ledger remains pending |
| Duplicate webhook | Same local event ID with three recorded deliveries; one event row and two duplicate deliveries |
| Pending capture | A pending state must not trigger fulfilment or another charge |
| Denied capture | A declined capture creates an incident and investigation path |
| Missing webhook | Provider state can be reconciled even when no event was recorded |

These fixtures never call PayPal and never represent real provider results. They are marked `LOCAL_SIMULATION` in the UI and database. The local fixture API returns 404 in production.

## API map

All routes are prefixed with `/api`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | API, database and integration readiness |
| GET | `/config/public` | Safe public config; contains Client ID only, never secrets |
| POST | `/payments/orders` | Create PayPal Sandbox order |
| POST | `/payments/:orderId/capture` | Check provider state and capture approved order |
| GET | `/payments` | List local payment ledger |
| GET | `/payments/:orderId` | Retrieve local payment by order or merchant reference |
| POST | `/payments/:orderId/reconcile` | Retrieve order from PayPal and sync local state |
| POST | `/payments/:orderId/investigate` | Generate AI/rules-based investigation |
| GET | `/dashboard/summary` | Dashboard aggregates |
| GET | `/dashboard/incidents` | List incidents |
| PATCH | `/dashboard/incidents/:id` | Update incident status |
| GET | `/dashboard/events` | List webhook event ledger |
| POST | `/webhooks/paypal` | Verified PayPal webhook receiver |
| POST | `/dev/scenarios` | Create clearly marked local fixture (development only) |
| DELETE | `/dev/scenarios` | Clear local fixtures (development only) |

## Tests and build

```bash
npm test
npm run build
```

`npm test` runs server unit tests and API smoke tests. `npm run build` creates the production frontend in `client/dist`.

## Security and prototype boundaries

This code intentionally implements a small but meaningful security baseline. It is **not production-ready for handling real customer payments** until the following are added and independently reviewed:

- Merchant/user authentication, role-based authorization and tenant isolation.
- CSRF protection for cookie-based sessions, secure session management and stronger admin controls.
- Persistent idempotency for all merchant-side create/capture workflows and concurrency tests across multiple API instances.
- A durable queue/outbox for webhook processing, replay controls, dead-letter handling and alerting.
- Strict audit retention, PII minimization, encryption/key management and privacy/legal review.
- Production observability, alert thresholds, backups, disaster recovery and rate-limit tuning.
- Provider-specific review of refund, dispute and chargeback flows before automating any action.

AI is read-only and advisory. It does not authorize, capture, refund, reverse or fulfil payments. The server must always establish payment truth from PayPal's API and verified provider events. Never send PayPal Client Secret, access tokens, full card data or unnecessary payer PII to the AI model.

## Project structure

```text
paypulse-ai/
├── client/                 # React + Vite dashboard + PayPal JS SDK
├── server/                 # Express API
│   ├── src/config/         # Environment and MongoDB connection
│   ├── src/controllers/    # Payment, webhook, dashboard, fixture handlers
│   ├── src/models/         # Payment, WebhookEvent, Incident, AuditLog
│   ├── src/routes/         # API routes
│   ├── src/services/       # PayPal, AI, payment state, audit, incidents
│   └── test/               # Node test runner + Supertest tests
├── docs/                   # Architecture, testing, security notes
├── postman/                # Importable API collection
├── docker-compose.yml      # Optional local MongoDB
└── README.md
```

## Official references

- PayPal Checkout integration: <https://developer.paypal.com/checkout/integrate>
- PayPal Orders API v2: <https://developer.paypal.com/docs/api/orders/v2/>
- PayPal webhooks: <https://developer.paypal.com/api/rest/webhooks/>
- PayPal webhook integration and signature verification: <https://developer.paypal.com/api/rest/webhooks/rest/>
- Gemini API: <https://ai.google.dev/gemini-api/docs>
- Vite: <https://vite.dev/guide/>
