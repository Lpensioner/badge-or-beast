import { getAppointmentDepartmentLabel } from './AppointmentDepartmentCatalog';
import { getAppointmentPurposeLabel } from './AppointmentPurposeCatalog';
import type { AppointmentDepartmentKey, AppointmentRosterDay, AppointmentRosterEntry } from './AppointmentTypes';
import type { AppointmentPurposeKey } from './AppointmentPurposeCatalog';
import { getVisitorProfile } from '../visitors/VisitorProfileCatalog';
import type { VisitorKey } from '../visitors/VisitorTypes';

const DAY4_INDEX = 4;
const DAY4_INSPECTION_DATE = '1999-12-06';
const DAY4_VISITOR_KEYS: readonly [VisitorKey, VisitorKey] = ['edward', 'nadia'];
const DEPARTMENT_POOL: readonly AppointmentDepartmentKey[] = ['research', 'production', 'sales'];
const PURPOSE_POOL: readonly AppointmentPurposeKey[] = [
  'project-consultation',
  'equipment-inspection',
  'confidential-document-delivery',
  'contract-review-authorization',
];

interface BuildDay4AppointmentRosterOptions {
  readonly random?: () => number;
}

export function buildDay4AppointmentRoster(options?: BuildDay4AppointmentRosterOptions): AppointmentRosterDay {
  const random = options?.random ?? Math.random;
  const [edwardDepartment, nadiaDepartment] = pickDistinctTwo(DEPARTMENT_POOL, random, 'department');
  const [edwardPurpose, nadiaPurpose] = pickDistinctTwo(PURPOSE_POOL, random, 'purpose');

  const entries: readonly AppointmentRosterEntry[] = Object.freeze([
    Object.freeze({
      appointmentId: 'day4-edward',
      visitorKey: DAY4_VISITOR_KEYS[0],
      inspectionDate: DAY4_INSPECTION_DATE,
      targetDepartmentKey: edwardDepartment,
      purposeKey: edwardPurpose,
      listed: true,
    }),
    Object.freeze({
      appointmentId: 'day4-nadia',
      visitorKey: DAY4_VISITOR_KEYS[1],
      inspectionDate: DAY4_INSPECTION_DATE,
      targetDepartmentKey: nadiaDepartment,
      purposeKey: nadiaPurpose,
      listed: true,
    }),
  ]);

  const roster = Object.freeze({
    dayIndex: DAY4_INDEX,
    inspectionDate: DAY4_INSPECTION_DATE,
    entries,
  }) as AppointmentRosterDay;

  validateDay4Roster(roster);
  return roster;
}

function pickDistinctTwo<T>(pool: readonly T[], random: () => number, label: string): readonly [T, T] {
  if (pool.length < 2) {
    throw new Error(`[AppointmentRosterGenerator] ${label} pool requires at least two entries.`);
  }
  const values = [...pool];
  shuffleInPlace(values, random);
  const first = values[0];
  const second = values[1];
  if (first === undefined || second === undefined) {
    throw new Error(`[AppointmentRosterGenerator] Failed to draw two ${label} values.`);
  }
  return [first, second] as const;
}

function shuffleInPlace<T>(values: T[], random: () => number): void {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const randomValue = nextRandomValue(random);
    const swapIndex = Math.floor(randomValue * (i + 1));
    const current = values[i];
    values[i] = values[swapIndex] as T;
    values[swapIndex] = current as T;
  }
}

function nextRandomValue(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || Number.isNaN(value) || value < 0 || value >= 1) {
    throw new Error(`[AppointmentRosterGenerator] Invalid random() value: ${String(value)}. Expected 0 <= value < 1.`);
  }
  return value;
}

function validateDay4Roster(roster: AppointmentRosterDay): void {
  if (roster.dayIndex !== DAY4_INDEX) {
    throw new Error(`[AppointmentRosterGenerator] Invalid dayIndex: ${roster.dayIndex}`);
  }
  if (roster.inspectionDate !== DAY4_INSPECTION_DATE) {
    throw new Error(`[AppointmentRosterGenerator] Invalid inspectionDate: ${roster.inspectionDate}`);
  }
  if (roster.entries.length !== 2) {
    throw new Error(`[AppointmentRosterGenerator] Invalid entry count: ${roster.entries.length}`);
  }

  const appointmentIds = new Set<string>();
  const visitorKeys = new Set<VisitorKey>();
  const departmentKeys = new Set<AppointmentDepartmentKey>();
  const purposeKeys = new Set<AppointmentPurposeKey>();

  for (const entry of roster.entries) {
    if (entry.appointmentId.trim().length === 0) {
      throw new Error('[AppointmentRosterGenerator] appointmentId must be non-empty.');
    }
    if (entry.inspectionDate.trim().length === 0) {
      throw new Error('[AppointmentRosterGenerator] inspectionDate must be non-empty.');
    }
    if (!entry.listed) {
      throw new Error(`[AppointmentRosterGenerator] listed must be true for ${entry.appointmentId}.`);
    }
    if (appointmentIds.has(entry.appointmentId)) {
      throw new Error(`[AppointmentRosterGenerator] Duplicate appointmentId: ${entry.appointmentId}`);
    }
    appointmentIds.add(entry.appointmentId);
    visitorKeys.add(entry.visitorKey);
    departmentKeys.add(entry.targetDepartmentKey);
    purposeKeys.add(entry.purposeKey);

    if (!getVisitorProfile(entry.visitorKey)) {
      throw new Error(`[AppointmentRosterGenerator] Unknown visitorKey: ${entry.visitorKey}`);
    }
    if (!getAppointmentDepartmentLabel(entry.targetDepartmentKey)) {
      throw new Error(`[AppointmentRosterGenerator] Unknown departmentKey: ${entry.targetDepartmentKey}`);
    }
    if (!getAppointmentPurposeLabel(entry.purposeKey)) {
      throw new Error(`[AppointmentRosterGenerator] Unknown purposeKey: ${entry.purposeKey}`);
    }
  }

  if (!visitorKeys.has('edward') || !visitorKeys.has('nadia') || visitorKeys.size !== 2) {
    throw new Error('[AppointmentRosterGenerator] Visitor set must contain only edward and nadia.');
  }
  if (departmentKeys.size !== 2) {
    throw new Error('[AppointmentRosterGenerator] Edward and Nadia must have different departments.');
  }
  if (purposeKeys.size !== 2) {
    throw new Error('[AppointmentRosterGenerator] Edward and Nadia must have different purposes.');
  }
}
