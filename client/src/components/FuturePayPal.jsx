import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, ArrowRight, Bot, CheckCircle2, Coins, Globe2, Lock,
  RefreshCcw, ShieldAlert, ShieldCheck, Sparkles, Unlock, Zap
} from 'lucide-react';
import api, { getErrorMessage } from '../lib/api';

const PILLARS = [
  ['guardrails', '1. Agentic Guardrails', Bot],
  ['escrow', '2. Smart Escrow', Lock],
  ['fx', '3. PYUSD FX & Split-Pay', Globe2],
  ['shield', '4. AI Fraud Shield & Self-Heal', ShieldCheck]
];

export default function FuturePayPal({ checkoutDraft, onStageCheckout }) {
  const [pillar, setPillar] = useState('guardrails');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  // Feature 1: Agentic Guardrails
  const [policy, setPolicy] = useState({
    maxPerOrderUsd: 250,
    dailyCapUsd: 750,
    stepUpThresholdUsd: 100,
    agentMode: 'SUPERVISED',
    autoPauseOnAnomaly: true
  });
  const [intentForm, setIntentForm] = useState({
    amountUsd: checkoutDraft?.amount || '45.00',
    merchant: 'Verified Marketplace',
    category: 'Laptops',
    description: checkoutDraft?.description || 'AI-selected developer gear'
  });
  const [evalResult, setEvalResult] = useState(null);

  // Feature 2: Smart Escrow
  const [escrows, setEscrows] = useState([]);
  const [escrowForm, setEscrowForm] = useState({
    title: 'Developer Workstation · Conditional Escrow',
    merchantLabel: 'Certified Tech Seller',
    totalAmountUsd: '120',
    firstMilestonePct: '40'
  });

  // Feature 3: Cross-Border FX & PYUSD Split-Pay
  const [fxForm, setFxForm] = useState({ sourceCurrency: 'INR', amount: '12500', splitCount: '3' });
  const [fxResult, setFxResult] = useState(null);
  const [circles, setCircles] = useState([]);

  // Feature 4: AI Fraud Shield & Self-Healing Copilot
  const [riskForm, setRiskForm] = useState({ amountUsd: '185', merchant: 'Electronics Hub', description: 'USB-C Monitor', orderId: '' });
  const [riskResult, setRiskResult] = useState(null);
  const [healReport, setHealReport] = useState(null);

  useEffect(() => {
    if (checkoutDraft?.amount || checkoutDraft?.description) {
      setIntentForm((prev) => ({
        ...prev,
        amountUsd: checkoutDraft.amount ? String(checkoutDraft.amount) : prev.amountUsd,
        description: checkoutDraft.description || prev.description
      }));
    }
  }, [checkoutDraft]);

  const loadInitial = useCallback(async () => {
    try {
      const [gRes, eRes, cRes] = await Promise.all([
        api.get('/future/guardrails'),
        api.get('/future/escrows'),
        api.get('/circles').catch(() => ({ data: { items: [] } }))
      ]);
      if (gRes.data?.policy) setPolicy(gRes.data.policy);
      setEscrows(eRes.data?.items || []);
      setCircles(cRes.data?.items || []);
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }, []);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  async function savePolicy() {
    setBusy('policy');
    setErr('');
    setNotice('');
    try {
      const r = await api.put('/future/guardrails', policy);
      setPolicy(r.data.policy);
      setNotice('Agentic PayPal policy saved.');
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function runEvaluate() {
    setBusy('evaluate');
    setErr('');
    setNotice('');
    try {
      const r = await api.post('/future/guardrails/evaluate', intentForm);
      setEvalResult(r.data);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function createEscrowContract() {
    setBusy('escrow');
    setErr('');
    setNotice('');
    try {
      const r = await api.post('/future/escrows', escrowForm);
      setEscrows((prev) => [r.data.escrow, ...prev]);
      setEscrowForm({ title: '', merchantLabel: 'Certified Tech Seller', totalAmountUsd: '120', firstMilestonePct: '40' });
      setNotice('Programmable milestone escrow created.');
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function runEscrowAction(id, action, extra = {}) {
    setBusy(id + action);
    setErr('');
    setNotice('');
    try {
      const r = await api.post(`/future/escrows/${encodeURIComponent(id)}/${action}`, extra);
      setEscrows((prev) => prev.map((x) => (x._id === id || x.escrowRef === id ? r.data.escrow : x)));
      setNotice(`Escrow updated (${r.data.escrow.status.replaceAll('_', ' ')}).`);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function runFxSplit(override) {
    setBusy('fx');
    setErr('');
    try {
      const r = await api.post('/future/fx-split', override || fxForm);
      setFxResult(r.data);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function runRiskScore() {
    setBusy('risk');
    setErr('');
    try {
      const r = await api.post('/future/risk-score', riskForm);
      setRiskResult(r.data);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function runBatchReconcile() {
    setBusy('heal');
    setErr('');
    setNotice('');
    try {
      const r = await api.post('/future/reconcile-batch');
      setHealReport(r.data);
      setNotice(`Checked ${r.data.checked} PayPal Sandbox order(s); updated ${r.data.updated}.`);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="pp-page pp-operations">
      <div className="pp-op-head">
        <div>
          <div className="pp-eyebrow">FUTURE OF PAYPAL / NEXT-GEN RAILS</div>
          <h1 className="pp-page-title">Programmable commerce.</h1>
          <p className="pp-muted pp-intro" style={{ marginBottom: 0 }}>
            Four next-generation PayPal capabilities: AI agent spend guardrails, conditional milestone escrow, PYUSD cross-border split-pay, and AI fraud &amp; self-healing reconciliation.
          </p>
        </div>
        <span className="pp-op-badge pp-op-ok"><Zap size={12} style={{ verticalAlign: 'middle', marginRight: 5 }} />4 LIVE CAPABILITIES</span>
      </div>

      <nav className="pp-op-tabs" aria-label="Future of PayPal pillars">
        {PILLARS.map(([id, label, Icon]) => (
          <button key={id} className={pillar === id ? 'active' : ''} onClick={() => { setPillar(id); setErr(''); setNotice(''); }}>
            <Icon size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 7 }} />
            {label}
          </button>
        ))}
      </nav>

      {err && <div className="pp-error pp-op-alert"><AlertTriangle size={18} /><span>{err}</span></div>}
      {notice && <div className="pp-op-note"><CheckCircle2 size={17} /><span>{notice}</span></div>}

      {pillar === 'guardrails' && (
        <div className="pp-future-grid">
          <section className="pp-panel">
            <div className="pp-panel-heading">
              <div>
                <div className="eyebrow">PROGRAMMABLE POLICY</div>
                <h2>Agentic spend guardrails</h2>
              </div>
              <span className={`pp-op-badge ${policy.agentMode === 'FROZEN' ? 'pp-op-bad' : 'pp-op-ok'}`}>{policy.agentMode.replaceAll('_', ' ')}</span>
            </div>
            <p className="pp-muted">Define strict caps before an AI shopping agent can stage a PayPal Sandbox checkout.</p>
            <div className="pp-input-grid">
              <label className="pp-field">
                <span>Max per order (USD)</span>
                <input type="number" min="1" max="5000" value={policy.maxPerOrderUsd} onChange={(e) => setPolicy((p) => ({ ...p, maxPerOrderUsd: Number(e.target.value) }))} />
              </label>
              <label className="pp-field">
                <span>24h daily cap (USD)</span>
                <input type="number" min="1" max="20000" value={policy.dailyCapUsd} onChange={(e) => setPolicy((p) => ({ ...p, dailyCapUsd: Number(e.target.value) }))} />
              </label>
              <label className="pp-field">
                <span>Step-up approval above (USD)</span>
                <input type="number" min="1" max="5000" value={policy.stepUpThresholdUsd} onChange={(e) => setPolicy((p) => ({ ...p, stepUpThresholdUsd: Number(e.target.value) }))} />
              </label>
              <label className="pp-field">
                <span>Execution mode</span>
                <select value={policy.agentMode} onChange={(e) => setPolicy((p) => ({ ...p, agentMode: e.target.value }))}>
                  <option value="SUPERVISED">Supervised (Always require PayPal approval)</option>
                  <option value="AUTONOMOUS_UNDER_CAP">Autonomous under step-up threshold</option>
                  <option value="FROZEN">Frozen (Block all agentic checkouts)</option>
                </select>
              </label>
            </div>
            <button className="pp-btn pp-btn-solid" disabled={busy === 'policy'} onClick={savePolicy}>
              <CheckCircle2 size={16} /> Save guardrail policy
            </button>
          </section>

          <section className="pp-panel">
            <div className="pp-panel-heading">
              <div>
                <div className="eyebrow">LIVE POLICY ENGINE</div>
                <h2>Simulate &amp; stage agent checkout</h2>
              </div>
              <Bot size={20} />
            </div>
            <div className="pp-input-grid">
              <label className="pp-field">
                <span>Checkout amount (USD)</span>
                <input type="number" min="0.01" max="5000" step="0.01" value={intentForm.amountUsd} onChange={(e) => setIntentForm((f) => ({ ...f, amountUsd: e.target.value }))} />
              </label>
              <label className="pp-field">
                <span>Category</span>
                <select value={intentForm.category} onChange={(e) => setIntentForm((f) => ({ ...f, category: e.target.value }))}>
                  {['Laptops', 'Phones', 'Audio', 'Accessories', 'Monitors', 'Products', 'Software', 'Gaming'].map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label className="pp-field">
              <span>Merchant &amp; item description</span>
              <input value={intentForm.description} maxLength={120} onChange={(e) => setIntentForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <button className="pp-btn pp-btn-solid" disabled={busy === 'evaluate'} onClick={runEvaluate}>
              <Sparkles size={16} /> Evaluate against 24h velocity &amp; rules
            </button>

            {evalResult && (
              <div className="pp-result">
                <div className="pp-eyebrow">POLICY DECISION</div>
                <strong style={{ fontSize: 24 }}>{evalResult.decision.replaceAll('_', ' ')}</strong>
                <p>24h PayPal spend: ${evalResult.dailySpentUsd.toFixed(2)} · Remaining daily cap: ${evalResult.remainingCapUsd.toFixed(2)}</p>
                {evalResult.riskFlags.map((f, i) => <p key={i}><ShieldAlert size={15} /> {f}</p>)}
                {evalResult.allowedToStage && (
                  <div className="pp-actions">
                    <button
                      className="pp-btn pp-btn-solid"
                      onClick={() => onStageCheckout?.({ amount: evalResult.amountUsd, description: evalResult.description })}
                    >
                      Stage in PayPal Sandbox Checkout <ArrowRight size={15} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {pillar === 'escrow' && (
        <div className="pp-future-grid">
          <section className="pp-panel">
            <div className="pp-panel-heading">
              <div>
                <div className="eyebrow">CONDITIONAL SETTLEMENT</div>
                <h2>Programmable Smart Escrow</h2>
              </div>
              <Lock size={20} />
            </div>
            <p className="pp-muted">Hold funds in milestone escrow and release payouts only when carrier dispatch or inspection conditions pass.</p>
            <label className="pp-field">
              <span>Contract title</span>
              <input value={escrowForm.title} placeholder="e.g. Studio MacBook Pro Escrow" onChange={(e) => setEscrowForm((f) => ({ ...f, title: e.target.value }))} />
            </label>
            <div className="pp-input-grid">
              <label className="pp-field">
                <span>Merchant</span>
                <input value={escrowForm.merchantLabel} onChange={(e) => setEscrowForm((f) => ({ ...f, merchantLabel: e.target.value }))} />
              </label>
              <label className="pp-field">
                <span>Total (USD)</span>
                <input type="number" min="1" max="5000" value={escrowForm.totalAmountUsd} onChange={(e) => setEscrowForm((f) => ({ ...f, totalAmountUsd: e.target.value }))} />
              </label>
              <label className="pp-field">
                <span>Milestone 1 split (%)</span>
                <input type="number" min="10" max="90" value={escrowForm.firstMilestonePct} onChange={(e) => setEscrowForm((f) => ({ ...f, firstMilestonePct: e.target.value }))} />
              </label>
            </div>
            <button className="pp-btn pp-btn-solid" disabled={busy === 'escrow'} onClick={createEscrowContract}>
              <Lock size={16} /> Create programmable escrow
            </button>
          </section>

          <div className="pp-stack">
            {escrows.map((esc) => (
              <article className="pp-panel" key={esc._id || esc.escrowRef}>
                <div className="pp-panel-heading">
                  <div>
                    <div className="eyebrow">{esc.escrowRef} · ${Number(esc.totalAmountUsd).toFixed(2)} USD</div>
                    <h3>{esc.title}</h3>
                  </div>
                  <span className={`pp-op-badge ${esc.status === 'RELEASED' ? 'pp-op-ok' : esc.status === 'DISPUTE_HOLD' ? 'pp-op-bad' : 'pp-op-muted'}`}>
                    {esc.status.replaceAll('_', ' ')}
                  </span>
                </div>
                <p className="pp-muted">Merchant: {esc.merchantLabel} · PayPal Ref: {esc.paypalOrderId || 'Unlinked'}</p>
                <div className="pp-future-milestones">
                  {esc.milestones.map((m) => (
                    <div className="pp-future-milestone" key={m.id}>
                      <div>
                        <strong>{m.label} ({m.percent}%)</strong>
                        <small>{m.condition}</small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong>${Number(m.amountUsd).toFixed(2)}</strong>
                        <span className={`pp-op-badge ${m.status === 'RELEASED' ? 'pp-op-ok' : m.status === 'HELD' ? 'pp-op-bad' : 'pp-op-muted'}`}>{m.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pp-actions">
                  {esc.status === 'DRAFT' && (
                    <button className="pp-btn" disabled={!!busy} onClick={() => onStageCheckout?.({ amount: esc.totalAmountUsd, description: esc.title })}>
                      Fund via PayPal Sandbox
                    </button>
                  )}
                  <button className="pp-btn" disabled={!!busy} onClick={() => runEscrowAction(esc._id || esc.escrowRef, 'VERIFY_DISPATCH')}>
                    Verify Dispatch
                  </button>
                  <button className="pp-btn pp-btn-solid" disabled={!!busy || esc.status === 'RELEASED'} onClick={() => runEscrowAction(esc._id || esc.escrowRef, 'RELEASE_NEXT')}>
                    <Unlock size={14} /> Release Next Milestone
                  </button>
                  <button className="pp-btn" disabled={!!busy || esc.status === 'RELEASED'} onClick={() => runEscrowAction(esc._id || esc.escrowRef, 'HOLD_DISPUTE')}>
                    <ShieldAlert size={14} /> Dispute Hold
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {pillar === 'fx' && (
        <div className="pp-future-grid">
          <section className="pp-panel">
            <div className="pp-panel-heading">
              <div>
                <div className="eyebrow">CROSS-BORDER + PYUSD RAIL</div>
                <h2>FX converter &amp; group split-pay</h2>
              </div>
              <Coins size={20} />
            </div>
            <p className="pp-muted">Convert INR/GBP product or Demand Circle budgets into USD Sandbox shares and compare settlement rails.</p>
            <div className="pp-input-grid">
              <label className="pp-field">
                <span>Source currency</span>
                <select value={fxForm.sourceCurrency} onChange={(e) => setFxForm((f) => ({ ...f, sourceCurrency: e.target.value }))}>
                  <option value="INR">INR (₹)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </label>
              <label className="pp-field">
                <span>Total amount</span>
                <input type="number" min="1" value={fxForm.amount} onChange={(e) => setFxForm((f) => ({ ...f, amount: e.target.value }))} />
              </label>
              <label className="pp-field">
                <span>Split across buyers</span>
                <input type="number" min="1" max="20" value={fxForm.splitCount} onChange={(e) => setFxForm((f) => ({ ...f, splitCount: e.target.value }))} />
              </label>
            </div>
            <div className="pp-actions">
              <button className="pp-btn pp-btn-solid" disabled={busy === 'fx'} onClick={() => runFxSplit()}>
                <Globe2 size={16} /> Calculate FX &amp; split shares
              </button>
            </div>
            {circles.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="pp-eyebrow">LOAD FROM DEMAND CIRCLES</div>
                <div className="pp-op-scenarios">
                  {circles.slice(0, 3).map((c) => (
                    <button
                      key={c.id}
                      className="pp-btn"
                      onClick={() => {
                        const next = { sourceCurrency: 'INR', amount: String(c.budget), splitCount: String(Math.min(20, Math.max(1, c.members))) };
                        setFxForm(next);
                        runFxSplit(next);
                      }}
                    >
                      {c.name} ({c.members} buyers)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="pp-panel">
            <div className="pp-panel-heading">
              <div>
                <div className="eyebrow">RAIL COMPARISON</div>
                <h2>Settlement quote</h2>
              </div>
              <span className="pp-op-badge pp-op-muted">INDICATIVE SANDBOX FX</span>
            </div>
            {fxResult ? (
              <>
                <div className="pp-result" style={{ marginTop: 8 }}>
                  <div className="pp-eyebrow">PER-BUYER PAYPAL SANDBOX SHARE</div>
                  <strong>${fxResult.perPersonUsd.toFixed(2)} USD</strong>
                  <h3>Total converted: ${fxResult.sandboxPayableUsd.toFixed(2)} USD ({fxResult.splitCount} participant{fxResult.splitCount > 1 ? 's' : ''})</h3>
                  <p><CheckCircle2 size={15} /> PYUSD simulated rail saves ~${fxResult.estimatedSavingsVsCardUsd.toFixed(2)} vs legacy cross-border cards.</p>
                  <small>{fxResult.notice}</small>
                </div>
                <div className="pp-future-milestones" style={{ marginTop: 16 }}>
                  {fxResult.rails.map((rail) => (
                    <div className="pp-future-milestone" key={rail.id}>
                      <div>
                        <strong>{rail.name}</strong>
                        <small>{rail.settlementTime} · Fee {rail.feePct}% + ${rail.fixedFeeUsd.toFixed(2)}</small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong>${rail.totalFeeUsd.toFixed(2)} fee</strong>
                        <small>${rail.perPersonFeeUsd.toFixed(2)} / buyer</small>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pp-actions">
                  <button
                    className="pp-btn pp-btn-solid"
                    onClick={() => onStageCheckout?.({ amount: fxResult.perPersonUsd, description: `Split-pay share (1/${fxResult.splitCount}) from ${fxResult.sourceAmount} ${fxResult.sourceCurrency}` })}
                  >
                    Pay My Share via PayPal Sandbox (${fxResult.perPersonUsd.toFixed(2)}) <ArrowRight size={15} />
                  </button>
                </div>
              </>
            ) : (
              <p className="pp-muted">Run a calculation on the left or pick a Demand Circle to compare PayPal USD vs PYUSD vs legacy card FX fees.</p>
            )}
          </section>
        </div>
      )}

      {pillar === 'shield' && (
        <div className="pp-future-grid">
          <section className="pp-panel">
            <div className="pp-panel-heading">
              <div>
                <div className="eyebrow">AI RISK &amp; SELLER PROTECTION</div>
                <h2>Fraud Shield Copilot</h2>
              </div>
              <ShieldCheck size={20} />
            </div>
            <div className="pp-input-grid">
              <label className="pp-field">
                <span>Amount (USD)</span>
                <input type="number" min="0.01" max="5000" value={riskForm.amountUsd} onChange={(e) => setRiskForm((f) => ({ ...f, amountUsd: e.target.value }))} />
              </label>
              <label className="pp-field">
                <span>PayPal Order ID (optional)</span>
                <input value={riskForm.orderId} placeholder="Leave blank for pre-checkout" onChange={(e) => setRiskForm((f) => ({ ...f, orderId: e.target.value }))} />
              </label>
            </div>
            <label className="pp-field">
              <span>Merchant &amp; item</span>
              <input value={riskForm.description} onChange={(e) => setRiskForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
            <button className="pp-btn pp-btn-solid" disabled={busy === 'risk'} onClick={runRiskScore}>
              <Sparkles size={16} /> Score fraud &amp; chargeback risk
            </button>

            {riskResult && (
              <div className="pp-result">
                <div className="pp-eyebrow">RISK SCORE · {riskResult.provider}</div>
                <strong>{riskResult.riskScore} / 100 ({riskResult.riskTier})</strong>
                <h3>Seller Protection: {riskResult.sellerProtectionEligible ? 'Eligible (with tracking proof)' : 'Review required'}</h3>
                {riskResult.signals.map((s, i) => <p key={i}><CheckCircle2 size={15} /> {s}</p>)}
                <p><Sparkles size={15} /> {riskResult.recommendation}</p>
              </div>
            )}
          </section>

          <section className="pp-panel">
            <div className="pp-panel-heading">
              <div>
                <div className="eyebrow">SELF-HEALING LEDGER</div>
                <h2>Batch Sandbox reconciliation</h2>
              </div>
              <RefreshCcw size={20} />
            </div>
            <p className="pp-muted">
              Automatically queries the live PayPal Sandbox Orders API for open CREATED/APPROVED/PENDING orders in MongoDB and repairs stale merchant states without duplicate captures.
            </p>
            <div className="pp-actions">
              <button className="pp-btn pp-btn-solid" disabled={busy === 'heal'} onClick={runBatchReconcile}>
                <RefreshCcw size={16} /> Run Self-Healing Sync
              </button>
            </div>
            <p className="pp-small pp-muted" style={{ marginTop: 10 }}>Requires Payment Intelligence to be unlocked with your Admin Key.</p>

            {healReport && (
              <div className="pp-result">
                <div className="pp-eyebrow">RECONCILIATION REPORT</div>
                <h3>Checked {healReport.checked} orders · Updated {healReport.updated}</h3>
                <p>Completed: {healReport.completed} · Ready to capture (APPROVED): {healReport.approvedReadyToCapture} · Awaiting buyer: {healReport.awaitingBuyerApproval}</p>
                {healReport.details.slice(0, 6).map((d) => (
                  <p key={d.orderId}>
                    • <b>{d.orderId}</b>: {d.previousStatus} → {d.currentStatus} (PayPal: {d.rawProviderStatus || d.error || '—'})
                  </p>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
