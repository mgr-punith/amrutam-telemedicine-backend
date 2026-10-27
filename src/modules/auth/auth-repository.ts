import type { AuditEvent, AuthUser, UserRole } from './auth-types.js';

export interface CreatePatientRecord {
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly phoneEnc: string;
  readonly dobEnc: string;
  readonly encKeyVersion: string;
  readonly city: string | null;
  readonly languages: readonly string[];
}

export interface NewRefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly familyId: string;
  readonly expiresAt: Date;
}

export type RefreshRotationResult =
  | { readonly kind: 'rotated'; readonly user: AuthUser }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'reused' };

export interface AuthRepository {
  findUserByEmail(email: string): Promise<AuthUser | null>;
  findUserById(userId: string): Promise<AuthUser | null>;
  createPatient(record: CreatePatientRecord): Promise<AuthUser>;
  recordFailedLogin(userId: string, lockedUntil: Date | null): Promise<void>;
  clearFailedLogins(userId: string): Promise<void>;
  saveMfaEnrollment(userId: string, encryptedSecret: string, keyVersion: string): Promise<void>;
  activateMfa(userId: string, recoveryCodeHashes: readonly string[]): Promise<void>;
  consumeRecoveryCode(
    userId: string,
    expectedHashes: readonly string[],
    remainingHashes: readonly string[],
  ): Promise<boolean>;
  createRefreshToken(record: NewRefreshTokenRecord): Promise<void>;
  rotateRefreshToken(
    currentTokenHash: string,
    replacementId: string,
    replacementTokenHash: string,
    replacementExpiresAt: Date,
    now: Date,
  ): Promise<RefreshRotationResult>;
  revokeRefreshToken(userId: string, tokenHash: string, now: Date): Promise<void>;
  writeAudit(event: AuditEvent): Promise<void>;
}

export class DuplicateEmailError extends Error {
  public constructor() {
    super('A user with this email already exists.');
    this.name = 'DuplicateEmailError';
  }
}

export function isPrivilegedRole(role: UserRole): boolean {
  return role === 'DOCTOR' || role === 'ADMIN';
}
