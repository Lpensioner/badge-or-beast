import {
  CURRENT_DATE,
  isValidUntilAccepted,
  isValidUntilPass,
  validateInspectionDateString,
} from './InspectionDateRules';
import { EMPLOYEE_FILE_VISIBLE_RULES, EmployeeFileId } from '../EmployeeFilesController';
import {
  APPEARANCE_VARIANTS,
  EMPLOYEE_KEYS,
  EMPLOYEE_PROFILES,
  INSPECTION_ENABLED_EMPLOYEE_KEYS,
} from './EmployeeProfileCatalog';
import { DifficultyTier, EmployeeKey } from './InspectionTypes';
import { RoundGenerator } from './RoundGenerator';
import { validateRoundInstance } from './RoundValidator';

export interface RoundEngineDebugReport {
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
}

export interface AppearanceVariantAuditRow {
  employeeKey: EmployeeKey;
  variantKey: string;
  spriteFrameUuid: string;
  failedRuleKeys: string[];
}

export interface RoundEngineBulkCheckReport {
  totalRounds: number;
  employeeCounts: Record<EmployeeKey, number>;
  caseKindCounts: Record<'VALID_HUMAN' | 'INVALID_HUMAN' | 'DISGUISED_MONSTER', number>;
  cardFailCount: number;
  applicationFailCount: number;
  appearanceFailCount: number;
  adjacentSignatureDuplicates: number;
  invalidRoundCount: number;
  disabledEmployeeRoundCount: number;
  generatorErrorCount: number;
  maxConsecutiveGeneratorErrors: number;
  issues: string[];
}

function addCheck(
  report: RoundEngineDebugReport,
  name: string,
  pass: boolean,
  detail?: string,
): void {
  report.checks.push({ name, pass, detail });
}

function normalizeVisibleRuleText(text: string): string {
  return text
    .replace(/^[\s\u2022\-\*]+/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

function collectEmployeeFileVisibleRules(employeeKey: EmployeeKey): string[] {
  const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES[employeeKey as EmployeeFileId];
  if (!visibleRules) {
    return [];
  }
  return [...visibleRules.appearanceFeatures, ...visibleRules.behavioralHabits].map(normalizeVisibleRuleText);
}

function collectCatalogAppearanceRuleDescriptions(employeeKey: EmployeeKey): string[] {
  return EMPLOYEE_PROFILES[employeeKey].appearanceRules.map((rule) => normalizeVisibleRuleText(rule.description));
}

function validateEmployeeFileAgainstCatalog(employeeKey: EmployeeKey): {
  pass: boolean;
  missingInCatalog: string[];
  missingInFile: string[];
} {
  const fileRules = collectEmployeeFileVisibleRules(employeeKey);
  const catalogRules = collectCatalogAppearanceRuleDescriptions(employeeKey);
  const fileRuleSet = new Set(fileRules);
  const catalogRuleSet = new Set(catalogRules);
  const missingInCatalog = fileRules.filter((rule) => !catalogRuleSet.has(rule));
  const missingInFile = catalogRules.filter((rule) => !fileRuleSet.has(rule));
  return {
    pass: missingInCatalog.length === 0 && missingInFile.length === 0,
    missingInCatalog,
    missingInFile,
  };
}

export function runRoundEngineSelfCheck(): RoundEngineDebugReport {
  const report: RoundEngineDebugReport = { checks: [] };
  const generator = new RoundGenerator();

  addCheck(report, 'DATE_EQUAL_INCLUSIVE_PASS', isValidUntilPass('1999-12-03', '1999-12-03') === true);
  addCheck(report, 'DATE_DAY2_CARD_EXPIRES', isValidUntilPass('1999-12-03', '1999-12-04') === false);
  addCheck(report, 'DATE_DAY3_CARD_EXPIRES', isValidUntilPass('1999-12-03', '1999-12-05') === false);
  addCheck(report, 'DATE_FUTURE_CARD_PASS', isValidUntilPass('1999-12-04', '1999-12-03') === true);
  addCheck(report, 'DATE_MONTH_INVALID_REJECT', validateInspectionDateString('1999-13-40') === false);
  addCheck(report, 'DATE_DAY_INVALID_REJECT', validateInspectionDateString('1999-02-31') === false);
  addCheck(report, 'DATE_FORMAT_INVALID_REJECT', validateInspectionDateString('1999/12/03') === false);
  addCheck(report, 'DATE_LEGACY_DEFAULT_STILL_COMPATIBLE', isValidUntilAccepted('1999-12-03') === true);

  const roundA = generator.generateNextRound(null, 'EARLY', CURRENT_DATE);
  const roundB = generator.generateNextRound(roundA.signature, 'EARLY', CURRENT_DATE);

  addCheck(
    report,
    'ADJACENT_SIGNATURE_DIFFERENT',
    roundA.signature !== roundB.signature,
    `${roundA.signature} vs ${roundB.signature}`,
  );
  addCheck(
    report,
    'ALLOW_REQUIRES_ALL_PASS',
    (roundA.truth.correctDecision === 'ALLOW') ===
      (roundA.truth.cardPass && roundA.truth.applicationPass && roundA.truth.appearancePass),
  );

  const profileSam = EMPLOYEE_PROFILES.sam;
  addCheck(
    report,
    'FLAVOR_NOT_IN_APPEARANCE_RULES',
    !profileSam.appearanceRules.some((rule) => {
      const text = String(rule.expectedValue).toLowerCase();
      return text.includes('gentle') || text.includes('helpful');
    }),
  );

  const enabledAuditKeys: EmployeeKey[] = ['carter', 'ethan', 'sam', 'mark', 'jake'];
  for (const employeeKey of enabledAuditKeys) {
    const consistency = validateEmployeeFileAgainstCatalog(employeeKey);
    addCheck(
      report,
      `FILE_CATALOG_VISIBLE_RULES_MATCH_${employeeKey.toUpperCase()}`,
      consistency.pass,
      consistency.pass
        ? undefined
        : `missingInCatalog=[${consistency.missingInCatalog.join(', ')}], missingInFile=[${consistency.missingInFile.join(', ')}]`,
    );
  }

  return report;
}

function buildEmployeeCounter(): Record<EmployeeKey, number> {
  return {
    carter: 0,
    ethan: 0,
    sam: 0,
    mark: 0,
    jake: 0,
    alice: 0,
    clara: 0,
    grace: 0,
    maya: 0,
  };
}

function pickDifficultyByIndex(index: number): DifficultyTier {
  if (index < 334) {
    return 'EARLY';
  }
  if (index < 667) {
    return 'MID';
  }
  return 'LATE';
}

export function runRoundEngineBulkCheck(roundCount: number = 1000): RoundEngineBulkCheckReport {
  const generator = new RoundGenerator();
  const enabledSet = new Set<EmployeeKey>(INSPECTION_ENABLED_EMPLOYEE_KEYS);
  const employeeCounts = buildEmployeeCounter();
  const caseKindCounts = {
    VALID_HUMAN: 0,
    INVALID_HUMAN: 0,
    DISGUISED_MONSTER: 0,
  };
  const issues: string[] = [];

  let previousSignature: string | null = null;
  let cardFailCount = 0;
  let applicationFailCount = 0;
  let appearanceFailCount = 0;
  let adjacentSignatureDuplicates = 0;
  let invalidRoundCount = 0;
  let disabledEmployeeRoundCount = 0;
  let generatorErrorCount = 0;
  let maxConsecutiveGeneratorErrors = 0;
  let consecutiveGeneratorErrors = 0;

  for (let index = 0; index < roundCount; index += 1) {
    const difficulty = pickDifficultyByIndex(index);
    let round;
    try {
      round = generator.generateNextRound(previousSignature, difficulty, CURRENT_DATE);
      consecutiveGeneratorErrors = 0;
    } catch (error) {
      generatorErrorCount += 1;
      consecutiveGeneratorErrors += 1;
      maxConsecutiveGeneratorErrors = Math.max(maxConsecutiveGeneratorErrors, consecutiveGeneratorErrors);
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_GENERATOR_ERROR:${String(error)}`);
      previousSignature = null;
      continue;
    }

    employeeCounts[round.employeeKey] += 1;
    caseKindCounts[round.caseKind] += 1;

    const profile = EMPLOYEE_PROFILES[round.employeeKey];
    if (!profile.inspectionEnabled || !enabledSet.has(round.employeeKey)) {
      disabledEmployeeRoundCount += 1;
      issues.push(`ROUND_${index + 1}_DISABLED_EMPLOYEE:${round.employeeKey}`);
    }

    if (round.signature === previousSignature) {
      adjacentSignatureDuplicates += 1;
      issues.push(`ROUND_${index + 1}_ADJACENT_SIGNATURE_DUPLICATE`);
    }

    if (round.card.failedFields.length > 0) {
      cardFailCount += 1;
    }
    if (round.application.failedFields.length > 0) {
      applicationFailCount += 1;
    }
    if (round.appearance.failedRuleKeys.length > 0) {
      appearanceFailCount += 1;
    }

    const validation = validateRoundInstance(round, previousSignature);
    if (!validation.ok) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_VALIDATOR:${validation.errors.join(' | ')}`);
    }

    const appearancePass = round.appearance.failedRuleKeys.length === 0;
    if (round.truth.appearancePass !== appearancePass) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_APPEARANCE_TRUTH_MISMATCH`);
    }
    if (round.truth.appearancePass === false && round.appearance.failedRuleKeys.length === 0) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_APPEARANCE_FAIL_WITHOUT_RULE_KEYS`);
    }
    if (round.truth.appearancePass === true && round.appearance.failedRuleKeys.length > 0) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_APPEARANCE_PASS_WITH_RULE_KEYS`);
    }

    const cardPass = round.card.failedFields.length === 0;
    const appPass = round.application.failedFields.length === 0;
    const decision = cardPass && appPass && appearancePass ? 'ALLOW' : 'DENY';
    if (round.truth.correctDecision !== decision) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_CORRECT_DECISION_MISMATCH`);
    }

    const expectedFailedCategories = [
      cardPass ? null : 'CARD',
      appPass ? null : 'APPLICATION',
      appearancePass ? null : 'APPEARANCE',
    ]
      .filter(Boolean)
      .sort();
    const actualFailedCategories = [...round.truth.failedCategories].sort();
    if (JSON.stringify(expectedFailedCategories) !== JSON.stringify(actualFailedCategories)) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_FAILED_CATEGORIES_MISMATCH`);
    }

    if (!isValidUntilPass(round.card.validUntil, round.inspectionDate) && cardPass) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_EXPIRED_CARD_WITHOUT_FAIL`);
    }
    if (!isValidUntilAccepted(round.application.validUntil) && appPass) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_EXPIRED_APPLICATION_WITHOUT_FAIL`);
    }

    if (round.caseKind === 'VALID_HUMAN' && (!cardPass || !appPass || !appearancePass)) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_VALID_HUMAN_NOT_ALL_PASS`);
    }
    if (round.caseKind === 'INVALID_HUMAN' && !appearancePass) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_INVALID_HUMAN_APPEARANCE_NOT_PASS`);
    }
    if (round.caseKind === 'INVALID_HUMAN' && cardPass && appPass) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_INVALID_HUMAN_NO_DOC_FAIL`);
    }
    if (round.caseKind === 'DISGUISED_MONSTER' && cardPass && appPass && appearancePass) {
      invalidRoundCount += 1;
      issues.push(`ROUND_${index + 1}_MONSTER_ALL_PASS`);
    }

    previousSignature = round.signature;
  }

  for (const key of EMPLOYEE_KEYS) {
    if (!enabledSet.has(key) && employeeCounts[key] > 0) {
      issues.push(`DISABLED_EMPLOYEE_PRESENT_IN_POOL:${key}:${employeeCounts[key]}`);
    }
  }

  return {
    totalRounds: roundCount,
    employeeCounts,
    caseKindCounts,
    cardFailCount,
    applicationFailCount,
    appearanceFailCount,
    adjacentSignatureDuplicates,
    invalidRoundCount,
    disabledEmployeeRoundCount,
    generatorErrorCount,
    maxConsecutiveGeneratorErrors,
    issues,
  };
}

export function getInspectionEnabledStatusSnapshot(): Record<EmployeeKey, boolean> {
  return {
    carter: EMPLOYEE_PROFILES.carter.inspectionEnabled,
    ethan: EMPLOYEE_PROFILES.ethan.inspectionEnabled,
    sam: EMPLOYEE_PROFILES.sam.inspectionEnabled,
    mark: EMPLOYEE_PROFILES.mark.inspectionEnabled,
    jake: EMPLOYEE_PROFILES.jake.inspectionEnabled,
    alice: EMPLOYEE_PROFILES.alice.inspectionEnabled,
    clara: EMPLOYEE_PROFILES.clara.inspectionEnabled,
    grace: EMPLOYEE_PROFILES.grace.inspectionEnabled,
    maya: EMPLOYEE_PROFILES.maya.inspectionEnabled,
  };
}

export function auditAppearanceVariantsForEnabledEmployees(): AppearanceVariantAuditRow[] {
  const enabledSet = new Set<EmployeeKey>(INSPECTION_ENABLED_EMPLOYEE_KEYS);
  return APPEARANCE_VARIANTS.filter((variant) => enabledSet.has(variant.employeeKey)).map((variant) => ({
    employeeKey: variant.employeeKey,
    variantKey: variant.variantKey,
    spriteFrameUuid: variant.spriteFrameUuid,
    failedRuleKeys: [...variant.failedRuleKeys],
  }));
}
