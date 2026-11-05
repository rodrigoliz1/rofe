import { DENOM_VALUES } from '../utils/cash';
export function DenominationInput({ value, onChange, label = 'Efectivo del movimiento' }: { value: Record<string, number>; onChange: (value: Record<string, number>) => void; label?: string }) {
  const total = Object.entries(value).reduce((sum, [key, count]) => sum + (DENOM_VALUES[key] ?? 0) * count, 0);
  return <details className="denomination-input"><summary>{label} · ${total.toFixed(2)}</summary><p>Desglosa los billetes y monedas que entran o salen de la caja.</p><div className="denom-grid">{Object.entries(DENOM_VALUES).map(([key, amount]) => <label className="denom-item" key={key}>{key.startsWith('bill') ? 'Billete' : 'Moneda'} ${amount}<input aria-label={`${label}: ${key.startsWith('bill') ? 'billete' : 'moneda'} de ${amount}`} type="number" min="0" max="10000" step="1" value={value[key] || 0} onChange={(event) => onChange({ ...value, [key]: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} /></label>)}</div></details>;
}
