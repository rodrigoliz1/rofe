import { randomInt } from 'crypto';

/**
 * Change voucher codes: 10 Crockford base-32 characters (no I, L, O, U), shown as
 * XXXX-XXXX-XX. ~50 bits of entropy: unguessable, short enough to type from a photo.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateVoucherCode(): string {
  let raw = '';
  for (let index = 0; index < 10; index += 1) raw += ALPHABET[randomInt(ALPHABET.length)];
  return formatVoucherCode(raw);
}

/** Accepts what a person types or a QR contains: case, spaces, dashes and look-alikes. */
export function normalizeVoucherCode(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/^ROFE[-:\s]?VALE[-:\s]?/, '').replace(/[\s-]/g, '')
    .replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{10}$/.test(cleaned)) return null;
  return formatVoucherCode(cleaned);
}

function formatVoucherCode(raw: string): string {
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 10)}`;
}

/** Content of the QR printed for the customer. */
export const voucherQrPayload = (code: string) => `ROFE-VALE:${code}`;
