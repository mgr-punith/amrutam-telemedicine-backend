CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');
CREATE TYPE "DoctorVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "SlotStatus" AS ENUM ('AVAILABLE', 'HELD', 'BOOKED', 'CANCELLED');
CREATE TYPE "ConsultationStatus" AS ENUM (
  'PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'NO_SHOW'
);
CREATE TYPE "ConsultationMode" AS ENUM ('VIDEO', 'AUDIO', 'CHAT');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED', 'REFUNDED');
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role "UserRole" NOT NULL,
  status "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  mfa_enabled boolean NOT NULL DEFAULT false,
  mfa_secret_enc text,
  mfa_secret_key_version text,
  mfa_recovery_codes_hash text[] NOT NULL DEFAULT '{}',
  failed_login_count integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_mfa_secret_key_pair CHECK (
    (mfa_secret_enc IS NULL) = (mfa_secret_key_version IS NULL)
    AND (NOT mfa_enabled OR mfa_secret_enc IS NOT NULL)
  )
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone_enc text,
  dob_enc text,
  gender "Gender",
  city text,
  languages text[] NOT NULL DEFAULT '{}',
  enc_key_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_encrypted_fields_key CHECK (
    (phone_enc IS NULL AND dob_enc IS NULL AND enc_key_version IS NULL)
    OR (enc_key_version IS NOT NULL AND (phone_enc IS NOT NULL OR dob_enc IS NOT NULL))
  )
);

CREATE TABLE doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialization text NOT NULL,
  qualifications text[] NOT NULL DEFAULT '{}',
  experience_years integer NOT NULL CHECK (experience_years >= 0),
  license_number text NOT NULL UNIQUE,
  consultation_fee_minor integer NOT NULL CHECK (consultation_fee_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'INR',
  city text NOT NULL,
  languages text[] NOT NULL DEFAULT '{}',
  rating_avg numeric(3, 2) NOT NULL DEFAULT 0 CHECK (rating_avg BETWEEN 0 AND 5),
  rating_count integer NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  verification_status "DoctorVerificationStatus" NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  status "SlotStatus" NOT NULL DEFAULT 'AVAILABLE',
  held_until timestamptz,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_slots_valid_range CHECK (end_time > start_time),
  CONSTRAINT availability_slots_doctor_start_key UNIQUE (doctor_id, start_time),
  CONSTRAINT availability_slots_no_overlap EXCLUDE USING gist (
    doctor_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  ) WHERE (status <> 'CANCELLED')
);

CREATE TABLE consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES users(id),
  doctor_id uuid NOT NULL REFERENCES doctors(id),
  slot_id uuid NOT NULL REFERENCES availability_slots(id),
  status "ConsultationStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
  mode "ConsultationMode" NOT NULL,
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  cancel_reason text,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES doctors(id),
  patient_id uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL CHECK (version > 0),
  content_enc text NOT NULL,
  enc_key_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prescriptions_consultation_version_key UNIQUE (consultation_id, version)
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL UNIQUE REFERENCES consultations(id) ON DELETE CASCADE,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  currency char(3) NOT NULL,
  status "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  provider text NOT NULL,
  provider_ref text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role "UserRole",
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  request_id text NOT NULL,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  replaced_by uuid UNIQUE REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL,
  method text NOT NULL,
  path text NOT NULL,
  request_hash text NOT NULL,
  status "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  response_status integer,
  response_body jsonb,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT idempotency_keys_user_key_key UNIQUE (user_id, key)
);

CREATE TABLE webhook_events (
  provider_event_id text PRIMARY KEY,
  payload_hash text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_city_idx ON profiles(city);
CREATE INDEX doctors_filter_idx ON doctors(verification_status, city, specialization);
CREATE INDEX doctors_specialization_trgm_idx ON doctors USING gin(specialization gin_trgm_ops);
CREATE INDEX availability_slots_browse_idx ON availability_slots(doctor_id, status, start_time);
CREATE INDEX consultations_patient_schedule_idx ON consultations(patient_id, scheduled_at DESC);
CREATE INDEX consultations_doctor_schedule_idx ON consultations(doctor_id, scheduled_at DESC);
CREATE INDEX consultations_status_schedule_idx ON consultations(status, scheduled_at);
CREATE UNIQUE INDEX consultations_active_slot_key ON consultations(slot_id)
  WHERE status IN ('PENDING_PAYMENT', 'CONFIRMED', 'IN_PROGRESS');
CREATE INDEX prescriptions_patient_created_idx ON prescriptions(patient_id, created_at DESC);
CREATE INDEX payments_status_created_idx ON payments(status, created_at);
CREATE INDEX audit_logs_resource_idx ON audit_logs(resource_type, resource_id, created_at);
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id, created_at);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens(user_id, family_id);
CREATE INDEX refresh_tokens_expiry_idx ON refresh_tokens(expires_at);
CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys(expires_at);
