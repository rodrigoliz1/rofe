import { getEnv } from '../src/config/env';
import { SupabaseDbAdapter } from '../src/supabaseAdapter';
import { MercadoPagoService } from '../src/payments/mercadoPago';

async function main() {
  // Read-only checks: never creates a charge, migrates, or writes user data.
  process.env.NODE_ENV = 'production';
  const env = getEnv();
  const database = new SupabaseDbAdapter(env.SUPABASE_URL!, env.SUPABASE_SERVICE_KEY!);
  await database.initialize();
  console.log('OK: esquema de producción y acceso a Supabase.');
  const terminal = await new MercadoPagoService(env).checkTerminal();
  console.log(`OK: Mercado Pago reconoce la terminal en modo ${terminal.operatingMode}.`);
  console.log('Pendiente de validación física: cobro mínimo autorizado, webhook HTTPS y conciliación del comprobante.');
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'La verificación de producción falló.');
  process.exitCode = 1;
});
