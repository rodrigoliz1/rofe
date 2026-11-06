import { createHmac, timingSafeEqual } from 'crypto';
import type { AppEnv } from '../config/env';
import { AppError } from '../utils/errors';

export interface MercadoPagoOrder {
  id: string;
  external_reference: string;
  status: 'created' | 'at_terminal' | 'processed' | 'failed' | 'canceled' | 'expired' | 'action_required' | 'refunded';
  status_detail?: string;
  total_paid_amount?: string;
  currency?: string;
  transactions?: {
    payments?: Array<{
      id?: string;
      reference?: { id?: string };
      amount?: string;
      paid_amount?: string;
      tip_amount?: string;
      reference_id?: string;
      status?: string;
      status_detail?: string;
    }>;
  };
}

export class MercadoPagoService {
  constructor(private readonly env: AppEnv) {}

  isConfigured(): boolean {
    return Boolean(this.env.MERCADO_PAGO_ACCESS_TOKEN && this.env.POINT_DEVICE_ID);
  }

  async createPointOrder(input: { orderId: string; total: number; idempotencyKey: string }): Promise<MercadoPagoOrder> {
    this.assertConfigured();
    const response = await fetch('https://api.mercadopago.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.env.MERCADO_PAGO_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        type: 'point',
        external_reference: input.orderId,
        description: 'ROFE Espresso Bar',
        expiration_time: 'PT15M',
        transactions: { payments: [{ amount: input.total.toFixed(2) }] },
        config: { point: { terminal_id: this.env.POINT_DEVICE_ID, print_on_terminal: 'seller_ticket' } },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    return parseResponse(response, 'La terminal no pudo recibir el cobro.');
  }

  async getOrder(orderId: string): Promise<MercadoPagoOrder> {
    this.assertConfigured();
    const response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${this.env.MERCADO_PAGO_ACCESS_TOKEN}` },
      signal: AbortSignal.timeout(10_000),
    });
    return parseResponse(response, 'No pudimos confirmar el pago con Mercado Pago.');
  }

  async cancelOrder(orderId: string, idempotencyKey: string): Promise<boolean> {
    return this.lifecycleRequest(orderId, 'cancel', idempotencyKey, ['canceled']);
  }

  async checkTerminal(): Promise<{ terminalId: string; operatingMode: string }> {
    this.assertConfigured();
    for (let offset = 0; offset < 1000; offset += 50) {
      const response = await fetch(`https://api.mercadopago.com/terminals/v1/list?limit=50&offset=${offset}`, {
        headers: { Authorization: `Bearer ${this.env.MERCADO_PAGO_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new AppError(502, 'TERMINAL_CHECK_FAILED', 'Mercado Pago no pudo verificar la terminal. Revisa las credenciales.');
      const payload = await response.json() as { data?: { terminals?: Array<{ id: string; operating_mode: string }> }; paging?: { total?: number } };
      const terminals = payload.data?.terminals ?? [];
      const terminal = terminals.find((entry) => entry.id === this.env.POINT_DEVICE_ID);
      if (terminal) {
        if (!['PDV', 'SELF_SERVICE'].includes(terminal.operating_mode)) throw new AppError(409, 'TERMINAL_MODE_INVALID', 'Configura la terminal en modo PDV o SELF_SERVICE en Mercado Pago.');
        return { terminalId: terminal.id, operatingMode: terminal.operating_mode };
      }
      if (terminals.length < 50 || offset + 50 >= (payload.paging?.total ?? Infinity)) break;
    }
    throw new AppError(409, 'TERMINAL_NOT_LINKED', 'La terminal configurada no pertenece a esta cuenta de Mercado Pago.');
  }

  /** Operator-only utility: no HTTP route exposes terminal configuration. */
  async setTerminalMode(mode: 'PDV' | 'SELF_SERVICE', expectedMode: 'PDV' | 'SELF_SERVICE'): Promise<{ terminalId: string; previousMode: string; operatingMode: string; changed: boolean; requestedMode: 'PDV' | 'SELF_SERVICE'; transitionPending: boolean; providerStatus?: number }> {
    if (!['PDV', 'SELF_SERVICE'].includes(mode) || !['PDV', 'SELF_SERVICE'].includes(expectedMode)) throw new AppError(400, 'TERMINAL_MODE_INVALID', 'Elige PDV o SELF_SERVICE.');
    const before = await this.checkTerminal();
    if (before.operatingMode === mode) return { ...before, previousMode: before.operatingMode, requestedMode: mode, changed: false, transitionPending: false };
    if (before.operatingMode !== expectedMode) throw new AppError(409, 'TERMINAL_MODE_CHANGED', 'El modo actual cambió. Consulta la terminal antes de continuar.');
    // Send only the configured terminal and its mode: never reassign store/POS/credentials.
    const response = await fetch('https://api.mercadopago.com/terminals/v1/setup', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${this.env.MERCADO_PAGO_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminals: [{ id: before.terminalId, operating_mode: mode }] }),
      signal: AbortSignal.timeout(10_000),
    });
    const payload = await response.json().catch(() => undefined) as { terminals?: Array<{ id: string; operating_mode: string }> } | undefined;
    if (response.status !== 200 || payload?.terminals?.length !== 1 || payload.terminals[0].id !== before.terminalId || payload.terminals[0].operating_mode !== mode) {
      throw new AppError(502, 'TERMINAL_SETUP_UNCONFIRMED', 'Mercado Pago no confirmó el cambio. Consulta el modo actual antes de reintentar.');
    }
    const after = await this.checkTerminal();
    // The list can lag a successful setup. Report that state; never repeat PATCH.
    return { ...after, previousMode: before.operatingMode, requestedMode: mode, changed: true, transitionPending: after.operatingMode !== mode, providerStatus: response.status };
  }

  async refundOrder(orderId: string, idempotencyKey: string): Promise<void> {
    await this.lifecycleRequest(orderId, 'refund', idempotencyKey, ['refunded']);
  }

  validateWebhookSignature(input: { xSignature?: string; xRequestId?: string; dataId?: string }): boolean {
    const secret = this.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret || !input.xSignature || !input.xRequestId || !input.dataId) return false;
    const signatureParts = Object.fromEntries(
      input.xSignature.split(',').map((part) => part.trim().split('=', 2)),
    );
    const timestamp = signatureParts.ts;
    const received = signatureParts.v1;
    if (!timestamp || !received || !/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(received)) return false;

    const numericTimestamp = Number(timestamp);
    const ageMs = Math.abs(Date.now() - (timestamp.length <= 10 ? numericTimestamp * 1000 : numericTimestamp));
    if (!Number.isFinite(ageMs) || ageMs > 5 * 60 * 1000) return false;

    const normalizedDataId = input.dataId.toLowerCase();
    const manifest = `id:${normalizedDataId};request-id:${input.xRequestId};ts:${timestamp};`;
    const expected = createHmac('sha256', secret).update(manifest).digest('hex');
    return safeHexEqual(expected, received.toLowerCase());
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new AppError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'La terminal no está configurada. Usa efectivo o solicita ayuda.');
    }
  }

  private async lifecycleRequest(orderId: string, action: 'cancel' | 'refund', idempotencyKey: string, acceptedStatuses: string[]): Promise<boolean> {
    this.assertConfigured();
    const response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}/${action}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.env.MERCADO_PAGO_ACCESS_TOKEN}`, 'X-Idempotency-Key': idempotencyKey },
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json().catch(() => undefined) as { status?: string } | undefined;
    if (action === 'cancel' && response.status === 202) return false;
    if (!response.ok || !payload?.status || !acceptedStatuses.includes(payload.status)) {
      console.error(JSON.stringify({ level: 'error', event: `mercado_pago_${action}_error`, status: response.status }));
      throw new AppError(502, action === 'refund' ? 'REFUND_PROVIDER_ERROR' : 'CANCEL_PROVIDER_ERROR', action === 'refund' ? 'Mercado Pago no pudo confirmar la devolución.' : 'Mercado Pago no pudo cancelar la orden.');
    }
    return true;
  }
}

async function parseResponse(response: Response, publicMessage: string): Promise<MercadoPagoOrder> {
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok || !isMercadoPagoOrder(payload)) {
    console.error(JSON.stringify({ level: 'error', event: 'mercado_pago_error', status: response.status }));
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', publicMessage);
  }
  return payload;
}

function isMercadoPagoOrder(value: unknown): value is MercadoPagoOrder {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && typeof candidate.external_reference === 'string' && typeof candidate.status === 'string';
}

function safeHexEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
