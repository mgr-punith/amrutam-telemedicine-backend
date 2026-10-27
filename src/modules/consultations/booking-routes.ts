import { Router, type RequestHandler } from 'express';

import type { BookingController } from './booking-controller.js';

export interface BookingRouteDependencies {
  readonly controller: BookingController;
  readonly authenticateAccess: RequestHandler;
  readonly requirePatient: RequestHandler;
  readonly idempotency: RequestHandler;
}

export function createBookingRouter(dependencies: BookingRouteDependencies): Router {
  const router = Router();
  router.post(
    '/consultations',
    dependencies.authenticateAccess,
    dependencies.requirePatient,
    dependencies.idempotency,
    dependencies.controller.create,
  );
  return router;
}
