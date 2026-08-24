export type AppointmentPurposeKey =
  | 'project-consultation'
  | 'equipment-inspection'
  | 'confidential-document-delivery'
  | 'contract-review-authorization';

interface AppointmentPurposeDefinition {
  readonly key: AppointmentPurposeKey;
  readonly displayName: string;
  readonly spokenVisitReason: string;
}

const APPOINTMENT_PURPOSE_DEFINITIONS: readonly AppointmentPurposeDefinition[] = Object.freeze([
  Object.freeze({
    key: 'project-consultation',
    displayName: 'PROJECT CONSULTATION',
    spokenVisitReason: 'a project consultation',
  }),
  Object.freeze({
    key: 'equipment-inspection',
    displayName: 'EQUIPMENT INSPECTION',
    spokenVisitReason: 'an equipment inspection',
  }),
  Object.freeze({
    key: 'confidential-document-delivery',
    displayName: 'CONFIDENTIAL DOC DELIVERY',
    spokenVisitReason: 'delivery of confidential documents',
  }),
  Object.freeze({
    key: 'contract-review-authorization',
    displayName: 'CONTRACT REVIEW AUTHORIZATION',
    spokenVisitReason: 'contract review and authorization',
  }),
]);

const APPOINTMENT_PURPOSE_LABEL_BY_KEY: Readonly<Record<AppointmentPurposeKey, string>> = Object.freeze(
  APPOINTMENT_PURPOSE_DEFINITIONS.reduce(
    (acc, definition) => {
      acc[definition.key] = definition.displayName;
      return acc;
    },
    {} as Record<AppointmentPurposeKey, string>,
  ),
);

const APPOINTMENT_PURPOSE_SPOKEN_VISIT_REASON_BY_KEY: Readonly<Record<AppointmentPurposeKey, string>> = Object.freeze(
  APPOINTMENT_PURPOSE_DEFINITIONS.reduce(
    (acc, definition) => {
      acc[definition.key] = definition.spokenVisitReason;
      return acc;
    },
    {} as Record<AppointmentPurposeKey, string>,
  ),
);

function validateAppointmentPurposeCatalog(): void {
  const keySet = new Set<AppointmentPurposeKey>();
  const displayNameSet = new Set<string>();
  for (const definition of APPOINTMENT_PURPOSE_DEFINITIONS) {
    if (keySet.has(definition.key)) {
      throw new Error(`[AppointmentPurposeCatalog] Duplicate purpose key: ${definition.key}`);
    }
    keySet.add(definition.key);

    const displayName = definition.displayName.trim();
    if (displayName.length === 0) {
      throw new Error(`[AppointmentPurposeCatalog] Empty display name for key: ${definition.key}`);
    }
    if (displayNameSet.has(displayName)) {
      throw new Error(`[AppointmentPurposeCatalog] Duplicate display name: ${displayName}`);
    }
    displayNameSet.add(displayName);

    const spokenVisitReason = definition.spokenVisitReason;
    const trimmedSpokenVisitReason = spokenVisitReason.trim();
    if (trimmedSpokenVisitReason.length === 0) {
      throw new Error(`[AppointmentPurposeCatalog] Empty spoken visit reason for key: ${definition.key}`);
    }
    if (trimmedSpokenVisitReason !== spokenVisitReason) {
      throw new Error(
        `[AppointmentPurposeCatalog] Spoken visit reason must not contain leading/trailing spaces for key: ${definition.key}`,
      );
    }
    if (spokenVisitReason.includes('\n') || spokenVisitReason.includes('\r')) {
      throw new Error(`[AppointmentPurposeCatalog] Spoken visit reason must not contain line breaks: ${definition.key}`);
    }
    if (trimmedSpokenVisitReason.endsWith('.')) {
      throw new Error(`[AppointmentPurposeCatalog] Spoken visit reason must not end with period: ${definition.key}`);
    }
  }
}

validateAppointmentPurposeCatalog();

export function getAppointmentPurposeLabel(purposeKey: AppointmentPurposeKey): string | null {
  return APPOINTMENT_PURPOSE_LABEL_BY_KEY[purposeKey] ?? null;
}

export function getAppointmentPurposeSpokenVisitReason(purposeKey: AppointmentPurposeKey): string | null {
  return APPOINTMENT_PURPOSE_SPOKEN_VISIT_REASON_BY_KEY[purposeKey] ?? null;
}
