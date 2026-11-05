import type { PaymentOutcome } from '../hooks/usePaymentFeedback';

export function PaymentOutcomeIcon({ outcome }: { outcome: PaymentOutcome }) {
  return <div className={`payment-outcome-icon payment-outcome-icon--${outcome}`} aria-hidden="true">
    <span className="payment-outcome-halo" />
    <span className="payment-outcome-disc"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">{outcome === 'success' ? <path d="m13 24 7 7 15-16" /> : <><path d="M24 13v13" /><path d="M24 34h.01" /></>}</svg></span>
  </div>;
}
