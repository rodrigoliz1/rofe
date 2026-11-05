import { useEffect, useState } from 'react';
import { apiUrl } from '../services/api';

/**
 * `navigator.onLine` only knows about the network interface: a tablet on Wi-Fi without
 * Internet still reports online. This probes the API health endpoint and treats two
 * consecutive failures as "sin conexión", then retries quickly until it recovers.
 */
export function useReachability({ onlineIntervalMs = 20_000, offlineIntervalMs = 4_000 } = {}): boolean {
  const [reachable, setReachable] = useState(navigator.onLine);
  useEffect(() => {
    let active = true;
    let failures = 0;
    let timer: number | undefined;
    let current = navigator.onLine;
    const set = (value: boolean) => { current = value; if (active) setReachable(value); };
    const probe = async () => {
      window.clearTimeout(timer);
      let ok = false;
      if (navigator.onLine) {
        try { ok = (await fetch(apiUrl('/health'), { cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(6_000) })).ok; }
        catch { ok = false; }
      }
      if (!active) return;
      failures = ok ? 0 : failures + 1;
      if (ok) set(true);
      else if (!navigator.onLine || failures >= 2) set(false);
      timer = window.setTimeout(() => void probe(), current ? onlineIntervalMs : offlineIntervalMs);
    };
    const wentOffline = () => { failures = 2; set(false); void probe(); };
    const wentOnline = () => { void probe(); };
    window.addEventListener('offline', wentOffline);
    window.addEventListener('online', wentOnline);
    void probe();
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener('offline', wentOffline); window.removeEventListener('online', wentOnline); };
  }, [onlineIntervalMs, offlineIntervalMs]);
  return reachable;
}
