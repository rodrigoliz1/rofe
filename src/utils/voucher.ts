/** Extracts the voucher code from a QR payload ("ROFE-VALE:XXXX-XXXX-XX") or typed text. */
export const voucherCodeFromScan = (value: string) => value.trim().replace(/^ROFE[-:\s]?VALE[-:\s]?/i, '');
