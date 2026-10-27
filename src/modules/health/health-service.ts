export interface ReadinessCheck {
  readonly name: string;
  check(): Promise<void>;
}

export interface LivenessResult {
  readonly status: 'alive';
}

export interface ReadinessResult {
  readonly status: 'ready' | 'not_ready';
  readonly checks: Readonly<Record<string, 'up' | 'down'>>;
}

export class HealthService {
  public constructor(private readonly readinessChecks: readonly ReadinessCheck[]) {}

  public liveness(): LivenessResult {
    return { status: 'alive' };
  }

  public async readiness(): Promise<ReadinessResult> {
    const results = await Promise.all(
      this.readinessChecks.map(async (dependency) => {
        try {
          await dependency.check();
          return [dependency.name, 'up'] as const;
        } catch {
          return [dependency.name, 'down'] as const;
        }
      }),
    );
    const checks = Object.fromEntries(results);
    const isReady = results.every(([, status]) => status === 'up');

    return { status: isReady ? 'ready' : 'not_ready', checks };
  }
}
