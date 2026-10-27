import { describe, expect, it } from 'vitest';

import type { DoctorRepository } from '../../src/modules/doctors/doctor-repository.js';
import { DoctorService } from '../../src/modules/doctors/doctor-service.js';

function buildRepository(
  doctor: Awaited<ReturnType<DoctorRepository['findByUserId']>>,
): DoctorRepository {
  return {
    searchVerified: () => Promise.resolve([]),
    findVerifiedById: () => Promise.resolve(null),
    listAvailableSlots: () => Promise.resolve([]),
    findByUserId: () => Promise.resolve(doctor),
    createSlot: () =>
      Promise.resolve({
        id: '30000000-0000-4000-8000-000000000001',
        doctorId: '20000000-0000-4000-8000-000000000001',
        startTime: '2031-01-01T10:00:00.000Z',
        endTime: '2031-01-01T10:30:00.000Z',
        status: 'AVAILABLE',
      }),
    verifyDoctor: () => Promise.resolve(true),
    writeAudit: () => Promise.resolve(),
  };
}

describe('DoctorService', () => {
  it('rejects availability creation by an unverified doctor', async () => {
    const service = new DoctorService(
      buildRepository({
        id: '20000000-0000-4000-8000-000000000001',
        verificationStatus: 'PENDING',
      }),
    );

    await expect(
      service.createSlot(
        { userId: 'doctor-user', role: 'DOCTOR', scope: 'access', tokenId: 'token' },
        {
          startTime: '2031-01-01T10:00:00.000Z',
          endTime: '2031-01-01T10:30:00.000Z',
        },
        'request-id',
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects past or excessively long availability', async () => {
    const service = new DoctorService(
      buildRepository({
        id: '20000000-0000-4000-8000-000000000001',
        verificationStatus: 'VERIFIED',
      }),
    );
    const principal = {
      userId: 'doctor-user',
      role: 'DOCTOR' as const,
      scope: 'access' as const,
      tokenId: 'token',
    };

    await expect(
      service.createSlot(
        principal,
        {
          startTime: '2029-01-01T10:00:00.000Z',
          endTime: '2029-01-01T10:30:00.000Z',
        },
        'request-id',
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'SLOT_IN_PAST' });
    await expect(
      service.createSlot(
        principal,
        {
          startTime: '2031-01-01T10:00:00.000Z',
          endTime: '2031-01-01T15:00:01.000Z',
        },
        'request-id',
        new Date('2030-01-01T00:00:00.000Z'),
      ),
    ).rejects.toMatchObject({ code: 'SLOT_TOO_LONG' });
  });
});
