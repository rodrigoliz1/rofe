/** No backend import, authentication bootstrap or remote I/O is allowed in a preview. */
export function isUntrustedDeployment(env) {
  return Boolean(env.VERCEL) && env.VERCEL_ENV !== 'production';
}

export function deploymentHandler(loadBackend, env = process.env) {
  return async (req, res) => {
    if (isUntrustedDeployment(env)) {
      res.status(503).json({ error: { code: 'PREVIEW_BACKEND_DISABLED', message: 'Vista previa de interfaz. El backend está deshabilitado para proteger producción.' } });
      return;
    }
    const backend = await loadBackend();
    return backend.app(req, res);
  };
}
