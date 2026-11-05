import { z } from 'zod';

export const customizationSchema = z.object({
  size: z.enum(['regular', 'grande']).default('regular'),
  milk: z.enum(['none', 'whole', 'light', 'avena', 'almendra']).default('none'),
  sweetness: z.enum(['none', 'standard', 'extra']).default('none'),
  temp: z.enum(['hot', 'iced']).default('hot'),
  extraShot: z.boolean().default(false),
});

export const orderItemInputSchema = z.object({
  productId: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(50),
  customization: customizationSchema.default({
    size: 'regular',
    milk: 'none',
    sweetness: 'none',
    temp: 'hot',
    extraShot: false,
  }),
  selectedCustomVariants: z.record(z.string(), z.string()).optional(),
  notes: z.string().trim().max(240).optional(),
});

export const createOrderSchema = z.object({
  operationId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(80).optional(),
  items: z.array(orderItemInputSchema).min(1).max(50),
  paymentMethod: z.enum(['card', 'cash']),
  discountAuthorizationToken: z.string().max(2048).optional(),
  /** Change voucher (cupón de cambio) to use as a discount. */
  voucherCode: z.string().trim().min(10).max(40).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type OrderItemInput = z.infer<typeof orderItemInputSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'IN_PREPARATION'
  | 'READY'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUNDED';

export type PaymentStatus = 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REFUNDED';
