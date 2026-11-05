import { useEffect, useRef, useState } from 'react';
import successSound from '../assets/audio/exito.mp3';
import failureSound from '../assets/audio/fallido.mp3';

export type PaymentOutcome = 'success' | 'failure';

// Browsers may block audio after returning from an external payment page.
export function usePaymentFeedback(outcome: PaymentOutcome | null, identity: string) {
  const lastPlayed = useRef('');
  const [blockedFor, setBlockedFor] = useState('');
  const key = outcome ? `${identity}:${outcome}` : '';
  const play = async (result: PaymentOutcome) => {
    try {
      const audio = new Audio(result === 'success' ? successSound : failureSound);
      await audio.play();
      setBlockedFor('');
    } catch {
      setBlockedFor(`${identity}:${result}`);
    }
  };

  useEffect(() => {
    if (!outcome || !key) { lastPlayed.current = ''; return; }
    if (lastPlayed.current === key) return;
    lastPlayed.current = key;
    void play(outcome);
    // A new outcome or order is the only reason to play automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, outcome]);

  return { soundBlocked: Boolean(outcome && blockedFor === key), replaySound: () => outcome && void play(outcome) };
}
