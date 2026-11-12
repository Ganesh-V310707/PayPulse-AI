import { useCallback, useEffect, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, Check, CheckCircle2, Clock3, CreditCard,
  Database, ExternalLink, Info, KeyRound, RefreshCcw, Send, ShieldAlert, Sparkles,
  Wallet, Webhook
} from 'lucide-react';
import api, { getErrorMessage } from '../lib/api';
import PayPalCheckout from './PayPalCheckout';

const TAB = [
  ['overview', 'Overview'],
  ['transactions', 'Transactions'],
  ['incidents', 'Incidents'],
  ['events', 'Webhook events'],
  ['integrations', 'Integrations']
];

const format = (n, c = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(n || 0));
  } catch {
    return `${n} ${c}`;
  }
};

const date = (x) => (x ? new Date(x).toLocaleString() : '—');
const short = (x) => (x ? String(x).slice(0, 15) : '—');

function extractApproveLink(payment) {
  const links = payment?.rawLastOrder?.links || payment?.rawCreateResponse?.links || [];
  if (!Array.isArray(links)) return null;
  return links.find((l) => l.rel === 'approve')?.href || links.find((l) => l.rel === 'payer-action')?.href || null;
}

function Badge({ value }) {
  const v = String(value || 'UNKNOWN');
  const cls =
    v === 'COMPLETED' || v === 'RESOLVED' || v === 'PAYPAL_VERIFIED' || v === 'APPROVED'
      ? 'ok'
      : v === 'DENIED' || v === 'FAILED'
        ? 'bad'
        : 'muted';
  return <span className={`pp-op-badge pp-op-${cls}`}>{v.replaceAll('_', ' ')}</span>;
}

function Metric({ label, value, detail, Icon }) {
  return (
    <article className="pp-op-metric">
      <div className="pp-op-metric-top">
        <span>{label}</span>
        <Icon size={20} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default function Operations({ checkoutDraft }) {
  const [key, setKey] = useState(() => sessionStorage.getItem('paypulse-admin-key') || '');
  const [draft, setDraft] = useState('');
  const [tab, setTab] = useState('overview');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [events, setEvents] = useState([]);
  const [config, setConfig] = useState(null);
  const [selected, setSelected] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [a, b, c, d, e] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/payments'),
        api.get('/dashboard/incidents'),
        api.get('/dashboard/events'),
        api.get('/config/public')
      ]);
      setSummary(a.data);
      const nextPayments = b.data.items || [];
      setPayments(nextPayments);
      setIncidents(c.data.items || []);
      setEvents(d.data.items || []);
      setConfig(e.data);
      setSelected((prev) => (prev ? nextPayments.find((p) => p._id === prev._id || p.orderId === prev.orderId) || prev : null));
    } catch (e) {
      setErr(getErrorMessage(e));
      if (e.response?.status === 401) {
        sessionStorage.removeItem('paypulse-admin-key');
        setKey('');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (key) refresh();
    else setLoading(false);
  }, [key, refresh]);

  function login() {
    const value = draft.trim();
    if (!value) return;
    sessionStorage.setItem('paypulse-admin-key', value);
    setKey(value);
    setDraft('');
  }

  async function action(name, url, body = {}) {
    setBusy(name);
    setErr('');
    setNotice('');
    try {
      const r = await api.post(url, body);
      if (name.startsWith('Analyze')) setAnalysis(r.data.analysis);
      if (name.startsWith('Reconcile')) {
        setNotice(`PayPal reports: ${r.data.rawProviderStatus || r.data.providerStatus}${r.data.canCapture ? ' — Ready to capture!' : ''}`);
      }
      if (name.startsWith('Capture')) {
        setNotice(`Payment captured & verified (${r.data.captureId || 'COMPLETED'}).`);
      }
      await refresh();
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy('');
    }
  }

  async function resolve(id) {
    try {
      await api.patch(`/dashboard/incidents/${encodeURIComponent(id)}`, { status: 'RESOLVED' });
      refresh();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  }

  const stats = summary?.stats || {};

  if (!key) {
    return (
      <div className="pp-page">
        <div className="pp-eyebrow">PAYMENT INTELLIGENCE / ADMIN ACCESS</div>
        <h1 className="pp-page-title">Protected payment workspace.</h1>
        <p className="pp-muted pp-intro">
          Payment and incident records are restricted. Enter the ADMIN_API_KEY from your own <code>server/.env</code>. The key stays in this browser tab’s session, and is never bundled into the app.
        </p>
        <div className="pp-panel pp-op-login">
          <KeyRound size={28} />
          <h2>Admin access</h2>
          <label className="pp-field">
            <span>Admin key</span>
            <input
              type="password"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              autoComplete="off"
              placeholder="Paste your ADMIN_API_KEY"
            />
          </label>
          <button className="pp-btn pp-btn-solid" onClick={login}>
            Unlock payment console <ArrowRight size={16} />
          </button>
          <p className="pp-muted pp-small">Set a secure 32+ character key in server/.env and restart the API first.</p>
        </div>
      </div>
    );
  }

  const selectedApproveUrl = selected && selected.status === 'CREATED' ? extractApproveLink(selected) : null;

  return (
    <div className="pp-page pp-operations">
      <div className="pp-op-head">
        <div>
          <div className="pp-eyebrow">PAYPULSE / OPERATIONS</div>
          <h1 className="pp-page-title">Payment intelligence.</h1>
          <p className="pp-muted">Your Sandbox transactions and verified webhook events—organized in the same PayPulse workspace.</p>
        </div>
        <div className="pp-actions">
          <button className="pp-btn" onClick={() => { sessionStorage.removeItem('paypulse-admin-key'); setKey(''); }}>
            <KeyRound size={16} /> Lock
          </button>
          <button className="pp-btn pp-btn-solid" onClick={refresh} disabled={loading}>
            <RefreshCcw size={16} /> Refresh
          </button>
        </div>
      </div>

      <nav className="pp-op-tabs" aria-label="Payment views">
        {TAB.map(([id, label]) => (
          <button className={tab === id ? 'active' : ''} key={id} onClick={() => { setTab(id); setAnalysis(null); setNotice(''); }}>
            {label}
          </button>
        ))}
      </nav>

      {err && <div className="pp-error pp-op-alert"><AlertTriangle size={18} /><span>{err}</span></div>}
      {notice && <div className="pp-op-note"><CheckCircle2 size={17} /><span>{notice}</span></div>}
      {loading && <p className="pp-muted">Updating verified payment records…</p>}

      {tab === 'overview' && (
        <>
          <div className="pp-op-metrics">
            <Metric label="Recorded payments" value={stats.total || 0} detail="Includes local simulations" Icon={Wallet} />
            <Metric label="Verified captures" value={stats.completed || 0} detail="Provider-confirmed records" Icon={CheckCircle2} />
            <Metric label="Pending payments" value={stats.pending || 0} detail="Require provider reconciliation" Icon={Clock3} />
            <Metric label="Payment exceptions" value={stats.denied || 0} detail="Denied and failed attempts" Icon={ShieldAlert} />
          </div>
          <div className="pp-op-columns">
            <section className="pp-panel">
              <div className="pp-panel-heading">
                <h2>Latest payments</h2>
                <button className="pp-inline" onClick={() => setTab('transactions')}>View all <ArrowRight size={15} /></button>
              </div>
              <PaymentTable items={summary?.recentPayments || []} onSelect={(p) => { setSelected(p); setAnalysis(null); setNotice(''); }} />
            </section>
            <section className="pp-op-stack">
              <section className="pp-panel">
                <div className="pp-panel-heading">
                  <h2>Sandbox checkout</h2>
                  <Badge value="SANDBOX ONLY" />
                </div>
                <p className="pp-muted">Test payments are not real customer purchases.</p>
                {config && <PayPalCheckout config={config} onPaymentComplete={refresh} prefill={checkoutDraft} />}
              </section>
              <section className="pp-panel">
                <h2>Operational safeguards</h2>
                <p className="pp-muted">
                  Never fulfil on a CREATED or APPROVED status. Only PayPal-confirmed capture completion is sufficient. AI provides investigation advice, not payment authorization.
                </p>
              </section>
              {config?.localScenariosEnabled && (
                <section className="pp-panel">
                  <div className="pp-panel-heading">
                    <h2>Reliability lab</h2>
                    <Badge value="LOCAL SIMULATION" />
                  </div>
                  <p className="pp-muted">Run isolated demonstration scenarios. They never call PayPal and never represent real money movement.</p>
                  <div className="pp-op-scenarios">
                    {[
                      ['capture-db-gap', 'Capture / DB gap'],
                      ['duplicate-webhook', 'Duplicate webhook'],
                      ['pending-capture', 'Pending capture'],
                      ['denied-capture', 'Denied capture'],
                      ['missing-webhook', 'Missing webhook']
                    ].map(([id, label]) => (
                      <button className="pp-btn" key={id} disabled={!!busy} onClick={() => action(`Simulate ${id}`, '/dev/scenarios', { scenario: id })}>
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </section>
          </div>
        </>
      )}

      {tab === 'transactions' && (
        <section className="pp-panel">
          <div className="pp-panel-heading">
            <div>
              <h2>Payment ledger</h2>
              <p className="pp-muted">Select a payment to inspect, reconcile, capture, or investigate.</p>
            </div>
            <span>{payments.length} records</span>
          </div>
          <PaymentTable items={payments} onSelect={(p) => { setSelected(p); setAnalysis(null); setNotice(''); }} />
        </section>
      )}

      {tab === 'incidents' && (
        <div className="pp-op-list">
          {incidents.length ? incidents.map((item) => (
            <article className="pp-panel" key={item._id}>
              <div className="pp-panel-heading">
                <h2>{item.title}</h2>
                <Badge value={item.status} />
              </div>
              <p className="pp-muted">{item.description}</p>
              <div className="pp-op-meta">{date(item.createdAt)} · Severity: {item.severity} · {item.source}</div>
              {item.recommendation && <p className="pp-op-note"><Sparkles size={16} />{item.recommendation}</p>}
              <div className="pp-actions">
                {item.orderId && (
                  <button className="pp-btn" disabled={!!busy} onClick={() => action(`Analyze ${item.orderId}`, `/payments/${encodeURIComponent(item.orderId)}/investigate`)}>
                    <Sparkles size={16} /> Investigate
                  </button>
                )}
                {item.status !== 'RESOLVED' && (
                  <button className="pp-btn" onClick={() => resolve(item._id)}>
                    <Check size={16} /> Mark resolved
                  </button>
                )}
              </div>
            </article>
          )) : <div className="pp-panel pp-op-empty">No incidents recorded.</div>}
        </div>
      )}

      {tab === 'events' && (
        <section className="pp-panel">
          <div className="pp-panel-heading">
            <div>
              <h2>Webhook event monitor</h2>
              <p className="pp-muted">Verified PayPal deliveries are distinct from local simulated events.</p>
            </div>
            <Webhook size={21} />
          </div>
          <div className="pp-op-table-scroll">
            <table className="pp-op-table">
              <thead>
                <tr><th>Event type</th><th>Source</th><th>Verified</th><th>Processed</th><th>Deliveries</th><th>Received</th></tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e._id}>
                    <td>{e.eventType}</td>
                    <td><Badge value={e.source} /></td>
                    <td>{e.verified ? 'Yes' : 'No'}</td>
                    <td>{e.processed ? 'Yes' : 'No'}</td>
                    <td>{e.deliveryCount || 1}</td>
                    <td>{date(e.receivedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!events.length && <p className="pp-muted">No webhook deliveries have been recorded yet.</p>}
          </div>
        </section>
      )}

      {tab === 'integrations' && (
        <div className="pp-op-metrics">
          {[
            ['PayPal Sandbox', config?.paypalConfigured ? 'Configured' : 'Missing credentials', CreditCard],
            ['Webhook verification', config?.webhookConfigured ? 'Configured' : 'Webhook ID needed', Webhook],
            ['Gemini', config?.geminiConfigured ? 'Configured' : 'Fallback available', Sparkles],
            ['MongoDB', summary ? 'Connected' : 'Unavailable', Database]
          ].map(([name, state, Icon]) => (
            <Metric key={name} label={name} value={state} detail="Configuration readiness, not a completed transaction test" Icon={Icon} />
          ))}
        </div>
      )}

      {analysis && (
        <section className="pp-panel pp-op-analysis">
          <h2>Investigation</h2>
          <p>{analysis.summary}</p>
          <p>{analysis.rootCause}</p>
          {(analysis.recommendedActions || []).map((x, i) => <p key={i}>• {x}</p>)}
          <Badge value={analysis.provider} />
        </section>
      )}

      {selected && (
        <div className="pp-modal-backdrop" onClick={() => setSelected(null)} role="presentation">
          <div className="pp-modal pp-op-detail" role="dialog" aria-modal="true" aria-label="Payment detail" onClick={(e) => e.stopPropagation()}>
            <div className="pp-panel-heading">
              <h2>Payment detail</h2>
              <button className="pp-btn" onClick={() => setSelected(null)}>Close</button>
            </div>
            <p className="pp-muted">Order ID: {selected.orderId || 'Not assigned'}</p>
            <h3>{format(selected.amount, selected.currency)}</h3>
            <Badge value={selected.status} />
            <p className="pp-muted" style={{ marginTop: 10 }}>{selected.description}</p>
            <p>Source: {selected.source}</p>
            <p>Capture ID: {selected.captureId || 'Not yet captured'}</p>
            {selected.payerEmail && <p>Payer: {selected.payerEmail}</p>}
            <p>Last synchronized: {date(selected.lastSyncedAt)}</p>
            {notice && <p className="pp-op-note"><CheckCircle2 size={15} /> {notice}</p>}
            {err && <p className="pp-error"><AlertTriangle size={15} /> {err}</p>}
            <div className="pp-actions">
              {selected.orderId && selected.source === 'PAYPAL' && (
                <>
                  {selectedApproveUrl && (
                    <a className="pp-btn" href={selectedApproveUrl} target="_blank" rel="noopener noreferrer">
                      Open PayPal Approval <ExternalLink size={15} />
                    </a>
                  )}
                  <button className="pp-btn" disabled={!!busy} onClick={() => action('Reconcile', `/payments/${encodeURIComponent(selected.orderId)}/reconcile`)}>
                    <RefreshCcw size={16} /> Reconcile
                  </button>
                  {selected.status === 'APPROVED' && (
                    <button className="pp-btn pp-btn-solid" disabled={!!busy} onClick={() => action('Capture', `/payments/${encodeURIComponent(selected.orderId)}/capture`)}>
                      <CheckCircle2 size={16} /> Capture Order
                    </button>
                  )}
                  <button className="pp-btn pp-btn-solid" disabled={!!busy} onClick={() => action(`Analyze ${selected.orderId}`, `/payments/${encodeURIComponent(selected.orderId)}/investigate`)}>
                    <Sparkles size={16} /> Analyze
                  </button>
                </>
              )}
            </div>
            {analysis && <p className="pp-op-note">{analysis.rootCause}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentTable({ items, onSelect }) {
  return (
    <div className="pp-op-table-scroll">
      <table className="pp-op-table">
        <thead>
          <tr><th>Order</th><th>Amount</th><th>Source</th><th>Status</th><th>Date</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p._id || p.merchantReference} onClick={() => onSelect(p)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(p)} role="button">
              <td><strong>{short(p.orderId || p.merchantReference)}</strong><small>{p.description || 'PayPal transaction'}</small></td>
              <td>{format(p.amount, p.currency)}</td>
              <td><Badge value={p.source} /></td>
              <td><Badge value={p.status} /></td>
              <td>{date(p.createdAt)}</td>
              <td><ArrowRight size={15} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!items.length && <p className="pp-muted">No payment records yet. Use the Sandbox checkout to test.</p>}
    </div>
  );
}
