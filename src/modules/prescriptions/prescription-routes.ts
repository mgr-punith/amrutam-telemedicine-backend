import { Router, type RequestHandler } from 'express';

import type { PrescriptionController } from './prescription-controller.js';

export interface PrescriptionRouteDependencies {
  readonly controller: PrescriptionController;
  readonly authenticateAccess: RequestHandler;
  readonly requireDoctor: RequestHandler;
  readonly idempotency: RequestHandler;
}

export function createPrescriptionRouter(dependencies: PrescriptionRouteDependencies): Router {
  const router = Router();
  router.post(
    '/consultations/:id/prescriptions',
    dependencies.authenticateAccess,
    dependencies.requireDoctor,
    dependencies.idempotency,
    dependencies.controller.create,
  );
  router.get(
    '/consultations/:id/prescriptions',
    dependencies.authenticateAccess,
    dependencies.controller.list,
  );
  return router;
}
