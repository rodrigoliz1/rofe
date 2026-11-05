import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BaristaView } from './BaristaView';
import { apiFetch, getPrincipal, login, logout, publicError, tryRestoreSession, type Principal } from '../services/api';
import { subscribeToEvents } from '../services/events';
import { enableBaristaAudio } from '../services/baristaAlerts';
import { isNativeShell, postNative, WEB_VERSION } from '../kiosk/nativeBridge';
import { handleBack } from '../kiosk/backStack';
import type { Order, OrderStatus } from '../types';
import '../styles/barista-station.css';
const staffRole = (principal: Principal | null | undefined) => Boolean(principal && ['ADMIN', 'MANAGER', 'BARISTA'].includes(principal.role));
export default function BaristaPage() {
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [restoring, setRestoring] = useState(true); const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState('');
  const [orders, setOrders] = useState<Order[]>([]); const [realtime, setRealtime] = useState(false); const [online, setOnline] = useState(navigator.onLine);
  const [lastSync, setLastSync] = useState(''); const [connectionEpoch, setConnectionEpoch] = useState(0); const [sound, setSound] = useState(false);
  const recovering = useRef(0); const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true; document.title = 'ROFÉ Barista';
    window.rofeKiosk = { back: () => { handleBack(); return true; }, resetSession: () => {}, openStaffAccess: () => {}, webVersion: WEB_VERSION };
    postNative({ type: 'ready', webVersion: WEB_VERSION });
    void tryRestoreSession().then(p => { if (mounted.current && staffRole(p)) setPrincipal(p); }).finally(() => { if (mounted.current) setRestoring(false); });
    return () => { mounted.current = false; delete window.rofeKiosk; };
  }, []);
  const loadOrders = useCallback(async () => {
    const response = await apiFetch('/api/orders');
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || !staffRole(getPrincipal())) { setPrincipal(null); setOrders([]); }
      throw new Error(await publicError(response));
    }
    const result = await response.json() as Order[];
    if (mounted.current) { setOrders(result); setLastSync(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })); setError(''); }
  }, []);
  useEffect(() => {
    if (!principal) return;
    let active = true;
    const refresh = () => { void loadOrders().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'No pudimos recuperar los pedidos.'); }); };
    refresh();
    const stop = subscribeToEvents(raw => {
      const event = raw as { type: string; order?: Order };
      if (event.order && active) { const order = event.order; setOrders(current => current.some(item => item.id === order.id) ? current.map(item => item.id === order.id ? order : item) : [...current, order]); setLastSync(new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })); }
      else if (['order_updated', 'order_paid'].includes(event.type)) refresh();
    }, connected => { if (active) { setRealtime(connected); if (connected) refresh(); } });
    const poll = window.setInterval(() => { if (document.visibilityState === 'visible' && navigator.onLine) refresh(); }, 15_000);
    return () => { active = false; stop(); clearInterval(poll); };
  }, [principal, loadOrders, connectionEpoch]);
  useEffect(() => {
    const recover = () => {
      setOnline(navigator.onLine);
      if (document.visibilityState === 'hidden' || Date.now() - recovering.current < 500) return;
      recovering.current = Date.now(); void enableBaristaAudio().then(setSound); setConnectionEpoch(epoch => epoch + 1);
    };
    const offline = () => { setOnline(false); setRealtime(false); };
    window.addEventListener('online', recover); window.addEventListener('offline', offline); window.addEventListener('rofe:resume', recover); document.addEventListener('visibilitychange', recover);
    return () => { window.removeEventListener('online', recover); window.removeEventListener('offline', offline); window.removeEventListener('rofe:resume', recover); document.removeEventListener('visibilitychange', recover); };
  }, []);
  const signIn = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    void enableBaristaAudio().then(setSound);
    try {
      const user = await login(email, password);
      if (!staffRole(user)) throw new Error('Esta cuenta no tiene acceso a la barra.');
      const access = await apiFetch('/api/barista/session'); if (!access.ok) throw new Error(await publicError(access));
      setPassword(''); setPrincipal(user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos iniciar el turno.'); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true); try { await logout(); setOrders([]); setPrincipal(null); setRealtime(false); } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos cerrar el turno. Recupera la conexión e intenta otra vez.'); } finally { setBusy(false); }
  };
  const update = async (id: string, status: OrderStatus) => {
    const response = await apiFetch(`/api/orders/${encodeURIComponent(id)}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!response.ok) throw new Error(await publicError(response));
    await loadOrders();
  };
  if (restoring) return <main className="barista-station-loading">Abriendo ROFÉ Barista…</main>;
  if (!principal) return <main className="barista-staff-login"><div className="barista-login-intro"><h1>ROFÉ<span>.</span><br />Barista</h1><p>Pedidos claros.<br />Una barra en movimiento.</p></div><form onSubmit={signIn} className="barista-login-form"><h2>Inicia tu turno</h2><p>Usa tu cuenta de personal para abrir la barra.</p><label htmlFor="barista-email">Correo<input id="barista-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label><label htmlFor="barista-password">Contraseña<input id="barista-password" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>{error && <p role="alert" className="inline-feedback error">{error}</p>}<button type="submit" disabled={busy}>{busy ? 'Verificando…' : 'Iniciar turno'}</button><span className="barista-login-footnote">Acceso para personal de barra, gerencia y administración.</span></form></main>;
  return <div className="barista-station"><header className="barista-station-toolbar"><strong>ROFÉ<span>.</span> <span className="barista-station-name">Barista</span></strong><div className="barista-station-tools"><span className={`barista-live-state ${realtime && online ? 'is-live' : ''}`} role="status">{!online ? 'Sin conexión' : realtime ? 'En vivo' : 'Reconectando'}{lastSync && <small>Actualizado {lastSync}</small>}</span><button type="button" aria-pressed={sound} onClick={() => void enableBaristaAudio().then(setSound)}>{sound ? 'Sonido activo' : 'Activar sonido'}</button>{isNativeShell() && <button type="button" onClick={() => postNative({ type: 'admin' })}>Opciones de tablet</button>}<button type="button" disabled={busy} onClick={() => void signOut()}>Cerrar turno</button></div></header>
    {(!online || error) && <div className="barista-station-notice" role="status">{error || 'Sin conexión. Conservamos la cola visible; los cobros y cambios se confirmarán al recuperar la red.'}<button onClick={() => setConnectionEpoch(e => e + 1)}>Reintentar</button></div>}
    <BaristaView dedicated soundReady={sound} orders={orders} onUpdateOrderStatus={update} onClose={() => void signOut()} />
  </div>;
}
