const env = require('../config/env');

function ruleBasedAnalysis(payment, webhookEvents = []) {
  const status = payment?.status || 'UNKNOWN';
  const observedStatus = payment?.observedProviderStatus || null;
  const eventCount = webhookEvents.length;
  const duplicateCount = webhookEvents.reduce((sum, event) => sum + Number(event.duplicateDeliveries || 0), 0);
  let rootCause = 'The available records do not show a confirmed payment failure. Re-query the PayPal order and compare its capture state with the merchant record.';
  let recommendation = 'Use the PayPal Orders API as the provider source of truth, then update the local record only after validating the response.';
  let riskLevel = 'LOW';

  if (observedStatus && observedStatus !== status) {
    rootCause = `The local ledger says ${status}, while the separately recorded provider observation says ${observedStatus}. This is a reconciliation mismatch in the available evidence.`;
    recommendation = 'Retrieve the order directly from PayPal, verify capture ID and amount, then reconcile the local ledger. Do not issue another capture while the outcome is uncertain.';
    riskLevel = 'HIGH';
  } else if (status === 'PENDING') {
    rootCause = 'The latest recorded capture state is PENDING. This is not proof of a completed payment.';
    recommendation = 'Do not fulfil the order or create another charge. Wait for a terminal event and reconcile with PayPal.';
    riskLevel = 'MEDIUM';
  } else if (status === 'DENIED' || status === 'FAILED') {
    rootCause = 'The payment attempt did not complete successfully according to the latest stored provider response.';
    recommendation = 'Inspect the PayPal API error details and ask the buyer to resolve the funding issue before a new approved attempt.';
    riskLevel = 'HIGH';
  } else if (status === 'COMPLETED') {
    rootCause = 'The local record says the capture completed. The remaining risk is stale merchant state or an unprocessed event.';
    recommendation = 'Verify the capture ID and amount through the PayPal Orders API, then reconcile the merchant record. Never capture again.';
  }

  return {
    summary: `Rule-based analysis of ${payment?.orderId || payment?.merchantReference || 'this payment'}: status ${status}.`,
    rootCause,
    recommendedActions: [recommendation, 'Keep the provider response and webhook event IDs in the audit trail.'],
    riskLevel,
    confidence: 0.68,
    evidenceUsed: { paymentStatus: status, webhookEventCount: eventCount, detectedDuplicateDeliveries: duplicateCount },
    provider: 'RULES'
  };
}

async function investigatePayment(payment, webhookEvents = []) {
  const fallback = ruleBasedAnalysis(payment, webhookEvents);
  if (!env.geminiApiKey) return fallback;

  const safeEvidence = {
    orderId: payment.orderId || null,
    merchantReference: payment.merchantReference,
    source: payment.source,
    status: payment.status,
    observedProviderStatus: payment.observedProviderStatus || null,
    scenarioLabel: payment.scenarioLabel || null,
    amount: payment.amount,
    currency: payment.currency,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    lastError: payment.lastError || null,
    events: webhookEvents.slice(0, 12).map((event) => ({
      eventType: event.eventType,
      resourceId: event.resourceId,
      receivedAt: event.receivedAt,
      verified: event.verified,
      source: event.source
    }))
  };

  const prompt = [
    'You are a cautious payment operations analyst. Analyze only the JSON evidence supplied below.',
    'Do not claim that money moved unless the evidence says capture status COMPLETED.',
    'Do not recommend another charge when the outcome is uncertain. Recommend provider-side retrieval/reconciliation first.',
    'Do not invent PayPal errors, causes, or events. If evidence is insufficient, say so.',
    'Return ONLY valid JSON with keys: summary (string), rootCause (string), recommendedActions (array of strings), riskLevel (LOW|MEDIUM|HIGH|CRITICAL), confidence (number 0 to 1).',
    `Evidence: ${JSON.stringify(safeEvidence)}`
  ].join('\n\n');

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {  responseMimeType: 'application/json' }
        }),
        signal: AbortSignal.timeout(20000)
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || `Gemini API returned ${response.status}`);
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
    const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
    const allowedRisk = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    return {
      summary: String(parsed.summary || fallback.summary).slice(0, 600),
      rootCause: String(parsed.rootCause || fallback.rootCause).slice(0, 1200),
      recommendedActions: Array.isArray(parsed.recommendedActions) ? parsed.recommendedActions.slice(0, 5).map((item) => String(item).slice(0, 400)) : fallback.recommendedActions,
      riskLevel: allowedRisk.includes(parsed.riskLevel) ? parsed.riskLevel : fallback.riskLevel,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      evidenceUsed: fallback.evidenceUsed,
      provider: 'GEMINI'
    };
  } catch (error) {
    console.error('[ai] Gemini investigation failed; using rule-based result:', error.message);
    return { ...fallback, aiNotice: 'Gemini was unavailable; this is a rule-based explanation.' };
  }
}

module.exports = { investigatePayment, ruleBasedAnalysis };
