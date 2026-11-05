import jwt from 'jsonwebtoken';
import type { AppEnv } from '../config/env';
import type { AuthorizedDiscount, DiscountType } from '../domain/discounts';
import { AppError } from '../utils/errors';

interface DiscountClaims extends jwt.JwtPayload {
  kind: 'discount';
  operationId: string;
  type: DiscountType;
  value: number;
  reason: string;
  authorizedBy: string;
}

export class DiscountAuthorizationService {
  constructor(private readonly env: AppEnv) {}

  issue(input: AuthorizedDiscount & { operationId: string }): string {
    return jwt.sign({ ...input, kind: 'discount' }, this.env.JWT_ACCESS_SECRET, {
      subject: input.authorizedBy,
      expiresIn: 5 * 60,
      audience: 'rofe-pos-discount',
    });
  }

  verify(token: string, operationId: string): AuthorizedDiscount {
    try {
      const claims = jwt.verify(token, this.env.JWT_ACCESS_SECRET, { audience: 'rofe-pos-discount' }) as DiscountClaims;
      if (claims.kind !== 'discount' || claims.operationId !== operationId || !claims.authorizedBy || !claims.reason) throw new Error('invalid claims');
      return { type: claims.type, value: Number(claims.value), reason: claims.reason, authorizedBy: claims.authorizedBy };
    } catch {
      throw new AppError(403, 'INVALID_DISCOUNT_AUTHORIZATION', 'La autorización del descuento venció o no corresponde a esta orden.');
    }
  }
}
