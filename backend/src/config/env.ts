import 'dotenv/config';
import { z } from 'zod';

const booleanFromString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(30).max(10000).default(180),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  DB_FILE_PATH: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().min(20).optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  AUTH_BOOTSTRAP_ADMIN_EMAIL: z.string().email().default('admin@rofe.local'),
  AUTH_BOOTSTRAP_ADMIN_HASH: z.string().min(20).optional(),
  AUTH_BOOTSTRAP_BARISTA_EMAIL: z.string().email().default('barista@rofe.local'),
  AUTH_BOOTSTRAP_BARISTA_HASH: z.string().min(20).optional(),
  DEVICE_ENROLLMENT_SECRET: z.string().min(16).optional(),
  MERCADO_PAGO_ACCESS_TOKEN: z.string().min(20).optional(),
  MERCADO_PAGO_WEBHOOK_SECRET: z.string().min(16).optional(),
  POINT_DEVICE_ID: z.string().min(3).optional(),
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(test|live)_/).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_').optional(),
  PUBLIC_ORDERING_URL: z.string().url().optional(),
  PICKUP_ENABLED: booleanFromString.optional(),
  PICKUP_LOCATION_NAME: z.string().trim().min(2).max(120).optional(),
  PICKUP_LOCATION_ADDRESS: z.string().trim().max(240).optional(),
  ENABLE_PAYMENT_SIMULATION: booleanFromString,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(3).default(1),
  // Serverless SSE: close streams before the function limit and poll the database for changes.
  SSE_MAX_DURATION_MS: z.coerce.number().int().min(0).max(3_600_000).default(0),
  REALTIME_POLL_MS: z.coerce.number().int().min(0).max(60_000).default(0),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | undefined;

export function getEnv(): AppEnv {
  if (cachedEnv) return cachedEnv;

  const parsed = envSchema.safeParse(withVercelDefaults(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ''))));
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Configuración de entorno inválida: ${details}`);
  }

  const env = parsed.data;
  if (env.PUBLIC_ORDERING_URL) {
    const url = new URL(env.PUBLIC_ORDERING_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (env.NODE_ENV === 'production' && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('PUBLIC_ORDERING_URL debe ser el origen público del frontend, sin ruta; producción requiere HTTPS.');
    }
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) throw new Error('Los secretos de acceso y renovación deben ser diferentes.');
  if (env.NODE_ENV === 'production') {
    const missing: string[] = [];
    if (env.ALLOWED_ORIGINS.split(',').some((value) => { try { const url = new URL(value.trim()); return url.protocol !== 'https:' || url.origin !== value.trim(); } catch { return true; } })) missing.push('ALLOWED_ORIGINS debe contener orígenes HTTPS explícitos');
    if (!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY)) missing.push('SUPABASE_URL + SUPABASE_SERVICE_KEY');
    if (!env.AUTH_BOOTSTRAP_ADMIN_HASH) missing.push('AUTH_BOOTSTRAP_ADMIN_HASH');
    if (!env.DEVICE_ENROLLMENT_SECRET) missing.push('DEVICE_ENROLLMENT_SECRET');
    if (!env.MERCADO_PAGO_ACCESS_TOKEN) missing.push('MERCADO_PAGO_ACCESS_TOKEN');
    if (!env.MERCADO_PAGO_WEBHOOK_SECRET) missing.push('MERCADO_PAGO_WEBHOOK_SECRET');
    if (!env.POINT_DEVICE_ID) missing.push('POINT_DEVICE_ID');
    if (env.ENABLE_PAYMENT_SIMULATION) missing.push('ENABLE_PAYMENT_SIMULATION debe ser false');
    if (missing.length > 0) throw new Error(`Configuración de producción incompleta: ${missing.join(', ')}`);
  }

  cachedEnv = env;
  return env;
}

/** Vercel serves frontend and API from the same domain; trust its own HTTPS domains automatically. */
function withVercelDefaults(source: Record<string, string | undefined>): Record<string, string | undefined> {
  if (!source.VERCEL) return source;
  const vercelOrigins = [source.VERCEL_PROJECT_PRODUCTION_URL, source.VERCEL_BRANCH_URL, source.VERCEL_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);
  const origins = [...(source.ALLOWED_ORIGINS ?? '').split(','), ...vercelOrigins].map((value) => value.trim()).filter(Boolean);
  return {
    ...source,
    ALLOWED_ORIGINS: [...new Set(origins)].join(','),
    SSE_MAX_DURATION_MS: source.SSE_MAX_DURATION_MS ?? '270000',
    REALTIME_POLL_MS: source.REALTIME_POLL_MS ?? '3000',
  };
}

export function resetEnvForTests(): void {
  cachedEnv = undefined;
}
