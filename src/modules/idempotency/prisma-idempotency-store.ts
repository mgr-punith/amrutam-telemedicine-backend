import { Prisma, type PrismaClient } from '@prisma/client';

import type { IdempotencyClaimResult, IdempotencyStore } from './idempotency-store.js';

export class PrismaIdempotencyStore implements IdempotencyStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async claim(
    input: Parameters<IdempotencyStore['claim']>[0],
  ): Promise<IdempotencyClaimResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.prisma.idempotencyKey.findUnique({
        where: { userId_key: { userId: input.userId, key: input.key } },
      });

      if (existing !== null) {
        if (existing.expiresAt <= input.now) {
          await this.prisma.idempotencyKey.deleteMany({
            where: { id: existing.id, expiresAt: { lte: input.now } },
          });
          continue;
        } else if (existing.requestHash !== input.requestHash) {
          return { kind: 'mismatch' };
        } else if (
          existing.status === 'COMPLETED' &&
          existing.responseStatus !== null &&
          existing.responseBody !== null
        ) {
          return {
            kind: 'replay',
            responseStatus: existing.responseStatus,
            responseBody: existing.responseBody,
          };
        } else {
          return { kind: 'in_progress' };
        }
      }

      try {
        await this.prisma.idempotencyKey.create({
          data: {
            userId: input.userId,
            key: input.key,
            method: input.method,
            path: input.path,
            requestHash: input.requestHash,
            lockedAt: input.now,
            expiresAt: input.expiresAt,
          },
        });
        return { kind: 'claimed' };
      } catch (error: unknown) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }
    return { kind: 'in_progress' };
  }

  public async complete(input: Parameters<IdempotencyStore['complete']>[0]): Promise<void> {
    const body = toJsonValue(input.responseBody);
    await this.prisma.idempotencyKey.updateMany({
      where: {
        userId: input.userId,
        key: input.key,
        requestHash: input.requestHash,
        status: 'IN_PROGRESS',
      },
      data: {
        status: 'COMPLETED',
        responseStatus: input.responseStatus,
        responseBody: body,
      },
    });
  }

  public async abandon(input: Parameters<IdempotencyStore['abandon']>[0]): Promise<void> {
    await this.prisma.idempotencyKey.deleteMany({
      where: {
        userId: input.userId,
        key: input.key,
        requestHash: input.requestHash,
        status: 'IN_PROGRESS',
      },
    });
  }
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
