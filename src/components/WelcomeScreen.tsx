import { UiIcon } from './UiIcon';
interface WelcomeScreenProps { onStart: () => void; onAdminClick?: () => void }
export function WelcomeScreen({ onStart, onAdminClick }: WelcomeScreenProps) {
  return <div className="welcome-screen">
    <header className="welcome-topline"><span>CAFÉ, A TU RITMO.</span>{onAdminClick && <button className="toolbar-action" title="Panel Barista" onClick={onAdminClick}><UiIcon name="users" />Acceso de equipo</button>}</header>
    <div className="welcome-content"><h1 className="brand-logo">ROFÉ<span className="accent-dot">.</span></h1><p className="brand-subtitle">ESPRESSO BAR</p><p className="welcome-description">Un buen café.<br />Un momento para ti.</p><button className="welcome-start" onClick={onStart}><span>ORDENAR AQUÍ</span><UiIcon name="arrow" size={24} /></button><p className="welcome-footer">Elige, personaliza y disfruta.</p></div>
    <footer className="welcome-bottomline"><span>HECHO AL MOMENTO</span><span>Efectivo · Tarjeta · Point</span></footer>
  </div>;
}
