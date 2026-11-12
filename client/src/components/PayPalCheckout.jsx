import { useEffect, useRef, useState } from 'react';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { CheckCircle2, CircleDollarSign, ExternalLink, RefreshCcw, ShieldCheck } from 'lucide-react';
import api, { getErrorMessage } from '../lib/api';

export default function PayPalCheckout({ config, onPaymentComplete, prefill }) {
  const [amount, setAmount] = useState('5.00');
  const [description, setDescription] = useState('PayPulse sandbox test payment');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('info');
  const [busy, setBusy] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);

  const amountRef = useRef(5);
  const descRef = useRef('PayPulse sandbox test payment');

  const safeAmount = Number(amount);
  const validAmount = Number.isFinite(safeAmount) && safeAmount >= 0.01 && safeAmount <= 5000;

  useEffect(() => {
    amountRef.current = safeAmount;
    descRef.current = description;
  }, [safeAmount, description]);

  useEffect(() => {
    if (prefill?.amount) {
      const clamped = Math.min(5000, Math.max(0.01, Number(prefill.amount)));
      if (Number.isFinite(clamped)) setAmount(clamped.toFixed(2));
    }
    if (prefill?.description) {
      setDescription(String(prefill.description).slice(0, 120));
    }
  }, [prefill]);

  // Support return from redirect-based PayPal approval (?paypal=approved&token=ORDER_ID)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paypalState = params.get('paypal');
    const token = params.get('token');
    if (paypalState === 'approved' && token) {
      setActiveOrder({ id: token, status: 'APPROVED' });
      setMessage(`Order ${token} approved in PayPal. Click "Verify & Capture" to complete settlement.`);
      setMessageType('info');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (paypalState === 'cancelled') {
      setMessage('PayPal approval was cancelled before authorization.');
      setMessageType('info');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  async function captureOrderId(orderId) {
    if (!orderId) return;
    setBusy(true);
    setMessage('Verifying approval and capturing payment with PayPal…');
    setMessageType('info');
    try {
      const response = await api.post(`/payments/${encodeURIComponent(orderId)}/capture`);
      const nextStatus = response.data?.status || 'UNKNOWN';
      if (nextStatus === 'COMPLETED') {
        setActiveOrder((prev) => ({
          ...prev,
          id: orderId,
          status: 'COMPLETED',
          captureId: response.data.captureId || prev?.captureId,
          payerEmail: response.data.payerEmail || prev?.payerEmail
        }));
        setMessage(`Payment completed & verified by PayPal Sandbox${response.data.captureId ? ` · Capture ${response.data.captureId}` : ''}.`);
        setMessageType('success');
        onPaymentComplete?.();
      } else {
        setActiveOrder((prev) => ({ ...prev, id: orderId, status: nextStatus }));
        setMessage(`PayPal returned status: ${nextStatus}`);
        setMessageType('info');
      }
    } catch (error) {
      const approveUrl = error?.response?.data?.approveUrl;
      if (approveUrl) {
        setActiveOrder((prev) => ({ ...prev, id: orderId, approveUrl }));
      }
      setMessage(getErrorMessage(error));
      setMessageType('error');
    } finally {
      setBusy(false);
    }
  }

  async function reconcileActive() {
    if (!activeOrder?.id) return;
    setBusy(true);
    setMessage('Checking live order state with PayPal Sandbox…');
    setMessageType('info');
    try {
      const response = await api.post(`/payments/${encodeURIComponent(activeOrder.id)}/reconcile`);
      const p = response.data?.payment;
      setActiveOrder((prev) => ({
        ...prev,
        status: p?.status || prev?.status,
        captureId: p?.captureId,
        payerEmail: p?.payerEmail,
        approveUrl: response.data?.approveUrl || prev?.approveUrl
      }));
      if (response.data?.canCapture) {
        setMessage('PayPal confirms buyer approval! Capturing order automatically…');
        await captureOrderId(activeOrder.id);
        return;
      }
      setMessage(`Live PayPal order status: ${response.data?.rawProviderStatus || p?.status || 'CREATED'}.`);
      setMessageType(p?.status === 'COMPLETED' ? 'success' : 'info');
      onPaymentComplete?.();
    } catch (error) {
      setMessage(getErrorMessage(error));
      setMessageType('error');
    } finally {
      setBusy(false);
    }
  }

  if (!config?.paypalConfigured || !config?.paypalClientId) {
    return (
      <section className="panel checkout-panel">
        <div className="panel-heading">
          <div>
            <div className="eyebrow">SANDBOX CHECKOUT</div>
            <h3>Run a real test payment</h3>
          </div>
          <span className="icon-orb blue"><CircleDollarSign size={19} /></span>
        </div>
        <div className="setup-placeholder">
          <div className="setup-illustration"><ShieldCheck size={27} /></div>
          <h4>Connect your PayPal Sandbox app</h4>
          <p>Add your Sandbox Client ID and Secret to <code>server/.env</code>. The checkout button will appear here automatically.</p>
          <div className="setup-line"><span className="setup-dot" /> Waiting for Sandbox credentials</div>
        </div>
        <div className="secure-note"><ShieldCheck size={15} /> Sandbox only · No real money moves</div>
      </section>
    );
  }

  return (
    <section className="panel checkout-panel">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">SANDBOX CHECKOUT</div>
          <h3>Test a payment</h3>
        </div>
        <span className="icon-orb blue"><CircleDollarSign size={19} /></span>
      </div>
      <label className="field-label" htmlFor="payment-amount">Amount · {config.currency}</label>
      <div className="amount-field">
        <span>{config.currency === 'USD' ? '$' : config.currency}</span>
        <input id="payment-amount" type="number" min="0.01" max="5000" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
      </div>
      <label className="field-label" htmlFor="payment-description">Description</label>
      <input className="text-field" id="payment-description" value={description} maxLength={120} onChange={(event) => setDescription(event.target.value)} />

      {activeOrder && (
        <div className="pp-checkout-steps">
          <div className={`pp-step ${activeOrder.id ? 'done' : ''}`}>1. Created</div>
          <div className={`pp-step ${['APPROVED', 'COMPLETED'].includes(activeOrder.status) ? 'done' : ''}`}>2. Approved</div>
          <div className={`pp-step ${activeOrder.status === 'COMPLETED' ? 'done' : ''}`}>3. Captured</div>
        </div>
      )}

      {message && <div className={`inline-message ${messageType}`}>{message}</div>}

      <div className="paypal-button-wrap">
        {validAmount ? (
          <PayPalScriptProvider options={{ clientId: config.paypalClientId, currency: config.currency, intent: 'capture', components: 'buttons' }}>
            <PayPalButtons
              disabled={busy}
              forceReRender={[safeAmount, config.currency]}
              style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', height: 42 }}
              createOrder={async () => {
                setBusy(true);
                setMessage('Creating a Sandbox order…');
                setMessageType('info');
                try {
                  const response = await api.post('/payments/orders', {
                    amount: amountRef.current,
                    currency: config.currency,
                    description: descRef.current
                  });
                  if (!response.data?.id || typeof response.data.id !== 'string') {
                    throw new Error('Server did not return a valid PayPal order ID.');
                  }
                  setActiveOrder({
                    id: response.data.id,
                    status: response.data.status || 'CREATED',
                    approveUrl: response.data.approveUrl || null
                  });
                  setMessage('Order created. Approve it in the PayPal Sandbox window.');
                  return response.data.id;
                } catch (error) {
                  setMessage(getErrorMessage(error));
                  setMessageType('error');
                  setBusy(false);
                  throw error;
                }
              }}
              onApprove={async (data) => {
                setActiveOrder((prev) => ({ ...prev, id: data.orderID, status: 'APPROVED' }));
                await captureOrderId(data.orderID);
              }}
              onCancel={() => {
                setMessage('Checkout cancelled. No capture was requested.');
                setMessageType('info');
                setBusy(false);
              }}
              onError={(error) => {
                console.error('PayPal checkout error:', error);
                setMessage(`PayPal popup could not complete (${String(error?.message || error || 'SDK error').slice(0, 140)}). You can use the Sandbox approval link below if popups are blocked.`);
                setMessageType('error');
                setBusy(false);
              }}
            />
          </PayPalScriptProvider>
        ) : (
          <div className="inline-message error">Enter an amount between 0.01 and 5,000.00.</div>
        )}
      </div>

      {activeOrder && activeOrder.status !== 'COMPLETED' && (
        <div className="pp-actions" style={{ marginTop: 10 }}>
          {activeOrder.approveUrl && (
            <a className="pp-btn" href={activeOrder.approveUrl} target="_blank" rel="noopener noreferrer">
              Open PayPal Approval <ExternalLink size={14} />
            </a>
          )}
          <button type="button" className="pp-btn" disabled={busy} onClick={reconcileActive}>
            <RefreshCcw size={14} /> Check Status
          </button>
          <button type="button" className="pp-btn pp-btn-solid" disabled={busy} onClick={() => captureOrderId(activeOrder.id)}>
            <CheckCircle2 size={14} /> Verify &amp; Capture
          </button>
        </div>
      )}

      {activeOrder?.status === 'COMPLETED' && (
        <div className="pp-op-note" style={{ marginTop: 12 }}>
          <CheckCircle2 size={17} />
          <span>
            Order <b>{activeOrder.id}</b> captured{activeOrder.captureId ? ` (${activeOrder.captureId})` : ''}
            {activeOrder.payerEmail ? ` · Buyer: ${activeOrder.payerEmail}` : ''}
          </span>
        </div>
      )}

      <div className="secure-note"><ShieldCheck size={15} /> PayPal-hosted approval · Server-side capture</div>
    </section>
  );
}
