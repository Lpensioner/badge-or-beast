import type { AppointmentPurposeKey } from '../appointments/AppointmentPurposeCatalog';
import type {
  AppointmentDepartmentKey,
  AppointmentRosterDay,
  AppointmentRosterEntry,
} from '../appointments/AppointmentTypes';
import { buildDay4AppointmentRoster } from '../appointments/AppointmentRosterGenerator';
import type {
  VisitorCaseKind,
  VisitorClaim,
  VisitorInspectionRound,
  VisitorMismatchKind,
} from './VisitorRoundTypes';
import type { VisitorKey } from './VisitorTypes';
import { resolveVisitorInitialVisualKind } from './VisitorVisualResolver';

const DAY4_INDEX = 4;
const DAY4_VISITOR_KEYS: readonly [VisitorKey, VisitorKey] = ['edward', 'nadia'];
const DEPARTMENT_KEYS: readonly AppointmentDepartmentKey[] = ['research', 'production', 'sales'];
const PURPOSE_KEYS: readonly AppointmentPurposeKey[] = [
  'project-consultation',
  'equipment-inspection',
  'confidential-document-delivery',
  'contract-review-authorization',
];
const MONSTER_MISMATCH_POOL: readonly VisitorMismatchKind[] = ['appearance', 'department', 'purpose'];

export interface Day4VisitorSession {
  readonly dayIndex: 4;
  readonly inspectionDate: string;
  readonly rosterDay: AppointmentRosterDay;
  readonly rounds: readonly VisitorInspectionRound[];
}

interface BuildDay4VisitorSessionOptions {
  readonly random?: () => number;
}

function freezeRosterEntry(entry: AppointmentRosterEntry): AppointmentRosterEntry {
  return Object.freeze({
    appointmentId: entry.appointmentId,
    visitorKey: entry.visitorKey,
    inspectionDate: entry.inspectionDate,
    targetDepartmentKey: entry.targetDepartmentKey,
    purposeKey: entry.purposeKey,
    listed: entry.listed,
  });
}

function freezeRosterDay(roster: AppointmentRosterDay): AppointmentRosterDay {
  return Object.freeze({
    dayIndex: roster.dayIndex,
    inspectionDate: roster.inspectionDate,
    entries: Object.freeze(roster.entries.map((entry) => freezeRosterEntry(entry))),
  });
}

function nextRandomValue(random: () => number, label: string): number {
  const value = random();
  if (!Number.isFinite(value) || Number.isNaN(value) || value < 0 || value >= 1) {
    throw new Error(`[Day4VisitorSessionGenerator] Invalid random() value for ${label}: ${String(value)}`);
  }
  return value;
}

function shuffleInPlace<T>(values: T[], random: () => number, label: string): void {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandomValue(random, `${label}-shuffle`) * (i + 1));
    const current = values[i];
    values[i] = values[j] as T;
    values[j] = current as T;
  }
}

function pickFromList<T>(values: readonly T[], random: () => number, label: string): T {
  if (values.length === 0) {
    throw new Error(`[Day4VisitorSessionGenerator] Cannot pick ${label} from an empty list.`);
  }
  const index = Math.floor(nextRandomValue(random, label) * values.length);
  const picked = values[index];
  if (picked === undefined) {
    throw new Error(`[Day4VisitorSessionGenerator] Failed to pick ${label}.`);
  }
  return picked;
}

function pickDifferentDepartment(
  officialKey: AppointmentDepartmentKey,
  random: () => number,
): AppointmentDepartmentKey {
  const alternatives = DEPARTMENT_KEYS.filter((key) => key !== officialKey);
  return pickFromList(alternatives, random, 'department-mismatch');
}

function pickDifferentPurpose(officialKey: AppointmentPurposeKey, random: () => number): AppointmentPurposeKey {
  const alternatives = PURPOSE_KEYS.filter((key) => key !== officialKey);
  return pickFromList(alternatives, random, 'purpose-mismatch');
}

function buildMonsterMismatchKinds(random: () => number): readonly VisitorMismatchKind[] {
  const working = [...MONSTER_MISMATCH_POOL];
  shuffleInPlace(working, random, 'mismatch-kinds');
  const count = nextRandomValue(random, 'mismatch-count') < 0.5 ? 1 : 2;
  return Object.freeze(working.slice(0, count));
}

function buildClaim(
  appointment: AppointmentRosterEntry,
  caseKind: VisitorCaseKind,
  mismatchKinds: readonly VisitorMismatchKind[],
  random: () => number,
): VisitorClaim {
  const department =
    caseKind === 'disguised-monster-visitor' && mismatchKinds.includes('department')
      ? pickDifferentDepartment(appointment.targetDepartmentKey, random)
      : appointment.targetDepartmentKey;
  const purpose =
    caseKind === 'disguised-monster-visitor' && mismatchKinds.includes('purpose')
      ? pickDifferentPurpose(appointment.purposeKey, random)
      : appointment.purposeKey;

  return Object.freeze({
    claimedVisitorKey: appointment.visitorKey,
    claimedDepartmentKey: department,
    claimedPurposeKey: purpose,
  });
}

function freezeVisitorRound(round: VisitorInspectionRound): VisitorInspectionRound {
  return Object.freeze({
    subjectKind: 'visitor',
    roundId: round.roundId,
    dayIndex: round.dayIndex,
    inspectionDate: round.inspectionDate,
    visitorKey: round.visitorKey,
    appointmentId: round.appointmentId,
    caseKind: round.caseKind,
    mismatchKinds: Object.freeze([...round.mismatchKinds]),
    claim: Object.freeze({
      claimedVisitorKey: round.claim.claimedVisitorKey,
      claimedDepartmentKey: round.claim.claimedDepartmentKey,
      claimedPurposeKey: round.claim.claimedPurposeKey,
    }),
  });
}

function validateDay4VisitorSession(session: Day4VisitorSession): void {
  if (session.dayIndex !== 4) {
    throw new Error('[Day4VisitorSessionGenerator] Day 4 session dayIndex must be 4.');
  }
  if (session.rounds.length !== 2) {
    throw new Error('[Day4VisitorSessionGenerator] Day 4 session must contain exactly 2 rounds.');
  }

  const visitorKeys = new Set<VisitorKey>();
  const caseKinds = session.rounds.map((round) => round.caseKind);
  const validCount = caseKinds.filter((kind) => kind === 'valid-visitor').length;
  const monsterCount = caseKinds.filter((kind) => kind === 'disguised-monster-visitor').length;
  if (validCount !== 1 || monsterCount !== 1) {
    throw new Error('[Day4VisitorSessionGenerator] Day 4 session must contain exactly one valid and one monster visitor.');
  }

  const appointmentById = new Map(session.rosterDay.entries.map((entry) => [entry.appointmentId, entry] as const));
  for (const round of session.rounds) {
    visitorKeys.add(round.visitorKey);
    if (round.claim.claimedVisitorKey !== round.visitorKey) {
      throw new Error('[Day4VisitorSessionGenerator] claimedVisitorKey must equal visitorKey.');
    }
    if (round.mismatchKinds.length !== new Set(round.mismatchKinds).size) {
      throw new Error('[Day4VisitorSessionGenerator] mismatchKinds contains duplicate entries.');
    }
    const appointment = appointmentById.get(round.appointmentId);
    if (!appointment) {
      throw new Error(`[Day4VisitorSessionGenerator] Missing appointment for roundId=${round.roundId}.`);
    }

    if (round.caseKind === 'valid-visitor') {
      if (round.mismatchKinds.length !== 0) {
        throw new Error('[Day4VisitorSessionGenerator] valid visitor mismatchKinds must be empty.');
      }
    } else {
      if (round.mismatchKinds.length < 1 || round.mismatchKinds.length > 2) {
        throw new Error('[Day4VisitorSessionGenerator] monster visitor mismatchKinds must contain 1-2 entries.');
      }
    }

    const departmentMismatched = round.mismatchKinds.includes('department');
    const purposeMismatched = round.mismatchKinds.includes('purpose');

    if (departmentMismatched && round.claim.claimedDepartmentKey === appointment.targetDepartmentKey) {
      throw new Error('[Day4VisitorSessionGenerator] Department mismatch requires different claimed department.');
    }
    if (!departmentMismatched && round.claim.claimedDepartmentKey !== appointment.targetDepartmentKey) {
      throw new Error('[Day4VisitorSessionGenerator] Without department mismatch, claim must match official department.');
    }
    if (purposeMismatched && round.claim.claimedPurposeKey === appointment.purposeKey) {
      throw new Error('[Day4VisitorSessionGenerator] Purpose mismatch requires different claimed purpose.');
    }
    if (!purposeMismatched && round.claim.claimedPurposeKey !== appointment.purposeKey) {
      throw new Error('[Day4VisitorSessionGenerator] Without purpose mismatch, claim must match official purpose.');
    }

    const initialVisual = resolveVisitorInitialVisualKind(round.caseKind, round.mismatchKinds);
    if (round.mismatchKinds.includes('appearance') && initialVisual !== 'disguised') {
      throw new Error('[Day4VisitorSessionGenerator] Appearance mismatch must resolve to disguised visual.');
    }
    if (!round.mismatchKinds.includes('appearance') && initialVisual !== 'portrait') {
      throw new Error('[Day4VisitorSessionGenerator] Non-appearance mismatch must resolve to portrait visual.');
    }
  }

  if (visitorKeys.size !== 2 || !visitorKeys.has('edward') || !visitorKeys.has('nadia')) {
    throw new Error('[Day4VisitorSessionGenerator] Rounds must contain Edward and Nadia exactly once.');
  }
  if (!Object.isFrozen(session) || !Object.isFrozen(session.rosterDay) || !Object.isFrozen(session.rounds)) {
    throw new Error('[Day4VisitorSessionGenerator] Session root objects must be frozen.');
  }
  for (const entry of session.rosterDay.entries) {
    if (!Object.isFrozen(entry)) {
      throw new Error('[Day4VisitorSessionGenerator] Appointment roster entries must be frozen.');
    }
  }
  for (const round of session.rounds) {
    if (!Object.isFrozen(round) || !Object.isFrozen(round.claim) || !Object.isFrozen(round.mismatchKinds)) {
      throw new Error('[Day4VisitorSessionGenerator] Visitor rounds must be fully frozen.');
    }
  }
}

export function buildDay4VisitorSession(options?: BuildDay4VisitorSessionOptions): Day4VisitorSession {
  const random = options?.random ?? Math.random;
  const rosterDay = freezeRosterDay(buildDay4AppointmentRoster({ random }));
  const rosterByVisitor = new Map<VisitorKey, AppointmentRosterEntry>(
    rosterDay.entries.map((entry) => [entry.visitorKey, entry] as const),
  );
  const caseAssignmentPool: VisitorCaseKind[] = ['valid-visitor', 'disguised-monster-visitor'];
  shuffleInPlace(caseAssignmentPool, random, 'case-assignment');
  const caseKindByVisitor = new Map<VisitorKey, VisitorCaseKind>([
    [DAY4_VISITOR_KEYS[0], caseAssignmentPool[0] as VisitorCaseKind],
    [DAY4_VISITOR_KEYS[1], caseAssignmentPool[1] as VisitorCaseKind],
  ]);

  const roundsInFixedVisitorOrder: VisitorInspectionRound[] = DAY4_VISITOR_KEYS.map((visitorKey) => {
    const appointment = rosterByVisitor.get(visitorKey);
    if (!appointment) {
      throw new Error(`[Day4VisitorSessionGenerator] Missing official appointment for visitorKey="${visitorKey}".`);
    }
    const caseKind = caseKindByVisitor.get(visitorKey);
    if (!caseKind) {
      throw new Error(`[Day4VisitorSessionGenerator] Missing case assignment for visitorKey="${visitorKey}".`);
    }
    const mismatchKinds =
      caseKind === 'valid-visitor' ? Object.freeze([] as VisitorMismatchKind[]) : buildMonsterMismatchKinds(random);
    const claim = buildClaim(appointment, caseKind, mismatchKinds, random);
    if (claim === (appointment as unknown)) {
      throw new Error('[Day4VisitorSessionGenerator] Claim object must not alias the official appointment object.');
    }
    return freezeVisitorRound({
      subjectKind: 'visitor',
      roundId: `day4-visitor-${appointment.visitorKey}`,
      dayIndex: DAY4_INDEX,
      inspectionDate: appointment.inspectionDate,
      visitorKey: appointment.visitorKey,
      appointmentId: appointment.appointmentId,
      caseKind,
      mismatchKinds,
      claim,
    });
  });

  const roundOrder = [...roundsInFixedVisitorOrder];
  shuffleInPlace(roundOrder, random, 'round-order');
  const rounds = Object.freeze(roundOrder.map((round) => freezeVisitorRound(round)));
  const session: Day4VisitorSession = Object.freeze({
    dayIndex: 4,
    inspectionDate: rosterDay.inspectionDate,
    rosterDay,
    rounds,
  });

  validateDay4VisitorSession(session);
  return session;
}

