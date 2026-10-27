import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { ConflictError, UnauthorizedError } from '../../common/errors/app-error.js';
import type { EncryptedValue } from '../../infra/crypto/field-encryption.js';
import type { AccessTokenClaims } from '../../infra/crypto/token-service.js';
import type {
  LoginRequest,
  MfaCodeRequest,
  MfaVerifyRequest,
  RefreshTokenRequest,
  RegisterRequest,
} from './auth-contracts.js';
import { DuplicateEmailError, isPrivilegedRole, type AuthRepository } from './auth-repository.js';
import type { AuthenticatedPrincipal, AuthUser, SessionTokens, UserRole } from './auth-types.js';

const MAX_FAILED_LOGINS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1_000;
const RECOVERY_CODE_COUNT = 8;

export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface FieldEncryptionPort {
  encrypt(plaintext: string): EncryptedValue;
  decrypt(value: EncryptedValue): string;
}

export interface TokenServicePort {
  issueAccessToken(
    subject: string,
    role: AccessTokenClaims['role'],
    scope?: AccessTokenClaims['scope'],
    now?: Date,
  ): string;
}

export interface TotpServicePort {
  generateSecret(): string;
  createOtpAuthUri(accountName: string, secret: string): string;
  verifyCode(secret: string, code: string, date?: Date): boolean;
}

export interface AuthServiceOptions {
  readonly accessTokenTtlSeconds: number;
  readonly refreshTokenTtlSeconds: number;
}

export interface RequestContext {
  readonly requestId: string;
}

export type LoginResult =
  | ({ readonly mfaRequired: false } & SessionTokens)
  | {
      readonly mfaRequired: true;
      readonly mfaEnrollmentRequired: boolean;
      readonly mfaToken: string;
    };

export interface MfaEnrollmentResult {
  readonly secret: string;
  readonly otpAuthUri: string;
}

export interface MfaActivationResult extends SessionTokens {
  readonly recoveryCodes: readonly string[];
}

export class AuthService {
  private dummyPasswordHash: Promise<string> | undefined;

  public constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasherPort,
    private readonly encryption: FieldEncryptionPort,
    private readonly tokenService: TokenServicePort,
    private readonly totpService: TotpServicePort,
    private readonly options: AuthServiceOptions,
  ) {}

  public async register(input: RegisterRequest, context: RequestContext): Promise<SessionTokens> {
    const passwordHash = await this.passwordHasher.hash(input.password);
    const phone = this.encryption.encrypt(input.phone);
    const dob = this.encryption.encrypt(input.dob);

    let user: AuthUser;
    try {
      user = await this.repository.createPatient({
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        phoneEnc: phone.ciphertext,
        dobEnc: dob.ciphertext,
        encKeyVersion: phone.keyVersion,
        city: input.city ?? null,
        languages: input.languages,
      });
    } catch (error: unknown) {
      if (error instanceof DuplicateEmailError) {
        throw new ConflictError('EMAIL_ALREADY_REGISTERED', 'This email is already registered.');
      }
      throw error;
    }

    const session = await this.issueSession(user);
    await this.audit(user, 'auth.registered', context, { authentication: 'password' });
    return session;
  }

  public async login(
    input: LoginRequest,
    context: RequestContext,
    now = new Date(),
  ): Promise<LoginResult> {
    let user = await this.repository.findUserByEmail(input.email);
    if (user?.status === 'LOCKED' && user.lockedUntil !== null && user.lockedUntil <= now) {
      await this.repository.clearFailedLogins(user.id);
      user = { ...user, status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null };
    }
    const passwordHash = user?.passwordHash ?? (await this.getDummyPasswordHash());
    const passwordMatches = await this.passwordHasher.verify(passwordHash, input.password);

    if (user === null || !passwordMatches || user.status === 'DISABLED') {
      if (user?.status === 'ACTIVE') {
        await this.handleFailedLogin(user, context, now);
      } else if (user?.status === 'DISABLED') {
        await this.audit(user, 'auth.login_failed', context, { reason: 'account_disabled' });
      } else if (user?.status === 'LOCKED') {
        await this.audit(user, 'auth.login_failed', context, { reason: 'account_locked' });
      } else {
        await this.repository.writeAudit({
          actorId: null,
          actorRole: null,
          action: 'auth.login_failed',
          resourceType: 'authentication',
          resourceId: null,
          requestId: context.requestId,
          metadata: { reason: 'invalid_credentials' },
        });
      }
      throw new UnauthorizedError('The email or password is incorrect.');
    }

    if (user.status === 'LOCKED') {
      if (user.lockedUntil === null || user.lockedUntil > now) {
        await this.audit(user, 'auth.login_failed', context, { reason: 'account_locked' });
        throw new UnauthorizedError('The account is temporarily locked.');
      }
    }

    await this.repository.clearFailedLogins(user.id);
    if (user.mfaEnabled || isPrivilegedRole(user.role)) {
      await this.audit(user, 'auth.password_verified', context, {
        mfaEnrollmentRequired: !user.mfaEnabled,
      });
      return {
        mfaRequired: true,
        mfaEnrollmentRequired: !user.mfaEnabled,
        mfaToken: this.tokenService.issueAccessToken(user.id, user.role, 'mfa', now),
      };
    }

    const session = await this.issueSession(user, now);
    await this.audit(user, 'auth.login_succeeded', context, { mfa: false });
    return { mfaRequired: false, ...session };
  }

  public async enrollMfa(
    principal: AuthenticatedPrincipal,
    context: RequestContext,
  ): Promise<MfaEnrollmentResult> {
    const user = await this.requireUser(principal.userId);
    if (user.mfaEnabled) {
      throw new ConflictError('MFA_ALREADY_ENABLED', 'MFA is already enabled.');
    }

    const secret = this.totpService.generateSecret();
    const encrypted = this.encryption.encrypt(secret);
    await this.repository.saveMfaEnrollment(user.id, encrypted.ciphertext, encrypted.keyVersion);
    await this.audit(user, 'auth.mfa_enrolled', context);
    return { secret, otpAuthUri: this.totpService.createOtpAuthUri(user.email, secret) };
  }

  public async activateMfa(
    principal: AuthenticatedPrincipal,
    input: MfaCodeRequest,
    context: RequestContext,
    now = new Date(),
  ): Promise<MfaActivationResult> {
    const user = await this.requireUser(principal.userId);
    const secret = this.decryptMfaSecret(user);
    if (!this.totpService.verifyCode(secret, input.code, now)) {
      await this.audit(user, 'auth.mfa_activation_failed', context);
      throw new UnauthorizedError('The MFA code is invalid.');
    }

    const recoveryCodes = createRecoveryCodes();
    await this.repository.activateMfa(user.id, recoveryCodes.map(hashRecoveryCode));
    const session = await this.issueSession(user, now);
    await this.audit(user, 'auth.mfa_activated', context);
    return { ...session, recoveryCodes };
  }

  public async verifyMfa(
    principal: AuthenticatedPrincipal,
    input: MfaVerifyRequest,
    context: RequestContext,
    now = new Date(),
  ): Promise<SessionTokens> {
    const user = await this.requireUser(principal.userId);
    if (!user.mfaEnabled) {
      throw new ConflictError('MFA_NOT_ENABLED', 'MFA must be activated before verification.');
    }

    let recoveryCodeUsed = false;
    if (input.code !== undefined) {
      const secret = this.decryptMfaSecret(user);
      if (!this.totpService.verifyCode(secret, input.code, now)) {
        await this.audit(user, 'auth.mfa_verification_failed', context);
        throw new UnauthorizedError('The MFA code is invalid.');
      }
    } else if (input.recoveryCode !== undefined) {
      const recoveryHash = hashRecoveryCode(input.recoveryCode);
      const index = user.mfaRecoveryCodesHash.indexOf(recoveryHash);
      if (index === -1) {
        await this.audit(user, 'auth.mfa_verification_failed', context);
        throw new UnauthorizedError('The MFA recovery code is invalid.');
      }
      const remaining = user.mfaRecoveryCodesHash.filter((_, candidate) => candidate !== index);
      const consumed = await this.repository.consumeRecoveryCode(
        user.id,
        user.mfaRecoveryCodesHash,
        remaining,
      );
      if (!consumed) {
        throw new UnauthorizedError('The MFA recovery code has already been used.');
      }
      recoveryCodeUsed = true;
    }

    const session = await this.issueSession(user, now);
    await this.audit(user, 'auth.mfa_verified', context, { recoveryCodeUsed });
    return session;
  }

  public async refresh(
    input: RefreshTokenRequest,
    context: RequestContext,
    now = new Date(),
  ): Promise<SessionTokens> {
    const replacementToken = createOpaqueRefreshToken();
    const replacementId = randomUUID();
    const replacementExpiresAt = this.refreshExpiry(now);
    const result = await this.repository.rotateRefreshToken(
      hashRefreshToken(input.refreshToken),
      replacementId,
      hashRefreshToken(replacementToken),
      replacementExpiresAt,
      now,
    );

    if (result.kind !== 'rotated') {
      if (result.kind === 'reused') {
        await this.repository.writeAudit({
          actorId: null,
          actorRole: null,
          action: 'auth.refresh_reuse_detected',
          resourceType: 'refresh_token_family',
          resourceId: null,
          requestId: context.requestId,
        });
      }
      throw new UnauthorizedError('The refresh token is invalid or expired.');
    }

    const accessToken = this.tokenService.issueAccessToken(
      result.user.id,
      result.user.role,
      'access',
      now,
    );
    await this.audit(result.user, 'auth.refresh_rotated', context);
    return {
      accessToken,
      accessTokenExpiresInSeconds: this.options.accessTokenTtlSeconds,
      refreshToken: replacementToken,
      refreshTokenExpiresAt: replacementExpiresAt.toISOString(),
    };
  }

  public async logout(
    principal: AuthenticatedPrincipal,
    input: RefreshTokenRequest,
    context: RequestContext,
    now = new Date(),
  ): Promise<void> {
    const user = await this.requireUser(principal.userId);
    await this.repository.revokeRefreshToken(user.id, hashRefreshToken(input.refreshToken), now);
    await this.audit(user, 'auth.logged_out', context);
  }

  private async issueSession(user: AuthUser, now = new Date()): Promise<SessionTokens> {
    const refreshToken = createOpaqueRefreshToken();
    const refreshTokenExpiresAt = this.refreshExpiry(now);
    await this.repository.createRefreshToken({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      familyId: randomUUID(),
      expiresAt: refreshTokenExpiresAt,
    });

    return {
      accessToken: this.tokenService.issueAccessToken(user.id, user.role, 'access', now),
      accessTokenExpiresInSeconds: this.options.accessTokenTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
    };
  }

  private async handleFailedLogin(
    user: AuthUser,
    context: RequestContext,
    now: Date,
  ): Promise<void> {
    const nextFailureCount = user.failedLoginCount + 1;
    const lockedUntil =
      nextFailureCount >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOGIN_LOCK_MS) : null;
    await this.repository.recordFailedLogin(user.id, lockedUntil);
    await this.audit(user, 'auth.login_failed', context, {
      reason: 'invalid_credentials',
      accountLocked: lockedUntil !== null,
    });
  }

  private async requireUser(userId: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(userId);
    if (user?.status !== 'ACTIVE') {
      throw new UnauthorizedError();
    }
    return user;
  }

  private decryptMfaSecret(user: AuthUser): string {
    if (user.mfaSecretEnc === null || user.mfaSecretKeyVersion === null) {
      throw new ConflictError('MFA_ENROLLMENT_REQUIRED', 'MFA enrollment must be completed first.');
    }
    return this.encryption.decrypt({
      ciphertext: user.mfaSecretEnc,
      keyVersion: user.mfaSecretKeyVersion,
    });
  }

  private refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + this.options.refreshTokenTtlSeconds * 1_000);
  }

  private getDummyPasswordHash(): Promise<string> {
    this.dummyPasswordHash ??= this.passwordHasher.hash('invalid-login-password');
    return this.dummyPasswordHash;
  }

  private async audit(
    user: Pick<AuthUser, 'id' | 'role'>,
    action: string,
    context: RequestContext,
    metadata?: Readonly<Record<string, string | number | boolean>>,
  ): Promise<void> {
    await this.repository.writeAudit({
      actorId: user.id,
      actorRole: user.role,
      action,
      resourceType: 'user',
      resourceId: user.id,
      requestId: context.requestId,
      ...(metadata === undefined ? {} : { metadata }),
    });
  }
}

function createOpaqueRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function createRecoveryCodes(): readonly string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const encoded = randomBytes(10).toString('hex').toUpperCase();
    return `${encoded.slice(0, 5)}-${encoded.slice(5, 10)}-${encoded.slice(10, 15)}-${encoded.slice(15)}`;
  });
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

export function userRole(value: string): UserRole {
  if (value === 'PATIENT' || value === 'DOCTOR' || value === 'ADMIN') {
    return value;
  }
  throw new Error('Unsupported user role.');
}
