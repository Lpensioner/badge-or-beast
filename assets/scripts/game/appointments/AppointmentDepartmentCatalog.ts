import type { AppointmentDepartmentKey } from './AppointmentTypes';

export interface AppointmentDepartmentProfile {
  readonly departmentKey: AppointmentDepartmentKey;
  readonly displayName: string;
  readonly spokenDisplayName: string;
  readonly phoneNumber: string;
}

const DEPARTMENT_PHONE_NUMBER_DIGITS = /^\d{4}$/;
const RESERVED_EMERGENCY_PHONE_NUMBER = '1214';
const OFFICIAL_APPOINTMENT_DEPARTMENT_KEYS: readonly AppointmentDepartmentKey[] = ['research', 'production', 'sales'];

const APPOINTMENT_DEPARTMENT_PROFILES: readonly AppointmentDepartmentProfile[] = Object.freeze([
  Object.freeze({
    departmentKey: 'research',
    displayName: 'RESEARCH DEPARTMENT',
    spokenDisplayName: 'Research Department',
    phoneNumber: '9527',
  }),
  Object.freeze({
    departmentKey: 'production',
    displayName: 'PRODUCTION DEPARTMENT',
    spokenDisplayName: 'Production Department',
    phoneNumber: '6842',
  }),
  Object.freeze({
    departmentKey: 'sales',
    displayName: 'SALES DEPARTMENT',
    spokenDisplayName: 'Sales Department',
    phoneNumber: '7716',
  }),
]);

const APPOINTMENT_DEPARTMENT_PROFILE_BY_KEY: Readonly<Record<AppointmentDepartmentKey, AppointmentDepartmentProfile>> = Object.freeze(
  APPOINTMENT_DEPARTMENT_PROFILES.reduce(
    (acc, definition) => {
      acc[definition.departmentKey] = definition;
      return acc;
    },
    {} as Record<AppointmentDepartmentKey, AppointmentDepartmentProfile>,
  ),
);

const APPOINTMENT_DEPARTMENT_PROFILE_BY_PHONE_NUMBER: ReadonlyMap<string, AppointmentDepartmentProfile> = new Map(
  APPOINTMENT_DEPARTMENT_PROFILES.map((profile) => [profile.phoneNumber, profile] as const),
);

function validateAppointmentDepartmentCatalog(): void {
  const keySet = new Set<AppointmentDepartmentKey>();
  const displayNameSet = new Set<string>();
  const phoneNumberSet = new Set<string>();
  for (const profile of APPOINTMENT_DEPARTMENT_PROFILES) {
    if (keySet.has(profile.departmentKey)) {
      throw new Error(`[AppointmentDepartmentCatalog] Duplicate department key: ${profile.departmentKey}`);
    }
    keySet.add(profile.departmentKey);

    const displayName = profile.displayName.trim();
    if (displayName.length === 0) {
      throw new Error(`[AppointmentDepartmentCatalog] Empty display name for key: ${profile.departmentKey}`);
    }
    if (displayNameSet.has(displayName)) {
      throw new Error(`[AppointmentDepartmentCatalog] Duplicate display name: ${displayName}`);
    }
    displayNameSet.add(displayName);

    const spokenDisplayName = profile.spokenDisplayName;
    const trimmedSpokenDisplayName = spokenDisplayName.trim();
    if (trimmedSpokenDisplayName.length === 0) {
      throw new Error(`[AppointmentDepartmentCatalog] Empty spoken display name for key: ${profile.departmentKey}`);
    }
    if (trimmedSpokenDisplayName !== spokenDisplayName) {
      throw new Error(
        `[AppointmentDepartmentCatalog] Spoken display name must not contain leading/trailing spaces for key: ${profile.departmentKey}`,
      );
    }
    if (spokenDisplayName.includes('\n') || spokenDisplayName.includes('\r')) {
      throw new Error(
        `[AppointmentDepartmentCatalog] Spoken display name must not contain line breaks for key: ${profile.departmentKey}`,
      );
    }

    const phoneNumber = profile.phoneNumber;
    const trimmedPhoneNumber = phoneNumber.trim();
    if (trimmedPhoneNumber.length === 0) {
      throw new Error(`[AppointmentDepartmentCatalog] Empty phone number for key: ${profile.departmentKey}`);
    }
    if (trimmedPhoneNumber !== phoneNumber) {
      throw new Error(
        `[AppointmentDepartmentCatalog] Phone number must not contain leading/trailing spaces for key: ${profile.departmentKey}`,
      );
    }
    if (phoneNumber.includes(' ')) {
      throw new Error(`[AppointmentDepartmentCatalog] Phone number must not contain spaces: ${phoneNumber}`);
    }
    if (phoneNumber.includes('-')) {
      throw new Error(`[AppointmentDepartmentCatalog] Phone number must not contain hyphens: ${phoneNumber}`);
    }
    if (spokenDisplayName === phoneNumber) {
      throw new Error(
        `[AppointmentDepartmentCatalog] Spoken display name must not match phone number for key: ${profile.departmentKey}`,
      );
    }
    if (/[A-Za-z]/.test(phoneNumber)) {
      throw new Error(`[AppointmentDepartmentCatalog] Phone number must not contain letters: ${phoneNumber}`);
    }
    if (!DEPARTMENT_PHONE_NUMBER_DIGITS.test(phoneNumber)) {
      throw new Error(
        `[AppointmentDepartmentCatalog] Phone number must be exactly 4 digits for key ${profile.departmentKey}: ${phoneNumber}`,
      );
    }
    if (phoneNumber === RESERVED_EMERGENCY_PHONE_NUMBER) {
      throw new Error(
        `[AppointmentDepartmentCatalog] Phone number ${RESERVED_EMERGENCY_PHONE_NUMBER} is reserved for emergency flow.`,
      );
    }
    if (phoneNumberSet.has(phoneNumber)) {
      throw new Error(`[AppointmentDepartmentCatalog] Duplicate department phone number: ${phoneNumber}`);
    }
    phoneNumberSet.add(phoneNumber);
  }

  if (APPOINTMENT_DEPARTMENT_PROFILES.length !== OFFICIAL_APPOINTMENT_DEPARTMENT_KEYS.length) {
    throw new Error(
      `[AppointmentDepartmentCatalog] Department profile count mismatch: expected ${OFFICIAL_APPOINTMENT_DEPARTMENT_KEYS.length}, got ${APPOINTMENT_DEPARTMENT_PROFILES.length}`,
    );
  }
  for (const expectedKey of OFFICIAL_APPOINTMENT_DEPARTMENT_KEYS) {
    if (!keySet.has(expectedKey)) {
      throw new Error(`[AppointmentDepartmentCatalog] Missing department key in catalog: ${expectedKey}`);
    }
  }
}

validateAppointmentDepartmentCatalog();

export function getAppointmentDepartmentProfile(
  departmentKey: AppointmentDepartmentKey,
): AppointmentDepartmentProfile | null {
  return APPOINTMENT_DEPARTMENT_PROFILE_BY_KEY[departmentKey] ?? null;
}

export function getAppointmentDepartmentByPhoneNumber(phoneNumber: string): AppointmentDepartmentProfile | null {
  return APPOINTMENT_DEPARTMENT_PROFILE_BY_PHONE_NUMBER.get(phoneNumber) ?? null;
}

export function getAppointmentDepartmentLabel(departmentKey: AppointmentDepartmentKey): string | null {
  return APPOINTMENT_DEPARTMENT_PROFILE_BY_KEY[departmentKey]?.displayName ?? null;
}

export function getAppointmentDepartmentSpokenDisplayName(departmentKey: AppointmentDepartmentKey): string | null {
  return APPOINTMENT_DEPARTMENT_PROFILE_BY_KEY[departmentKey]?.spokenDisplayName ?? null;
}
