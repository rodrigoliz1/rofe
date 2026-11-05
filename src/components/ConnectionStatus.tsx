import { useState } from 'react';
interface ConnectionStatusProps { online: boolean; realtime: boolean; pending: number; error?: string; onRetry: () => void }
export function ConnectionStatus({ online, realtime, pending, error, onRetry }: ConnectionStatusProps) {
  const [expanded, setExpanded] = useState(false);
  const label = !online ? 'Sin internet' : pending > 0 ? `${pending} por sincronizar` : realtime ? 'En línea' : 'Reconectando';
  const state = !online ? 'offline' : pending > 0 ? 'pending' : realtime ? 'online' : 'reconnecting';
  return <div className="connection-control"><button className={`connection-status ${state}`} onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="connection-details"><span aria-hidden="true" />{label}</button>
    {expanded && <section className="connection-details" id="connection-details" aria-label="Estado de conexión"><h2>Conexión de ROFÉ</h2><p role="status">{!online ? 'Sin internet. Los pedidos en efectivo se guardan en este dispositivo.' : realtime ? 'Pedidos actualizados en tiempo real.' : 'Intentando restablecer las actualizaciones en tiempo real.'}</p><p>{pending === 1 ? 'Un pedido pendiente de envío.' : `${pending} pedidos pendientes de envío.`}</p>{error && <p className="inline-error" role="alert">{error}</p>}{pending > 0 && <button className="btn btn-secondary" onClick={onRetry} disabled={!online}>Reintentar sincronización</button>}<button className="btn btn-ghost" onClick={() => setExpanded(false)}>Cerrar</button></section>}
  </div>;
}
