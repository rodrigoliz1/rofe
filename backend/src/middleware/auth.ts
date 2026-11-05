import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../auth/service';
import type { Role } from '../auth/types';
import { AppError } from '../utils/errors';

export function authenticate(authService: AuthService) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authorization = req.header('authorization');
    if (!authorization?.startsWith('Bearer ')) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Necesitas iniciar sesión.'));
      return;
    }
    try {
      req.principal = await authService.verifyActiveAccessToken(authorization.slice(7));
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.principal || !roles.includes(req.principal.role)) {
      next(new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta operación.'));
      return;
    }
    next();
  };
}
