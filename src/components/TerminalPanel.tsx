import { useEffect, useState } from 'react';
import { apiJson } from '../services/api';
import { UiIcon } from './UiIcon';
interface TerminalConfiguration { configured: boolean; webhookConfigured: boolean; simulation: boolean; terminalId: string | null }
export function TerminalPanel() {
  const [config, setConfig] = useState<TerminalConfiguration | null>(null);
  const [verification, setVerification] = useState<{ operatingMode: string; verifiedAt: string } | null>(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  useEffect(() => { let active = true; void apiJson<TerminalConfiguration>('/api/admin/terminal').then((result) => { if (active) setConfig(result); }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'No pudimos cargar la terminal.'); }); return () => { active = false; }; }, []);
  const check = async () => {
    setChecking(true); setError(''); setVerification(null);
    try { setVerification(await apiJson('/api/admin/terminal/check', { method: 'POST' })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No pudimos verificar la conexión.'); }
    finally { setChecking(false); }
  };
  return <section className="terminal-panel">
    <div className="terminal-summary"><UiIcon name="terminal" size={48} /><div><h3>Mercado Pago Point</h3><p>{config ? config.terminalId ?? 'Sin terminal vinculada' : 'Cargando configuración…'}</p></div></div>
    {config && <><dl className="terminal-facts"><div><dt>Credenciales y terminal</dt><dd>{config.configured ? 'Configuradas' : 'Pendientes de configurar'}</dd></div><div><dt>Firma de notificaciones</dt><dd>{config.webhookConfigured ? 'Configurada' : 'Pendiente de configurar'}</dd></div><div><dt>Entorno de cobro</dt><dd>{config.simulation ? 'Simulación habilitada' : 'Sin simulación'}</dd></div><div><dt>Verificación con Mercado Pago</dt><dd>{verification ? `Verificada · ${verification.operatingMode}` : 'Aún no verificada'}</dd></div></dl>
      <p className="terminal-help">Comprueba que Mercado Pago reconoce la terminal y que está en modo PDV o SELF_SERVICE. Esta verificación no realiza ningún cobro.</p>
      <button className="btn btn-primary" disabled={checking || !config.configured} onClick={() => void check()}><UiIcon name="refresh" />{checking ? 'Verificando…' : 'Verificar conexión'}</button>
      {verification && <p className="inline-feedback success" role="status">Mercado Pago reconoce esta terminal. Verificado a las {new Date(verification.verifiedAt).toLocaleTimeString('es-MX')}. Confirma que la terminal física tenga internet antes del primer cobro.</p>}
      {!config.configured && <p className="terminal-help">El administrador debe configurar las credenciales y el identificador de Point en el servidor. El pago en efectivo sigue disponible.</p>}
    </>}
    {error && <p className="inline-feedback error" role="alert">{error}</p>}
  </section>;
}
