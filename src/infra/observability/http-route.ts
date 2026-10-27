const UUID_PATH_SEGMENT =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/giu;

const KNOWN_ROUTES = new Set([
  '/health/live',
  '/health/ready',
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/mfa/enroll',
  '/api/v1/auth/mfa/activate',
  '/api/v1/auth/mfa/verify',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/doctors',
  '/api/v1/doctors/:id',
  '/api/v1/doctors/:id/slots',
  '/api/v1/availability/slots',
  '/api/v1/admin/doctors/:id/verify',
  '/api/v1/consultations',
  '/api/v1/consultations/:id',
  '/api/v1/consultations/:id/start',
  '/api/v1/consultations/:id/complete',
  '/api/v1/consultations/:id/cancel',
  '/api/v1/consultations/:id/prescriptions',
  '/api/v1/webhooks/payments',
  '/api/v1/dev/payments/:id/simulate',
  '/api/v1/admin/analytics/overview',
]);

export function normalizeHttpRoute(urlValue: string | undefined): string {
  if (urlValue === undefined) {
    return 'unmatched';
  }
  const path = urlValue.split('?', 1)[0] ?? '';
  if (path === '/openapi.json') {
    return path;
  }
  if (path === '/docs' || path.startsWith('/docs/')) {
    return '/docs/*';
  }
  const normalized = path.replace(UUID_PATH_SEGMENT, '/:id');
  return KNOWN_ROUTES.has(normalized) ? normalized : 'unmatched';
}
