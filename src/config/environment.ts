import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    METRICS_PORT: z.coerce.number().int().min(1).max(65_535).default(9100),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ALLOWED_ORIGINS: z.string().min(1).default('http://localhost:3001'),
    DATABASE_URL: z.string().startsWith('postgresql://'),
    REDIS_URL: z.string().startsWith('redis://'),
  })
  .strict();

const ENVIRONMENT_KEYS = new Set([
  'NODE_ENV',
  'PORT',
  'METRICS_PORT',
  'LOG_LEVEL',
  'CORS_ALLOWED_ORIGINS',
  'DATABASE_URL',
  'REDIS_URL',
]);

function selectApplicationEnvironment(
  source: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key]) => ENVIRONMENT_KEYS.has(key) || key.startsWith('AMRUTAM_'),
    ),
  );
}

export type Environment = Readonly<{
  nodeEnv: z.infer<typeof environmentSchema>['NODE_ENV'];
  port: number;
  metricsPort: number;
  logLevel: z.infer<typeof environmentSchema>['LOG_LEVEL'];
  corsAllowedOrigins: readonly string[];
  databaseUrl: string;
  redisUrl: string;
}>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  // OS environments contain unrelated variables. The AMRUTAM_ prefix reserves a strict
  // application namespace so new settings cannot be accidentally accepted without a schema.
  const selected = selectApplicationEnvironment(source);
  const parsed = environmentSchema.safeParse(selected);

  if (!parsed.success) {
    const details = z.prettifyError(parsed.error);
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return {
    nodeEnv: parsed.data.NODE_ENV,
    port: parsed.data.PORT,
    metricsPort: parsed.data.METRICS_PORT,
    logLevel: parsed.data.LOG_LEVEL,
    corsAllowedOrigins: parsed.data.CORS_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    databaseUrl: parsed.data.DATABASE_URL,
    redisUrl: parsed.data.REDIS_URL,
  };
}
