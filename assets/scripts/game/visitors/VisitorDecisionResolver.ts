import type {
  VisitorCaseKind,
  VisitorDecision,
  VisitorDecisionOutcome,
  VisitorInspectionRound,
} from './VisitorRoundTypes';

function assertNever(value: never, label: string): never {
  throw new Error(`[VisitorDecisionResolver] Unexpected ${label}: ${String(value)}`);
}

export function resolveVisitorDecision(
  round: VisitorInspectionRound,
  decision: VisitorDecision,
): VisitorDecisionOutcome {
  const caseKind: VisitorCaseKind = round.caseKind;

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
