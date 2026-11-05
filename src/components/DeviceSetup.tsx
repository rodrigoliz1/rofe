import { useState, type FormEvent } from 'react';
import { loginDevice, registerDevice } from '../services/api';
import { saveDeviceCredentials } from '../services/offline';

interface DeviceSetupProps {
  onReady: () => void;
  onStaffAccess: () => void;
}

export function DeviceSetup({ onReady, onStaffAccess }: DeviceSetupProps) {
  const [name, setName] = useState('iPad POS');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const credentials = await registerDevice(name, secret);
      await saveDeviceCredentials({ ...credentials, name });
      await loginDevice(credentials.deviceId, credentials.deviceToken);
      onReady();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos autorizar esta terminal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="device-setup" id="main-content">
      <section className="device-setup-panel" aria-labelledby="device-title">
        <div className="setup-brand">ROFÉ.</div>
        <h1 id="device-title">Autoriza esta terminal</h1>
        <p>ROFE vinculará cada venta con este dispositivo. Solicita al administrador la clave de registro.</p>
        <form onSubmit={submit}>
          <div className="device-setup-field">
            <label htmlFor="device-name">Nombre de la terminal</label>
            <input id="device-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
          </div>
          <div className="device-setup-field">
            <label htmlFor="device-secret">Clave de registro</label>
            <input id="device-secret" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} required minLength={16} autoComplete="one-time-code" />
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Autorizando…' : 'Autorizar terminal'}</button>
        </form>
        <button className="setup-staff-access" type="button" onClick={onStaffAccess}>Entrar con una cuenta de equipo</button>
      </section>
    </main>
  );
}
