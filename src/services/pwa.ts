export type PwaState = { status: 'development' | 'insecure' | 'unsupported' | 'registering' | 'ready' | 'error'; scope?: string; message?: string };
let state: PwaState = { status: 'development' };
const listeners = new Set<(value: PwaState) => void>();
function update(value: PwaState) { state = value; for (const listener of listeners) listener(value); }
export function pwaState(): PwaState { return state; }
export function subscribePwa(listener: (value: PwaState) => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function registerPwa(): void {
  if (!window.isSecureContext) { update({ status: 'insecure' }); return; }
  if (!('serviceWorker' in navigator)) { update({ status: 'unsupported' }); return; }
  if (!import.meta.env.PROD) { update({ status: 'development' }); return; }
  const register = async () => {
    update({ status: 'registering' });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('El service worker no se activó en 60 segundos. Revisa los recursos de la precarga.')), 60_000); }),
      ]);
      update({ status: 'ready', scope: registration.scope });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Error de registro del service worker.';
      update({ status: 'error', message });
      console.error('[ROFÉ PWA] No se pudo registrar el service worker.', message);
    } finally { clearTimeout(timeout); }
  };
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
