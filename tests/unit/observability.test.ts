import { describe, expect, it } from 'vitest';

import { normalizeHttpRoute } from '../../src/infra/observability/http-route.js';
import { ApplicationMetrics } from '../../src/infra/observability/metrics.js';

describe('observability primitives', () => {
  it('normalizes route identifiers and strips query strings from telemetry labels', () => {
    expect(
      normalizeHttpRoute(
        '/api/v1/consultations/30000000-0000-4000-8000-000000000001/prescriptions?token=secret',
      ),
    ).toBe('/api/v1/consultations/:id/prescriptions');
    expect(normalizeHttpRoute('/docs/swagger-ui.css')).toBe('/docs/*');
    expect(normalizeHttpRoute('/unknown?email=patient@example.com')).toBe('unmatched');
    expect(normalizeHttpRoute('/api/v1/doctors/private-email@example.com')).toBe('unmatched');
    expect(normalizeHttpRoute('/health/private-identifier')).toBe('unmatched');
  });

  it('exports HTTP, booking, payment, worker, and process metrics without sensitive labels', async () => {
    const metrics = new ApplicationMetrics('amrutam-test');
    metrics.recordHttp({
      method: 'POST',
      route: '/api/v1/consultations',
      statusCode: 201,
      durationSeconds: 0.04,
    });
    metrics.recordBooking('created');
    metrics.recordPayment('SUCCEEDED', 'processed');
    metrics.recordExpiredHolds(2);

    const output = await metrics.registry.metrics();
    expect(output).toContain('amrutam_http_requests_total');
    expect(output).toContain('amrutam_http_request_duration_seconds');
    expect(output).toContain('amrutam_booking_attempts_total');
    expect(output).toContain('amrutam_payment_events_total');
    expect(output).toContain('amrutam_expired_holds_total');
    expect(output).toContain('amrutam_process_cpu_user_seconds_total');
    expect(output).not.toContain('secret');
    expect(output).not.toContain('patient@example.com');
  });
});
