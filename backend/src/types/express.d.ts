import type { AuthPrincipal } from '../auth/types';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      principal?: AuthPrincipal;
    }
  }
}

export {};
