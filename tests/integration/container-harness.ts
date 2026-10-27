import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';

export interface InfrastructureHarness {
  readonly databaseUrl: string;
  readonly redisUrl: string;
  stop(): Promise<void>;
}

export async function startInfrastructureHarness(): Promise<InfrastructureHarness> {
  const [postgres, redis] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('amrutam_test')
      .withUsername('amrutam')
      .withPassword('amrutam')
      .start(),
    new RedisContainer('redis:7-alpine').start(),
  ] as const);

  return {
    databaseUrl: postgres.getConnectionUri(),
    redisUrl: redis.getConnectionUrl(),
    async stop(): Promise<void> {
      await Promise.all([postgres.stop(), redis.stop()]);
    },
  };
}
