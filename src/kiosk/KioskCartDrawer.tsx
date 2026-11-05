import type { CartItem } from '../types';
import { Cart } from '../components/Cart';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { useBackHandler } from './backStack';

interface KioskCartDrawerProps {
  cart: CartItem[];
  total: number;
  /** Portrait / narrow: bottom sheet. Landscape: right drawer. Same component, same state. */
  stacked: boolean;
  onClose: () => void;
  onRemoveItem: (id: string) => void;
  onUpdateQty: (id: string, quantity: number) => void;
  onCheckout: () => void;
  onCancelOrder: () => void;
}

/**
 * The order as an overlay: it never takes space from the catalog. Modal dialog semantics
 * (aria-modal, focus trap, Escape/Back/X/backdrop close); the catalog behind is inert.
 */
export function KioskCartDrawer({ cart, stacked, onClose, ...cartProps }: KioskCartDrawerProps) {
  const ref = useDialogFocus(onClose);
  useBackHandler(true, () => { onClose(); return true; });
  return <div className="kiosk-drawer-layer" data-variant={stacked ? 'sheet' : 'drawer'}>
    {/* Touch target only; keyboard and screen readers use the X button or Escape. */}
    <div className="kiosk-drawer-backdrop" aria-hidden="true" onClick={onClose} />
    <div ref={ref} className="kiosk-drawer" role="dialog" aria-modal="true" aria-labelledby="kiosk-cart-title" tabIndex={-1}>
      {stacked && <span className="kiosk-drawer-grip" aria-hidden="true" />}
      <Cart cart={cart} titleId="kiosk-cart-title" onClose={onClose} onRemoveItem={cartProps.onRemoveItem} onUpdateQty={cartProps.onUpdateQty} onCheckout={cartProps.onCheckout} onCancelOrder={cartProps.onCancelOrder} />
    </div>
  </div>;
}
