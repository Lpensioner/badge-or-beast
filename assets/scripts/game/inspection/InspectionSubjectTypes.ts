import type { RoundInstance } from './InspectionTypes';
import type { VisitorInspectionRound } from '../visitors/VisitorRoundTypes';

export interface EmployeeInspectionSubject {
  readonly subjectKind: 'employee';
  readonly round: RoundInstance;
}

export type InspectionSubject = EmployeeInspectionSubject | VisitorInspectionRound;

function assertNever(value: never, label: string): never {
  throw new Error(`[InspectionSubjectTypes] Unexpected ${label}: ${String(value)}`);
}

export function createEmployeeInspectionSubject(round: RoundInstance): EmployeeInspectionSubject {
  if (round == null) {
    throw new Error('[InspectionSubjectTypes] createEmployeeInspectionSubject requires a RoundInstance.');
  }
  return Object.freeze({
    subjectKind: 'employee',
    round,
  });
}

export function isEmployeeInspectionSubject(subject: InspectionSubject): subject is EmployeeInspectionSubject {
  return subject.subjectKind === 'employee';
}

export function isVisitorInspectionSubject(subject: InspectionSubject): subject is VisitorInspectionRound {
  return subject.subjectKind === 'visitor';
}

export function getInspectionSubjectRoundId(subject: InspectionSubject): string {
  switch (subject.subjectKind) {
    case 'employee':
      return subject.round.roundId;
    case 'visitor':
      return subject.roundId;
    default:
      return assertNever(subject, 'inspection subject kind');
  }
}

export function getInspectionSubjectInspectionDate(subject: InspectionSubject): string {
  switch (subject.subjectKind) {
    case 'employee':
      return subject.round.inspectionDate;
    case 'visitor':
      return subject.inspectionDate;
    default:
      return assertNever(subject, 'inspection subject kind');
  }
}
