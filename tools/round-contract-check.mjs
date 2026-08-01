import { RoundGenerator } from '../assets/scripts/game/inspection/RoundGenerator.ts';
import { validateRoundInstance } from '../assets/scripts/game/inspection/RoundValidator.ts';
import {
  EMPLOYEE_PROFILES,
  INSPECTION_ENABLED_EMPLOYEE_KEYS,
  getAppearanceVariantsForEmployee,
} from '../assets/scripts/game/inspection/EmployeeProfileCatalog.ts';

const ENABLED_AUDIT_KEYS = ['carter', 'ethan', 'sam', 'mark', 'jake'];

function pickDifficultyByIndex(index) {
  if (index < 334) return 'EARLY';
  if (index < 667) return 'MID';
  return 'LATE';
}

function matchesTruth(truth, player) {
  return (
    (truth.cardPass ? player.card === 'pass' : player.card === 'fail') &&
    (truth.applicationPass ? player.application === 'pass' : player.application === 'fail') &&
    (truth.appearancePass ? player.appearance === 'pass' : player.appearance === 'fail')
  );
}

function checklistComplete(player) {
  return player.card !== 'unset' && player.application !== 'unset' && player.appearance !== 'unset';
}

function resolveRejectOutcome(entityKind, truth, player) {
  const complete = checklistComplete(player);
  const patternMatched = complete && matchesTruth(truth, player);
  if (!complete) {
    return {
      checklistComplete: false,
      patternMatched: false,
      reasonCorrect: false,
      resolvedOutcome: 'deny-incomplete-checklist',
    };
  }
  if (entityKind === 'monster') {
    return {
      checklistComplete: true,
      patternMatched,
      reasonCorrect: patternMatched,
      resolvedOutcome: patternMatched ? 'monster-correctly-rejected' : 'monster-wrongly-rejected',
    };
  }
  const shouldAllow = truth.cardPass && truth.applicationPass && truth.appearancePass;
  if (shouldAllow) {
    return {
      checklistComplete: true,
      patternMatched,
      reasonCorrect: patternMatched,
      resolvedOutcome: 'valid-human-wrongly-rejected',
    };
  }
  return {
    checklistComplete: true,
    patternMatched,
    reasonCorrect: patternMatched,
    resolvedOutcome: patternMatched ? 'invalid-human-correctly-rejected' : 'invalid-human-wrongly-rejected',
  };
}

function resolveAllowOutcome(entityKind, truth) {
  const shouldAllow = truth.cardPass && truth.applicationPass && truth.appearancePass;
  if (entityKind === 'monster') return 'monster-wrongly-allowed';
  return shouldAllow ? 'valid-human-allowed' : 'invalid-human-wrongly-allowed';
}

function runStaticDecisionTests() {
  const samTruth = { cardPass: false, applicationPass: true, appearancePass: false };
  return {
    sam_f_p_f_correct_reject: resolveRejectOutcome('monster', samTruth, {
      card: 'fail',
      application: 'pass',
      appearance: 'fail',
    }),
    sam_f_p_p_wrong_reason: resolveRejectOutcome('monster', samTruth, {
      card: 'fail',
      application: 'pass',
      appearance: 'pass',
    }),
    invalid_human_f_p_p_correct_reject: resolveRejectOutcome(
      'human',
      { cardPass: false, applicationPass: true, appearancePass: true },
      { card: 'fail', application: 'pass', appearance: 'pass' },
    ),
    invalid_human_p_f_p_correct_reject: resolveRejectOutcome(
      'human',
      { cardPass: true, applicationPass: false, appearancePass: true },
      { card: 'pass', application: 'fail', appearance: 'pass' },
    ),
    valid_human_allow: {
      resolvedOutcome: resolveAllowOutcome('human', {
        cardPass: true,
        applicationPass: true,
        appearancePass: true,
      }),
    },
  };
}

function auditEnabledEmployeeVariants() {
  return ENABLED_AUDIT_KEYS.map((employeeKey) => {
    const profile = EMPLOYEE_PROFILES[employeeKey];
    const variants = getAppearanceVariantsForEmployee(employeeKey);
    const firstVariant = variants[0] ?? null;
    const failedRuleKeys = firstVariant?.failedRuleKeys ?? [];
    return {
      employeeKey,
      normalPortraitUuid: profile.portraitSpriteFrameUuid,
      disguisedPortraitUuid: profile.disguisedSpriteFrameUuid ?? null,
      monsterVariantKey: firstVariant?.variantKey ?? null,
      monsterVariantFailedRuleKeys: failedRuleKeys,
      appearanceRules: profile.appearanceRules.map((rule) => rule.key),
      portraitsDifferent:
        Boolean(profile.disguisedSpriteFrameUuid) &&
        profile.disguisedSpriteFrameUuid !== profile.portraitSpriteFrameUuid,
      generatedAppearancePassFromVariant: failedRuleKeys.length === 0,
    };
  });
}

function runBulkContractCheck(totalRounds = 1000) {
  const generator = new RoundGenerator();
  const caseKindCounts = { VALID_HUMAN: 0, INVALID_HUMAN: 0, DISGUISED_MONSTER: 0 };
  const employeeMonsterCounts = Object.fromEntries(ENABLED_AUDIT_KEYS.map((k) => [k, 0]));
  let previousSignature = null;
  let appearanceFailRounds = 0;
  let invalidHumanAppearanceFail = 0;
  let monsterAppearancePass = 0;
  let monsterNoRuleKeys = 0;
  let monsterSamePortrait = 0;
  let validatorErrorRounds = 0;
  const validatorErrors = [];

  for (let i = 0; i < totalRounds; i += 1) {
    const difficulty = pickDifficultyByIndex(i);
    const prevSignature = previousSignature;
    const round = generator.generateNextRound(prevSignature, difficulty);
    previousSignature = round.signature;
    caseKindCounts[round.caseKind] += 1;

    if (!round.truth.appearancePass) appearanceFailRounds += 1;

    const validation = validateRoundInstance(round, prevSignature);
    if (!validation.ok) {
      validatorErrorRounds += 1;
      validatorErrors.push({
        roundId: round.roundId,
        employeeKey: round.employeeKey,
        caseKind: round.caseKind,
        errors: validation.errors,
      });
    }

    if (round.caseKind === 'INVALID_HUMAN' && round.truth.appearancePass === false) {
      invalidHumanAppearanceFail += 1;
    }
    if (round.caseKind === 'DISGUISED_MONSTER') {
      if (Object.prototype.hasOwnProperty.call(employeeMonsterCounts, round.employeeKey)) {
        employeeMonsterCounts[round.employeeKey] += 1;
      }
      if (round.truth.appearancePass === true) {
        monsterAppearancePass += 1;
      }
      if (round.appearance.failedRuleKeys.length === 0) {
        monsterNoRuleKeys += 1;
      }
      const profile = EMPLOYEE_PROFILES[round.employeeKey];
      if (profile.portraitSpriteFrameUuid === round.appearance.spriteFrameUuid) {
        monsterSamePortrait += 1;
      }
    }
  }

  return {
    totalRounds,
    caseKindCounts,
    appearanceFailRounds,
    employeeMonsterCounts,
    invalidHumanAppearanceFail,
    monsterAppearancePass,
    monsterNoRuleKeys,
    monsterSamePortrait,
    illegalCombinationCount:
      invalidHumanAppearanceFail + monsterAppearancePass + monsterNoRuleKeys + monsterSamePortrait,
    validatorErrorRounds,
    validatorErrors,
  };
}

const output = {
  staticDecisionTests: runStaticDecisionTests(),
  enabledEmployeeVariantAudit: auditEnabledEmployeeVariants(),
  bulkContractCheck: runBulkContractCheck(1000),
  enabledInspectionEmployees: INSPECTION_ENABLED_EMPLOYEE_KEYS,
};

console.log(JSON.stringify(output, null, 2));
