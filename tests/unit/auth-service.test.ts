import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  AuthRepository,
  CreatePatientRecord,
  NewRefreshTokenRecord,
  RefreshRotationResult,
} from '../../src/modules/auth/auth-repository.js';
import { AuthService } from '../../src/modules/auth/auth-service.js';
import type { AuditEvent, AuthUser } from '../../src/modules/auth/auth-types.js';

class InMemoryAuthRepository implements AuthRepository {
  public readonly users = new Map<string, AuthUser>();
  public readonly audits: AuditEvent[] = [];
  private readonly refreshTokens = new Map<
    string,
    NewRefreshTokenRecord & { revokedAt: Date | null; replacedBy: string | null }
  >();

  public findUserByEmail(email: string): Promise<AuthUser | null> {
    return Promise.resolve([...this.users.values()].find((user) => user.email === email) ?? null);
  }

  public findUserById(userId: string): Promise<AuthUser | null> {
    return Promise.resolve(this.users.get(userId) ?? null);
  }

  public createPatient(record: CreatePatientRecord): Promise<AuthUser> {
    const user = createUser({
      id: `user-${String(this.users.size + 1)}`,
      email: record.email,
      passwordHash: record.passwordHash,
      role: 'PATIENT',
    });
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }

  public recordFailedLogin(userId: string, lockedUntil: Date | null): Promise<void> {
    const user = requireUser(this.users, userId);
    this.users.set(userId, {
      ...user,
      failedLoginCount: user.failedLoginCount + 1,
      ...(lockedUntil === null ? {} : { status: 'LOCKED', lockedUntil }),
    });
    return Promise.resolve();
  }

  public clearFailedLogins(userId: string): Promise<void> {
    const user = requireUser(this.users, userId);
    this.users.set(userId, {
      ...user,
      failedLoginCount: 0,
      lockedUntil: null,
      status: 'ACTIVE',
    });
    return Promise.resolve();
  }

  public saveMfaEnrollment(
    userId: string,
    encryptedSecret: string,
    keyVersion: string,
  ): Promise<void> {
    const user = requireUser(this.users, userId);
    this.users.set(userId, {
      ...user,
      mfaEnabled: false,
      mfaSecretEnc: encryptedSecret,
      mfaSecretKeyVersion: keyVersion,
      mfaRecoveryCodesHash: [],
    });
    return Promise.resolve();
  }

  public activateMfa(userId: string, recoveryCodeHashes: readonly string[]): Promise<void> {
    const user = requireUser(this.users, userId);
    this.users.set(userId, {
      ...user,
      mfaEnabled: true,
      mfaRecoveryCodesHash: [...recoveryCodeHashes],
    });
    return Promise.resolve();
  }

  public consumeRecoveryCode(
    userId: string,
    expectedHashes: readonly string[],
    remainingHashes: readonly string[],
  ): Promise<boolean> {
    const user = requireUser(this.users, userId);
    if (JSON.stringify(user.mfaRecoveryCodesHash) !== JSON.stringify(expectedHashes)) {
      return Promise.resolve(false);
    }
    this.users.set(userId, { ...user, mfaRecoveryCodesHash: [...remainingHashes] });
    return Promise.resolve(true);
  }

  public createRefreshToken(record: NewRefreshTokenRecord): Promise<void> {
    this.refreshTokens.set(record.tokenHash, { ...record, revokedAt: null, replacedBy: null });
    return Promise.resolve();
  }

  public rotateRefreshToken(
    currentTokenHash: string,
    replacementId: string,
    replacementTokenHash: string,
    replacementExpiresAt: Date,
    now: Date,
  ): Promise<RefreshRotationResult> {
    const current = this.refreshTokens.get(currentTokenHash);
    if (current === undefined || current.expiresAt <= now) {
      return Promise.resolve({ kind: 'invalid' });
    }
    if (current.revokedAt !== null || current.replacedBy !== null) {
      for (const [hash, candidate] of this.refreshTokens) {
        if (candidate.familyId === current.familyId) {
          this.refreshTokens.set(hash, { ...candidate, revokedAt: now });
        }
      }
      return Promise.resolve({ kind: 'reused' });
    }

    current.revokedAt = now;
    current.replacedBy = replacementId;
    this.refreshTokens.set(replacementTokenHash, {
      id: replacementId,
      userId: current.userId,
      tokenHash: replacementTokenHash,
      familyId: current.familyId,
      expiresAt: replacementExpiresAt,
      revokedAt: null,
      replacedBy: null,
    });
    return Promise.resolve({ kind: 'rotated', user: requireUser(this.users, current.userId) });
  }

  public revokeRefreshToken(userId: string, tokenHash: string, now: Date): Promise<void> {
    const token = this.refreshTokens.get(tokenHash);
    if (token?.userId === userId) {
      token.revokedAt = now;
    }
    return Promise.resolve();
  }

  public writeAudit(event: AuditEvent): Promise<void> {
    this.audits.push(event);
    return Promise.resolve();
  }
}

const passwordHasher = {
  hash: (password: string) => Promise.resolve(`hash:${password}`),
  verify: (hash: string, password: string) => Promise.resolve(hash === `hash:${password}`),
};

const encryption = {
  encrypt: (plaintext: string) => ({ keyVersion: 'v1', ciphertext: `encrypted:${plaintext}` }),
  decrypt: (value: { readonly ciphertext: string }) => value.ciphertext.replace('encrypted:', ''),
};

const tokenService = {
  issueAccessToken: (subject: string, role: string, scope = 'access') =>
    `jwt:${subject}:${role}:${scope}`,
};

const totpService = {
  generateSecret: () => 'JBSWY3DPEHPK3PXP',
  createOtpAuthUri: (accountName: string, secret: string) =>
    `otpauth://totp/Amrutam:${accountName}?secret=${secret}`,
  verifyCode: (_secret: string, code: string) => code === '123456',
};

function buildService(repository: InMemoryAuthRepository): AuthService {
  return new AuthService(repository, passwordHasher, encryption, tokenService, totpService, {
    accessTokenTtlSeconds: 900,
    refreshTokenTtlSeconds: 2_592_000,
  });
}

describe('AuthService', () => {
  it('registers a patient, creates a rotating session, and audits the action', async () => {
    const repository = new InMemoryAuthRepository();
    const service = buildService(repository);

    const session = await service.register(
      {
        email: 'patient@example.com',
        password: 'a-secure-password',
        fullName: 'Demo Patient',
        phone: '+919000000001',
        dob: '1990-01-15',
        languages: ['English'],
      },
      { requestId: 'request-register' },
    );

    expect(session.accessToken).toContain(':PATIENT:access');
    expect(session.refreshToken).not.toContain('hash');
    expect(repository.audits).toContainEqual(
      expect.objectContaining({ action: 'auth.registered', requestId: 'request-register' }),
    );
  });

  it('requires and verifies MFA for a privileged user, then rotates and revokes refresh tokens', async () => {
    const repository = new InMemoryAuthRepository();
    const doctor = createUser({
      id: 'doctor-1',
      email: 'doctor@example.com',
      passwordHash: 'hash:a-secure-password',
      role: 'DOCTOR',
      mfaEnabled: true,
      mfaSecretEnc: 'encrypted:JBSWY3DPEHPK3PXP',
      mfaSecretKeyVersion: 'v1',
      mfaRecoveryCodesHash: [hashRecoveryCode('AAAAA-BBBBB-CCCCC-DDDDD')],
    });
    repository.users.set(doctor.id, doctor);
    const service = buildService(repository);

    const login = await service.login(
      { email: doctor.email, password: 'a-secure-password' },
      { requestId: 'request-login' },
    );
    expect(login).toEqual({
      mfaRequired: true,
      mfaEnrollmentRequired: false,
      mfaToken: 'jwt:doctor-1:DOCTOR:mfa',
    });

    const session = await service.verifyMfa(
      { userId: doctor.id, role: 'DOCTOR', scope: 'mfa', tokenId: 'mfa-token' },
      { code: '123456' },
      { requestId: 'request-mfa' },
    );
    const rotated = await service.refresh(
      { refreshToken: session.refreshToken },
      { requestId: 'request-refresh' },
    );
    expect(rotated.refreshToken).not.toBe(session.refreshToken);

    await expect(
      service.refresh({ refreshToken: session.refreshToken }, { requestId: 'request-reuse' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      service.refresh(
        { refreshToken: rotated.refreshToken },
        { requestId: 'request-family-revoked' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(repository.audits.map((audit) => audit.action)).toContain('auth.refresh_reuse_detected');
  });

  it('enrolls and activates MFA with one-time recovery codes', async () => {
    const repository = new InMemoryAuthRepository();
    const admin = createUser({
      id: 'admin-1',
      email: 'admin@example.com',
      passwordHash: 'hash:a-secure-password',
      role: 'ADMIN',
    });
    repository.users.set(admin.id, admin);
    const service = buildService(repository);
    const principal = {
      userId: admin.id,
      role: 'ADMIN' as const,
      scope: 'mfa' as const,
      tokenId: 'mfa',
    };

    const enrollment = await service.enrollMfa(principal, { requestId: 'request-enroll' });
    expect(enrollment.secret).toBe('JBSWY3DPEHPK3PXP');

    const activation = await service.activateMfa(
      principal,
      { code: '123456' },
      { requestId: 'request-activate' },
    );
    expect(activation.recoveryCodes).toHaveLength(8);

    const recoveryCode = activation.recoveryCodes[0];
    if (recoveryCode === undefined) {
      throw new Error('Expected a recovery code.');
    }
    await expect(
      service.verifyMfa(principal, { recoveryCode }, { requestId: 'request-recovery' }),
    ).resolves.toMatchObject({ accessToken: 'jwt:admin-1:ADMIN:access' });
    await expect(
      service.verifyMfa(principal, { recoveryCode }, { requestId: 'request-recovery-reuse' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('locks an account after repeated invalid password attempts without auditing credentials', async () => {
    const repository = new InMemoryAuthRepository();
    const patient = createUser({
      id: 'patient-1',
      email: 'patient@example.com',
      passwordHash: 'hash:correct-password',
      role: 'PATIENT',
    });
    repository.users.set(patient.id, patient);
    const service = buildService(repository);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.login(
          { email: patient.email, password: 'incorrect-password' },
          { requestId: `request-${String(attempt)}` },
          new Date('2026-10-27T10:00:00.000Z'),
        ),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }

    expect(repository.users.get(patient.id)).toMatchObject({
      status: 'LOCKED',
      failedLoginCount: 5,
    });
    expect(JSON.stringify(repository.audits)).not.toContain('incorrect-password');
  });

  it('keeps disabled accounts disabled after rejected login attempts', async () => {
    const repository = new InMemoryAuthRepository();
    const disabled = createUser({
      id: 'disabled-1',
      email: 'disabled@example.com',
      passwordHash: 'hash:correct-password',
      role: 'PATIENT',
      status: 'DISABLED',
    });
    repository.users.set(disabled.id, disabled);
    const service = buildService(repository);

    await expect(
      service.login(
        { email: disabled.email, password: 'incorrect-password' },
        { requestId: 'request-disabled' },
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(repository.users.get(disabled.id)).toMatchObject({
      status: 'DISABLED',
      failedLoginCount: 0,
    });
  });

  it('resets the failed-attempt window after a temporary lock expires', async () => {
    const repository = new InMemoryAuthRepository();
    const patient = createUser({
      id: 'expired-lock-1',
      email: 'expired-lock@example.com',
      passwordHash: 'hash:correct-password',
      role: 'PATIENT',
      status: 'LOCKED',
      failedLoginCount: 5,
      lockedUntil: new Date('2026-10-27T09:00:00.000Z'),
    });
    repository.users.set(patient.id, patient);
    const service = buildService(repository);

    await expect(
      service.login(
        { email: patient.email, password: 'incorrect-password' },
        { requestId: 'request-expired-lock' },
        new Date('2026-10-27T10:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(repository.users.get(patient.id)).toMatchObject({
      status: 'ACTIVE',
      failedLoginCount: 1,
      lockedUntil: null,
    });
  });

  it('does not extend an active lock after another rejected login attempt', async () => {
    const repository = new InMemoryAuthRepository();
    const lockedUntil = new Date('2026-10-27T10:15:00.000Z');
    const patient = createUser({
      id: 'active-lock-1',
      email: 'active-lock@example.com',
      passwordHash: 'hash:correct-password',
      role: 'PATIENT',
      status: 'LOCKED',
      failedLoginCount: 5,
      lockedUntil,
    });
    repository.users.set(patient.id, patient);
    const service = buildService(repository);

    await expect(
      service.login(
        { email: patient.email, password: 'incorrect-password' },
        { requestId: 'request-active-lock' },
        new Date('2026-10-27T10:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    expect(repository.users.get(patient.id)).toMatchObject({
      status: 'LOCKED',
      failedLoginCount: 5,
      lockedUntil,
    });
  });
});

function createUser(
  overrides: Partial<AuthUser> & Pick<AuthUser, 'id' | 'email' | 'passwordHash' | 'role'>,
): AuthUser {
  return {
    status: 'ACTIVE',
    mfaEnabled: false,
    mfaSecretEnc: null,
    mfaSecretKeyVersion: null,
    mfaRecoveryCodesHash: [],
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

function requireUser(users: ReadonlyMap<string, AuthUser>, userId: string): AuthUser {
  const user = users.get(userId);
  if (user === undefined) {
    throw new Error(`Missing test user ${userId}.`);
  }
  return user;
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}
