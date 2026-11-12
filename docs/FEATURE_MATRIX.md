# Feature matrix — PayPulse AI 2.1

| Feature | Implementation | Verification required |
|---|---|---|
| One consistent light/dark design | React + CSS, payment operations redesigned | Visual QA on mobile and desktop |
| Real product search | SerpApi Google Shopping adapter | SERPAPI_KEY, licensed usage, real API test |
| Optional US/GB product search | eBay Browse API OAuth | Approved eBay credentials and live test |
| Marketplace comparison | normalized price/currency/spec/source lists | Validate provider quality; not all specs available |
| Accurate budget detection | deterministic parser + explainable rank | Unit tested, not exhaustive natural language |
| Gemini recommendations | grounded on returned product list | GEMINI_API_KEY + model quota |
| Photo product recognition | multimodal Gemini inline image | GEMINI_API_KEY + image testing |
| Barcode reader | native browser or ZXing; image decode | Camera permission + browser hardware testing |
| Food barcode lookup | Open Food Facts API | Fair use, own User-Agent, connectivity |
| Saved products / comparison | browser localStorage | Not cloud synced or multiuser |
| Decision lab | deterministic calculations | 9 tools, not financial advice |
| Demand Circles | simulation only, prod writes disabled | No real buyer/merchant network |
| PayPal Sandbox | existing Orders v2 and checkout buttons | Buyer approval and capture NOT verified here |
| Webhooks | verified signature, duplicate handling | Real webhook test with ngrok/deployment |
| Payment intelligence | one consistent theme, admin access, incidents, ledger, simulations | MongoDB & Sandbox integration testing |
| Security | rate limits, admin secret, input bounds, signed webhooks | Not production security audit or complete auth |
