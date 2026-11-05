import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { voucherCodeFromScan } from './voucher';

describe('voucher QR', () => {
  it('the QR printed for the customer decodes back to the exact code', async () => {
    const code = 'N77D-Y8VM-40';
    // Same options as the barista ticket (CashPaymentPanel).
    const buffer = await QRCode.toBuffer(`ROFE-VALE:${code}`, { errorCorrectionLevel: 'M', margin: 2, width: 260 });
    const image = PNG.sync.read(buffer);
    const result = jsQR(new Uint8ClampedArray(image.data), image.width, image.height);
    expect(result?.data).toBe(`ROFE-VALE:${code}`);
    expect(voucherCodeFromScan(result!.data)).toBe(code);
  });
  it('accepts a typed code unchanged', () => {
    expect(voucherCodeFromScan('  n77d-y8vm-40 ')).toBe('n77d-y8vm-40');
  });
});
