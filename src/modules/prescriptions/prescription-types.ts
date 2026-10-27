import type { ConsultationAccessRecord } from '../consultations/consultation-types.js';

export type PrescriptionConsultation = ConsultationAccessRecord;

export interface EncryptedPrescription {
  readonly id: string;
  readonly consultationId: string;
  readonly version: number;
  readonly contentEnc: string;
  readonly encKeyVersion: string;
  readonly createdAt: Date;
}

export interface PrescriptionView {
  readonly id: string;
  readonly consultationId: string;
  readonly version: number;
  readonly content: string;
  readonly createdAt: string;
}

export type PrescriptionMetadata = Omit<PrescriptionView, 'content'>;
