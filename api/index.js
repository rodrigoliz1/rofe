// Vercel Function: serves the whole Express API (backend/) from the same domain as the PWA.
// `vercel.json` rewrites /api/*, /health and /ready here; Express sees the original URL.
import { deploymentHandler } from './environment-boundary.js';

export default deploymentHandler(async () => (await import('../backend/dist/index.js')).default);
