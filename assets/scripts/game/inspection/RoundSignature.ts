import type { RoundInstance } from './InspectionTypes';

function sortedCopy<T extends string>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.localeCompare(b));
}

export function buildRoundSignature(round: Omit<RoundInstance, 'signature'>): string {
  const payload = {
    inspectionDate: round.inspectionDate,
    employeeKey: round.employeeKey,
    caseKind: round.caseKind,
    card: {
      employeeId: round.card.employeeId,
      name: round.card.name,
      validUntil: round.card.validUntil,
      sealState: round.card.sealState,
      failedFields: sortedCopy(round.card.failedFields),
    },
    application: {
      employeeId: round.application.employeeId,
      name: round.application.name,
      position: round.application.position,
      department: round.application.department,
      validUntil: round.application.validUntil,
      reasonForEntry: round.application.reasonForEntry,
      failedFields: sortedCopy(round.application.failedFields),
    },
    appearance: {
      variantKey: round.appearance.variantKey,
      failedRuleKeys: sortedCopy(round.appearance.failedRuleKeys),
    },
  };
  return JSON.stringify(payload);
}
