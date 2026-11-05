import { useEffect, useState } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useBackHandler } from './backStack';

interface Action { label: string; onClick: () => void }
interface KioskDialogProps {
  title: string;
  description: string;
  /** The safe, expected choice: large and focused first. */
  primary: Action;
  secondary: Action;
  /** Optional countdown; when it reaches zero `onTimeout` runs. */
  countdownSeconds?: number;
  onTimeout?: () => void;
}

export function KioskDialog({ title, description, primary, secondary, countdownSeconds, onTimeout }: KioskDialogProps) {
  const ref = useDialogFocus(primary.onClick);
  const [remaining, setRemaining] = useState(countdownSeconds);
  // Back behaves like the safe choice.
  useBackHandler(true, () => { primary.onClick(); return true; });
  useEffect(() => {
    if (!countdownSeconds) return;
    const deadline = Date.now() + countdownSeconds * 1000;
    const timer = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    return () => window.clearInterval(timer);
  }, [countdownSeconds]);
  useEffect(() => { if (remaining === 0) onTimeout?.(); }, [remaining, onTimeout]);
  return <div className="kiosk-overlay">
    <div ref={ref} className="kiosk-overlay-card kiosk-dialog" role="alertdialog" aria-modal="true" aria-labelledby="kiosk-dialog-title" aria-describedby="kiosk-dialog-text" tabIndex={-1}>
      <h2 id="kiosk-dialog-title">{title}</h2>
      <p id="kiosk-dialog-text">{description}</p>
      {remaining !== undefined && <p className="kiosk-dialog-countdown" aria-live="off">{remaining} s</p>}
      <div className="kiosk-dialog-actions">
        <button type="button" className="kiosk-primary" onClick={primary.onClick}>{primary.label}</button>
        <button type="button" className="kiosk-secondary" onClick={secondary.onClick}>{secondary.label}</button>
      </div>
    </div>
  </div>;
}
