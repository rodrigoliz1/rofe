import { useEffect, useState } from 'react';
import App from '../App';
import { pwaState, subscribePwa } from '../services/pwa';
import { installKioskGuards } from '../kiosk/guards';
import { handleBack } from '../kiosk/backStack';
import { isNativeShell, postNative, WEB_VERSION } from '../kiosk/nativeBridge';
import { KIOSK_RESET_EVENT, KIOSK_STAFF_EVENT } from '../kiosk/events';
import '../styles/kiosk.css';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function KioskPage() {
  const [status, setStatus] = useState(pwaState);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState('');
  const [native] = useState(isNativeShell);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
  useEffect(() => subscribePwa(setStatus), []);
  useEffect(() => {
    document.title = 'ROFÉ · Terminal de autoservicio';
    const removeGuards = installKioskGuards();
    // The Android shell drives these through evaluateJavascript.
    window.rofeKiosk = {
      back: () => { handleBack(); return true; },
      resetSession: () => window.dispatchEvent(new Event(KIOSK_RESET_EVENT)),
      openStaffAccess: () => window.dispatchEvent(new Event(KIOSK_STAFF_EVENT)),
      webVersion: WEB_VERSION,
    };
    postNative({ type: 'ready', webVersion: WEB_VERSION });
    return () => { removeGuards(); delete window.rofeKiosk; };
  }, []);
  useEffect(() => {
    if (native) return;
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    const display = window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)');
    const modeChanged = () => setInstalled(display.matches);
    window.addEventListener('beforeinstallprompt', beforeInstall); window.addEventListener('appinstalled', complete); display.addEventListener('change', modeChanged);
    return () => { window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', complete); display.removeEventListener('change', modeChanged); };
  }, [native]);
  const install = async () => {
    if (!prompt || installing) return;
    setInstalling(true); setMessage('');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(choice.outcome === 'accepted' ? 'Chrome está completando la instalación.' : 'Instalación cerrada. Puedes volver a abrirla desde el menú de Chrome.');
    } catch { setMessage('Chrome no pudo iniciar la instalación. Revisa la opción Instalar en su menú.'); }
    finally { setPrompt(null); setInstalling(false); }
  };
  return <div className="kiosk-shell" data-kiosk="true" data-native={native}>
    {!installed && !native && <div className="kiosk-install-status" role="status">
      <span>{message || (status.status === 'insecure' ? 'Acceso de desarrollo: instala la terminal desde una dirección HTTPS.' : status.status === 'error' ? 'No pudimos preparar la instalación. Recarga la página y revisa tu conexión.' : status.status === 'development' ? 'Vista de desarrollo. La instalación se valida con el build publicado por HTTPS.' : 'Terminal ROFÉ · En Chrome, abre el menú y elige Instalar ROFÉ.')}</span>
      {prompt && <button type="button" className="btn btn-secondary" disabled={installing} onClick={() => void install()}>{installing ? 'Abriendo instalación…' : 'Instalar ROFÉ'}</button>}
    </div>}
    <App kiosk />
  </div>;
}
