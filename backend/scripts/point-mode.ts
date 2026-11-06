import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../src/config/env';
import { MercadoPagoService } from '../src/payments/mercadoPago';

async function main() {
  const { values } = parseArgs({ options: { mode: { type: 'string' }, apply: { type: 'boolean', default: false }, 'expected-mode': { type: 'string' }, 'terminal-id': { type: 'string' } } });
  const env = getEnv();
  const service = new MercadoPagoService(env);
  if (!values.apply) {
    console.log(JSON.stringify({ ...(await service.checkTerminal()), action: 'READ_ONLY', instruction: 'Para cambiar usa --apply --mode PDV|SELF_SERVICE --expected-mode MODO_ACTUAL --terminal-id ID_CONFIGURADO. No se crean cobros.' }));
    return;
  }
  const mode = values.mode;
  const expected = values['expected-mode'];
  if ((mode !== 'PDV' && mode !== 'SELF_SERVICE') || (expected !== 'PDV' && expected !== 'SELF_SERVICE')) throw new Error('Se requieren --mode y --expected-mode válidos.');
  if (!env.POINT_DEVICE_ID || values['terminal-id'] !== env.POINT_DEVICE_ID) throw new Error('--terminal-id debe coincidir exactamente con POINT_DEVICE_ID.');
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('Falta acceso de lectura a ROFÉ para comprobar cobros Point pendientes.');
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db.from('orders').select('id').eq('status', 'PENDING_PAYMENT').eq('payment_method', 'card').or('payment_provider.eq.MERCADO_PAGO,payment_provider.is.null').limit(1);
  if (error) throw new Error('No se pudo verificar si hay cobros Point pendientes. No se cambió el modo.');
  if (data?.length) throw new Error('Hay un cobro Point pendiente. Finalízalo por su flujo normal antes de cambiar el modo.');
  const result = await service.setTerminalMode(mode, expected);
  console.log(JSON.stringify({ ...result, rebootRequired: result.changed, chargesCreated: 0, credentialChanges: 0 }));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'No se confirmó la operación. Consulta el modo actual antes de reintentar.'); process.exitCode = 1; });
