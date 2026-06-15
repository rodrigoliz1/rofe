import React, { useState } from 'react';

interface PasswordPromptModalProps {
  onClose: () => void;
  onSuccess: (mode: 'barista' | 'admin') => void;
}

export const PasswordPromptModal: React.FC<PasswordPromptModalProps> = ({
  onClose,
  onSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'ROFEBARISTA') {
      onSuccess('barista');
    } else if (password === 'ADMIN162004RLC') {
      onSuccess('admin');
    } else {
      setError(true);
      // Reset error shake after 500ms
      setTimeout(() => setError(false), 500);
    }
  };

  return (
    <div className="checkout-backdrop" style={{ zIndex: 200 }}>
      <div className={`checkout-dialog ${error ? 'input-error animate-shake' : ''}`} style={{ width: '380px' }}>
        <button className="checkout-close-x" onClick={onClose}>
          &times;
        </button>

        <div className="checkout-step-content width-100">
          <h3 className="checkout-step-title">ACCESO RESTRINGIDO</h3>
          <p className="checkout-step-text">Ingresa tu contraseña para acceder al panel correspondiente.</p>

          <form onSubmit={handleSubmit} className="name-form">
            <input
              type="password"
              className={`name-input ${error ? 'input-error' : ''}`}
              placeholder="Contraseña..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            {error && <p className="error-hint" style={{ marginTop: '0.5rem' }}>Contraseña incorrecta</p>}

            <button type="submit" className="confirm-name-btn" style={{ marginTop: '1rem' }}>
              INGRESAR
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

