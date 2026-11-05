import React, { useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { login } from '../services/api';

interface PasswordPromptModalProps {
  onClose: () => void;
  onSuccess: (mode: 'barista' | 'admin') => void;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const dialogRef = useDialogFocus(onClose);
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const principal = await login(email, password);
      if (principal.role === 'ADMIN' || principal.role === 'MANAGER') onSuccess('admin');
      else if (principal.role === 'BARISTA') onSuccess('barista');
      else setError('Esta cuenta no tiene acceso al panel.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="checkout-backdrop" style={{ zIndex: 200 }}>
      <div ref={dialogRef} className={`checkout-dialog ${error ? 'input-error animate-shake' : ''}`} style={{ width: '380px' }} role="dialog" aria-modal="true" aria-labelledby="access-title">
        <button className="checkout-close-x" onClick={onClose} aria-label="Cerrar acceso de equipo">
          &times;
        </button>

        <div className="checkout-step-content width-100">
          <h3 id="access-title" className="checkout-step-title">Acceso de equipo</h3>
          <p className="checkout-step-text">Ingresa con tu cuenta de administración o barista.</p>

          <form onSubmit={handleSubmit} className="name-form">
            <label className="sr-only" htmlFor="staff-email">Correo</label>
            <input
              id="staff-email"
              type="email"
              className={`name-input ${error ? 'input-error' : ''}`}
              placeholder="correo@rofe.mx"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
            <label className="sr-only" htmlFor="staff-password">Contraseña o PIN</label>
            <input
              id="staff-password"
              type="password"
              className={`name-input ${error ? 'input-error' : ''}`}
              placeholder="Contraseña..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && <p className="error-hint" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}

            <button type="submit" className="confirm-name-btn" style={{ marginTop: '1rem' }} disabled={loading}>
              {loading ? 'Verificando…' : 'Ingresar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
