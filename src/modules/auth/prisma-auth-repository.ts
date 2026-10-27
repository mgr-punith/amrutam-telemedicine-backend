import { Prisma, type PrismaClient } from '@prisma/client';

import {
  DuplicateEmailError,
  type AuthRepository,
  type CreatePatientRecord,
  type NewRefreshTokenRecord,
  type RefreshRotationResult,
} from './auth-repository.js';
import type { AuditEvent, AuthUser } from './auth-types.js';

type PrismaTransaction = Prisma.TransactionClient;

const authUserSelect = {
  id: true,
  email: true,
  passwordHash: true,
  role: true,
  status: true,
  mfaEnabled: true,
  mfaSecretEnc: true,
  mfaSecretKeyVersion: true,
  mfaRecoveryCodesHash: true,
  failedLoginCount: true,
  lockedUntil: true,
} satisfies Prisma.UserSelect;

export class PrismaAuthRepository implements AuthRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async findUserByEmail(email: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({ where: { email }, select: authUserSelect });
  }

  public async findUserById(userId: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({ where: { id: userId }, select: authUserSelect });
  }

  public async createPatient(record: CreatePatientRecord): Promise<AuthUser> {
    try {
      return await this.prisma.user.create({
        data: {
          email: record.email,
          passwordHash: record.passwordHash,
          role: 'PATIENT',
          profile: {
            create: {
              fullName: record.fullName,
              phoneEnc: record.phoneEnc,
              dobEnc: record.dobEnc,
              encKeyVersion: record.encKeyVersion,
              city: record.city,
              languages: [...record.languages],
            },
          },
        },
        select: authUserSelect,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }

  public async recordFailedLogin(userId: string, lockedUntil: Date | null): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: { increment: 1 },
        ...(lockedUntil === null ? {} : { status: 'LOCKED', lockedUntil }),
      },
    });
  }

  public async clearFailedLogins(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, status: 'ACTIVE' },
    });
  }

  public async saveMfaEnrollment(
    userId: string,
    encryptedSecret: string,
    keyVersion: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecretEnc: encryptedSecret,
        mfaSecretKeyVersion: keyVersion,
        mfaRecoveryCodesHash: [],
      },
    });
  }

  public async activateMfa(userId: string, recoveryCodeHashes: readonly string[]): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true, mfaRecoveryCodesHash: [...recoveryCodeHashes] },
    });
  }

  public async consumeRecoveryCode(
    userId: string,
    expectedHashes: readonly string[],
    remainingHashes: readonly string[],
  ): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, mfaRecoveryCodesHash: { equals: [...expectedHashes] } },
      data: { mfaRecoveryCodesHash: [...remainingHashes] },
    });
    return result.count === 1;
  }

  public async createRefreshToken(record: NewRefreshTokenRecord): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        id: record.id,
        userId: record.userId,
        tokenHash: record.tokenHash,
        familyId: record.familyId,
        expiresAt: record.expiresAt,
      },
    });
  }

  public async rotateRefreshToken(
    currentTokenHash: string,
    replacementId: string,
    replacementTokenHash: string,
    replacementExpiresAt: Date,
    now: Date,
  ): Promise<RefreshRotationResult> {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.refreshToken.findUnique({
        where: { tokenHash: currentTokenHash },
        include: { user: { select: authUserSelect } },
      });
      if (current === null || current.expiresAt <= now || current.user.status !== 'ACTIVE') {
        return { kind: 'invalid' };
      }

      if (current.revokedAt !== null || current.replacedBy !== null) {
        await revokeTokenFamily(transaction, current.userId, current.familyId, now);
        return { kind: 'reused' };
      }

      const claimed = await transaction.refreshToken.updateMany({
        where: {
          id: current.id,
          revokedAt: null,
          replacedBy: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) {
        await revokeTokenFamily(transaction, current.userId, current.familyId, now);
        return { kind: 'reused' };
      }

      await transaction.refreshToken.create({
        data: {
          id: replacementId,
          userId: current.userId,
          tokenHash: replacementTokenHash,
          familyId: current.familyId,
          expiresAt: replacementExpiresAt,
        },
      });
      await transaction.refreshToken.update({
        where: { id: current.id },
        data: { replacedBy: replacementId },
      });
      return { kind: 'rotated', user: current.user };
    });
  }

  public async revokeRefreshToken(userId: string, tokenHash: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  public async writeAudit(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: event.actorId,
        actorRole: event.actorRole,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        requestId: event.requestId,
        metadata: event.metadata ?? {},
      },
    });
  }
}

async function revokeTokenFamily(
  transaction: PrismaTransaction,
  userId: string,
  familyId: string,
  now: Date,
): Promise<void> {
  await transaction.refreshToken.updateMany({
    where: { userId, familyId, revokedAt: null },
    data: { revokedAt: now },
  });
}
