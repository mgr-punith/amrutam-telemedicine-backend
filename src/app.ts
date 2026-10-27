import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import swaggerUi from 'swagger-ui-express';

import type { Environment } from './config/environment.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createHttpLogger } from './middleware/http-logger.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import type { AnalyticsRouteDependencies } from './modules/admin/analytics-routes.js';
import { createAnalyticsRouter } from './modules/admin/analytics-routes.js';
import type { AuthRouteDependencies } from './modules/auth/auth-routes.js';
import { createAuthRouter } from './modules/auth/auth-routes.js';
import type { BookingRouteDependencies } from './modules/consultations/booking-routes.js';
import { createBookingRouter } from './modules/consultations/booking-routes.js';
import type { ConsultationRouteDependencies } from './modules/consultations/consultation-routes.js';
import { createConsultationRouter } from './modules/consultations/consultation-routes.js';
import type { DoctorRouteDependencies } from './modules/doctors/doctor-routes.js';
import { createDoctorRouter } from './modules/doctors/doctor-routes.js';
import type { HealthController } from './modules/health/health-controller.js';
import { createHealthRouter } from './modules/health/health-routes.js';
import type { PaymentRouteDependencies } from './modules/payments/payment-routes.js';
import { createPaymentRouter } from './modules/payments/payment-routes.js';
import type { PrescriptionRouteDependencies } from './modules/prescriptions/prescription-routes.js';
import { createPrescriptionRouter } from './modules/prescriptions/prescription-routes.js';

export interface AppDependencies {
  readonly environment: Pick<Environment, 'corsAllowedOrigins'>;
  readonly logger: Logger;
  readonly healthController: HealthController;
  readonly auth?: AuthRouteDependencies;
  readonly doctors?: DoctorRouteDependencies;
  readonly booking?: BookingRouteDependencies;
  readonly consultations?: ConsultationRouteDependencies;
  readonly payments?: PaymentRouteDependencies;
  readonly prescriptions?: PrescriptionRouteDependencies;
  readonly analytics?: AnalyticsRouteDependencies;
  readonly openApiDocument?: Readonly<Record<string, unknown>>;
  readonly docsEnabled?: boolean;
}

export function createApp(dependencies: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(createHttpLogger(dependencies.logger));
  app.use(helmet());
  app.use(
    cors({
      origin: [...dependencies.environment.corsAllowedOrigins],
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '100kb',
      strict: true,
      verify: (request, _response, buffer) => {
        request.rawBody = Buffer.from(buffer);
      },
    }),
  );

  app.use('/health', createHealthRouter(dependencies.healthController));
  if (dependencies.docsEnabled === true && dependencies.openApiDocument !== undefined) {
    app.get('/openapi.json', (_request, response) => response.json(dependencies.openApiDocument));
    app.use(
      '/docs',
      swaggerUi.serve,
      swaggerUi.setup(dependencies.openApiDocument, {
        customSiteTitle: 'Amrutam Telemedicine API',
        swaggerOptions: { persistAuthorization: true },
      }),
    );
  }
  if (dependencies.auth !== undefined) {
    app.use('/api/v1/auth', createAuthRouter(dependencies.auth));
  }
  if (dependencies.doctors !== undefined) {
    app.use('/api/v1', createDoctorRouter(dependencies.doctors));
  }
  if (dependencies.booking !== undefined) {
    app.use('/api/v1', createBookingRouter(dependencies.booking));
  }
  if (dependencies.consultations !== undefined) {
    app.use('/api/v1', createConsultationRouter(dependencies.consultations));
  }
  if (dependencies.payments !== undefined) {
    app.use('/api/v1', createPaymentRouter(dependencies.payments));
  }
  if (dependencies.prescriptions !== undefined) {
    app.use('/api/v1', createPrescriptionRouter(dependencies.prescriptions));
  }
  if (dependencies.analytics !== undefined) {
    app.use('/api/v1', createAnalyticsRouter(dependencies.analytics));
  }

  app.use(notFoundHandler());
  app.use(createErrorHandler(dependencies.logger));

  return app;
}
