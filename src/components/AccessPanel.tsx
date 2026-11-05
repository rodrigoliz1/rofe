import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAsyncAction } from '../hooks/useAsyncAction';
import { apiFetch, publicError } from '../services/api';

interface User { id: string; email: string; role: 'ADMIN' | 'MANAGER' | 'BARISTA'; active: boolean }
interface Device { id: string; name: string; active: boolean; createdAt: string; lastSeenAt?: string; revokedAt?: string }

export function AccessPanel() {
  const actions = useAsyncAction();
  const [users, setUsers] = useState<User[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<User['role']>('BARISTA');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [usersResponse, devicesResponse] = await Promise.all([apiFetch('/api/admin/users'), apiFetch('/api/admin/devices')]);
    if (!usersResponse.ok) throw new Error(await publicError(usersResponse));
    if (!devicesResponse.ok) throw new Error(await publicError(devicesResponse));
    setUsers(await usersResponse.json() as User[]);
    setDevices(await devicesResponse.json() as Device[]);
  }, []);

  useEffect(() => { void load().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'No pudimos cargar accesos.')); }, [load]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setFeedback('');
    const response = await apiFetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, role }) });
    if (!response.ok) return setError(await publicError(response));
    setEmail(''); setPassword(''); setFeedback('Usuario creado.'); await load();
  };

  const toggleUser = async (user: User) => {
    setError(''); setFeedback('');
    const response = await apiFetch(`/api/admin/users/${encodeURIComponent(user.email)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !user.active }) });
    if (!response.ok) return setError(await publicError(response));
    setFeedback(user.active ? 'Usuario desactivado y sesiones revocadas.' : 'Usuario reactivado.'); await load();
  };

  const revokeDevice = async (device: Device) => {
    if (!window.confirm(`¿Revocar ${device.name}? La terminal perderá acceso inmediatamente.`)) return;
    const response = await apiFetch(`/api/admin/devices/${encodeURIComponent(device.id)}/revoke`, { method: 'POST' });
    if (!response.ok) return setError(await publicError(response));
    setFeedback('Terminal revocada.'); await load();
  };

  return (
    <section className="access-panel">
      <header><h3>USUARIOS Y TERMINALES</h3><p>Los cambios revocan sesiones activas y quedan en el registro de auditoría.</p></header>
      {(error || actions.error) && <div className="inline-feedback error" role="alert">{error || actions.error}</div>}
      {feedback && <div className="inline-feedback success" role="status">{feedback}</div>}
      <form className="access-create" onSubmit={(event) => { event.preventDefault(); void actions.run(() => createUser(event)); }}>
        <h4>Crear usuario</h4>
        <label>Correo<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Contraseña temporal<input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>Rol<select value={role} onChange={(event) => setRole(event.target.value as User['role'])}><option value="BARISTA">Barista</option><option value="MANAGER">Manager</option><option value="ADMIN">Administrador</option></select></label>
        <button type="submit" disabled={actions.busy}>Crear acceso</button>
      </form>
      <div className="access-columns">
        <section><h4>Equipo</h4><div className="access-list">{users.map((user) => <article key={user.id}><div><strong>{user.email}</strong><span>{user.role} · {user.active ? 'Activo' : 'Desactivado'}</span></div><button type="button" disabled={actions.busy} onClick={() => void actions.run(() => toggleUser(user))}>{user.active ? 'Desactivar' : 'Reactivar'}</button></article>)}</div></section>
        <section><h4>Terminales POS</h4><div className="access-list">{devices.map((device) => <article key={device.id}><div><strong>{device.name}</strong><span>{device.active ? 'Autorizada' : 'Revocada'} · {device.lastSeenAt ? `Vista ${new Date(device.lastSeenAt).toLocaleString('es-MX')}` : 'Sin actividad'}</span></div>{device.active && <button type="button" disabled={actions.busy} onClick={() => void actions.run(() => revokeDevice(device))}>Revocar</button>}</article>)}</div></section>
      </div>
    </section>
  );
}
