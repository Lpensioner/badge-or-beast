import type {
  VisitorCaseKind,
  VisitorDecision,
  VisitorDecisionOutcome,
  VisitorInspectionRound,
} from './VisitorRoundTypes';

type VisitorChecklistChoice = 'unset' | 'pass' | 'fail';

export interface VisitorChecklistDecisionState {
  readonly idCardChoice: VisitorChecklistChoice;
  readonly applicationChoice: VisitorChecklistChoice;
  readonly appearanceChoice: VisitorChecklistChoice;
}

function assertNever(value: never, label: string): never {
  throw new Error(`[VisitorDecisionResolver] Unexpected ${label}: ${String(value)}`);
}

function isDay4VisitorPhoneVerifiedArrived(round: VisitorInspectionRound): boolean {
  if (round.dayIndex !== 4) {
    // Keep Day1-Day3 behavior unchanged.
    return false;
  }
  return round.phoneVerificationResult?.visitorArrived === true;
}

function hasDay4ChecklistAnomaly(checklist: VisitorChecklistDecisionState | null): boolean {
  if (!checklist) {
    return false;
  }
  return (
    checklist.idCardChoice === 'fail' ||
    checklist.applicationChoice === 'fail' ||
    checklist.appearanceChoice === 'fail'
  );
}

export function resolveVisitorDecision(
  round: VisitorInspectionRound,
  decision: VisitorDecision,
  checklistState: VisitorChecklistDecisionState | null = null,
): VisitorDecisionOutcome {
  const hasChecklistAnomaly = round.dayIndex === 4 && hasDay4ChecklistAnomaly(checklistState);
  const hasPhoneAnomaly = isDay4VisitorPhoneVerifiedArrived(round);
  const caseKind: VisitorCaseKind =
    round.caseKind === 'valid-visitor' && (hasPhoneAnomaly || hasChecklistAnomaly)
      ? 'disguised-monster-visitor'
      : round.caseKind;

  switch (caseKind) {
    case 'valid-visitor': {
      switch (decision) {
        case 'allow':
          return Object.freeze({
            kind: 'valid-visitor-allowed',
            decision: 'allow',
            isCorrect: true,
          });
        case 'deny':
          return Object.freeze({
            kind: 'valid-visitor-wrongly-denied',
            decision: 'deny',
            isCorrect: false,
          });
        default:
          return assertNever(decision, 'visitor decision');
      }
    }
    case 'disguised-monster-visitor': {
      switch (decision) {
        case 'allow':
          return Object.freeze({
            kind: 'visitor-monster-wrongly-allowed',
            decision: 'allow',
            isCorrect: false,
          });
        case 'deny':
          return Object.freeze({
            kind: 'visitor-monster-correctly-denied',
            decision: 'deny',
            isCorrect: true,
          });
        default:
          return assertNever(decision, 'visitor decision');
      }
    }
    default:
      return assertNever(caseKind, 'visitor case kind');
  }
}
