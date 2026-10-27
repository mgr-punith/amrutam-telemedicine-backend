const UUID_PATH_SEGMENT =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/giu;

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
  if (path.startsWith('/health/')) {
    return path;
  }
  if (path.startsWith('/api/v1/')) {
    return path.replace(UUID_PATH_SEGMENT, '/:id');
  }
  return 'unmatched';
}
