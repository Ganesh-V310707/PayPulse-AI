# PayPulse AI 2.1 — architecture

### Public commerce plane
React shell -> Express `/api/commerce` -> independent server-side live providers -> product normalization -> deterministic relevance scoring -> Gemini (optional) grounded explanation -> external retailer listing pages. The user must verify seller and price at source. Demo records are only available through explicit demo mode.

### Product vision
Browser camera -> BarcodeDetector or ZXing -> Open Food Facts for food barcodes; uploaded images -> resized JPG -> server mime/magic validation -> Gemini multimodal -> tentative `searchTerm` -> live product search. Image identification does not guarantee exact model.

### Administrative payment plane
Same commerce UI shell -> Payment Intelligence view -> session-scoped ADMIN_API_KEY -> protected Express routes -> PayPal Sandbox Orders v2 + MongoDB payment/event/incident records. PayPal JS buttons initiate order creation and user approval; backend validates and captures only provider-approved orders. PayPal webhook signatures are verified; duplicate events tracked and out-of-order status regression blocked. Provider records are source of truth. This is single-merchant Sandbox, not production tenant isolation.

### Storage & sandbox modules
- MongoDB: Payment, WebhookEvent, Incident, AuditLog.
- Browser localStorage: product shortlist, comparison, decision journal, warranty notes (no synchronization; no backend account).
- In-memory simulated Demand Circles: demo only; writing is disabled when NODE_ENV=production.
- No PayPal capture from external Amazon/Flipkart/eBay source listings. No wallet, escrow or unauthorized merchant-of-record functionality.
