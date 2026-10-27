export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'LOCKED' | 'DISABLED';
export type TokenScope = 'access' | 'mfa';

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly role: UserRole;
  readonly scope: TokenScope;
  readonly tokenId: string;
}

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly mfaEnabled: boolean;
  readonly mfaSecretEnc: string | null;
  readonly mfaSecretKeyVersion: string | null;
  readonly mfaRecoveryCodesHash: readonly string[];
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

export interface SessionTokens {
  readonly accessToken: string;
  readonly accessTokenExpiresInSeconds: number;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt: string;
}

export interface AuditEvent {
  readonly actorId: string | null;
  readonly actorRole: UserRole | null;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly requestId: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean>>;
}
