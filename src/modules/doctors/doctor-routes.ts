import { Router, type RequestHandler } from 'express';

import type { DoctorController } from './doctor-controller.js';

export interface DoctorRouteDependencies {
  readonly controller: DoctorController;
  readonly authenticateAccess: RequestHandler;
  readonly requireDoctor: RequestHandler;
  readonly requireAdmin: RequestHandler;
  readonly idempotency: RequestHandler;
}

export function createDoctorRouter(dependencies: DoctorRouteDependencies): Router {
  const router = Router();
  router.get('/doctors', dependencies.controller.search);
  router.get('/doctors/:id', dependencies.controller.get);
  router.get('/doctors/:id/slots', dependencies.controller.listSlots);
  router.post(
    '/availability/slots',
    dependencies.authenticateAccess,
    dependencies.requireDoctor,
    dependencies.idempotency,
    dependencies.controller.createSlot,
  );
  router.post(
    '/admin/doctors/:id/verify',
    dependencies.authenticateAccess,
    dependencies.requireAdmin,
    dependencies.idempotency,
    dependencies.controller.verify,
  );
  return router;
}
