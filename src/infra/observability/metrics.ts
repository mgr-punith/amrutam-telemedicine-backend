import { createServer, type Server } from 'node:http';

import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';
import type { Logger } from 'pino';

export class ApplicationMetrics {
  public readonly registry = new Registry();

  private readonly httpRequests = new Counter({
    name: 'amrutam_http_requests_total',
    help: 'HTTP requests handled by method, normalized route, and status code.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  private readonly httpDuration = new Histogram({
    name: 'amrutam_http_request_duration_seconds',
    help: 'HTTP request duration by method, normalized route, and status code.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  private readonly bookingAttempts = new Counter({
    name: 'amrutam_booking_attempts_total',
    help: 'Booking attempts by outcome.',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });

  private readonly paymentEvents = new Counter({
    name: 'amrutam_payment_events_total',
    help: 'Verified payment events by status and processing result.',
    labelNames: ['status', 'result'] as const,
    registers: [this.registry],
  });

  private readonly expiredHolds = new Counter({
    name: 'amrutam_expired_holds_total',
    help: 'Expired held slots compensated by the background worker.',
    registers: [this.registry],
  });

  public constructor(serviceName: string) {
    this.registry.setDefaultLabels({ service: serviceName });
    collectDefaultMetrics({ register: this.registry, prefix: 'amrutam_' });
  }

  public recordHttp(input: {
    readonly method: string;
    readonly route: string;
    readonly statusCode: number;
    readonly durationSeconds: number;
  }): void {
    const labels = {
      method: input.method,
      route: input.route,
      status_code: String(input.statusCode),
    };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, input.durationSeconds);
  }

  public recordBooking(outcome: 'created' | 'unavailable' | 'error'): void {
    this.bookingAttempts.inc({ outcome });
  }

  public recordPayment(
    status: 'SUCCEEDED' | 'FAILED' | 'EXPIRED',
    result: 'processed' | 'duplicate' | 'not_found' | 'mismatch' | 'error',
  ): void {
    this.paymentEvents.inc({ status, result });
  }

  public recordExpiredHolds(count: number): void {
    if (count > 0) {
      this.expiredHolds.inc(count);
    }
  }
}

export function startMetricsServer(input: {
  readonly metrics: ApplicationMetrics;
  readonly port: number;
  readonly logger: Logger;
}): Server {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== '/metrics') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found\n');
      return;
    }
    void input.metrics.registry
      .metrics()
      .then((body) => {
        response.writeHead(200, { 'content-type': input.metrics.registry.contentType });
        response.end(body);
      })
      .catch((error: unknown) => {
        input.logger.error({ err: error }, 'Metrics serialization failed');
        response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Metrics unavailable\n');
      });
  });
  server.listen(input.port, () => {
    input.logger.info({ port: input.port }, 'Prometheus metrics server started');
  });
  return server;
}
