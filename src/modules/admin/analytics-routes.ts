import { Router, type RequestHandler } from 'express';

import type { AnalyticsController } from './analytics-controller.js';

export interface AnalyticsRouteDependencies {
  readonly controller: AnalyticsController;
  readonly authenticateAccess: RequestHandler;
  readonly requireAdmin: RequestHandler;
}

export function createAnalyticsRouter(dependencies: AnalyticsRouteDependencies): Router {
  const router = Router();
  router.get(
    '/admin/analytics/overview',
    dependencies.authenticateAccess,
    dependencies.requireAdmin,
    dependencies.controller.getOverview,
  );
  return router;
}
