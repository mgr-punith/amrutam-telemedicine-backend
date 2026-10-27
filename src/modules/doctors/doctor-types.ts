export interface DoctorSummary {
  readonly id: string;
  readonly fullName: string;
  readonly specialization: string;
  readonly experienceYears: number;
  readonly consultationFeeMinor: number;
  readonly currency: string;
  readonly city: string;
  readonly languages: readonly string[];
  readonly ratingAvg: number;
  readonly ratingCount: number;
  readonly verificationStatus: 'VERIFIED';
}

export interface DoctorDetail extends DoctorSummary {
  readonly qualifications: readonly string[];
}

export interface AvailabilitySlotView {
  readonly id: string;
  readonly doctorId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly status: 'AVAILABLE';
}
