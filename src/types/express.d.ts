import type { AuthenticatedPrincipal } from '../modules/auth/auth-types.js';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthenticatedPrincipal;
    }
  }
}

declare module 'node:http' {
  interface IncomingMessage {
    requestId: string;
  }
}

export {};
