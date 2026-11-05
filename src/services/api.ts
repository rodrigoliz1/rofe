export type Role = 'ADMIN' | 'MANAGER' | 'BARISTA' | 'POS_DEVICE';
export interface Principal { subjectId: string; sessionId: string; role: Role; deviceId?: string }
interface SessionResponse { accessToken: string; principal: Principal }
let accessToken: string | undefined;
let principal: Principal | undefined;
let refreshPromise: Promise<boolean> | undefined;

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.status = status; this.code = code; }
}
export class ConnectionError extends Error {
  constructor() { super('No pudimos conectar con ROFÉ. Revisa la conexión e intenta de nuevo.'); }
}
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL || window.location.origin;
  return `${base.replace(/\/$/, '')}${path}`;
}
export function getPrincipal(): Principal | undefined { return principal; }
export async function tryRestoreSession(): Promise<Principal | null> {
  return await refreshSession() ? principal! : null;
}

async function transport(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(apiUrl(path), {
      ...init, credentials: 'include', cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(20_000),
    });
  } catch (error) {
    if (init.signal?.aborted) throw error;
    throw new ConnectionError();
  }
}
export async function apiFetch(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await transport(path, { ...init, headers });
  if (response.status === 401 && retry && await refreshSession()) return apiFetch(path, init, false);
  return response;
}
export async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) throw new ApiError(await publicError(response), response.status);
  return response.json() as Promise<T>;
}
export async function login(email: string, password: string): Promise<Principal> {
  return applySession(await requestSession('/api/auth/login', { email, password }));
}
export async function registerDevice(name: string, enrollmentSecret: string): Promise<{ deviceId: string; deviceToken: string }> {
  const response = await transport('/api/auth/device/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, enrollmentSecret }) });
  if (!response.ok) throw new ApiError(await publicError(response), response.status);
  return response.json();
}
export async function loginDevice(deviceId: string, deviceToken: string): Promise<Principal> {
  return applySession(await requestSession('/api/auth/device/login', { deviceId, deviceToken }));
}
export async function logout(): Promise<void> {
  const response = await apiFetch('/api/auth/logout', { method: 'POST' }, false);
  if (!response.ok && response.status !== 401) throw new ApiError(await publicError(response), response.status);
  accessToken = undefined; principal = undefined;
}
export async function publicError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => undefined) as { error?: { code?: string; message?: string } | string; message?: string; requestId?: string } | undefined
    : undefined;
  if (typeof payload?.error === 'string') return payload.error;
  const message = payload?.error?.message || payload?.message || (response.status === 429
    ? 'Hay demasiadas solicitudes. Espera un momento e intenta de nuevo.'
    : response.status >= 500 && !contentType.includes('application/json')
      ? 'El servidor de ROFÉ no respondió. Inicia el backend y vuelve a intentarlo.'
      : 'No pudimos completar la operación. Intenta de nuevo.');
  return payload?.requestId && response.status >= 500 ? `${message} Código de soporte: ${payload.requestId}.` : message;
}
async function requestSession(path: string, body: unknown): Promise<SessionResponse> {
  const response = await transport(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new ApiError(await publicError(response), response.status);
  return response.json();
}
async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = transport('/api/auth/refresh', { method: 'POST' }).then(async (response) => {
      if (!response.ok) { accessToken = undefined; principal = undefined; return false; }
      applySession(await response.json());
      return true;
    }).catch(() => false).finally(() => { refreshPromise = undefined; });
  }
  return refreshPromise;
}
function applySession(session: SessionResponse): Principal {
  accessToken = session.accessToken; principal = session.principal; return principal;
}
