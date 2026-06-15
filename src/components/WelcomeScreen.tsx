import React from 'react';

interface WelcomeScreenProps {
  onStart: () => void;
  onAdminClick?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart, onAdminClick }) => {
  return (
    <div className="welcome-screen" onClick={onStart}>
      {onAdminClick && (
        <button
          className="admin-toggle-btn"
          onClick={(e) => {
            e.stopPropagation();
            onAdminClick();
          }}
          title="Panel Barista"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      <div className="welcome-content">
        <h1 className="brand-logo">ROFE<span className="accent-dot">.</span></h1>
        <p className="brand-subtitle">ESPRESSO BAR</p>

        <div className="pulse-container">
          <div className="pulse-ring"></div>
          <div className="pulse-ring-inner"></div>
          <span className="pulse-text">ORDENAR AQUÍ</span>
        </div>

        <p className="welcome-footer">TOCA LA PANTALLA PARA EMPEZAR</p>
      </div>
    </div>
  );
};
