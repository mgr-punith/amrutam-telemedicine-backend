import { context, SpanKind, SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import type { RequestHandler } from 'express';

import { normalizeHttpRoute } from './http-route.js';

let telemetrySdk: NodeSDK | undefined;

export function startTelemetry(input: {
  readonly serviceName: string;
  readonly exporterEndpoint: string | undefined;
}): void {
  if (input.exporterEndpoint === undefined || telemetrySdk !== undefined) {
    return;
  }
  telemetrySdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: input.serviceName,
      [ATTR_SERVICE_NAMESPACE]: 'amrutam',
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter({ url: input.exporterEndpoint }),
    instrumentations: [
      ...getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: false },
        '@opentelemetry/instrumentation-express': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: true },
        '@opentelemetry/instrumentation-ioredis': { enabled: true },
      }),
      new PrismaInstrumentation(),
    ],
  });
  telemetrySdk.start();
}

export async function stopTelemetry(): Promise<void> {
  await telemetrySdk?.shutdown();
  telemetrySdk = undefined;
}

export function createHttpTracingMiddleware(serviceName: string): RequestHandler {
  const tracer = trace.getTracer(serviceName);
  return (request, response, next) => {
    const route = normalizeHttpRoute(request.originalUrl);
    const span = tracer.startSpan(`${request.method} ${route}`, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.request.method': request.method,
        'http.route': route,
      },
    });
    const activeContext = trace.setSpan(context.active(), span);
    response.once('finish', () => {
      span.setAttribute('http.response.status_code', response.statusCode);
      span.setStatus({
        code: response.statusCode >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK,
      });
      span.end();
    });
    context.with(activeContext, next);
  };
}

export function withActiveSpan<T>(
  name: string,
  attributes: Attributes,
  operation: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('amrutam-business');
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await operation();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error: unknown) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
