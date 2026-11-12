import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertOctagon, AlertTriangle, ArrowDownLeft, ArrowRight, ArrowUpRight,
  Bell, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3,
  Code2, Command, CreditCard, Database, ExternalLink, FileClock, Filter,
  Gauge, Globe2, Info, Layers3, LifeBuoy, LoaderCircle, LockKeyhole, Menu,
  MoreHorizontal, Plus, Radio, RefreshCw, Search, Settings2, Shield, ShieldAlert,
  ShieldCheck, Sparkles, WalletCards, Webhook, X, Zap
} from 'lucide-react';
import PayPalCheckout from './components/PayPalCheckout';
import api, { getErrorMessage } from './lib/api';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'transactions', label: 'Transactions', icon: WalletCards, countKey: 'total' },
  { id: 'incidents', label: 'Incidents', icon: ShieldAlert, countKey: 'openIncidents' },
  { id: 'events', label: 'Event monitor', icon: Webhook },
  { id: 'integrations', label: 'Integrations', icon: Settings2 }
];

const EMPTY_DATA = {
  stats: { total: 0, completed: 0, pending: 0, denied: 0, localSimulationCount: 0, completedAmount: [] },
  recentPayments: [], openIncidents: [], recentEvents: [], volume: []
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatMoney(amount, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(amount || 0));
}

function shortId(value) {
  if (!value) return '—';
  return value.length > 20 ? `${value.slice(0, 9)}…${value.slice(-7)}` : value;
}

function StatusPill({ status }) {
  const value = String(status || 'UNKNOWN').toUpperCase();
  const map = {
    COMPLETED: 'green', RESOLVED: 'green', VERIFIED: 'green', APPROVED: 'blue',
    CREATED: 'blue', PENDING: 'amber', INVESTIGATING: 'amber', OPEN: 'amber',
    DENIED: 'red', FAILED: 'red', CRITICAL: 'red', HIGH: 'red', REFUNDED: 'slate',
    LOW: 'slate', MEDIUM: 'amber', IGNORED: 'slate', UNKNOWN: 'slate'
  };
  return <span className={`status-pill ${map[value] || 'slate'}`}><i />{value.replaceAll('_', ' ')}</span>;
}

function SourceTag({ source }) {
  const local = source === 'LOCAL_SIMULATION';
  return <span className={`source-tag ${local ? 'simulation' : 'paypal'}`}>{local ? 'LOCAL FIXTURE' : 'PAYPAL'}</span>;
}

function PageTitle({ eyebrow, title, subtitle, right }) {
  return (
    <div className="page-title-row">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right && <div className="page-title-actions">{right}</div>}
    </div>
  );
}

function MetricCard({ label, value, note, icon: Icon, color = 'blue', trend }) {
  return (
    <div className="metric-card">
      <div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}`}><Icon size={17} /></span></div>
      <div className="metric-value">{value}</div>
      <div className="metric-bottom"><span>{note}</span>{trend && <span className="metric-trend">{trend}</span>}</div>
    </div>
  );
}

function EmptyState({ icon: Icon = Layers3, title, body, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><Icon size={22} /></div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

function PaymentTable({ payments, onSelect, compact = false }) {
  if (!payments?.length) {
    return <EmptyState icon={WalletCards} title="No transactions yet" body="Create a PayPal Sandbox payment or add a local reliability scenario to start exploring the ledger." />;
  }
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr>
          <th>Transaction</th><th>Source</th><th>Amount</th><th>Status</th><th>Created</th><th><span className="sr-only">Open</span></th>
        </tr></thead>
        <tbody>
          {payments.slice(0, compact ? 6 : 100).map((payment) => (
            <tr key={payment._id || payment.orderId || payment.merchantReference} onClick={() => onSelect(payment)} className="click-row">
              <td><div className="transaction-cell"><span className="transaction-icon"><CreditCard size={16} /></span><span><strong>{shortId(payment.orderId || payment.merchantReference)}</strong><small>{payment.description || 'Payment'}</small></span></div></td>
              <td><SourceTag source={payment.source} /></td>
              <td className="amount-cell">{formatMoney(payment.amount, payment.currency)}</td>
              <td><StatusPill status={payment.status} /></td>
              <td className="muted-cell">{formatDate(payment.createdAt)}</td>
              <td><ChevronRight className="row-chevron" size={16} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VolumeChart({ volume = [] }) {
  const labels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
  const values = labels.map((day) => volume.find((item) => item._id === day)?.count || 0);
  const max = Math.max(1, ...values);
  return (
    <div className="volume-chart">
      <div className="chart-grid"><span /><span /><span /></div>
      <div className="chart-bars">
        {values.map((value, index) => (
          <div className="chart-column" key={labels[index]} title={`${labels[index]}: ${value} completed payments`}>
            <div className="chart-bar-track"><div className="chart-bar" style={{ height: `${Math.max(value ? 9 : 2, (value / max) * 100)}%` }} /></div>
            <span>{new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${labels[index]}T12:00:00`))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function IncidentCard({ incident, onInvestigate, onUpdate, busy }) {
  return (
    <article className="incident-card">
      <div className="incident-card-top">
        <div className="incident-type-icon"><AlertTriangle size={17} /></div>
        <div className="incident-title-block"><div className="incident-title-line"><h3>{incident.title}</h3><StatusPill status={incident.severity} /></div><p>{incident.description}</p></div>
        <button className="icon-button quiet" title="Incident options" aria-label="Incident options"><MoreHorizontal size={18} /></button>
      </div>
      <div className="incident-card-meta"><span><Clock3 size={13} /> {formatDate(incident.createdAt)}</span><span className="meta-divider" /><SourceTag source={incident.source} /><span className="meta-divider" /><StatusPill status={incident.status} /></div>
      {incident.recommendation && <div className="recommendation"><Sparkles size={14} /><span>{incident.recommendation}</span></div>}
      <div className="incident-actions">
        <button className="button button-secondary button-small" onClick={() => onInvestigate(incident.orderId || incident.payment?.orderId || incident.payment?.merchantReference)} disabled={busy}>{busy ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />} Investigate with AI</button>
        {incident.status !== 'RESOLVED' && <button className="button button-ghost button-small" onClick={() => onUpdate(incident._id, 'RESOLVED')}>Mark resolved <Check size={14} /></button>}
      </div>
    </article>
  );
}

function OverviewPage({ data, config, onRefresh, onPaymentComplete, onSelectPayment, onCreateScenario, busyScenario }) {
  const stats = data.stats || EMPTY_DATA.stats;
  const completionRate = stats.total ? Math.round((stats.completed / Math.max(1, stats.total - stats.localSimulationCount)) * 100) : 0;
  return (
    <>
      <PageTitle eyebrow="PAYMENT OPERATIONS" title="Overview" subtitle="A live view of your payment health, exceptions and event activity." right={<button className="button button-secondary" onClick={onRefresh}><RefreshCw size={15} /> Refresh data</button>} />
      <div className="metric-grid">
        <MetricCard label="Total transactions" value={stats.total.toLocaleString()} note={`${stats.localSimulationCount} local test fixtures`} icon={WalletCards} color="blue" />
        <MetricCard label="Completed captures" value={stats.completed.toLocaleString()} note="PayPal-confirmed records" icon={CheckCircle2} color="green" />
        <MetricCard label="Needs attention" value={(stats.pending + stats.denied).toLocaleString()} note={`${stats.pending} pending · ${stats.denied} denied / failed`} icon={AlertTriangle} color="amber" />
        <MetricCard label="Completion rate" value={`${Math.min(100, completionRate)}%`} note="Based on stored transactions" icon={Activity} color="violet" />
      </div>
      <div className="overview-grid">
        <div className="overview-main-column">
          <section className="panel chart-panel">
            <div className="panel-heading"><div><div className="eyebrow">PAYMENT ACTIVITY</div><h3>Completed captures</h3><p className="panel-subtitle">Last 7 days · PayPal records only</p></div><span className="period-chip">7 days <ChevronDown size={13} /></span></div>
            <VolumeChart volume={data.volume} />
          </section>
          <section className="panel table-panel">
            <div className="panel-heading"><div><div className="eyebrow">LEDGER</div><h3>Recent transactions</h3></div><a className="text-link" href="#transactions" onClick={(event) => { event.preventDefault(); window.dispatchEvent(new CustomEvent('paypulse:navigate', { detail: 'transactions' })); }}>View all <ArrowUpRight size={14} /></a></div>
            <PaymentTable payments={data.recentPayments} compact onSelect={onSelectPayment} />
          </section>
        </div>
        <div className="overview-side-column">
          <PayPalCheckout config={config} onPaymentComplete={onPaymentComplete} />
          <section className="panel scenario-panel">
            <div className="panel-heading"><div><div className="eyebrow">RELIABILITY LAB</div><h3>Try a failure scenario</h3><p className="panel-subtitle">Local fixtures · No money moves</p></div><span className="icon-orb violet"><Zap size={17} /></span></div>
            <div className="scenario-list">
              <button onClick={() => onCreateScenario('capture-db-gap')} disabled={Boolean(busyScenario)}><span className="scenario-icon amber"><Database size={15} /></span><span><strong>Capture / DB gap</strong><small>Provider completed · ledger pending</small></span><ChevronRight size={15} /></button>
              <button onClick={() => onCreateScenario('duplicate-webhook')} disabled={Boolean(busyScenario)}><span className="scenario-icon violet"><Webhook size={15} /></span><span><strong>Duplicate webhook</strong><small>One event delivered three times</small></span><ChevronRight size={15} /></button>
              <button onClick={() => onCreateScenario('pending-capture')} disabled={Boolean(busyScenario)}><span className="scenario-icon blue"><Clock3 size={15} /></span><span><strong>Pending capture</strong><small>Payment not yet terminal</small></span><ChevronRight size={15} /></button>
              <button onClick={() => onCreateScenario('denied-capture')} disabled={Boolean(busyScenario)}><span className="scenario-icon red"><AlertOctagon size={15} /></span><span><strong>Denied capture</strong><small>Provider rejects the capture</small></span><ChevronRight size={15} /></button>
            </div>
            {busyScenario && <div className="scenario-progress"><LoaderCircle className="spin" size={13} /> Creating local fixture…</div>}
          </section>
          <section className="mini-health-panel">
            <div className="mini-health-top"><span className="health-check"><Activity size={15} /></span><div><strong>System status</strong><small>Integration readiness</small></div><span className="live-label"><i /> ACTIVE</span></div>
            <div className="health-row"><span>PayPal Sandbox</span><StatusPill status={config?.paypalConfigured ? 'COMPLETED' : 'PENDING'} /></div>
            <div className="health-row"><span>AI investigation</span><StatusPill status={config?.geminiConfigured ? 'COMPLETED' : 'APPROVED'} /></div>
            <div className="health-row"><span>Webhook verification</span><StatusPill status={config?.webhookConfigured ? 'COMPLETED' : 'PENDING'} /></div>
          </section>
        </div>
      </div>
    </>
  );
}

function TransactionsPage({ payments, onSelect, onReconcile, reconciling }) {
  const [filter, setFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => payments.filter((payment) => {
    const matchesFilter = filter === 'ALL' || payment.status === filter;
    const search = `${payment.orderId || ''} ${payment.merchantReference || ''} ${payment.description || ''}`.toLowerCase();
    return matchesFilter && search.includes(query.toLowerCase());
  }), [payments, filter, query]);
  return (
    <>
      <PageTitle eyebrow="PAYMENT LEDGER" title="Transactions" subtitle="Inspect payment state, provider references and reconciliation status." />
      <section className="panel full-panel">
        <div className="toolbar">
          <div className="search-field"><Search size={16} /><input placeholder="Search order ID or description…" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <div className="filter-control"><Filter size={15} /><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All statuses</option><option value="COMPLETED">Completed</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="DENIED">Denied</option><option value="FAILED">Failed</option><option value="REFUNDED">Refunded</option></select></div>
          <span className="results-count">{filtered.length} records</span>
        </div>
        <PaymentTable payments={filtered} onSelect={onSelect} />
      </section>
      <div className="info-banner"><Info size={17} /><span>Reconciliation queries PayPal's Orders API and compares the provider state with this local ledger. Local simulation fixtures are deliberately excluded from provider reconciliation.</span></div>
    </>
  );
}

function IncidentsPage({ incidents, onInvestigate, onUpdate, onCreateScenario, busyInvestigation, busyScenario }) {
  const openCount = incidents.filter((item) => ['OPEN', 'INVESTIGATING'].includes(item.status)).length;
  return (
    <>
      <PageTitle eyebrow="EXCEPTION MANAGEMENT" title="Incidents" subtitle="Investigate payment inconsistencies and track safe recovery actions." right={<button className="button button-secondary" onClick={() => onCreateScenario('missing-webhook')} disabled={Boolean(busyScenario)}><Plus size={15} /> Test missing event</button>} />
      <div className="incident-summary-strip"><div><span className="summary-number">{openCount}</span><span>Open or investigating</span></div><div><span className="summary-number">{incidents.filter((item) => item.severity === 'HIGH' || item.severity === 'CRITICAL').length}</span><span>High priority</span></div><div><span className="summary-number">{incidents.filter((item) => item.source === 'LOCAL_SIMULATION').length}</span><span>Local test incidents</span></div></div>
      <div className="incident-grid">
        {incidents.length ? incidents.map((incident) => <IncidentCard key={incident._id} incident={incident} onInvestigate={onInvestigate} onUpdate={onUpdate} busy={busyInvestigation === (incident.orderId || incident.payment?.orderId || incident.payment?.merchantReference)} />) : <div className="panel full-panel"><EmptyState icon={ShieldCheck} title="No incidents detected" body="Create a local scenario or run a Sandbox payment to exercise the investigation workflow." action={<button className="button button-secondary" onClick={() => onCreateScenario('capture-db-gap')}><Zap size={14} /> Create test incident</button>} /></div>}
      </div>
      <div className="info-banner"><ShieldCheck size={17} /><span>AI provides recommendations, not payment authorization. Always confirm the provider's actual order/capture state before fulfilment, refunds or retries.</span></div>
    </>
  );
}

function EventsPage({ events }) {
  return (
    <>
      <PageTitle eyebrow="EVENT-DRIVEN OPERATIONS" title="Event monitor" subtitle="Inspect webhook deliveries, verification state and duplicate event handling." />
      <section className="panel full-panel">
        {!events.length ? <EmptyState icon={Webhook} title="No webhook events yet" body="Register the HTTPS webhook endpoint in your PayPal Sandbox app, or create a local duplicate-webhook fixture from the Overview." /> : <div className="event-list">
          {events.map((event) => <div className="event-row" key={event._id}><div className={`event-icon ${event.verified ? 'verified' : 'unverified'}`}><Webhook size={17} /></div><div className="event-info"><strong>{event.eventType}</strong><span>{shortId(event.eventId)} · {formatDate(event.receivedAt)}</span><small>{event.orderId ? `Order ${shortId(event.orderId)}` : 'No matched order reference'}</small></div><div className="event-meta"><StatusPill status={event.verified ? 'COMPLETED' : 'PENDING'} /><span className="delivery-count">{event.deliveryCount || 1} delivery{(event.deliveryCount || 1) !== 1 ? 's' : ''}</span>{event.duplicateDeliveries > 0 && <span className="duplicate-label">{event.duplicateDeliveries} duplicate</span>}<SourceTag source={event.source} /></div></div>)}
        </div>}
      </section>
      <div className="info-banner"><Info size={17} /><span>Only events with successful PayPal signature verification are labelled verified. Local fixtures are always unverified and clearly marked.</span></div>
    </>
  );
}

function IntegrationsPage({ config, health, onRefresh }) {
  const items = [
    { name: 'PayPal REST API', desc: 'OAuth 2.0, Orders v2 create/capture/retrieve', status: config?.paypalConfigured ? 'CONNECTED' : 'NEEDS SETUP', icon: WalletCards },
    { name: 'PayPal Webhooks', desc: 'Signature verification using the configured webhook ID', status: config?.webhookConfigured ? 'CONNECTED' : 'NEEDS SETUP', icon: Webhook },
    { name: 'Gemini AI', desc: 'Evidence-grounded payment incident analysis', status: config?.geminiConfigured ? 'CONNECTED' : 'RULES FALLBACK', icon: Sparkles },
    { name: 'MongoDB', desc: 'Payments, incidents, webhook events and audit history', status: health?.database === 'connected' ? 'CONNECTED' : 'DISCONNECTED', icon: Database }
  ];
  return (
    <>
      <PageTitle eyebrow="ENVIRONMENT & KEYS" title="Integrations" subtitle="Configure your own Sandbox credentials and inspect service readiness." right={<button className="button button-secondary" onClick={onRefresh}><RefreshCw size={15} /> Check status</button>} />
      <section className="panel full-panel integration-list">
        {items.map((item) => <div className="integration-row" key={item.name}><div className="integration-icon"><item.icon size={19} /></div><div className="integration-info"><strong>{item.name}</strong><span>{item.desc}</span></div><StatusPill status={item.status === 'CONNECTED' ? 'COMPLETED' : item.status === 'RULES FALLBACK' ? 'APPROVED' : 'PENDING'} /></div>)}
      </section>
      <div className="settings-grid">
        <section className="panel setup-card"><div className="eyebrow">PAYPAL SANDBOX SETUP</div><h3>Connect your developer app</h3><ol className="setup-steps"><li><span>1</span><div><strong>Create or open a Sandbox REST app</strong><p>In the PayPal Developer Dashboard, open Apps & Credentials and choose Sandbox.</p><a href="https://developer.paypal.com/dashboard/applications/sandbox" target="_blank" rel="noreferrer">Open PayPal Developer <ExternalLink size={13} /></a></div></li><li><span>2</span><div><strong>Copy the Sandbox credentials</strong><p>Paste Client ID and Secret into <code>server/.env</code>. Do not add the Secret to the React app.</p></div></li><li><span>3</span><div><strong>Create a Sandbox buyer</strong><p>Use Testing Tools → Sandbox Accounts to create a Personal test buyer and sign in to checkout with it.</p><a href="https://developer.paypal.com/dashboard/accounts" target="_blank" rel="noreferrer">Sandbox accounts <ExternalLink size={13} /></a></div></li><li><span>4</span><div><strong>Register the webhook endpoint</strong><p>After deploying to HTTPS, register <code>/api/webhooks/paypal</code> and copy its Webhook ID into <code>PAYPAL_WEBHOOK_ID</code>.</p></div></li></ol></section>
        <section className="panel setup-card"><div className="eyebrow">SERVER CONFIGURATION</div><h3>Environment checklist</h3><div className="env-check"><span>PAYPAL_ENV</span><code>{config?.paypalEnvironment || 'sandbox'}</code><StatusPill status="COMPLETED" /></div><div className="env-check"><span>PAYPAL_CURRENCY</span><code>{config?.currency || 'USD'}</code><StatusPill status="COMPLETED" /></div><div className="env-check"><span>PAYPAL_CLIENT_ID</span><code>{config?.paypalConfigured ? '•••••••• configured' : 'not set'}</code><StatusPill status={config?.paypalConfigured ? 'COMPLETED' : 'PENDING'} /></div><div className="env-check"><span>PAYPAL_WEBHOOK_ID</span><code>{config?.webhookConfigured ? '•••••••• configured' : 'not set'}</code><StatusPill status={config?.webhookConfigured ? 'COMPLETED' : 'PENDING'} /></div><div className="env-check"><span>GEMINI_API_KEY</span><code>{config?.geminiConfigured ? '•••••••• configured' : 'rules fallback'}</code><StatusPill status={config?.geminiConfigured ? 'COMPLETED' : 'APPROVED'} /></div><div className="security-callout"><LockKeyhole size={16} /><p>Secrets stay on the server. This hackathon starter is a single-merchant prototype; add real user authentication and authorization before any public production use.</p></div></section>
      </div>
    </>
  );
}

function PaymentDrawer({ payment, onClose, onReconcile, onInvestigate, onRefresh, busyReconcile, busyInvestigation, analysis }) {
  if (!payment) return null;
  const lookup = payment.orderId || payment.merchantReference;
  const isLocal = payment.source === 'LOCAL_SIMULATION';
  return (
    <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="detail-drawer">
        <div className="drawer-header"><div><div className="eyebrow">TRANSACTION DETAIL</div><h2>Payment record</h2></div><button className="icon-button" onClick={onClose} aria-label="Close details"><X size={18} /></button></div>
        <div className="drawer-amount"><span>{formatMoney(payment.amount, payment.currency)}</span><StatusPill status={payment.status} /></div>
        <SourceTag source={payment.source} />
        <div className="detail-list">
          <div><span>Order ID</span><strong>{payment.orderId || 'Not assigned'}</strong></div>
          <div><span>Merchant reference</span><strong>{payment.merchantReference || '—'}</strong></div>
          <div><span>Capture ID</span><strong>{payment.captureId || 'Not captured'}</strong></div>
          <div><span>Provider observation</span><strong>{payment.observedProviderStatus || 'Not separately recorded'}</strong></div>
          <div><span>Currency</span><strong>{payment.currency}</strong></div>
          <div><span>Created</span><strong>{formatDate(payment.createdAt)}</strong></div>
          <div><span>Last synced</span><strong>{formatDate(payment.lastSyncedAt)}</strong></div>
        </div>
        {payment.lastError && <div className="inline-message error">{payment.lastError}</div>}
        {payment.scenarioLabel && <div className="simulation-warning"><Info size={15} /> Local fixture: {payment.scenarioLabel}. Not a PayPal transaction.</div>}
        <div className="drawer-actions">
          {!isLocal && <button className="button button-secondary" onClick={() => onReconcile(lookup)} disabled={busyReconcile}>{busyReconcile ? <LoaderCircle className="spin" size={15} /> : <RefreshCw size={15} />} Reconcile with PayPal</button>}
          <button className="button button-primary" onClick={() => onInvestigate(lookup)} disabled={busyInvestigation}>{busyInvestigation ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />} Investigate with AI</button>
        </div>
        {analysis && <div className="analysis-panel"><div className="analysis-heading"><Sparkles size={16} /> AI investigation <StatusPill status={analysis.riskLevel} /></div><h4>{analysis.summary}</h4><p>{analysis.rootCause}</p><strong>Recommended next steps</strong><ul>{analysis.recommendedActions?.map((item, index) => <li key={index}>{item}</li>)}</ul><small>Provider: {analysis.provider} · Confidence: {Math.round((analysis.confidence || 0) * 100)}%</small></div>}
      </aside>
    </div>
  );
}

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return <div className={`toast ${toast.type || 'success'}`} role="status"><CheckCircle2 size={17} /><span>{toast.message}</span><button onClick={onClose} aria-label="Dismiss notification"><X size={15} /></button></div>;
}

export default function App() {
  const [section, setSection] = useState('overview');
  const [data, setData] = useState(EMPTY_DATA);
  const [payments, setPayments] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [events, setEvents] = useState([]);
  const [config, setConfig] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState('');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [busyScenario, setBusyScenario] = useState('');
  const [busyReconcile, setBusyReconcile] = useState(false);
  const [busyInvestigation, setBusyInvestigation] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4800);
  }, []);

  const refreshData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setApiError('');
    try {
      const [healthResponse, configResponse] = await Promise.all([api.get('/health'), api.get('/config/public')]);
      setHealth(healthResponse.data);
      setConfig(configResponse.data);
      if (healthResponse.data.database === 'connected') {
        const [summaryResponse, paymentResponse, incidentResponse, eventResponse] = await Promise.all([
          api.get('/dashboard/summary'), api.get('/payments?limit=100'), api.get('/dashboard/incidents'), api.get('/dashboard/events')
        ]);
        setData(summaryResponse.data);
        setPayments(paymentResponse.data.items || []);
        setIncidents(incidentResponse.data.items || []);
        setEvents(eventResponse.data.items || []);
      } else {
        setData(EMPTY_DATA);
        setPayments([]);
        setIncidents([]);
        setEvents([]);
      }
    } catch (error) {
      setApiError(getErrorMessage(error));
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshData(); }, [refreshData]);
  useEffect(() => {
    const handler = (event) => { setSection(event.detail); setSidebarOpen(false); };
    window.addEventListener('paypulse:navigate', handler);
    return () => window.removeEventListener('paypulse:navigate', handler);
  }, []);

  const createScenario = async (scenario) => {
    setBusyScenario(scenario);
    try {
      const response = await api.post('/dev/scenarios', { scenario });
      await refreshData(true);
      notify(`${scenario.replaceAll('-', ' ')} fixture created. It is labelled local simulation.`);
      setSection('incidents');
      if (response.data.payment) setSelectedPayment(response.data.payment);
    } catch (error) { notify(getErrorMessage(error), 'error'); }
    finally { setBusyScenario(''); }
  };

  const reconcile = async (orderId) => {
    setBusyReconcile(true);
    try {
      const response = await api.post(`/payments/${encodeURIComponent(orderId)}/reconcile`);
      await refreshData(true);
      if (selectedPayment) setSelectedPayment(response.data.payment);
      notify(response.data.changed ? 'Provider state reconciled; local ledger updated.' : 'Ledger already matches the PayPal provider state.');
    } catch (error) { notify(getErrorMessage(error), 'error'); }
    finally { setBusyReconcile(false); }
  };

  const investigate = async (orderId) => {
    if (!orderId) return notify('No payment reference is available for investigation.', 'error');
    setBusyInvestigation(orderId);
    setAnalysis(null);
    try {
      const response = await api.post(`/payments/${encodeURIComponent(orderId)}/investigate`);
      const paymentResponse = await api.get(`/payments/${encodeURIComponent(orderId)}`).catch(() => null);
      if (paymentResponse?.data?.payment) setSelectedPayment(paymentResponse.data.payment);
      setAnalysis(response.data.analysis);
      notify(`Investigation complete using ${response.data.analysis.provider}.`);
      await refreshData(true);
    } catch (error) { notify(getErrorMessage(error), 'error'); }
    finally { setBusyInvestigation(''); }
  };

  const updateIncident = async (id, status) => {
    try {
      await api.patch(`/dashboard/incidents/${id}`, { status });
      await refreshData(true);
      notify(`Incident marked ${status.toLowerCase()}.`);
    } catch (error) { notify(getErrorMessage(error), 'error'); }
  };

  const selectPayment = (payment) => { setSelectedPayment(payment); setAnalysis(null); };
  const pageTitle = NAV_ITEMS.find((item) => item.id === section)?.label || 'Overview';

  return (
    <div className="app-shell min-h-screen">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><span>p</span><i /></div><div><strong>paypulse<span>AI</span></strong><small>PAYMENT INTELLIGENCE</small></div></div>
        <div className="workspace-switch"><div className="workspace-avatar">D</div><div><strong>Demo workspace</strong><small>Sandbox environment</small></div><ChevronDown size={15} /></div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${section === id ? 'active' : ''}`} onClick={() => { setSection(id); setSidebarOpen(false); }}><Icon size={18} /><span>{label}</span>{id === 'incidents' && incidents.filter((item) => ['OPEN', 'INVESTIGATING'].includes(item.status)).length > 0 && <em>{incidents.filter((item) => ['OPEN', 'INVESTIGATING'].includes(item.status)).length}</em>}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Sparkles size={15} /></div><strong>Built for payment trust</strong><p>Investigate the why behind every payment exception.</p><button onClick={() => setSection('integrations')}>Explore setup <ArrowRight size={13} /></button></div>
          <div className="sidebar-user"><div className="user-avatar">P</div><div><strong>PayPulse operator</strong><small>Local prototype</small></div><MoreHorizontal size={17} /></div>
        </div>
      </aside>

      <main className="main-area min-w-0">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu"><Menu size={20} /></button><div className="breadcrumb">Workspace <ChevronRight size={14} /> <strong>{pageTitle}</strong></div></div><div className="topbar-right"><span className="sandbox-badge"><span /> PAYPAL SANDBOX</span><button className="top-icon" title="Help and docs" onClick={() => setSection('integrations')}><CircleHelp size={18} /></button><button className="top-icon notification-icon" title="Notifications"><Bell size={18} /><i /></button><div className="top-avatar">P</div></div></header>
        <div className="page-content w-full">
          {apiError && <div className="connection-banner error"><AlertTriangle size={17} /><div><strong>API connection issue</strong><span>{apiError}</span></div><button onClick={() => refreshData()}><RefreshCw size={14} /> Retry</button></div>}
          {!apiError && health?.database !== 'connected' && <div className="connection-banner warning"><Database size={17} /><div><strong>MongoDB is not connected</strong><span>Start Docker MongoDB or add a valid MONGODB_URI in server/.env. Checkout and ledger storage need the database.</span></div><button onClick={() => setSection('integrations')}>Setup <ArrowRight size={14} /></button></div>}
          {loading && <div className="loading-strip"><LoaderCircle size={15} className="spin" /> Checking service connections…</div>}
          {section === 'overview' && <OverviewPage data={data} config={config} onRefresh={() => refreshData()} onPaymentComplete={() => refreshData(true)} onSelectPayment={selectPayment} onCreateScenario={createScenario} busyScenario={busyScenario} />}
          {section === 'transactions' && <TransactionsPage payments={payments} onSelect={selectPayment} onReconcile={reconcile} reconciling={busyReconcile} />}
          {section === 'incidents' && <IncidentsPage incidents={incidents} onInvestigate={investigate} onUpdate={updateIncident} onCreateScenario={createScenario} busyInvestigation={busyInvestigation} busyScenario={busyScenario} />}
          {section === 'events' && <EventsPage events={events} />}
          {section === 'integrations' && <IntegrationsPage config={config} health={health} onRefresh={() => refreshData()} />}
          <footer className="app-footer"><span>© 2026 PayPulse AI · Hackathon prototype</span><span><ShieldCheck size={13} /> Sandbox-first · AI-assisted · Human-controlled</span></footer>
        </div>
      </main>
      <PaymentDrawer payment={selectedPayment} onClose={() => setSelectedPayment(null)} onReconcile={reconcile} onInvestigate={investigate} busyReconcile={busyReconcile} busyInvestigation={busyInvestigation === (selectedPayment?.orderId || selectedPayment?.merchantReference)} analysis={analysis} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
