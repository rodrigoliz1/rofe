import { getEnv } from '../src/config/env';
import { StripePickupService } from '../src/payments/stripePickup';

async function main() {
  const env = getEnv();
  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PUBLIC_ORDERING_URL'].filter((key) => !env[key as keyof typeof env]);
  if (missing.length) throw new Error(`Pickup pendiente de configurar: ${missing.join(', ')}.`);
  const service = new StripePickupService(env);
  const account = await service.client!.accounts.retrieve(null);
  console.log(`Stripe reconoce la cuenta ${account.id}; país ${account.country}; entorno ${env.STRIPE_SECRET_KEY!.includes('_live_') ? 'real' : 'de pruebas'}; cargos ${account.charges_enabled ? 'habilitados' : 'pendientes'}.`);
  console.log(`Menú público: ${new URL('/pedir', env.PUBLIC_ORDERING_URL).toString()}`);
  console.log('Esta comprobación sólo realiza lecturas. Confirma el webhook con un pago de prueba antes de colocar los stands.');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'No pudimos verificar Stripe.'); process.exitCode = 1; });
