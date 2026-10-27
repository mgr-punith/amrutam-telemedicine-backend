import 'dotenv/config';

import { startTelemetry } from './infra/observability/tracing.js';

const exporterEndpoint = process.env.AMRUTAM_OTEL_EXPORTER_ENDPOINT;

startTelemetry({
  serviceName: process.env.AMRUTAM_SERVICE_NAME ?? 'amrutam-api',
  exporterEndpoint:
    exporterEndpoint === undefined || exporterEndpoint.length === 0 ? undefined : exporterEndpoint,
});
