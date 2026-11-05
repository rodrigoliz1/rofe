// Vercel Function: serves the whole Express API (backend/) from the same domain as the PWA.
// `vercel.json` rewrites /api/*, /health and /ready here; Express sees the original URL.
import backend from '../backend/dist/index.js';

export default backend.app;
