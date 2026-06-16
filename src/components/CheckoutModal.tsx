import React, { useState, useEffect } from 'react';
import type { CartItem, Order } from '../types';

interface CheckoutModalProps {
  total: number;
  cartItems: CartItem[];
  orders: Order[];
  onPaymentSuccess: (orderId: string, customerName: string) => void;
  onClose: () => void;
}

type PaymentStep = 'enter_name' | 'select_payment_method' | 'connecting' | 'waiting_card' | 'processing' | 'success' | 'failed' | 'cash_instructions';

const playSuccessSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    // Play a premium minimalist double chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.5);
    
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, now + 0.12); // E5
    gain2.gain.setValueAtTime(0.12, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.7);
  } catch (e) {
    console.error("Failed to play sound: ", e);
  }
};

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  total,
  cartItems,
  orders,
  onPaymentSuccess,
  onClose,
}) => {
  const [step, setStep] = useState<PaymentStep>('enter_name');
  const [customerName, setCustomerName] = useState('');
  const [orderId, setOrderId] = useState('');
  const [countdown, setCountdown] = useState(6);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSimulationMode, setIsSimulationMode] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash'>('card');

  // API URL Helper
  const getApiUrl = (path: string) => {
    const base = import.meta.env.VITE_API_URL || 
                 (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')
                   ? `http://${window.location.hostname}:3000`
                   : window.location.origin);
    return `${base}${path}`;
  };

  // Generate a fallback order number on mount
  useEffect(() => {
    const randomNum = Math.floor(Math.random() * 90) + 10; // 10 to 99
    setOrderId(`#0${randomNum}`);
  }, []);

  // Set countdown timer based on step
  useEffect(() => {
    if (step === 'success') {
      setCountdown(6);
    } else if (step === 'cash_instructions') {
      setCountdown(15);
    }
  }, [step]);

  // Backend Order Creation on 'connecting' step
  useEffect(() => {
    if (step === 'connecting') {
      let active = true;
      const createOrder = async () => {
        try {
          const response = await fetch(getApiUrl('/api/orders'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              customerName,
              items: cartItems,
              total,
              paymentMethod,
            }),
          });

          if (!active) return;

          if (response.ok) {
            const data = await response.json();
            setOrderId(data.order.id);
            if (paymentMethod === 'cash') {
              setStep('cash_instructions');
            } else {
              setIsSimulationMode(data.mode === 'simulation');
              setStep('waiting_card');
            }
          } else {
            throw new Error('Server returned non-2xx status');
          }
        } catch (e) {
          console.error('Failed to create order on server, using offline fallback:', e);
          if (!active) return;
          setIsSimulationMode(true);
          if (paymentMethod === 'cash') {
            setStep('cash_instructions');
          } else {
            setStep('waiting_card');
          }
        }
      };

      createOrder();
      return () => {
        active = false;
      };
    }
  }, [step, customerName, cartItems, total, paymentMethod]);

  // Monitor order status changes from the parent state (SSE-driven)
  useEffect(() => {
    if (!orderId || step === 'success' || step === 'failed' || step === 'enter_name' || step === 'connecting' || step === 'select_payment_method' || step === 'cash_instructions') {
      return;
    }

    const currentOrder = orders.find((o) => o.id === orderId);
    
    if (currentOrder) {
      // 1. Si el pago fue exitoso
      if (currentOrder.status === 'paid') {
        setStep('processing');
        const timer = setTimeout(() => {
          setStep('success');
          playSuccessSound();
        }, 1200);
        return () => clearTimeout(timer);
      } 
      // 2. Si el pago falló (¡AQUÍ CONECTAMOS TU DISEÑO!)
      else if (currentOrder.status === 'rejected') {
        setStep('failed');
      }
    }
  }, [orders, orderId, step]);

  // Countdown timer for automatic closing on success or cash instructions
  useEffect(() => {
    if (step === 'success' || step === 'cash_instructions') {
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            onPaymentSuccess(orderId, customerName);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step, onPaymentSuccess, orderId, customerName]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setErrorMsg('Por favor ingresa tu nombre');
      return;
    }
    setErrorMsg('');
    setStep('select_payment_method');
  };

  const handleSelectPaymentMethod = (method: 'card' | 'cash') => {
    setPaymentMethod(method);
    setStep('connecting');
  };

  const handleSimulateSuccess = async () => {
    setStep('processing');
    try {
      const response = await fetch(getApiUrl(`/api/orders/${encodeURIComponent(orderId)}/simulate-payment`), {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Simulation endpoint returned failure');
      }
    } catch (e) {
      console.error('Failed to simulate payment on backend, running local checkout:', e);
      setTimeout(() => {
        setStep('success');
        playSuccessSound();
      }, 1500);
    }
  };

  const handleSimulateFailed = () => {
    setStep('processing');
    setTimeout(() => {
      setStep('failed');
    }, 1200);
  };

  const handleRetry = () => {
    setStep('connecting');
  };

  // Particles component for success animation
  const SuccessParticles = () => (
    <div className="particles-container">
      {[...Array(15)].map((_, i) => {
        const style = {
          left: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 1.5}s`,
          animationDuration: `${1.8 + Math.random() * 2.2}s`,
          opacity: Math.random() * 0.8 + 0.2,
          transform: `scale(${Math.random() * 0.8 + 0.4})`,
        };
        return <div key={i} className="sparkle-dot" style={style}></div>;
      })}
    </div>
  );

  return (
    <div className="checkout-backdrop">
      {step === 'success' && <SuccessParticles />}
      
      <div className={`checkout-dialog ${step === 'success' ? 'checkout-dialog-success' : ''} ${step === 'select_payment_method' ? 'checkout-dialog-payment' : ''}`}>
        {step !== 'success' && step !== 'processing' && step !== 'cash_instructions' && (
          <button className="checkout-close-x" onClick={onClose}>
            &times;
          </button>
        )}

        {/* STEP 0: ENTER NAME */}
        {step === 'enter_name' && (
          <div className="checkout-step-content width-100">
            <h3 className="checkout-step-title text-center">Identifica tu orden</h3>
            <p className="checkout-step-text text-center">Por favor ingresa tu nombre para llamarte cuando esté listo tu pedido.</p>
            
            <form onSubmit={handleNameSubmit} className="name-form">
              <input
                type="text"
                className={`name-input ${errorMsg ? 'input-error' : ''}`}
                placeholder="Ingresa tu nombre..."
                value={customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (e.target.value.trim()) setErrorMsg('');
                }}
                autoFocus
                maxLength={24}
              />
              {errorMsg && <p className="error-hint">{errorMsg}</p>}
              
              <div className="checkout-price-display margin-small">${total.toFixed(2)} MXN</div>
              
              <button type="submit" className="confirm-name-btn">
                CONTINUAR
              </button>
            </form>
          </div>
        )}

        {/* STEP 0.5: SELECT PAYMENT METHOD */}
        {step === 'select_payment_method' && (
          <div className="checkout-step-content width-100">
            <h3 className="checkout-step-title text-center">Método de Pago</h3>
            <p className="checkout-step-text text-center">¿Cómo deseas realizar tu pago, <strong>{customerName}</strong>?</p>
            
            <div className="payment-methods-grid">
              <button className="payment-method-btn" onClick={() => handleSelectPaymentMethod('card')}>
                <div className="payment-method-icon">💳</div>
                <div className="payment-method-label">TARJETA DE DÉBITO/CRÉDITO</div>
                <p className="payment-method-desc">Paga directamente en la terminal Point Smart de forma segura.</p>
              </button>
              <button className="payment-method-btn btn-cash-accent" onClick={() => handleSelectPaymentMethod('cash')}>
                <div className="payment-method-icon">💵</div>
                <div className="payment-method-label">PAGO EN EFECTIVO</div>
                <p className="payment-method-desc">Obtén tu ticket y paga directamente en el mostrador del motocarro.</p>
              </button>
            </div>

            <div className="checkout-price-display margin-small">${total.toFixed(2)} MXN</div>
          </div>
        )}

        {/* STEP 1: CONNECTING */}
        {step === 'connecting' && (
          <div className="checkout-step-content">
            <div className="spinner-ring"></div>
            <h3 className="checkout-step-title">PROCESANDO PEDIDO</h3>
            <p className="checkout-step-text">
              {paymentMethod === 'card' 
                ? 'Conectando con la terminal de Mercado Pago...' 
                : 'Registrando tu orden en el motocarro...'}
            </p>
            <div className="checkout-price-display">${total.toFixed(2)}</div>
          </div>
        )}

        {/* STEP 2: WAITING FOR CARD */}
        {step === 'waiting_card' && (
          <div className="checkout-step-content">
            <div className="terminal-illustration animate-pulse">
              <svg width="64" height="80" viewBox="0 0 64 80" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="12" y="4" width="40" height="72" rx="4" />
                <rect x="18" y="10" width="28" height="20" rx="1" fill="currentColor" fillOpacity="0.05" />
                <circle cx="24" cy="40" r="2" />
                <circle cx="32" cy="40" r="2" />
                <circle cx="40" cy="40" r="2" />
                <line x1="20" y1="52" x2="44" y2="52" strokeWidth="2" />
                <line x1="20" y1="60" x2="44" y2="60" strokeWidth="2" />
                <path d="M26 22a8 8 0 0 1 12 0" strokeWidth="1" />
                <path d="M23 19a12 12 0 0 1 18 0" strokeWidth="1" />
              </svg>
            </div>
            <h3 className="checkout-step-title">INSERTE O ACERQUE SU TARJETA</h3>
            <p className="checkout-step-text">La terminal Mercado Pago está lista para recibir el pago de <strong>{customerName}</strong>.</p>
            <div className="checkout-price-display">${total.toFixed(2)} MXN</div>

            {isSimulationMode ? (
              <div className="simulation-actions">
                <button className="sim-btn sim-success" onClick={handleSimulateSuccess}>
                  Simular Pago Exitoso
                </button>
                <button className="sim-btn sim-fail" onClick={handleSimulateFailed}>
                  Simular Pago Rechazado
                </button>
              </div>
            ) : (
              <div className="waiting-terminal-indicator">
                <div className="spinner-ring border-accent height-small"></div>
                <p className="waiting-hint">Esperando confirmación en terminal Point Smart...</p>
              </div>
            )}
          </div>
        )}

        {/* STEP: PROCESSING */}
        {step === 'processing' && (
          <div className="checkout-step-content">
            <div className="spinner-ring border-accent"></div>
            <h3 className="checkout-step-title">PROCESANDO PAGO</h3>
            <p className="checkout-step-text">Verificando transacción con el banco...</p>
          </div>
        )}

        {/* STEP 3: SUCCESS */}
        {step === 'success' && (
          <div className="checkout-step-content success-animation-flow">
            <div className="success-icon-wrapper">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="checkout-step-title font-success">PAGO APROBADO</h3>
            <p className="checkout-step-text">¡Gracias por tu compra, <strong>{customerName}</strong>!</p>
            
            <div className="order-ticket ticket-print-animation">
              <p className="ticket-label">NÚMERO DE PEDIDO</p>
              <h2 className="ticket-number">{orderId}</h2>
              <p className="ticket-client-name">CLIENTE: {customerName.toUpperCase()}</p>
              <div className="ticket-dash"></div>
              <p className="ticket-footer">Tu pedido se está preparando en el motocarro. Toma una foto para recogerlo.</p>
            </div>

            <button className="done-btn" onClick={() => onPaymentSuccess(orderId, customerName)}>
              Entendido
            </button>
            <p className="countdown-text">Esta pantalla se cerrará automáticamente en {countdown}s</p>
          </div>
        )}

        {/* STEP 4: CASH INSTRUCTIONS */}
        {step === 'cash_instructions' && (
          <div className="checkout-step-content success-animation-flow">
            <div className="cash-icon-wrapper animate-pulse">
              💵
            </div>
            <h3 className="checkout-step-title font-cash">PEDIDO REGISTRADO</h3>
            <p className="checkout-step-text">Por favor, acércate al mostrador para realizar tu pago en efectivo.</p>
            
            <div className="order-ticket ticket-print-animation border-cash-dashed">
              <p className="ticket-label text-orange">PAGO EN MOSTRADOR</p>
              <h2 className="ticket-number font-cash">{orderId}</h2>
              <p className="ticket-client-name">CLIENTE: {customerName.toUpperCase()}</p>
              <h3 className="ticket-amount-due">Pagar: ${total.toFixed(2)} MXN</h3>
              <div className="ticket-dash"></div>
              <p className="ticket-footer">Toma una foto de este ticket o dile tu número de pedido al barista para pagar en efectivo.</p>
            </div>

            <button className="done-btn btn-cash-done" onClick={() => onPaymentSuccess(orderId, customerName)}>
              Listo, tomé foto
            </button>
            <p className="countdown-text">Volviendo a la pantalla de inicio en {countdown}s</p>
          </div>
        )}

        {/* STEP 5: FAILED */}
        {step === 'failed' && (
          <div className="checkout-step-content">
            <div className="error-icon-wrapper">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h3 className="checkout-step-title font-error">PAGO RECHAZADO</h3>
            <p className="checkout-step-text">La transacción no pudo completarse. Por favor, intente con otra tarjeta.</p>
            
            <div className="failed-actions">
              <button className="sim-btn sim-retry" onClick={handleRetry}>
                Reintentar
              </button>
              <button className="sim-btn sim-cancel" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
