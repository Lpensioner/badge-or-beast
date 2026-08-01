import {
  CURRENT_DATE,
  isValidUntilPass,
  validateInspectionDateString,
} from './InspectionDateRules';
import { EMPLOYEE_PROFILES } from './EmployeeProfileCatalog';
import type { RoundInstance } from './InspectionTypes';

export interface RoundValidationResult {
  ok: boolean;
  errors: string[];
}

function hasAnyCardMismatch(round: RoundInstance): boolean {
  return round.card.failedFields.length > 0;
}

function hasAnyApplicationMismatch(round: RoundInstance): boolean {
  return round.application.failedFields.length > 0;
}

function hasAnyAppearanceMismatch(round: RoundInstance): boolean {
  return round.appearance.failedRuleKeys.length > 0;
}

function logAppearanceContractViolation(round: RoundInstance, reason: string): void {
  const profile = EMPLOYEE_PROFILES[round.employeeKey];
  const cardPass = round.card.failedFields.length === 0;
  const appPass = round.application.failedFields.length === 0;
  const appearancePass = round.appearance.failedRuleKeys.length === 0;
  console.error('[RoundValidator] invalid appearance contract', {
    reason,
    roundId: round.roundId,
    employeeKey: round.employeeKey,
    caseKind: round.caseKind,
    normalPortraitUuid: profile?.portraitSpriteFrameUuid ?? null,
    variantPortraitUuid: round.appearance.spriteFrameUuid ?? null,
    failedRuleKeys: [...round.appearance.failedRuleKeys],
    appearancePass,
    cardPass,
    applicationPass: appPass,
  });
}

export function validateRoundInstance(
  round: RoundInstance,
  previousSignature: string | null,
): RoundValidationResult {
  const errors: string[] = [];
  const inspectionDate = round.inspectionDate;
  const hasValidInspectionDate = validateInspectionDateString(inspectionDate);
  if (!hasValidInspectionDate) {
    errors.push(`Invalid inspectionDate: ${inspectionDate}`);
  }

  const cardPass = round.card.failedFields.length === 0;
  const appPass = round.application.failedFields.length === 0;
  const appearancePass = round.appearance.failedRuleKeys.length === 0;
  const profile = EMPLOYEE_PROFILES[round.employeeKey];
  const hasAppearanceSpriteUuid = round.appearance.spriteFrameUuid.trim().length > 0;
  const appearanceMatchesOfficialPortrait =
    profile && round.appearance.spriteFrameUuid === profile.portraitSpriteFrameUuid;

  if (round.caseKind === 'VALID_HUMAN' && (!cardPass || !appPass || !appearancePass)) {
    errors.push('VALID_HUMAN must pass all categories.');
  }
  if (round.caseKind === 'INVALID_HUMAN' && !appearancePass) {
    errors.push('INVALID_HUMAN appearance must pass.');
  }
  if (round.caseKind === 'INVALID_HUMAN' && cardPass && appPass) {
    errors.push('INVALID_HUMAN must fail card or application.');
  }
  if (round.caseKind === 'DISGUISED_MONSTER' && appearancePass) {
    errors.push('DISGUISED_MONSTER appearance must fail.');
  }
  if (round.caseKind === 'DISGUISED_MONSTER' && round.appearance.failedRuleKeys.length === 0) {
    errors.push('DISGUISED_MONSTER requires appearance failedRuleKeys.');
  }
  if (round.caseKind === 'DISGUISED_MONSTER' && !hasAppearanceSpriteUuid) {
    errors.push('DISGUISED_MONSTER requires appearance spriteFrameUuid.');
  }
  if (round.caseKind === 'DISGUISED_MONSTER' && appearanceMatchesOfficialPortrait) {
    errors.push('DISGUISED_MONSTER appearance sprite must differ from official portrait.');
  }
  if (round.caseKind === 'DISGUISED_MONSTER' && cardPass && appPass && appearancePass) {
    errors.push('DISGUISED_MONSTER cannot pass all categories.');
  }

  const expectedDecision = cardPass && appPass && appearancePass ? 'ALLOW' : 'DENY';
  if (round.truth.correctDecision !== expectedDecision) {
    errors.push('truth.correctDecision mismatch.');
  }
  if (round.truth.cardPass !== cardPass) {
    errors.push('truth.cardPass mismatch.');
  }
  if (round.truth.applicationPass !== appPass) {
    errors.push('truth.applicationPass mismatch.');
  }
  if (round.truth.appearancePass !== appearancePass) {
    errors.push('truth.appearancePass mismatch.');
  }
  if (round.truth.appearancePass === false && round.appearance.failedRuleKeys.length === 0) {
    errors.push('appearancePass=false requires failedRuleKeys.');
  }
  if (round.truth.appearancePass === true && round.appearance.failedRuleKeys.length > 0) {
    errors.push('appearancePass=true requires no failedRuleKeys.');
  }

  const expectedFailedCategories = [
    !cardPass && 'CARD',
    !appPass && 'APPLICATION',
    !appearancePass && 'APPEARANCE',
  ].filter(Boolean) as ('CARD' | 'APPLICATION' | 'APPEARANCE')[];
  const sortedActual = [...round.truth.failedCategories].sort();
  const sortedExpected = [...expectedFailedCategories].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
    errors.push('truth.failedCategories mismatch.');
  }

  const cardValidUntilPasses = hasValidInspectionDate
    ? isValidUntilPass(round.card.validUntil, inspectionDate)
    : false;
  if (!cardValidUntilPasses && !hasAnyCardMismatch(round)) {
    errors.push('Card validUntil expired but no card failure.');
  }
  if (cardValidUntilPasses && round.card.failedFields.includes('VALID_UNTIL')) {
    errors.push('Card VALID_UNTIL flagged while date is not expired.');
  }
  if (!isValidUntilPass(round.application.validUntil, CURRENT_DATE) && !hasAnyApplicationMismatch(round)) {
    errors.push('Application validUntil expired but no application failure.');
  }
  if (hasAnyAppearanceMismatch(round) !== !appearancePass) {
    errors.push('Appearance failedRuleKeys mismatch.');
  }

  if (
    (round.caseKind === 'DISGUISED_MONSTER' &&
      (appearancePass ||
        round.appearance.failedRuleKeys.length === 0 ||
        !hasAppearanceSpriteUuid ||
        appearanceMatchesOfficialPortrait)) ||
    (round.caseKind === 'INVALID_HUMAN' && !appearancePass)
  ) {
    logAppearanceContractViolation(round, 'case-kind appearance contract violated');
  }

  if (!round.signature || round.signature.trim().length === 0) {
    errors.push('Signature must be non-empty.');
  }
  if (round.signature.includes(round.roundId)) {
    errors.push('Signature must not include roundId.');
  }
  if (previousSignature && round.signature === previousSignature) {
    errors.push('Signature must differ from previous round.');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
