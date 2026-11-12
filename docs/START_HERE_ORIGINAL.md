# Start Here — PayPulse AI

## Before running

- [ ] Install Node.js 20.19+ or 22.12+ (Node 22 LTS recommended) and npm.
- [ ] Install Docker Desktop and start it, **or** create a MongoDB Atlas database.
- [ ] Have an authorized PayPal Developer Sandbox REST app with Client ID and Client Secret. This starter is locked to Sandbox and cannot call PayPal Live.
- [ ] Optional: obtain a Gemini API key. Without it, the rules-based investigator works.

## Windows PowerShell

From the extracted `paypulse-ai` folder:

```powershell
node --version
npm --version
Copy-Item server/.env.example server/.env
```

Edit `server/.env` and set the PayPal Sandbox Client ID and Secret. Keep `PAYPAL_ENV=sandbox`. If using Atlas, replace `MONGODB_URI` with your Atlas connection string.

Then run:

```powershell
npm install
docker compose up -d mongo
npm test
npm run build
npm run dev
```

If you use MongoDB Atlas, `docker compose up -d mongo` is not required.

Open `http://localhost:5173`. The API health endpoint is `http://localhost:5000/api/health`.

## macOS / Linux

```bash
node --version
npm --version
cp server/.env.example server/.env
# Edit server/.env, then:
npm install
docker compose up -d mongo
npm test
npm run build
npm run dev
```

## Webhook note

PayPal cannot call `localhost`. Register `/api/webhooks/paypal` only after you have a public HTTPS API URL. Add the webhook to the same Sandbox REST app, subscribe to the event types in the main README, and copy the returned Webhook ID into `PAYPAL_WEBHOOK_ID`. Restart the server.

## Before a demo

- Verify the buyer login is a Sandbox Personal account.
- Verify the seller is a Sandbox Business account.
- Make one low-value Sandbox payment and confirm the capture in PayPal Sandbox.
- Create one `LOCAL SIMULATION` incident and show AI/rule-based analysis. Do not present local fixtures as real PayPal transactions.
- Do not expose this unauthenticated prototype to public production traffic.
