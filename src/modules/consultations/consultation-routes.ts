import { Router, type RequestHandler } from 'express';

import type { ConsultationController } from './consultation-controller.js';

export interface ConsultationRouteDependencies {
  readonly controller: ConsultationController;
  readonly authenticateAccess: RequestHandler;
  readonly requireDoctor: RequestHandler;
  readonly idempotency: RequestHandler;
}

export function createConsultationRouter(dependencies: ConsultationRouteDependencies): Router {
  const router = Router();
  router.get('/consultations/:id', dependencies.authenticateAccess, dependencies.controller.get);
  router.post(
    '/consultations/:id/start',
    dependencies.authenticateAccess,
    dependencies.requireDoctor,
    dependencies.idempotency,
    dependencies.controller.start,
  );
  router.post(
    '/consultations/:id/complete',
    dependencies.authenticateAccess,
    dependencies.requireDoctor,
    dependencies.idempotency,
    dependencies.controller.complete,
  );
  router.post(
    '/consultations/:id/cancel',
    dependencies.authenticateAccess,
    dependencies.idempotency,
    dependencies.controller.cancel,
  );
  return router;
}
