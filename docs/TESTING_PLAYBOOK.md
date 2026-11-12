# PayPulse AI 2.1 — verification playbook

1. `npm install`, `npm test`, `npm run build` from root. Fix failures before deployment. Confirm Node 22.12+ and npm installed.
2. Confirm `GET /api/health`: server status and MongoDB readiness. Confirm `GET /api/commerce/providers`: provider readiness, without credentials.
3. Real Shopping: with SERPAPI_KEY set, choose Live listings, enter INR budget and verify product photo, price, link, source, match explanations. Try no API key and exhausted quota; no fictional results should be presented as live.
4. Barcode: scan food EAN with camera and photo; note Open Food Facts coverage and User-Agent requirement. Without BarcodeDetector, ZXing fallback should scan. On hardware without a camera use manual code.
5. Gemini: upload a photo with recognizable package text. It should produce tentative suggested search terms; confirm and search live listings; with no GEMINI_API_KEY it should show a setup message.
6. Comparison/saved/Decision Lab: verify storage and no invented spec data.
7. Payment Intelligence: enter ADMIN_API_KEY. Test 401 on missing/wrong key; verify payment ledger, incidents, provider events and theme both light/dark.
8. Sandbox test: create order, approve with Sandbox Personal account, verify backend capture and PayPal Sandbox Business account. Do not assume HTTP 201 means payment.
9. Webhooks: ngrok public HTTPS -> same REST app -> configure PAYPAL_WEBHOOK_ID, verify signature and recording, replay duplicate deliveries, confirm late APPROVED does not downgrade COMPLETED.
10. Security: run npm audit, verify no server/.env in repository, check CORS/rate limits, validate upload MIME and large payload rejection. Avoid real money.
