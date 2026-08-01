import { buildRoundSignature } from '../inspection/RoundSignature';
import type { RoundInstance, CaseKind, EmployeeCardField, ApplicationField, EmployeeKey } from '../inspection/InspectionTypes';
import { validateRoundInstance } from '../inspection/RoundValidator';
import {
  INSPECTION_ENABLED_EMPLOYEE_KEYS,
  canEmployeeServeCase,
} from '../inspection/EmployeeProfileCatalog';
import type {
  CampaignRoundSpec,
  CampaignRoundTruthConstraint,
  DayOptionalCaseEntry,
  DayRequiredCaseQuota,
  GeneratedDayQueue,
} from './DayQueueTypes';
import type { DayLevelConfig } from './DayLevelConfig';

const VISIBLE_CARD_FAILURE_FIELDS: readonly EmployeeCardField[] = ['EMPLOYEE_ID', 'NAME', 'VALID_UNTIL'];
const VISIBLE_APPLICATION_FAILURE_FIELDS: readonly ApplicationField[] = [
  'EMPLOYEE_ID',
  'NAME',
  'POSITION',
  'DEPARTMENT',
  'VALID_UNTIL',
  'REASON_FOR_ENTRY',
];

function buildQueueErrorMessage(args: {
  readonly dayIndex: number;
  readonly queueIndex: number;
  readonly specId: string;
  readonly expected: string;
  readonly actual: string;
}): string {
  return `[DayQueueValidator] dayIndex=${args.dayIndex} queueIndex=${args.queueIndex} specId=${args.specId} expected=${args.expected} actual=${args.actual}`;
}

function isTruthyBoolean(value: boolean | undefined): value is boolean {
  return value === true || value === false;
}

function formatTruth(truth: CampaignRoundTruthConstraint | undefined): string {
  if (!truth) {
    return '{}';
  }
  return JSON.stringify(truth);
}

export function validateRoundSpecFeasibility(spec: CampaignRoundSpec): string[] {
  const errors: string[] = [];
  if (!spec.specId || spec.specId.trim().length === 0) {
    errors.push('specId must be non-empty.');
  }
  if (spec.mode === 'legacy-random') {
    return errors;
  }

  const truth = spec.truth;
  const caseKind = spec.caseKind;
  if (!truth && !caseKind) {
    return errors;
  }

  if (caseKind === 'VALID_HUMAN') {
    if (truth?.appearancePass === false) errors.push('VALID_HUMAN cannot set appearancePass=false.');
    if (truth?.idCardPass === false) errors.push('VALID_HUMAN cannot set idCardPass=false.');
    if (truth?.applicationPass === false) errors.push('VALID_HUMAN cannot set applicationPass=false.');
  }

  if (caseKind === 'INVALID_HUMAN') {
    if (truth?.appearancePass === false) errors.push('INVALID_HUMAN cannot set appearancePass=false.');
    if (truth?.idCardPass === true && truth?.applicationPass === true) {
      errors.push('INVALID_HUMAN cannot force both documents pass.');
    }
  }

  if (caseKind === 'DISGUISED_MONSTER') {
    if (truth?.appearancePass === true) errors.push('DISGUISED_MONSTER cannot set appearancePass=true.');
  }

  if (!caseKind) {
    if (truth?.appearancePass === false) {
      // implied monster; valid
    } else if (
      truth?.appearancePass === true &&
      truth?.idCardPass === true &&
      truth?.applicationPass === true
    ) {
      // implied valid; valid
    } else if (
      truth?.appearancePass === true &&
      (truth?.idCardPass === false || truth?.applicationPass === false)
    ) {
      // implied invalid; valid
    }
  }

  return errors;
}

export function inferCaseKindFromSpec(spec: CampaignRoundSpec): CaseKind | null {
  if (spec.mode === 'legacy-random') {
    return null;
  }
  if (spec.caseKind) {
    return spec.caseKind;
  }
  const truth = spec.truth;
  if (!truth) {
    return null;
  }
  if (truth.appearancePass === false) {
    return 'DISGUISED_MONSTER';
  }
  if (truth.appearancePass === true && truth.idCardPass === true && truth.applicationPass === true) {
    return 'VALID_HUMAN';
  }
  if (
    truth.appearancePass === true &&
    (truth.idCardPass === false || truth.applicationPass === false)
  ) {
    return 'INVALID_HUMAN';
  }
  return null;
}

export function doesRoundMatchSpec(round: RoundInstance, spec: CampaignRoundSpec): boolean {
  if (spec.mode === 'legacy-random') {
    return true;
  }
  if (spec.employeeKey && round.employeeKey !== spec.employeeKey) {
    return false;
  }
  const inferred = inferCaseKindFromSpec(spec);
  if (spec.caseKind && round.caseKind !== spec.caseKind) {
    return false;
  }
  if (!spec.caseKind && inferred && round.caseKind !== inferred) {
    return false;
  }
  if (isTruthyBoolean(spec.truth?.idCardPass) && round.truth.cardPass !== spec.truth!.idCardPass) {
    return false;
  }
  if (
    isTruthyBoolean(spec.truth?.applicationPass) &&
    round.truth.applicationPass !== spec.truth!.applicationPass
  ) {
    return false;
  }
  if (
    isTruthyBoolean(spec.truth?.appearancePass) &&
    round.truth.appearancePass !== spec.truth!.appearancePass
  ) {
    return false;
  }
  return true;
}

export function getEligibleEmployeeKeysForSpec(args: {
  spec: CampaignRoundSpec;
  inspectionDate: string;
  excludedEmployeeKeys?: ReadonlySet<EmployeeKey>;
}): EmployeeKey[] {
  const { spec, inspectionDate, excludedEmployeeKeys } = args;
  if (spec.mode !== 'employee-constraint') {
    return [];
  }
  if (spec.employeeKey) {
    if (excludedEmployeeKeys?.has(spec.employeeKey)) {
      return [];
    }
    return canEmployeeServeCase({
      employeeKey: spec.employeeKey,
      caseKind: spec.caseKind ?? inferCaseKindFromSpec(spec) ?? 'INVALID_HUMAN',
      inspectionDate,
      requiredTruth: spec.truth,
    })
      ? [spec.employeeKey]
      : [];
  }
  return INSPECTION_ENABLED_EMPLOYEE_KEYS.filter((employeeKey) => {
    if (excludedEmployeeKeys?.has(employeeKey)) {
      return false;
    }
    return canEmployeeServeCase({
      employeeKey,
      caseKind: spec.caseKind ?? inferCaseKindFromSpec(spec) ?? 'INVALID_HUMAN',
      inspectionDate,
      requiredTruth: spec.truth,
    });
  });
}

export function validateDayQueueConfig(config: DayLevelConfig): string[] {
  const errors: string[] = [];
  const quotaIds = new Set<string>();
  const entryIds = new Set<string>();
  let requiredTotal = 0;

  for (const quota of config.requiredCaseQuotas) {
    if (quotaIds.has(quota.quotaId)) {
      errors.push(`requiredCaseQuotas duplicate quotaId=${quota.quotaId}`);
    }
    quotaIds.add(quota.quotaId);
    if (!Number.isInteger(quota.count) || quota.count <= 0) {
      errors.push(`requiredCaseQuotas[${quota.quotaId}] count must be positive integer.`);
    }
    requiredTotal += quota.count;
    const specErrors = validateRoundSpecFeasibility(quota.spec);
    for (const reason of specErrors) {
      errors.push(`requiredCaseQuotas[${quota.quotaId}] ${reason}`);
    }
  }

  for (const entry of config.optionalCasePool) {
    if (entryIds.has(entry.entryId)) {
      errors.push(`optionalCasePool duplicate entryId=${entry.entryId}`);
    }
    entryIds.add(entry.entryId);
    if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
      errors.push(`optionalCasePool[${entry.entryId}] weight must be finite positive.`);
    }
    const specErrors = validateRoundSpecFeasibility(entry.spec);
    for (const reason of specErrors) {
      errors.push(`optionalCasePool[${entry.entryId}] ${reason}`);
    }
  }

  if (requiredTotal > config.encounterCountMax) {
    errors.push(`required total ${requiredTotal} exceeds encounterCountMax ${config.encounterCountMax}.`);
  }
  if (requiredTotal < config.encounterCountMin && config.optionalCasePool.length === 0) {
    errors.push('optionalCasePool cannot be empty when required total is below encounterCountMin.');
  }

  return errors;
}

export function validateGeneratedDayQueue(
  queue: GeneratedDayQueue,
  config: DayLevelConfig,
  buildInputPreviousSignature: string | null,
): string[] {
  const errors: string[] = [];
  const usedEmployeeKeysForDay = new Set<EmployeeKey>();

  if (queue.targetEncounterCount < config.encounterCountMin || queue.targetEncounterCount > config.encounterCountMax) {
    errors.push(
      buildQueueErrorMessage({
        dayIndex: queue.dayIndex,
        queueIndex: -1,
        specId: 'queue-root',
        expected: `target within [${config.encounterCountMin}, ${config.encounterCountMax}]`,
        actual: String(queue.targetEncounterCount),
      }),
    );
  }
  if (queue.rounds.length !== queue.targetEncounterCount) {
    errors.push(
      buildQueueErrorMessage({
        dayIndex: queue.dayIndex,
        queueIndex: -1,
        specId: 'queue-root',
        expected: `rounds.length=${queue.targetEncounterCount}`,
        actual: String(queue.rounds.length),
      }),
    );
  }
  if (queue.signatures.length !== queue.targetEncounterCount) {
    errors.push(
      buildQueueErrorMessage({
        dayIndex: queue.dayIndex,
        queueIndex: -1,
        specId: 'queue-root',
        expected: `signatures.length=${queue.targetEncounterCount}`,
        actual: String(queue.signatures.length),
      }),
    );
  }
  if (queue.entries.length !== queue.targetEncounterCount) {
    errors.push(
      buildQueueErrorMessage({
        dayIndex: queue.dayIndex,
        queueIndex: -1,
        specId: 'queue-root',
        expected: `entries.length=${queue.targetEncounterCount}`,
        actual: String(queue.entries.length),
      }),
    );
  }
  if (queue.requiredEncounterCount + queue.optionalEncounterCount !== queue.targetEncounterCount) {
    errors.push(
      buildQueueErrorMessage({
        dayIndex: queue.dayIndex,
        queueIndex: -1,
        specId: 'queue-root',
        expected: 'requiredEncounterCount + optionalEncounterCount = targetEncounterCount',
        actual: `${queue.requiredEncounterCount} + ${queue.optionalEncounterCount} != ${queue.targetEncounterCount}`,
      }),
    );
  }

  const requiredCounter = new Map<string, number>();
  for (const quota of config.requiredCaseQuotas) {
    requiredCounter.set(quota.quotaId, 0);
  }

  let previousSignature = buildInputPreviousSignature;
  const seenQueueIndexes = new Set<number>();
  for (let i = 0; i < queue.entries.length; i += 1) {
    const entry = queue.entries[i];
    const round = entry.round;
    const specId = entry.spec.specId;
    if (seenQueueIndexes.has(entry.queueIndex)) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'unique queueIndex',
          actual: 'duplicated queueIndex',
        }),
      );
    }
    seenQueueIndexes.add(entry.queueIndex);
    if (!round) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'defined RoundInstance',
          actual: 'undefined',
        }),
      );
      continue;
    }
    if (usedEmployeeKeysForDay.has(round.employeeKey)) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'employeeKey unique within day queue',
          actual: `duplicate employeeKey=${round.employeeKey}`,
        }),
      );
    }
    usedEmployeeKeysForDay.add(round.employeeKey);
    if (!INSPECTION_ENABLED_EMPLOYEE_KEYS.includes(round.employeeKey)) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'inspectionEnabled employee',
          actual: `employeeKey=${round.employeeKey}`,
        }),
      );
    }
    const validation = validateRoundInstance(round, previousSignature);
    if (!validation.ok) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'RoundValidator ok',
          actual: validation.errors.join(' | '),
        }),
      );
    }
    if (!doesRoundMatchSpec(round, entry.spec)) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: `round matches spec truth=${formatTruth(entry.spec.mode === 'employee-constraint' ? entry.spec.truth : undefined)}`,
          actual: JSON.stringify({
            employeeKey: round.employeeKey,
            caseKind: round.caseKind,
            truth: round.truth,
          }),
        }),
      );
    }
    if (
      entry.spec.mode === 'employee-constraint' &&
      !canEmployeeServeCase({
        employeeKey: round.employeeKey,
        caseKind: entry.spec.caseKind ?? inferCaseKindFromSpec(entry.spec) ?? round.caseKind,
        inspectionDate: round.inspectionDate,
        requiredTruth: entry.spec.truth,
      })
    ) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'employee capable for constrained case',
          actual: `employeeKey=${round.employeeKey} caseKind=${round.caseKind} truth=${JSON.stringify(round.truth)}`,
        }),
      );
    }
    const rebuiltSignature = buildRoundSignature({
      roundId: round.roundId,
      inspectionDate: round.inspectionDate,
      employeeKey: round.employeeKey,
      caseKind: round.caseKind,
      card: round.card,
      application: round.application,
      appearance: round.appearance,
      truth: round.truth,
      difficultyTier: round.difficultyTier,
    });
    if (rebuiltSignature !== round.signature || queue.signatures[i] !== round.signature) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'signature consistent with round and signature list',
          actual: `round.signature=${round.signature}, rebuilt=${rebuiltSignature}, list=${queue.signatures[i]}`,
        }),
      );
    }
    if (previousSignature && previousSignature === round.signature) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'adjacent signatures differ',
          actual: round.signature,
        }),
      );
    }
    if (round.caseKind !== 'DISGUISED_MONSTER' && round.truth.appearancePass === false) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'human appearancePass=true',
          actual: `caseKind=${round.caseKind}, appearancePass=false`,
        }),
      );
    }
    if (round.caseKind === 'DISGUISED_MONSTER' && round.truth.appearancePass === true) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'monster appearancePass=false',
          actual: 'appearancePass=true',
        }),
      );
    }
    if (round.caseKind === 'VALID_HUMAN' && (!round.truth.cardPass || !round.truth.applicationPass || !round.truth.appearancePass)) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'VALID_HUMAN all pass',
          actual: JSON.stringify(round.truth),
        }),
      );
    }
    if (round.caseKind === 'INVALID_HUMAN' && round.truth.cardPass && round.truth.applicationPass) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'INVALID_HUMAN has at least one doc fail',
          actual: JSON.stringify(round.truth),
        }),
      );
    }
    if (!round.truth.cardPass && !round.card.failedFields.some((field) => VISIBLE_CARD_FAILURE_FIELDS.includes(field))) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'card fail should be visually checkable',
          actual: `failedFields=${JSON.stringify(round.card.failedFields)}`,
        }),
      );
    }
    if (
      !round.truth.applicationPass &&
      !round.application.failedFields.some((field) => VISIBLE_APPLICATION_FAILURE_FIELDS.includes(field))
    ) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: entry.queueIndex,
          specId,
          expected: 'application fail should be visually checkable',
          actual: `failedFields=${JSON.stringify(round.application.failedFields)}`,
        }),
      );
    }
    if (entry.sourceKind === 'required') {
      requiredCounter.set(entry.sourceId, (requiredCounter.get(entry.sourceId) ?? 0) + 1);
    }
    previousSignature = round.signature;
  }

  for (const quota of config.requiredCaseQuotas) {
    const actual = requiredCounter.get(quota.quotaId) ?? 0;
    if (actual !== quota.count) {
      errors.push(
        buildQueueErrorMessage({
          dayIndex: queue.dayIndex,
          queueIndex: -1,
          specId: quota.spec.specId,
          expected: `required quota ${quota.quotaId} count=${quota.count}`,
          actual: `count=${actual}`,
        }),
      );
    }
  }

  return errors;
}

export function cloneQuotaSnapshot(values: readonly DayRequiredCaseQuota[]): DayRequiredCaseQuota[] {
  return values.map((quota) => ({
    quotaId: quota.quotaId,
    count: quota.count,
    spec: quota.spec,
  }));
}

export function cloneOptionalSnapshot(values: readonly DayOptionalCaseEntry[]): DayOptionalCaseEntry[] {
  return values.map((entry) => ({
    entryId: entry.entryId,
    weight: entry.weight,
    spec: entry.spec,
  }));
}
