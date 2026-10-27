import { describe, expect, it, vi } from 'vitest';

import { FieldEncryption } from '../../src/infra/crypto/field-encryption.js';
import type { AuthenticatedPrincipal } from '../../src/modules/auth/auth-types.js';
import type { PrescriptionRepository } from '../../src/modules/prescriptions/prescription-repository.js';
import { PrescriptionService } from '../../src/modules/prescriptions/prescription-service.js';

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
const consultationId = '30000000-0000-4000-8000-000000000001';

describe('PrescriptionService', () => {
  it('encrypts content before storage and omits plaintext from the create response', async () => {
    const encryption = new FieldEncryption(new Map([['v1', Buffer.alloc(32, 7)]]), 'v1');
    let storedCiphertext = '';
    const repository = createRepository();
    repository.createVersion.mockImplementation((input) => {
      storedCiphertext = input.contentEnc;
      return Promise.resolve({
        id: '60000000-0000-4000-8000-000000000001',
        consultationId,
        version: 1,
        contentEnc: input.contentEnc,
        encKeyVersion: input.encKeyVersion,
        createdAt: new Date('2031-01-01T10:30:00.000Z'),
      });
    });
    const service = new PrescriptionService(repository, encryption);

    const result = await service.create(
      doctor,
      consultationId,
      { content: 'Take medicine twice daily.' },
      'request-1',
    );
    expect(storedCiphertext).not.toContain('Take medicine twice daily.');
    expect(result).not.toHaveProperty('content');
    expect(encryption.decrypt({ ciphertext: storedCiphertext, keyVersion: 'v1' })).toBe(
      'Take medicine twice daily.',
    );
  });

  it('decrypts only for the patient or assigned doctor and denies administrators', async () => {
    const encryption = new FieldEncryption(new Map([['v1', Buffer.alloc(32, 7)]]), 'v1');
    const encrypted = encryption.encrypt('Confidential prescription');
    const repository = createRepository();
    repository.listWithAudit.mockResolvedValue([
      {
        id: '60000000-0000-4000-8000-000000000001',
        consultationId,
        version: 1,
        contentEnc: encrypted.ciphertext,
        encKeyVersion: encrypted.keyVersion,
        createdAt: new Date('2031-01-01T10:30:00.000Z'),
      },
    ]);
    const service = new PrescriptionService(repository, encryption);

    await expect(service.list(patient, consultationId, 'request-2')).resolves.toEqual({
      prescriptions: [expect.objectContaining({ content: 'Confidential prescription' })],
    });
    await expect(service.list(admin, consultationId, 'request-3')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects prescription creation until consultation completion', async () => {
    const repository = createRepository();
    repository.findConsultation.mockResolvedValue({
      id: consultationId,
      patientId: patient.userId,
      doctorId: '20000000-0000-4000-8000-000000000002',
      doctorUserId: doctor.userId,
      status: 'IN_PROGRESS',
    });
    const service = new PrescriptionService(
      repository,
      new FieldEncryption(new Map([['v1', Buffer.alloc(32, 7)]]), 'v1'),
    );

    await expect(
      service.create(doctor, consultationId, { content: 'Too early' }, 'request-4'),
    ).rejects.toMatchObject({ code: 'CONSULTATION_NOT_COMPLETED' });
    expect(repository.createVersion).not.toHaveBeenCalled();
  });
});

function createRepository() {
  return {
    findConsultation: vi.fn<PrescriptionRepository['findConsultation']>().mockResolvedValue({
      id: consultationId,
      patientId: patient.userId,
      doctorId: '20000000-0000-4000-8000-000000000002',
      doctorUserId: doctor.userId,
      status: 'COMPLETED',
    }),
    createVersion: vi.fn<PrescriptionRepository['createVersion']>(),
    listWithAudit: vi.fn<PrescriptionRepository['listWithAudit']>().mockResolvedValue([]),
  };
}
