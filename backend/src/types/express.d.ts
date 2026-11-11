import 'express';
import type { AuthenticatedUser } from '../common/auth/authenticated-user';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      /** Set by `JwtAuthGuard` for guarded routes. */
      user?: AuthenticatedUser;
    }
  }
}

export {};

