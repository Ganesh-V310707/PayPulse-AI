import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Bot, Check, CheckCircle2, Clock3,
  CreditCard, ExternalLink, FileText, KeyRound, Layers, Lock, MessageSquare,
  Plus, RefreshCcw, Search, ShieldCheck, Sparkles, Target, UserCheck, UtensilsCrossed, X
} from 'lucide-react';
import api, { getErrorMessage } from '../lib/api';

const TABS = [
  ['milestones', 'Milestones & Dependencies', Layers],
  ['providers', 'Providers & Negotiation', Search],
  ['approvals', 'Human Approvals', UserCheck],
  ['agents', 'Agents & Activity Log', Bot],
  ['payments', 'PayPal Sandbox & Integrations', CreditCard]
];

const money = (v, c = 'INR') => {
  try {
    return new Intl.NumberFormat(c === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency: c, maximumFractionDigits: 2 }).format(Number(v) || 0);
  } catch {
    return `${v} ${c}`;
  }
};

function StatusBadge({ value }) {
  const v = String(value || 'PENDING');
  const cls = ['COMPLETED', 'APPROVED', 'LIVE', 'connected'].includes(v)
    ? 'ok'
    : ['BLOCKED', 'REJECTED', 'HIGH', 'AT_RISK', 'FAILED', 'ERROR', 'disconnected'].includes(v)
      ? 'bad'
      : 'muted';
  return <span className={`pp-op-badge pp-op-${cls}`}>{v.replaceAll('_', ' ')}</span>;
}

export default function LifeOS({ onStageCheckout }) {
  const [goals, setGoals] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [goal, setGoal] = useState(null);
  const [statusInfo, setStatusInfo] = useState(null);
  const [tab, setTab] = useState('milestones');
  const [role, setRole] = useState(() => sessionStorage.getItem('paypulse-life-role') || 'OWNER');
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem('paypulse-admin-key') || '');
  const [keyDraft, setKeyDraft] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [monitorOut, setMonitorOut] = useState(null);
  const [linkOrderId, setLinkOrderId] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    location: 'Bengaluru, India',
    country: 'IN',
    currency: 'INR',
    totalBudget: '500000',
    deadline: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)
  });

  function switchRole(nextRole) {
    sessionStorage.setItem('paypulse-life-role', nextRole);
    setRole(nextRole);
    setNotice(`Switched active RBAC role to ${nextRole}.`);
  }

  function unlockAdmin() {
    const val = keyDraft.trim();
    if (!val) return;
    sessionStorage.setItem('paypulse-admin-key', val);
    setAdminKey(val);
    setKeyDraft('');
    setNotice('Admin key stored for this browser session.');
  }

  const loadGoals = useCallback(async (preferId) => {
    try {
      const [gRes, sRes] = await Promise.all([api.get('/life-os/goals'), api.get('/life-os/status')]);
      const items = gRes.data?.items || [];
      setGoals(items);
      setStatusInfo(sRes.data);
      const targetId = preferId || selectedId || items[0]?._id || items[0]?.goalRef || '';
      if (targetId) {
        const found = items.find((x) => x._id === targetId || x.goalRef === targetId) || items[0];
        if (found) {
          setSelectedId(found._id || found.goalRef);
          setGoal(found);
        }
      }
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }, [selectedId]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  async function selectGoal(id) {
    setSelectedId(id);
    setErr('');
    setNotice('');
    setMonitorOut(null);
    try {
      const r = await api.get(`/life-os/goals/${encodeURIComponent(id)}`);
      setGoal(r.data.goal);
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }

  async function seedRestaurantDemo() {
    setBusy('demo');
    setErr('');
    setNotice('');
    try {
      const r = await api.post('/life-os/demo/restaurant');
      const g = r.data.goal;
      setGoal(g);
      setSelectedId(g._id || g.goalRef);
      setNotice(g.reusedExisting ? 'Loaded persisted Restaurant Launch demonstration from MongoDB.' : 'Created flagship Restaurant Launch orchestration goal.');
      await loadGoals(g._id || g.goalRef);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function createNewGoal(e) {
    e.preventDefault();
    setBusy('create');
    setErr('');
    setNotice('');
    try {
      const r = await api.post('/life-os/goals', { ...form, totalBudget: Number(form.totalBudget) });
      const g = r.data.goal;
      setGoal(g);
      setSelectedId(g._id || g.goalRef);
      setShowCreate(false);
      setForm((f) => ({ ...f, title: '', description: '' }));
      setNotice(`Goal decomposed via ${g.aiProvider} into ${g.milestones.length} milestones.`);
      await loadGoals(g._id || g.goalRef);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function updateMilestone(code, status) {
    if (!goal) return;
    setBusy(`ms-${code}`);
    setErr('');
    setNotice('');
    try {
      const r = await api.post(`/life-os/goals/${encodeURIComponent(goal._id || goal.goalRef)}/milestones/${encodeURIComponent(code)}/status`, { status });
      setGoal(r.data.goal);
      setNotice(`Milestone ${code} updated to ${status}.`);
      loadGoals(goal._id || goal.goalRef);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function sourceProviders(code) {
    if (!goal) return;
    setBusy(`src-${code}`);
    setErr('');
    setNotice('');
    try {
      const r = await api.post(`/life-os/goals/${encodeURIComponent(goal._id || goal.goalRef)}/milestones/${encodeURIComponent(code)}/source`);
      setGoal(r.data.goal);
      const s = r.data.providerSummary;
      setNotice(`Sourcing Agent found ${s.liveHits} live provider listing(s) and ${s.simulatedEstimates} labeled planning estimate(s) for ${code}.`);
      setTab('providers');
      loadGoals(goal._id || goal.goalRef);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function selectQuote(quoteId) {
    if (!goal) return;
    setBusy(`sel-${quoteId}`);
    setErr('');
    setNotice('');
    try {
      const r = await api.post(`/life-os/goals/${encodeURIComponent(goal._id || goal.goalRef)}/quotes/${encodeURIComponent(quoteId)}/select`);
      setGoal(r.data.goal);
      setNotice('Offer selected and staged for human Purchase Commitment approval.');
      loadGoals(goal._id || goal.goalRef);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function draftNegotiation(quoteId) {
    if (!goal) return;
    setBusy(`neg-${quoteId}`);
    setErr('');
    setNotice('');
    try {
      const r = await api.post(`/life-os/goals/${encodeURIComponent(goal._id || goal.goalRef)}/quotes/${encodeURIComponent(quoteId)}/negotiate`);
      setGoal(r.data.goal);
      setNotice(`Negotiation Copilot drafted an RFQ script (${r.data.provider}). Approve outreach in Human Approvals before sending.`);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function decideApproval(approvalId, decision) {
    if (!goal) return;
    setBusy(`apr-${approvalId}`);
    setErr('');
    setNotice('');
    try {
      const r = await api.post(`/life-os/goals/${encodeURIComponent(goal._id || goal.goalRef)}/approvals/${encodeURIComponent(approvalId)}/decide`, {
        decision,
        note: `${decision} by ${role} in PayPulse LIFE OS`
      });
      setGoal(r.data.goal);
      setNotice(`Approval ${approvalId} marked ${decision}.`);
      loadGoals(goal._id || goal.goalRef);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function runMonitor() {
    if (!goal) return;
    setBusy('monitor');
    setErr('');
    setNotice('');
    try {
      const r = await api.post(`/life-os/goals/${encodeURIComponent(goal._id || goal.goalRef)}/monitor`);
      setGoal(r.data.goal);
      setMonitorOut(r.data.monitor);
      setNotice(`Execution Monitor completed (${r.data.monitor.provider}): Risk ${r.data.monitor.riskLevel}.`);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function prepareSandboxOrder(approvalId, createSandboxOrder) {
    if (!goal) return;
    setBusy(`pay-${approvalId}`);
    setErr('');
    setNotice('');
    try {
      const r = await api.post(`/life-os/goals/${encodeURIComponent(goal._id || goal.goalRef)}/payments/prepare`, {
        approvalId,
        createSandboxOrder
      });
      setGoal(r.data.goal);
      if (r.data.paypalOrder?.approveUrl) {
        setNotice(`PayPal Sandbox Order ${r.data.paypalOrder.orderId} created (${r.data.paypalOrder.status}). Open the approval link or manage in Payment Intelligence.`);
      } else {
        onStageCheckout?.(r.data.stagedCheckout);
      }
      loadGoals(goal._id || goal.goalRef);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function syncSandboxOrder() {
    if (!goal || !linkOrderId.trim()) return;
    setBusy('link-order');
    setErr('');
    setNotice('');
    try {
      const r = await api.post(`/life-os/goals/${encodeURIComponent(goal._id || goal.goalRef)}/payments/link`, {
        paypalOrderId: linkOrderId.trim()
      });
      setGoal(r.data.goal);
      setLinkOrderId('');
      setNotice(`Synced PayPal Sandbox order (${r.data.transaction.status}).`);
      loadGoals(goal._id || goal.goalRef);
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  const metrics = goal?.metrics || {};
  const pendingApprovals = (goal?.approvals || []).filter((a) => a.status === 'PENDING');
  const paymentApprovals = (goal?.approvals || []).filter((a) => a.type === 'PAYMENT_AUTHORIZATION' && a.status === 'APPROVED');

  return (
    <div className="pp-page pp-operations">
      <div className="pp-op-head">
        <div>
          <div className="pp-eyebrow">PAYPULSE LIFE OS / GOAL-TO-OUTCOME ORCHESTRATION</div>
          <h1 className="pp-page-title">Turn real-world goals into verified execution.</h1>
          <p className="pp-muted pp-intro" style={{ marginBottom: 0 }}>
            AI agents decompose budgets and deadlines into dependency-ordered milestones, source real product providers, draft negotiation RFQs, enforce human approvals, and execute authorized PayPal Sandbox payments.
          </p>
        </div>
        <div className="pp-actions" style={{ marginTop: 0 }}>
          <label className="pp-life-role-box">
            <span>RBAC Role</span>
            <select value={role} onChange={(e) => switchRole(e.target.value)} aria-label="Workspace RBAC role">
              <option value="OWNER">OWNER (Full access)</option>
              <option value="OPERATOR">OPERATOR (Execute &amp; approve)</option>
              <option value="VIEWER">VIEWER (Read-only)</option>
            </select>
          </label>
          <button className="pp-btn" disabled={!!busy} onClick={seedRestaurantDemo}>
            <UtensilsCrossed size={16} /> Restaurant Demo
          </button>
          <button className="pp-btn pp-btn-solid" onClick={() => setShowCreate((s) => !s)}>
            <Plus size={16} /> New Goal
          </button>
        </div>
      </div>

      {statusInfo && (
        <div className="pp-life-status-strip">
          <span><ShieldCheck size={14} /> MongoDB: <b>{statusInfo.database}</b></span>
          <span><Sparkles size={14} /> Gemini: <b>{statusInfo.geminiConfigured ? 'Configured' : 'Rules fallback'}</b></span>
          <span><Search size={14} /> Live Shopping: <b>{statusInfo.shoppingConfigured ? 'SerpApi / eBay ready' : 'Planning estimates only'}</b></span>
          <span><CreditCard size={14} /> PayPal Sandbox: <b>{statusInfo.paypalSandboxConfigured ? 'Ready (USD)' : 'Needs credentials'}</b></span>
        </div>
      )}

      {!adminKey && (
        <div className="pp-panel pp-life-admin-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <KeyRound size={18} />
            <div>
              <strong>Financial &amp; Approval Gate Locked</strong>
              <p className="pp-muted pp-small">Enter your <code>ADMIN_API_KEY</code> to authorize human approvals and PayPal Sandbox orders.</p>
            </div>
          </div>
          <div className="pp-life-admin-input">
            <input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlockAdmin()}
              placeholder="Paste ADMIN_API_KEY"
            />
            <button className="pp-btn pp-btn-solid" onClick={unlockAdmin}>Unlock</button>
          </div>
        </div>
      )}

      {showCreate && (
        <form className="pp-panel" style={{ marginBottom: 22 }} onSubmit={createNewGoal}>
          <div className="pp-panel-heading">
            <div>
              <div className="eyebrow">PLANNER AGENT</div>
              <h2>Create a new Life OS goal</h2>
            </div>
            <button type="button" className="pp-icon-btn" onClick={() => setShowCreate(false)} aria-label="Close"><X size={17} /></button>
          </div>
          <label className="pp-field">
            <span>Goal title</span>
            <input required minLength={5} placeholder="e.g. Launch a small restaurant within a fixed budget and deadline" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </label>
          <label className="pp-field">
            <span>Scope &amp; constraints (PII is automatically redacted before AI calls)</span>
            <textarea placeholder="Describe scale, seats/equipment, constraints, and outcome..." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </label>
          <div className="pp-input-grid">
            <label className="pp-field">
              <span>Location</span>
              <input required value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
            </label>
            <label className="pp-field">
              <span>Country &amp; Currency</span>
              <select
                value={form.country}
                onChange={(e) => {
                  const country = e.target.value;
                  const currency = country === 'IN' ? 'INR' : country === 'GB' ? 'GBP' : 'USD';
                  setForm((f) => ({ ...f, country, currency }));
                }}
              >
                <option value="IN">India · INR</option>
                <option value="US">United States · USD</option>
                <option value="GB">United Kingdom · GBP</option>
              </select>
            </label>
            <label className="pp-field">
              <span>Fixed budget ({form.currency})</span>
              <input type="number" min="10" required value={form.totalBudget} onChange={(e) => setForm((f) => ({ ...f, totalBudget: e.target.value }))} />
            </label>
            <label className="pp-field">
              <span>Target deadline</span>
              <input type="date" required value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} />
            </label>
          </div>
          <button type="submit" className="pp-btn pp-btn-solid" disabled={busy === 'create'}>
            <Sparkles size={16} /> {busy === 'create' ? 'Decomposing goal with AI…' : 'Decompose Goal into Milestones'}
          </button>
        </form>
      )}

      {err && <div className="pp-error pp-op-alert"><AlertTriangle size={18} /><span>{err}</span></div>}
      {notice && <div className="pp-op-note"><CheckCircle2 size={17} /><span>{notice}</span></div>}

      {goals.length > 0 && (
        <div className="pp-life-goal-strip">
          {goals.map((g) => {
            const id = g._id || g.goalRef;
            return (
              <button
                key={id}
                className={`pp-life-goal-chip ${selectedId === id ? 'active' : ''}`}
                onClick={() => selectGoal(id)}
              >
                <strong>{g.title}</strong>
                <small>{money(g.totalBudget, g.currency)} · {g.metrics?.progressPct || 0}% complete</small>
              </button>
            );
          })}
        </div>
      )}

      {!goal ? (
        <div className="pp-empty">
          <Target size={40} />
          <h3>No active Life OS goal yet</h3>
          <p>Click <b>Restaurant Demo</b> to launch the complete “Launch a small restaurant within a fixed budget and deadline” demonstration, or create a custom goal.</p>
          <div className="pp-actions" style={{ justifyContent: 'center' }}>
            <button className="pp-btn pp-btn-solid" disabled={!!busy} onClick={seedRestaurantDemo}>
              <UtensilsCrossed size={16} /> Load Restaurant Launch Demo
            </button>
          </div>
        </div>
      ) : (
        <>
          <section className="pp-panel" style={{ marginBottom: 20 }}>
            <div className="pp-panel-heading">
              <div>
                <div className="pp-eyebrow">{goal.goalRef} · {goal.location} · AI: {goal.aiProvider}</div>
                <h2 style={{ marginTop: 6 }}>{goal.title}</h2>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatusBadge value={goal.status} />
                {goal.isDemo && <span className="pp-op-badge pp-op-muted">FLAGSHIP DEMO</span>}
              </div>
            </div>
            <p className="pp-muted">{goal.description}</p>
            <div className="pp-life-progress-bar">
              <div className="pp-life-progress-fill" style={{ width: `${metrics.progressPct || 0}%` }} />
            </div>
            <div className="pp-op-metrics" style={{ marginTop: 18, marginBottom: 0 }}>
              <article className="pp-op-metric">
                <div className="pp-op-metric-top"><span>Fixed Budget</span><Target size={18} /></div>
                <strong>{money(goal.totalBudget, goal.currency)}</strong>
                <small>Allocated: {money(metrics.allocatedBudget, goal.currency)}</small>
              </article>
              <article className="pp-op-metric">
                <div className="pp-op-metric-top"><span>Approved Spend</span><UserCheck size={18} /></div>
                <strong>{money(metrics.approvedCommitment, goal.currency)}</strong>
                <small>Remaining: {money(metrics.remainingBudget, goal.currency)}</small>
              </article>
              <article className="pp-op-metric">
                <div className="pp-op-metric-top"><span>Overall Progress</span><Layers size={18} /></div>
                <strong>{metrics.progressPct || 0}%</strong>
                <small>{metrics.completedCount}/{metrics.totalMilestones} milestones · {metrics.daysRemaining}d left</small>
              </article>
              <article className="pp-op-metric">
                <div className="pp-op-metric-top"><span>Human Gates &amp; Sandbox</span><CreditCard size={18} /></div>
                <strong>{pendingApprovals.length} pending</strong>
                <small>Sandbox staged/paid: ${Number(metrics.sandboxPaidUsd || 0).toFixed(2)} USD</small>
              </article>
            </div>
          </section>

          <nav className="pp-op-tabs" aria-label="Life OS sections">
            {TABS.map(([id, label, Icon]) => (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                <Icon size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 7 }} />
                {label}
                {id === 'approvals' && pendingApprovals.length > 0 && ` (${pendingApprovals.length})`}
              </button>
            ))}
          </nav>

          {tab === 'milestones' && (
            <div className="pp-stack">
              {goal.milestones.map((m) => (
                <article className="pp-panel" key={m.code}>
                  <div className="pp-panel-heading">
                    <div>
                      <div className="pp-eyebrow">
                        {m.code} · {m.category}
                        {m.dependsOn?.length > 0 && ` · DEPENDS ON ${m.dependsOn.join(', ')}`}
                      </div>
                      <h3>{m.title}</h3>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <strong>{money(m.allocatedBudget, goal.currency)}</strong>
                      <StatusBadge value={m.status} />
                    </div>
                  </div>
                  <p className="pp-muted">{m.description}</p>
                  {m.procurementItems?.length > 0 && (
                    <div className="pp-future-milestones">
                      {m.procurementItems.map((it) => (
                        <div className="pp-future-milestone" key={it.id}>
                          <div>
                            <strong>{it.name}</strong>
                            <small>Type: {it.itemType} · Query: <code>{it.searchQuery}</code></small>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong>Est. {money(it.estimatedCost, goal.currency)}</strong>
                            <small>{it.selectedQuoteId ? 'Offer selected' : 'Needs sourcing'}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pp-actions">
                    <button className="pp-btn pp-btn-solid" disabled={!!busy || role === 'VIEWER'} onClick={() => sourceProviders(m.code)}>
                      <Search size={15} /> {busy === `src-${m.code}` ? 'Searching providers…' : 'Source Real Providers'}
                    </button>
                    {m.status !== 'IN_PROGRESS' && m.status !== 'COMPLETED' && (
                      <button className="pp-btn" disabled={!!busy || role === 'VIEWER'} onClick={() => updateMilestone(m.code, 'IN_PROGRESS')}>
                        <Clock3 size={15} /> Start Milestone
                      </button>
                    )}
                    {m.status !== 'COMPLETED' && (
                      <button className="pp-btn" disabled={!!busy || role === 'VIEWER'} onClick={() => updateMilestone(m.code, 'COMPLETED')}>
                        <Check size={15} /> Mark Completed
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {tab === 'providers' && (
            <div className="pp-stack">
              {!goal.quotes?.length ? (
                <div className="pp-panel pp-empty">
                  <Search size={34} />
                  <h3>No provider quotes sourced yet</h3>
                  <p>Open <b>Milestones &amp; Dependencies</b> and click <b>Source Real Providers</b> on any milestone (e.g., M2 Kitchen Equipment or M3 POS Hardware) to fetch live shopping offers.</p>
                </div>
              ) : (
                <div className="pp-future-grid">
                  {goal.quotes.map((q) => (
                    <article className="pp-panel" key={q.quoteId}>
                      <div className="pp-panel-heading">
                        <div>
                          <div className="pp-eyebrow">{q.milestoneCode} · {q.itemName}</div>
                          <h3 style={{ fontSize: 17 }}>{q.title}</h3>
                        </div>
                        <span className={`pp-op-badge ${q.isRealProvider ? 'pp-op-ok' : 'pp-op-muted'}`}>
                          {q.isRealProvider ? `LIVE · ${q.source}` : 'SIMULATED ESTIMATE'}
                        </span>
                      </div>
                      {q.image && <img src={q.image} alt={q.title} className="pp-scan-result-image" style={{ width: 96, height: 96 }} referrerPolicy="no-referrer" />}
                      <p className="pp-muted">Provider: <b>{q.provider}</b></p>
                      <div style={{ fontSize: 22, fontWeight: 800, margin: '8px 0', fontFamily: 'Manrope' }}>
                        {money(q.price, q.currency)}
                      </div>
                      <p className="pp-small pp-muted">{q.notes}</p>
                      {q.negotiationScript && (
                        <div className="pp-op-note">
                          <MessageSquare size={16} />
                          <span>{q.negotiationScript}</span>
                        </div>
                      )}
                      <div className="pp-actions">
                        <button className={`pp-btn ${q.selected ? 'pp-btn-solid' : ''}`} disabled={!!busy || role === 'VIEWER'} onClick={() => selectQuote(q.quoteId)}>
                          <CheckCircle2 size={15} /> {q.selected ? 'Selected Offer' : 'Select & Request Approval'}
                        </button>
                        <button className="pp-btn" disabled={!!busy || role === 'VIEWER'} onClick={() => draftNegotiation(q.quoteId)}>
                          <MessageSquare size={15} /> {busy === `neg-${q.quoteId}` ? 'Drafting…' : 'AI Negotiation Copilot'}
                        </button>
                        {q.url && (
                          <a className="pp-btn" href={q.url} target="_blank" rel="noopener noreferrer">
                            Source <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'approvals' && (
            <div className="pp-stack">
              {goal.approvals.map((a) => (
                <article className="pp-panel" key={a.approvalId}>
                  <div className="pp-panel-heading">
                    <div>
                      <div className="pp-eyebrow">{a.approvalId} · {a.type.replaceAll('_', ' ')} {a.milestoneCode ? `· ${a.milestoneCode}` : ''}</div>
                      <h3>{a.title}</h3>
                    </div>
                    <StatusBadge value={a.status} />
                  </div>
                  <p className="pp-muted">{a.summary}</p>
                  <p className="pp-small" style={{ marginTop: 8 }}>
                    Amount: <b>{money(a.amount, a.currency)}</b> · Sandbox USD est: <b>${Number(a.sandboxUsdAmount || 0).toFixed(2)} USD</b> · Requested by: {a.requestedBy}
                  </p>
                  {a.decidedByRole && (
                    <p className="pp-small pp-muted">Decided by {a.decidedByRole} at {new Date(a.decidedAt).toLocaleString()}</p>
                  )}
                  {a.status === 'PENDING' && (
                    <div className="pp-actions">
                      <button className="pp-btn pp-btn-solid" disabled={!!busy || role === 'VIEWER'} onClick={() => decideApproval(a.approvalId, 'APPROVED')}>
                        <Check size={15} /> Approve ({role})
                      </button>
                      <button className="pp-btn" disabled={!!busy || role === 'VIEWER'} onClick={() => decideApproval(a.approvalId, 'REJECTED')}>
                        <X size={15} /> Reject
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {tab === 'agents' && (
            <div className="pp-future-grid">
              <section className="pp-panel">
                <div className="pp-panel-heading">
                  <div>
                    <div className="pp-eyebrow">MULTI-AGENT ORCHESTRATION</div>
                    <h2>Execution Monitor &amp; Agents</h2>
                  </div>
                  <Bot size={20} />
                </div>
                <p className="pp-muted">{goal.agentInsights?.plannerSummary}</p>
                <div className="pp-op-note">
                  <Activity size={16} />
                  <span>
                    <b>Risk: {goal.agentInsights?.riskLevel || 'LOW'}</b> — {monitorOut?.executionRisk || goal.agentInsights?.executionRisk}
                  </span>
                </div>
                {monitorOut?.nextRecommendedActions?.map((act, idx) => (
                  <p className="pp-small" key={idx} style={{ marginTop: 6 }}>• {act}</p>
                ))}
                <div className="pp-actions">
                  <button className="pp-btn pp-btn-solid" disabled={!!busy || role === 'VIEWER'} onClick={runMonitor}>
                    <RefreshCcw size={15} /> {busy === 'monitor' ? 'Running Monitor Agent…' : 'Run Execution Monitor Agent'}
                  </button>
                </div>
                <div className="pp-future-milestones" style={{ marginTop: 18 }}>
                  {[
                    ['Planner Agent', 'Decomposes goal, budget & dependencies via Gemini/Rules with PII redaction'],
                    ['Sourcing Agent', 'Queries Google Shopping & eBay APIs; labels simulated estimates explicitly'],
                    ['Negotiation Copilot', 'Drafts vendor RFQ scripts gated by human outreach approval'],
                    ['Execution Monitor', 'Evaluates milestone dependencies, budget headroom & deadline risk'],
                    ['Payment Prep Agent', 'Converts approved commitments to USD and stages PayPal Sandbox orders']
                  ].map(([name, desc]) => (
                    <div className="pp-future-milestone" key={name}>
                      <div><strong>{name}</strong><small>{desc}</small></div>
                      <StatusBadge value="ACTIVE" />
                    </div>
                  ))}
                </div>
              </section>

              <section className="pp-panel">
                <div className="pp-panel-heading">
                  <div>
                    <div className="eyebrow">MONGODB AUDIT TRAIL</div>
                    <h2>Activity Log</h2>
                  </div>
                  <FileText size={20} />
                </div>
                <div className="pp-notes">
                  {goal.activityLogs.slice(0, 14).map((log, idx) => (
                    <div className="pp-note" key={idx}>
                      <span>
                        <b>[{log.agent}] {log.action}</b> — {log.summary}
                        <small>{new Date(log.at).toLocaleString()} · Role: {log.actorRole}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === 'payments' && (
            <div className="pp-future-grid">
              <section className="pp-panel">
                <div className="pp-panel-heading">
                  <div>
                    <div className="eyebrow">AUTHORIZED PAYPAL SANDBOX EXECUTION</div>
                    <h2>Payment Prep Agent</h2>
                  </div>
                  <span className="pp-op-badge pp-op-muted">SANDBOX ONLY · USD MAX $5,000</span>
                </div>
                <p className="pp-muted">
                  Only explicitly approved <b>PAYMENT AUTHORIZATION</b> gates can initiate PayPal Sandbox orders. Amounts in INR/GBP are converted to USD for Sandbox testing.
                </p>

                {!paymentApprovals.length ? (
                  <div className="pp-op-note">
                    <Lock size={16} />
                    <span>No approved Payment Authorizations yet. Open <b>Human Approvals</b> and approve a payment authorization gate first.</span>
                  </div>
                ) : (
                  <div className="pp-future-milestones">
                    {paymentApprovals.map((a) => (
                      <div className="pp-future-milestone" key={a.approvalId} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <div>
                            <strong>{a.title}</strong>
                            <small>Original: {money(a.amount, a.currency)} · Sandbox: ${Number(a.sandboxUsdAmount).toFixed(2)} USD</small>
                          </div>
                          <StatusBadge value={a.status} />
                        </div>
                        <div className="pp-actions" style={{ marginTop: 8 }}>
                          <button className="pp-btn pp-btn-solid" disabled={!!busy || role === 'VIEWER'} onClick={() => prepareSandboxOrder(a.approvalId, false)}>
                            Stage in PayPal Checkout <ArrowRight size={14} />
                          </button>
                          <button className="pp-btn" disabled={!!busy || role === 'VIEWER'} onClick={() => prepareSandboxOrder(a.approvalId, true)}>
                            Create Sandbox Order Now
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 22 }}>
                  <div className="pp-eyebrow">SYNC SANDBOX ORDER TO GOAL</div>
                  <div className="pp-bid-form">
                    <input
                      placeholder="Paste PayPal Sandbox Order ID"
                      value={linkOrderId}
                      onChange={(e) => setLinkOrderId(e.target.value)}
                    />
                    <button className="pp-btn pp-btn-solid" disabled={!!busy || !linkOrderId.trim() || role === 'VIEWER'} onClick={syncSandboxOrder}>
                      Sync Order
                    </button>
                  </div>
                </div>
              </section>

              <section className="pp-panel">
                <div className="pp-panel-heading">
                  <div>
                    <div className="eyebrow">GOAL TRANSACTION LEDGER</div>
                    <h2>Recorded Sandbox References</h2>
                  </div>
                  <CreditCard size={20} />
                </div>
                {!goal.transactions?.length ? (
                  <p className="pp-muted">No Sandbox transactions recorded for this goal yet.</p>
                ) : (
                  <div className="pp-future-milestones">
                    {goal.transactions.map((t) => (
                      <div className="pp-future-milestone" key={t.txRef}>
                        <div>
                          <strong>{t.paypalOrderId || t.txRef}</strong>
                          <small>{t.note} {t.captureId ? `· Capture: ${t.captureId}` : ''}</small>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <strong>${Number(t.amountUsd).toFixed(2)} USD</strong>
                          <StatusBadge value={t.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {statusInfo?.requiredEnvVars && (
                  <div style={{ marginTop: 22 }}>
                    <div className="pp-eyebrow">ENVIRONMENT &amp; INTEGRATION STATE</div>
                    <div className="pp-notes">
                      {statusInfo.requiredEnvVars.map((v) => (
                        <div className="pp-note" key={v.key}>
                          <span><b>{v.key}</b> — {v.purpose}</span>
                          <StatusBadge value={v.configured ? 'CONNECTED' : 'MISSING'} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
