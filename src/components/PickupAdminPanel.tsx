import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { apiJson } from '../services/api';
import { UiIcon } from './UiIcon';
import '../styles/pickup-admin.css';

interface PickupConfiguration {
  enabled: boolean; acceptingOrders: boolean; configured: boolean; secretKeyConfigured: boolean; webhookConfigured: boolean;
  publicUrl: string | null; localPreview: boolean; mode: 'test' | 'live'; locationName: string; locationAddress: string; instructions: string;
}
const escapeXml = (value: string) => value.replace(/[<>&"']/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
function download(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function standFontData() {
  const dataUrl = async (path: string) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error('No pudimos cargar las fuentes del letrero. Reintenta la descarga.');
    const blob = new Blob([await response.arrayBuffer()], { type: 'font/ttf' });
    return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = () => reject(new Error('No pudimos preparar la fuente del letrero.')); reader.readAsDataURL(blob); });
  };
  const [display700, display600, body400, licenseDisplay, licenseBody] = await Promise.all([
    dataUrl('/fonts/rofe-font-3.ttf'), dataUrl('/fonts/rofe-font-2.ttf'), dataUrl('/fonts/rofe-font-5.ttf'),
    fetch('/fonts/Bricolage-Grotesque-OFL.txt').then((response) => response.text()), fetch('/fonts/Outfit-OFL.txt').then((response) => response.text()),
  ]);
  return `<metadata>${escapeXml(`Bricolage Grotesque / Outfit · SIL Open Font License\n${licenseDisplay}\n${licenseBody}`)}</metadata><style>@font-face{font-family:'Bricolage Grotesque';font-weight:700;src:url(${display700}) format('truetype')}@font-face{font-family:'Bricolage Grotesque';font-weight:600;src:url(${display600}) format('truetype')}@font-face{font-family:Outfit;font-weight:400;src:url(${body400}) format('truetype')}text{font-family:'Bricolage Grotesque',sans-serif}text[font-size='23'],text[font-size='25'],text[font-size='17'],text[font-size='14']{font-family:Outfit,sans-serif}</style>`;
}

export function PickupAdminPanel() {
  const [config, setConfig] = useState<PickupConfiguration | null>(null);
  const [standId, setStandId] = useState('principal');
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [check, setCheck] = useState<{ accountId: string; chargesEnabled: boolean; country: string } | null>(null);
  useEffect(() => { let active = true; void apiJson<PickupConfiguration>('/api/admin/pickup').then((value) => { if (active) setConfig(value); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No pudimos cargar el canal de pickup.'); }); return () => { active = false; }; }, []);
  const url = new URL(config?.publicUrl ?? '/pedir', window.location.origin); url.searchParams.set('stand', standId || 'principal');
  const orderingUrl = url.toString();
  useEffect(() => {
    let active = true;
    setQr('');
    void QRCode.toString(orderingUrl, { type: 'svg', errorCorrectionLevel: 'M', margin: 4, width: 520, color: { dark: '#111311', light: '#ffffff' } }).then((value) => { if (active) setQr(value); }).catch(() => { if (active) setError('No pudimos generar este QR. Revisa la dirección del menú.'); });
    return () => { active = false; };
  }, [orderingUrl]);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!config || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await apiJson('/api/admin/pickup', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: config.enabled, locationName: config.locationName, locationAddress: config.locationAddress, instructions: config.instructions }) });
      setConfig(await apiJson<PickupConfiguration>('/api/admin/pickup'));
      setMessage('Configuración de pickup guardada.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos guardar la configuración.'); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    setBusy(true); setError(''); setCheck(null);
    try { setCheck(await apiJson('/api/admin/pickup/check', { method: 'POST' })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos verificar Stripe.'); }
    finally { setBusy(false); }
  };
  const poster = async () => {
    if (exporting) return;
    setExporting(true); setError('');
    try {
    const fonts = await standFontData();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="780" height="1100" viewBox="0 0 780 1100"><rect width="780" height="1100" fill="#f4f0e5"/><text x="390" y="112" text-anchor="middle" font-family="Arial,sans-serif" font-size="68" font-weight="700" fill="#111311">ROFÉ.</text><text x="390" y="234" text-anchor="middle" font-family="Arial,sans-serif" font-size="57" font-weight="700" fill="#111311">PIDE TU CAFÉ</text><text x="390" y="300" text-anchor="middle" font-family="Arial,sans-serif" font-size="57" font-weight="700" fill="#111311">AQUÍ</text><text x="390" y="355" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" fill="#444b3f">Escanea. Elige. Paga. Recoge en barra.</text>${qr.replace('<svg ', '<svg x="130" y="390" ')}<text x="390" y="962" text-anchor="middle" font-family="Arial,sans-serif" font-size="25" font-weight="700" fill="#111311">${escapeXml((config?.locationName ?? 'ROFÉ Espresso Bar').slice(0, 42))}</text><text x="390" y="1003" text-anchor="middle" font-family="Arial,sans-serif" font-size="17" fill="#444b3f">Sin registro. Paga con tarjeta desde tu celular.</text><text x="390" y="1054" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#444b3f">${config?.localPreview ? 'VISTA PREVIA LOCAL · Configura el dominio antes de imprimir' : `Stand: ${escapeXml(standId || 'principal')}`}</text></svg>`;
    const branded = svg.replace('<rect width=', `${fonts}<rect width=`).replaceAll('font-family="Arial,sans-serif"', '');
    download(branded, `ROFE-pide-aqui-${standId || 'principal'}.svg`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos preparar el letrero.'); }
    finally { setExporting(false); }
  };
  if (!config) return <section aria-busy={!error}>{error ? <p className="inline-feedback error" role="alert">{error}</p> : <p>Cargando canal de pedidos…</p>}</section>;
  return <div className="pickup-admin">
    <section className="pickup-admin-config"><h3>Pedidos desde el celular</h3><p>El QR abre un menú público. Stripe confirma el pago y el pedido llega a la barra con su folio de pickup.</p>
      <dl className="pickup-admin-facts"><div><dt>Canal</dt><dd>{config.acceptingOrders ? 'Aceptando pedidos' : 'Pedidos pausados'}</dd></div><div><dt>Credencial Stripe</dt><dd>{config.secretKeyConfigured ? 'Configurada' : 'Pendiente'}</dd></div><div><dt>Firma de notificaciones</dt><dd>{config.webhookConfigured ? 'Configurada' : 'Pendiente'}</dd></div><div><dt>Dirección del menú</dt><dd>{config.localPreview ? 'Localhost · vista previa' : 'Dominio público configurado'}</dd></div><div><dt>Entorno de Stripe</dt><dd>{config.mode === 'test' ? 'Pruebas' : 'Cobros reales'}</dd></div></dl>
      <button className="btn btn-secondary" type="button" disabled={busy || !config.secretKeyConfigured} onClick={() => void verify()}><UiIcon name="refresh" />Verificar cuenta Stripe</button>
      {check && <p className="inline-feedback success" role="status">Cuenta {check.accountId} · {check.country} · {check.chargesEnabled ? 'Cargos habilitados en Stripe' : 'Cargos pendientes de habilitación en Stripe'}. La entrega de webhooks se comprueba con un pago de prueba.</p>}
      {!config.configured && <p className="pickup-admin-help">Para activar los pagos, configura <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_WEBHOOK_SECRET</code> y <code>PUBLIC_ORDERING_URL</code> en el servidor. El webhook es <code>/api/webhooks/stripe</code>.</p>}
      <form onSubmit={(event) => void save(event)} className="pickup-admin-form"><label className="pickup-admin-toggle"><input type="checkbox" checked={config.enabled} onChange={(event) => setConfig({ ...config, enabled: event.target.checked })} />Aceptar nuevos pedidos <span>(requiere Stripe configurado)</span></label><label>Nombre del punto de recogida<input required minLength={2} maxLength={120} value={config.locationName} onChange={(event) => setConfig({ ...config, locationName: event.target.value })} /></label><label>Dirección o referencia<input maxLength={240} placeholder="Indica dónde deben recoger los clientes" value={config.locationAddress} onChange={(event) => setConfig({ ...config, locationAddress: event.target.value })} /></label><label>Instrucciones de recogida<textarea required minLength={3} maxLength={500} rows={3} value={config.instructions} onChange={(event) => setConfig({ ...config, instructions: event.target.value })} /></label><button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button></form>
    </section>
    <section className="pickup-qr-tools"><h3>Un QR para cada stand</h3><p>Usa nombres diferentes para identificar desde qué stand llega cada pedido.</p><label htmlFor="pickup-stand">Identificador del stand</label><input id="pickup-stand" value={standId} maxLength={40} onChange={(event) => setStandId(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="entrada-principal" /><a className="pickup-qr-url" href={orderingUrl} target="_blank" rel="noreferrer">Abrir menú · {standId || 'principal'}<UiIcon name="arrow" size={16} /></a>
      <div className="pickup-stand-preview"><span className="pickup-stand-brand">ROFÉ.</span><h4>PIDE TU CAFÉ<br />AQUÍ</h4><p>Escanea. Elige. Paga.<br />Recoge en barra.</p>{qr && <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt={`Código QR para pedir desde el stand ${standId || 'principal'}`} />}<strong>{config.locationName}</strong><small>Sin registro. A tu ritmo.</small></div>
      {config.localPreview && <p className="pickup-admin-help">El QR actual es una vista previa local. Configura un dominio público HTTPS antes de imprimir los stands para clientes.</p>}
      <div className="pickup-qr-downloads"><button className="btn btn-secondary" disabled={!qr} onClick={() => download(qr, `ROFE-qr-${standId || 'principal'}.svg`)}><UiIcon name="qr" />Descargar QR</button><button className="btn btn-primary" disabled={!qr} onClick={poster}><UiIcon name="download" />Descargar letrero</button></div><p className="pickup-admin-help">SVG vectorial, listo para imprimir. El QR dirige siempre al mismo menú actualizado.</p>
    </section>
    {message && <p className="inline-feedback success" role="status">{message}</p>}{error && <p className="inline-feedback error" role="alert">{error}</p>}
  </div>;
}
