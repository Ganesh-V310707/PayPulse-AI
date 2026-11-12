# PayPulse AI 2.1 — security posture

Sandbox research prototype, **not audited for market launch**.

Implemented: sensitive credentials in server/.env; restricted admin routes using a long ADMIN_API_KEY with timing-safe equality; PayPal signature verification of webhooks; duplicate tracking; server-side order checks; request rate limits, size bounds, HTTPS-only external product URL display, approximate user intent scoring; input validation; explicit demo-data separation.

Remaining before production: robust account and role system, isolation of every merchant and customer record, formal 3rd-party security assessment, authentication for all merchant actions, allowlisted trusted deployment origins, CSRF-safe session strategy, queue-backed webhook idempotency/outbox, multi-instance race tests, secret rotation and KMS, secure logging and data minimization, privacy notice and deletion process, merchant legal agreements, authorization and licences for shopping data and product imagery, dispute/refund/chargeback support, user consent before any payments, production monitoring, regular dependency audits and incident response.

Sandbox-only payments: PayPal live credentials are intentionally rejected. Never use this prototype for real customer funds. Keep ngrok active only during a controlled Sandbox test. Avoid exposing public admin key.
