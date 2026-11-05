import type { Request, RequestHandler } from 'express';
import type { AppEnv } from '../config/env';
export interface RouteContext {
  env: AppEnv;
  requireAuth: RequestHandler;
  audit(request: Request, input: { action: string; entity: string; entityId?: string; before?: unknown; after?: unknown }): Promise<void>;
  broadcast(event: { type: string; [key: string]: unknown }): void;
}
