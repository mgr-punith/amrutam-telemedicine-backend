import { PrismaClient, UserRole } from '@prisma/client';

import { FieldEncryption } from '../src/infra/crypto/field-encryption.js';
import { PasswordHasher } from '../src/infra/crypto/password-hasher.js';
import { loadSecurityEnvironment } from '../src/config/security-environment.js';

const prisma = new PrismaClient();

const DEMO_USERS = {
  patient: {
    id: '10000000-0000-4000-8000-000000000001',
    email: 'patient@amrutam.local',
    fullName: 'Demo Patient',
    role: UserRole.PATIENT,
  },
  doctor: {
    id: '10000000-0000-4000-8000-000000000002',
    doctorId: '20000000-0000-4000-8000-000000000002',
    email: 'doctor@amrutam.local',
    fullName: 'Dr Demo Vaidya',
    role: UserRole.DOCTOR,
  },
  admin: {
    id: '10000000-0000-4000-8000-000000000003',
    email: 'admin@amrutam.local',
    fullName: 'Demo Administrator',
    role: UserRole.ADMIN,
  },
} as const;

async function main(): Promise<void> {
  const security = loadSecurityEnvironment();
  const demoPassword = requireEnvironment('AMRUTAM_DEMO_PASSWORD');
  const demoMfaSecret = requireEnvironment('AMRUTAM_DEMO_MFA_SECRET');
  const passwordHash = await new PasswordHasher().hash(demoPassword);
  const encryption = new FieldEncryption(
    security.encryptionKeys,
    security.activeEncryptionKeyVersion,
  );

  await prisma.$transaction(async (transaction) => {
    for (const user of Object.values(DEMO_USERS)) {
      const requiresMfa = user.role !== UserRole.PATIENT;
      const encryptedMfaSecret = requiresMfa ? encryption.encrypt(demoMfaSecret) : null;
      await transaction.user.upsert({
        where: { id: user.id },
        create: {
          id: user.id,
          email: user.email,
          passwordHash,
          role: user.role,
          mfaEnabled: requiresMfa,
          mfaSecretEnc: encryptedMfaSecret?.ciphertext ?? null,
          mfaSecretKeyVersion: encryptedMfaSecret?.keyVersion ?? null,
        },
        update: {
          email: user.email,
          passwordHash,
          role: user.role,
          status: 'ACTIVE',
          mfaEnabled: requiresMfa,
          mfaSecretEnc: encryptedMfaSecret?.ciphertext ?? null,
          mfaSecretKeyVersion: encryptedMfaSecret?.keyVersion ?? null,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      const encryptedPhone = encryption.encrypt(
        user.role === UserRole.PATIENT ? '+919000000001' : '+919000000002',
      );
      const encryptedDob = encryption.encrypt(
        user.role === UserRole.PATIENT ? '1990-01-15' : '1984-06-10',
      );
      await transaction.profile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          fullName: user.fullName,
          phoneEnc: encryptedPhone.ciphertext,
          dobEnc: encryptedDob.ciphertext,
          encKeyVersion: encryptedPhone.keyVersion,
          city: 'Bengaluru',
          languages: ['English', 'Hindi'],
        },
        update: {
          fullName: user.fullName,
          phoneEnc: encryptedPhone.ciphertext,
          dobEnc: encryptedDob.ciphertext,
          encKeyVersion: encryptedPhone.keyVersion,
          city: 'Bengaluru',
          languages: ['English', 'Hindi'],
        },
      });
    }

    await transaction.doctor.upsert({
      where: { id: DEMO_USERS.doctor.doctorId },
      create: {
        id: DEMO_USERS.doctor.doctorId,
        userId: DEMO_USERS.doctor.id,
        specialization: 'Ayurvedic Medicine',
        qualifications: ['BAMS', 'MD Ayurveda'],
        experienceYears: 12,
        licenseNumber: 'DEMO-KA-AYU-0001',
        consultationFeeMinor: 75000,
        city: 'Bengaluru',
        languages: ['English', 'Hindi', 'Kannada'],
        verificationStatus: 'VERIFIED',
      },
      update: {
        specialization: 'Ayurvedic Medicine',
        qualifications: ['BAMS', 'MD Ayurveda'],
        experienceYears: 12,
        consultationFeeMinor: 75000,
        city: 'Bengaluru',
        languages: ['English', 'Hindi', 'Kannada'],
        verificationStatus: 'VERIFIED',
      },
    });

    for (const startTime of demoSlotStarts()) {
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1_000);
      await transaction.availabilitySlot.upsert({
        where: {
          doctorId_startTime: {
            doctorId: DEMO_USERS.doctor.doctorId,
            startTime,
          },
        },
        create: {
          doctorId: DEMO_USERS.doctor.doctorId,
          startTime,
          endTime,
        },
        update: { endTime },
      });
    }
  });
}

function requireEnvironment(name: 'AMRUTAM_DEMO_PASSWORD' | 'AMRUTAM_DEMO_MFA_SECRET'): string {
  const value =
    name === 'AMRUTAM_DEMO_PASSWORD'
      ? process.env.AMRUTAM_DEMO_PASSWORD
      : process.env.AMRUTAM_DEMO_MFA_SECRET;
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required to seed demo identities.`);
  }
  return value;
}

function demoSlotStarts(): readonly Date[] {
  return [
    new Date('2030-01-15T04:30:00.000Z'),
    new Date('2030-01-15T05:30:00.000Z'),
    new Date('2030-01-15T06:30:00.000Z'),
  ];
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error: unknown) => {
    process.stderr.write(
      `Database seed failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
    );
    await prisma.$disconnect();
    process.exitCode = 1;
  });
