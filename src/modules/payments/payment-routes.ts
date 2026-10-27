import { Router, type RequestHandler } from 'express';

import type { PaymentController } from './payment-controller.js';

export interface PaymentRouteDependencies {
  readonly controller: PaymentController;
  readonly authenticateAccess: RequestHandler;
  readonly requireAdmin: RequestHandler;
  readonly idempotency: RequestHandler;
  readonly devSimulationEnabled: boolean;
}

export function createPaymentRouter(dependencies: PaymentRouteDependencies): Router {
  const router = Router();
  router.post('/webhooks/payments', dependencies.controller.webhook);
  if (dependencies.devSimulationEnabled) {
    router.post(
      '/dev/payments/:id/simulate',
      dependencies.authenticateAccess,
      dependencies.requireAdmin,
      dependencies.idempotency,
      dependencies.controller.simulate,
    );
  }
  return router;
}
