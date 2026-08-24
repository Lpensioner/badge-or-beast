import type { AppointmentDepartmentKey, AppointmentId } from '../appointments/AppointmentTypes';
import type { AppointmentPurposeKey } from '../appointments/AppointmentPurposeCatalog';
import type { VisitorKey } from './VisitorTypes';

export type VisitorRoundId = string;

export type VisitorCaseKind = 'valid-visitor' | 'disguised-monster-visitor';
export type VisitorMismatchKind = 'appearance' | 'department' | 'purpose';

export interface PhoneVerificationResult {
  readonly checked: boolean;
  readonly calledNumber: string | null;
  readonly departmentMatched: boolean | null;
  readonly appointmentFound: boolean | null;
  readonly visitorArrived: boolean | null;
}

export interface VisitorClaim {
  readonly claimedVisitorKey: VisitorKey;
  readonly claimedDepartmentKey: AppointmentDepartmentKey;
  readonly claimedPurposeKey: AppointmentPurposeKey;
}

export interface VisitorInspectionRound {
  readonly subjectKind: 'visitor';
  readonly roundId: VisitorRoundId;
  readonly dayIndex: number;
  readonly inspectionDate: string;
  readonly visitorKey: VisitorKey;
  readonly appointmentId: AppointmentId;
  readonly caseKind: VisitorCaseKind;
  readonly mismatchKinds: readonly VisitorMismatchKind[];
  readonly claim: VisitorClaim;
  phoneVerificationResult?: PhoneVerificationResult | null;
}

export type VisitorDecision = 'allow' | 'deny';

export interface VisitorValidAllowedOutcome {
  readonly kind: 'valid-visitor-allowed';
  readonly decision: 'allow';
  readonly isCorrect: true;
}

export interface VisitorValidWronglyDeniedOutcome {
  readonly kind: 'valid-visitor-wrongly-denied';
  readonly decision: 'deny';
  readonly isCorrect: false;
}

export interface VisitorMonsterWronglyAllowedOutcome {
  readonly kind: 'visitor-monster-wrongly-allowed';
  readonly decision: 'allow';
  readonly isCorrect: false;
}

export interface VisitorMonsterCorrectlyDeniedOutcome {
  readonly kind: 'visitor-monster-correctly-denied';
  readonly decision: 'deny';
  readonly isCorrect: true;
}

export type VisitorDecisionOutcome =
  | VisitorValidAllowedOutcome
  | VisitorValidWronglyDeniedOutcome
  | VisitorMonsterWronglyAllowedOutcome
  | VisitorMonsterCorrectlyDeniedOutcome;
