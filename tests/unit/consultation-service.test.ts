import { describe, expect, it, vi } from 'vitest';

import type { AuthenticatedPrincipal } from '../../src/modules/auth/auth-types.js';
import type { ConsultationRepository } from '../../src/modules/consultations/consultation-repository.js';
import { ConsultationService } from '../../src/modules/consultations/consultation-service.js';
import type {
  ConsultationAccessRecord,
  ConsultationView,
} from '../../src/modules/consultations/consultation-types.js';

const patient: AuthenticatedPrincipal = {
  userId: '10000000-0000-4000-8000-000000000001',
  role: 'PATIENT',
  scope: 'access',
  tokenId: 'patient-token',
};
const doctor: AuthenticatedPrincipal = {
  userId: '10000000-0000-4000-8000-000000000002',
  role: 'DOCTOR',
  scope: 'access',
  tokenId: 'doctor-token',
};
const admin: AuthenticatedPrincipal = {
  userId: '10000000-0000-4000-8000-000000000003',
  role: 'ADMIN',
  scope: 'access',
  tokenId: 'admin-token',
};

describe('ConsultationService', () => {
  it('allows only the assigned doctor to start and complete valid states', async () => {
    const repository = createRepository();
    const service = new ConsultationService(repository);

    await expect(service.start(patient, consultation.id, 'request-1')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.start(doctor, consultation.id, 'request-2')).resolves.toMatchObject({
      status: 'IN_PROGRESS',
    });
    expect(repository.transition).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedStatus: 'CONFIRMED',
        nextStatus: 'IN_PROGRESS',
        actorId: doctor.userId,
      }),
    );

    repository.findForAccess.mockResolvedValue({ ...consultation, status: 'IN_PROGRESS' });
    repository.transition.mockResolvedValue({ ...consultationView, status: 'COMPLETED' });
    await expect(service.complete(doctor, consultation.id, 'request-3')).resolves.toMatchObject({
      status: 'COMPLETED',
    });
  });

  it('denies admins and unrelated users before returning consultation data', async () => {
    const repository = createRepository();
    const service = new ConsultationService(repository);
    const outsider = { ...patient, userId: '10000000-0000-4000-8000-000000000009' };

    await expect(service.get(admin, consultation.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.get(outsider, consultation.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(repository.findView).not.toHaveBeenCalled();
  });

  it('passes a bounded cancellation reason and actor role to compensation storage', async () => {
    const repository = createRepository();
    const service = new ConsultationService(repository);

    await expect(
      service.cancel(patient, consultation.id, { reason: 'PATIENT_REQUEST' }, 'request-4'),
    ).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(repository.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: patient.userId,
        actorRole: 'PATIENT',
        reason: 'PATIENT_REQUEST',
      }),
    );
  });
});

const consultation: ConsultationAccessRecord = {
  id: '30000000-0000-4000-8000-000000000001',
  patientId: patient.userId,
  doctorId: '20000000-0000-4000-8000-000000000002',
  doctorUserId: doctor.userId,
  status: 'CONFIRMED',
};

const consultationView: ConsultationView = {
  ...consultation,
  slotId: '40000000-0000-4000-8000-000000000001',
  mode: 'VIDEO',
  scheduledAt: '2031-01-01T10:00:00.000Z',
  startedAt: null,
  endedAt: null,
  cancelReason: null,
  version: 1,
  payment: {
    id: '50000000-0000-4000-8000-000000000001',
    amountMinor: 75000,
    currency: 'INR',
    status: 'SUCCEEDED',
  },
};

function createRepository() {
  return {
    findForAccess: vi.fn<ConsultationRepository['findForAccess']>().mockResolvedValue(consultation),
    findView: vi.fn<ConsultationRepository['findView']>().mockResolvedValue(consultationView),
    transition: vi
      .fn<ConsultationRepository['transition']>()
      .mockResolvedValue({ ...consultationView, status: 'IN_PROGRESS' }),
    cancel: vi.fn<ConsultationRepository['cancel']>().mockResolvedValue({
      ...consultationView,
      status: 'CANCELLED',
      cancelReason: 'PATIENT_REQUEST',
    }),
  };
}
