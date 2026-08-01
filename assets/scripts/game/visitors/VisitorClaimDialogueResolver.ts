import type { AppointmentDepartmentKey } from '../appointments/AppointmentTypes';
import type { AppointmentPurposeKey } from '../appointments/AppointmentPurposeCatalog';
import type { VisitorInspectionRound } from './VisitorRoundTypes';
import type { VisitorKey } from './VisitorTypes';

const ERROR_PREFIX = '[VisitorClaimDialogue]';

export type VisitorClaimDialogueLineKind = 'claimed-name' | 'claimed-department' | 'claimed-purpose';

export interface VisitorClaimDialogueLine {
  readonly kind: VisitorClaimDialogueLineKind;
  readonly text: string;
}

export interface ResolvedVisitorClaimDialogueData {
  readonly claimedVisitorKey: VisitorKey;
  readonly claimedVisitorDisplayName: string;
  readonly claimedDepartmentKey: AppointmentDepartmentKey;
  readonly claimedDepartmentSpokenDisplayName: string;
  readonly claimedPurposeKey: AppointmentPurposeKey;
  readonly claimedPurposeSpokenVisitReason: string;
}

export type VisitorClaimDialogue = readonly [
  VisitorClaimDialogueLine,
  VisitorClaimDialogueLine,
  VisitorClaimDialogueLine,
];

function requireSingleLineText(value: string, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${ERROR_PREFIX} ${fieldName} must be a non-empty single-line string.`);
  }

  if (value.includes('\n') || value.includes('\r')) {
    throw new Error(`${ERROR_PREFIX} ${fieldName} must be a non-empty single-line string.`);
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw new Error(`${ERROR_PREFIX} ${fieldName} must be a non-empty single-line string.`);
  }

  return trimmedValue;
}

function requireNoTrailingPeriod(value: string, fieldName: string): void {
  if (value.endsWith('.')) {
    throw new Error(`${ERROR_PREFIX} ${fieldName} must not end with a period.`);
  }
}

export function resolveVisitorClaimDialogue(
  round: VisitorInspectionRound,
  resolvedData: ResolvedVisitorClaimDialogueData,
): VisitorClaimDialogue {
  if (!round || typeof round !== 'object' || round.subjectKind !== 'visitor') {
    throw new Error(`${ERROR_PREFIX} Expected a visitor inspection round.`);
  }

  if (typeof round.roundId !== 'string' || round.roundId.trim().length === 0) {
    throw new Error(`${ERROR_PREFIX} Expected a visitor inspection round with a non-empty roundId.`);
  }

  if (!round.claim || typeof round.claim !== 'object') {
    throw new Error(`${ERROR_PREFIX} Expected a visitor inspection round claim.`);
  }

  if (!resolvedData || typeof resolvedData !== 'object') {
    throw new Error(`${ERROR_PREFIX} Expected resolved visitor claim dialogue data.`);
  }

  if (resolvedData.claimedVisitorKey !== round.claim.claimedVisitorKey) {
    throw new Error(`${ERROR_PREFIX} Claimed visitor key does not match the active visitor claim.`);
  }

  if (resolvedData.claimedDepartmentKey !== round.claim.claimedDepartmentKey) {
    throw new Error(`${ERROR_PREFIX} Claimed department key does not match the active visitor claim.`);
  }

  if (resolvedData.claimedPurposeKey !== round.claim.claimedPurposeKey) {
    throw new Error(`${ERROR_PREFIX} Claimed purpose key does not match the active visitor claim.`);
  }

  const claimedVisitorDisplayName = requireSingleLineText(
    resolvedData.claimedVisitorDisplayName,
    'claimedVisitorDisplayName',
  );
  const claimedDepartmentSpokenDisplayName = requireSingleLineText(
    resolvedData.claimedDepartmentSpokenDisplayName,
    'claimedDepartmentSpokenDisplayName',
  );
  const claimedPurposeSpokenVisitReason = requireSingleLineText(
    resolvedData.claimedPurposeSpokenVisitReason,
    'claimedPurposeSpokenVisitReason',
  );

  requireNoTrailingPeriod(claimedDepartmentSpokenDisplayName, 'claimedDepartmentSpokenDisplayName');
  requireNoTrailingPeriod(claimedPurposeSpokenVisitReason, 'claimedPurposeSpokenVisitReason');

  const claimedNameLine = Object.freeze<VisitorClaimDialogueLine>({
    kind: 'claimed-name',
    text: `My name is ${claimedVisitorDisplayName}.`,
  });
  const claimedDepartmentLine = Object.freeze<VisitorClaimDialogueLine>({
    kind: 'claimed-department',
    text: `I have an appointment with the ${claimedDepartmentSpokenDisplayName}.`,
  });
  const claimedPurposeLine = Object.freeze<VisitorClaimDialogueLine>({
    kind: 'claimed-purpose',
    text: `I am here for ${claimedPurposeSpokenVisitReason}.`,
  });

  return Object.freeze([claimedNameLine, claimedDepartmentLine, claimedPurposeLine]) as VisitorClaimDialogue;
}
