import { Router, type RequestHandler } from 'express';

import type { AuthController } from './auth-controller.js';

export interface AuthRouteDependencies {
  readonly controller: AuthController;
  readonly authenticateAccess: RequestHandler;
  readonly authenticateMfa: RequestHandler;
  readonly authenticationRateLimit: RequestHandler;
}

export function createAuthRouter(dependencies: AuthRouteDependencies): Router {
  const router = Router();

  router.post('/register', dependencies.authenticationRateLimit, dependencies.controller.register);
  router.post('/login', dependencies.authenticationRateLimit, dependencies.controller.login);
  router.post('/mfa/enroll', dependencies.authenticateMfa, dependencies.controller.enrollMfa);
  router.post(
    '/mfa/activate',
    dependencies.authenticationRateLimit,
    dependencies.authenticateMfa,
    dependencies.controller.activateMfa,
  );
  router.post(
    '/mfa/verify',
    dependencies.authenticationRateLimit,
    dependencies.authenticateMfa,
    dependencies.controller.verifyMfa,
  );
  router.post('/refresh', dependencies.authenticationRateLimit, dependencies.controller.refresh);
  router.post('/logout', dependencies.authenticateAccess, dependencies.controller.logout);

  return router;
}
