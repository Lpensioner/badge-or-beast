import { getAppointmentDepartmentLabel } from './AppointmentDepartmentCatalog';
import { getAppointmentPurposeLabel } from './AppointmentPurposeCatalog';
import type {
  AppointmentArrivalStatus,
  AppointmentDepartmentKey,
  AppointmentRosterDay,
  AppointmentRosterEntry,
} from './AppointmentTypes';
import type { AppointmentPurposeKey } from './AppointmentPurposeCatalog';
import { getVisitorProfile } from '../visitors/VisitorProfileCatalog';
import type { VisitorKey } from '../visitors/VisitorTypes';

const DAY4_INDEX = 4;
const DAY4_INSPECTION_DATE = '1999-12-06';
const DAY4_VISITOR_KEYS: readonly [VisitorKey, VisitorKey] = ['edward', 'nadia'];
const DAY4_APPOINTMENT_ID_PATTERN = /^D4-\d{6}$/;
const APPOINTMENT_ID_GENERATION_MAX_ATTEMPTS = 128;
const APPOINTMENT_ID_NAMESPACE_SIZE = 1_000_000;
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

function generateArrivalStatus(random: () => number): AppointmentArrivalStatus {
  return nextRandomValue(random) < 0.5 ? 'arrived' : 'not_arrived';
}

export function buildDay4AppointmentRoster(options?: BuildDay4AppointmentRosterOptions): AppointmentRosterDay {
  const random = options?.random ?? Math.random;
  const [edwardDepartment, nadiaDepartment] = pickDistinctTwo(DEPARTMENT_POOL, random, 'department');
  const [edwardPurpose, nadiaPurpose] = pickDistinctTwo(PURPOSE_POOL, random, 'purpose');
  const [edwardAppointmentId, nadiaAppointmentId] = generateDistinctDay4AppointmentIds(random);
  const edwardArrivalStatus = generateArrivalStatus(random);
  const nadiaArrivalStatus = generateArrivalStatus(random);

  const entries: readonly AppointmentRosterEntry[] = Object.freeze([
    Object.freeze({
      appointmentId: edwardAppointmentId,
      visitorKey: DAY4_VISITOR_KEYS[0],
      inspectionDate: DAY4_INSPECTION_DATE,
      targetDepartmentKey: edwardDepartment,
      purposeKey: edwardPurpose,
      listed: true,
      arrivalStatus: edwardArrivalStatus,
    }),
    Object.freeze({
      appointmentId: nadiaAppointmentId,
      visitorKey: DAY4_VISITOR_KEYS[1],
      inspectionDate: DAY4_INSPECTION_DATE,
      targetDepartmentKey: nadiaDepartment,
      purposeKey: nadiaPurpose,
      listed: true,
      arrivalStatus: nadiaArrivalStatus,
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

function buildDay4AppointmentId(random: () => number): string {
  const normalizedRandom = nextRandomValue(random);
  const numericPart = Math.floor(normalizedRandom * APPOINTMENT_ID_NAMESPACE_SIZE);
  return `D4-${numericPart.toString().padStart(6, '0')}`;
}

function parseAppointmentNumericPart(appointmentId: string): number {
  const numericPartText = appointmentId.slice(3);
  const numericPart = Number.parseInt(numericPartText, 10);
  if (!Number.isInteger(numericPart) || numericPart < 0 || numericPart >= APPOINTMENT_ID_NAMESPACE_SIZE) {
    throw new Error(`[AppointmentRosterGenerator] Invalid appointmentId numeric part: ${appointmentId}`);
  }
  return numericPart;
}

function buildDeterministicUniqueDay4AppointmentId(startingNumericPart: number, usedIds: ReadonlySet<string>): string {
  for (let offset = 1; offset <= APPOINTMENT_ID_NAMESPACE_SIZE; offset += 1) {
    const candidateNumber = (startingNumericPart + offset) % APPOINTMENT_ID_NAMESPACE_SIZE;
    const candidate = `D4-${candidateNumber.toString().padStart(6, '0')}`;
    if (!usedIds.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('[AppointmentRosterGenerator] Day 4 appointment ID namespace exhausted.');
}

function generateDistinctDay4AppointmentIds(random: () => number): readonly [string, string] {
  const ids = new Set<string>();
  let attempts = 0;
  let lastNumericPart = 0;
  while (ids.size < 2 && attempts < APPOINTMENT_ID_GENERATION_MAX_ATTEMPTS) {
    const candidate = buildDay4AppointmentId(random);
    ids.add(candidate);
    lastNumericPart = parseAppointmentNumericPart(candidate);
    attempts += 1;
  }
  if (ids.size < 2) {
    ids.add(buildDeterministicUniqueDay4AppointmentId(lastNumericPart, ids));
  }
  const pair = [...ids];
  const first = pair[0];
  const second = pair[1];
  if (!first || !second) {
    throw new Error('[AppointmentRosterGenerator] Generated Day 4 appointment IDs are incomplete.');
  }
  return [first, second] as const;
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
    if (!DAY4_APPOINTMENT_ID_PATTERN.test(entry.appointmentId)) {
      throw new Error(
        `[AppointmentRosterGenerator] appointmentId must match D4-\\d{6} format: ${entry.appointmentId}`,
      );
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
