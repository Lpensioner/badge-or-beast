import type { RoundInstance, EmployeeKey } from '../inspection/InspectionTypes';
import { EMPLOYEE_PROFILES, INSPECTION_ENABLED_EMPLOYEE_KEYS } from '../inspection/EmployeeProfileCatalog';
import type { DayLevelConfig } from './DayLevelConfig';
import type {
  CampaignRoundSpec,
  DayQueueBuildInput,
  DayRequiredCaseQuota,
  DayQueueStaticCheckResult,
  GeneratedDayQueue,
  GeneratedDayQueueEntry,
} from './DayQueueTypes';
import {
  cloneOptionalSnapshot,
  cloneQuotaSnapshot,
  doesRoundMatchSpec,
  getEligibleEmployeeKeysForSpec,
  validateDayQueueConfig,
  validateGeneratedDayQueue,
} from './DayQueueValidator';

const MAX_QUEUE_BUILD_ATTEMPTS = 12;
const MAX_DAY4_LEGACY_RANDOM_DUPLICATE_RETRY_ATTEMPTS = 24;
const HARD_UNIQUE_EMPLOYEE_DAY_INDEX_SET = new Set<number>([1, 2, 3, 5]);

interface PlannedSlot {
  readonly sourceKind: 'required' | 'optional';
  readonly sourceId: string;
  readonly spec: CampaignRoundSpec;
}

function isEmployeeConstraintSlot(slot: PlannedSlot): boolean {
  return slot.spec.mode === 'employee-constraint';
}

function getDay6AssignmentPriority(spec: Extract<CampaignRoundSpec, { mode: 'employee-constraint' }>): number {
  if (spec.caseKind === 'DISGUISED_MONSTER') {
    return 0;
  }
  if (spec.caseKind === 'VALID_HUMAN') {
    return 1;
  }
  if (
    spec.caseKind === 'INVALID_HUMAN' &&
    spec.truth?.idCardPass === true &&
    spec.truth?.applicationPass === false &&
    spec.truth?.appearancePass === true
  ) {
    return 2;
  }
  if (
    spec.caseKind === 'INVALID_HUMAN' &&
    spec.truth?.idCardPass === false &&
    spec.truth?.applicationPass === true &&
    spec.truth?.appearancePass === true
  ) {
    return 3;
  }
  return 4;
}

function buildDay6UniqueEmployeeAssignments(args: {
  slots: PlannedSlot[];
  inspectionDate: string;
  random: () => number;
  previousQueueLastEmployeeKey: EmployeeKey | null;
}): Map<number, EmployeeKey> | null {
  const indexed = args.slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => isEmployeeConstraintSlot(slot))
    .map(({ slot, index }) => {
      const spec = slot.spec as Extract<CampaignRoundSpec, { mode: 'employee-constraint' }>;
      const candidates = getEligibleEmployeeKeysForSpec({
        spec,
        inspectionDate: args.inspectionDate,
      });
      return {
        index,
        slot,
        spec,
        candidates,
      };
    });

  indexed.sort((a, b) => {
    const priorityDiff = getDay6AssignmentPriority(a.spec) - getDay6AssignmentPriority(b.spec);
    if (priorityDiff !== 0) {
      return priorityDiff;
    }
    const candidateCountDiff = a.candidates.length - b.candidates.length;
    if (candidateCountDiff !== 0) {
      return candidateCountDiff;
    }
    return 0;
  });

  const assignment = new Map<number, EmployeeKey>();
  const used = new Set<EmployeeKey>();
  const dfs = (cursor: number): boolean => {
    if (cursor >= indexed.length) {
      return true;
    }
    const current = indexed[cursor];
    let pool = current.candidates.filter((employeeKey) => !used.has(employeeKey));
    if (pool.length === 0) {
      return false;
    }
    if (
      current.index === 0 &&
      args.previousQueueLastEmployeeKey &&
      pool.length > 1 &&
      pool.includes(args.previousQueueLastEmployeeKey)
    ) {
      const preferred = pool.filter((employeeKey) => employeeKey !== args.previousQueueLastEmployeeKey);
      if (preferred.length > 0) {
        pool = preferred;
      }
    }
    pool = fisherYatesShuffle(pool, args.random);
    for (const employeeKey of pool) {
      assignment.set(current.index, employeeKey);
      used.add(employeeKey);
      if (dfs(cursor + 1)) {
        return true;
      }
      used.delete(employeeKey);
      assignment.delete(current.index);
    }
    return false;
  };

  if (!dfs(0)) {
    return null;
  }
  return assignment;
}

function shouldUseHardUniqueEmployeeAssignments(dayIndex: number): boolean {
  return HARD_UNIQUE_EMPLOYEE_DAY_INDEX_SET.has(dayIndex);
}

function buildHardUniqueEmployeeAssignments(args: {
  slots: PlannedSlot[];
  inspectionDate: string;
  random: () => number;
  previousQueueLastEmployeeKey: EmployeeKey | null;
}): Map<number, EmployeeKey> | null {
  const indexed = args.slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => isEmployeeConstraintSlot(slot))
    .map(({ slot, index }) => {
      const spec = slot.spec as Extract<CampaignRoundSpec, { mode: 'employee-constraint' }>;
      const candidates = getEligibleEmployeeKeysForSpec({
        spec,
        inspectionDate: args.inspectionDate,
      });
      return {
        index,
        spec,
        candidates,
      };
    });

  const randomizedIndexed = fisherYatesShuffle(indexed, args.random);
  randomizedIndexed.sort((a, b) => a.candidates.length - b.candidates.length);

  const assignment = new Map<number, EmployeeKey>();
  const used = new Set<EmployeeKey>();
  const dfs = (cursor: number): boolean => {
    if (cursor >= randomizedIndexed.length) {
      return true;
    }
    const current = randomizedIndexed[cursor];
    let pool = current.candidates.filter((employeeKey) => !used.has(employeeKey));
    if (pool.length === 0) {
      return false;
    }
    if (
      current.index === 0 &&
      args.previousQueueLastEmployeeKey &&
      pool.length > 1 &&
      pool.includes(args.previousQueueLastEmployeeKey)
    ) {
      const preferred = pool.filter((employeeKey) => employeeKey !== args.previousQueueLastEmployeeKey);
      if (preferred.length > 0) {
        pool = preferred;
      }
    }
    pool = fisherYatesShuffle(pool, args.random);
    for (const employeeKey of pool) {
      assignment.set(current.index, employeeKey);
      used.add(employeeKey);
      if (dfs(cursor + 1)) {
        return true;
      }
      used.delete(employeeKey);
      assignment.delete(current.index);
    }
    return false;
  };

  if (!dfs(0)) {
    return null;
  }
  return assignment;
}

function freezeQueue(queue: GeneratedDayQueue): GeneratedDayQueue {
  return Object.freeze({
    ...queue,
    rounds: Object.freeze([...queue.rounds]),
    signatures: Object.freeze([...queue.signatures]),
    entries: Object.freeze([...queue.entries]),
  });
}

function randomIntInclusive(min: number, max: number, random: () => number): number {
  if (min === max) {
    return min;
  }
  const range = max - min + 1;
  return min + Math.floor(random() * range);
}

function fisherYatesShuffle<T>(values: readonly T[], random: () => number): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function weightedPickIndex(weights: readonly number[], random: () => number): number {
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('[DayQueueGenerator] weighted pick failed: non-positive total weight.');
  }
  const threshold = random() * total;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i += 1) {
    cumulative += weights[i];
    if (threshold < cumulative) {
      return i;
    }
  }
  return weights.length - 1;
}

function expandRequiredQuotas(requiredQuotas: readonly DayRequiredCaseQuota[]): PlannedSlot[] {
  const required: PlannedSlot[] = [];
  for (const quota of requiredQuotas) {
    for (let i = 0; i < quota.count; i += 1) {
      required.push({
        sourceKind: 'required',
        sourceId: quota.quotaId,
        spec: quota.spec,
      });
    }
  }
  return required;
}

function fillOptionalSlots(config: DayLevelConfig, count: number, random: () => number): PlannedSlot[] {
  if (count <= 0) {
    return [];
  }
  if (config.optionalCasePool.length === 0) {
    throw new Error(
      `[DayQueueGenerator] dayIndex=${config.dayIndex} optional pool is empty while remaining slot count=${count}.`,
    );
  }
  const weights = config.optionalCasePool.map((entry) => entry.weight);
  const optionalSlots: PlannedSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    const pickedIndex = weightedPickIndex(weights, random);
    const picked = config.optionalCasePool[pickedIndex];
    optionalSlots.push({
      sourceKind: 'optional',
      sourceId: picked.entryId,
      spec: picked.spec,
    });
  }
  return optionalSlots;
}

function toBuildError(
  config: DayLevelConfig,
  reason: string,
  attempts: number,
  extra?: Record<string, unknown>,
): Error {
  const payload = {
    dayIndex: config.dayIndex,
    date: config.date,
    reason,
    attempts,
    ...extra,
  };
  return new Error(`[DayQueue] build failed ${JSON.stringify(payload)}`);
}

function buildEmployeeCaseTruthKey(round: RoundInstance): string {
  return [
    round.employeeKey,
    round.caseKind,
    round.truth.cardPass ? 'card-pass' : 'card-fail',
    round.truth.applicationPass ? 'app-pass' : 'app-fail',
    round.truth.appearancePass ? 'appearance-pass' : 'appearance-fail',
  ].join('|');
}

function filterQueueErrorsForReusePolicy(queueErrors: readonly string[], dayIndex: number): string[] {
  if (dayIndex >= 7) {
    return queueErrors.filter((error) => !error.includes('expected=employeeKey unique within day queue'));
  }
  return [...queueErrors];
}

export function buildDayQueue(input: DayQueueBuildInput): GeneratedDayQueue {
  const config = input.config;
  const configErrors = validateDayQueueConfig(config);
  if (configErrors.length > 0) {
    throw toBuildError(config, 'config-invalid', 0, { errors: configErrors });
  }

  const originalRequiredSnapshot = cloneQuotaSnapshot(config.requiredCaseQuotas);
  const originalOptionalSnapshot = cloneOptionalSnapshot(config.optionalCasePool);
  const requiredSlots = expandRequiredQuotas(config.requiredCaseQuotas);
  const baseTarget = randomIntInclusive(config.encounterCountMin, config.encounterCountMax, input.random);
  const requiredCount = requiredSlots.length;
  const targetEncounterCount = Math.max(baseTarget, requiredCount);
  if (targetEncounterCount > config.encounterCountMax) {
    throw toBuildError(config, 'required-exceeds-max', 0, {
      requiredCount,
      encounterCountMax: config.encounterCountMax,
      targetEncounterCount,
    });
  }
  const optionalCount = targetEncounterCount - requiredCount;
  const optionalSlots = fillOptionalSlots(config, optionalCount, input.random);
  const baseSlots = [...requiredSlots, ...optionalSlots];
  const previousQueueLastEmployeeKey = (() => {
    if (!input.previousSignature) {
      return null;
    }
    try {
      const parsed = JSON.parse(input.previousSignature) as { employeeKey?: string };
      return typeof parsed.employeeKey === 'string' ? (parsed.employeeKey as EmployeeKey) : null;
    } catch {
      return null;
    }
  })();

  let lastErrors: string[] = [];
  for (let attempt = 1; attempt <= MAX_QUEUE_BUILD_ATTEMPTS; attempt += 1) {
    const shuffled = fisherYatesShuffle(baseSlots, input.random);
    const hardUniqueAssignments =
      shouldUseHardUniqueEmployeeAssignments(config.dayIndex)
        ? buildHardUniqueEmployeeAssignments({
            slots: shuffled,
            inspectionDate: config.date,
            random: input.random,
            previousQueueLastEmployeeKey,
          })
        : null;
    const day6Assignments =
      config.dayIndex === 6
        ? buildDay6UniqueEmployeeAssignments({
            slots: shuffled,
            inspectionDate: config.date,
            random: input.random,
            previousQueueLastEmployeeKey,
          })
        : null;
    if (shouldUseHardUniqueEmployeeAssignments(config.dayIndex) && !hardUniqueAssignments) {
      throw toBuildError(config, 'hard-unique-assignment-unresolved', attempt, {
        reason:
          'unable to find same-day unique employee assignment satisfying all employee-constraint specs',
        targetEncounterCount,
      });
    }
    if (config.dayIndex === 6 && !day6Assignments) {
      throw toBuildError(config, 'day6-unique-assignment-unresolved', attempt, {
        reason:
          'unable to find same-day unique employee assignment satisfying all employee-constraint specs',
        targetEncounterCount,
      });
    }
    const entries: GeneratedDayQueueEntry[] = [];
    let previousSignature = input.previousSignature;
    const usedEmployeeKeysForDay = new Set<EmployeeKey>();
    const usedEmployeeCaseTruthKeys = new Set<string>();
    const compositionLog: string[] = [];

    for (let i = 0; i < shuffled.length; i += 1) {
      const slot = shuffled[i];
      const plannedCompletedRoundCount = input.completedRoundCount + i;
      const selectedEmployeeKey = (() => {
        if (slot.spec.mode !== 'employee-constraint') {
          return undefined;
        }
        if (config.dayIndex === 6) {
          const assigned = day6Assignments?.get(i);
          if (assigned) {
            return assigned;
          }
        }
        if (shouldUseHardUniqueEmployeeAssignments(config.dayIndex)) {
          const assigned = hardUniqueAssignments?.get(i);
          if (!assigned) {
            throw toBuildError(config, 'hard-unique-assignment-missing-slot', attempt, {
              queueIndex: i,
              specId: slot.spec.specId,
              sourceId: slot.sourceId,
              sourceKind: slot.sourceKind,
            });
          }
          return assigned;
        }
        const candidates = getEligibleEmployeeKeysForSpec({
          spec: slot.spec,
          inspectionDate: config.date,
        });
        if (candidates.length === 0) {
          throw toBuildError(config, 'no-eligible-candidate', attempt, {
            specId: slot.spec.specId,
            sourceId: slot.sourceId,
            sourceKind: slot.sourceKind,
            usedEmployeeKeys: [...usedEmployeeKeysForDay],
          });
        }
        let pool = candidates;
        if (i === 0 && previousQueueLastEmployeeKey && pool.length > 1) {
          const firstSlotPreferred = pool.filter((key) => key !== previousQueueLastEmployeeKey);
          if (firstSlotPreferred.length > 0) {
            pool = firstSlotPreferred;
          }
        }
        return pool[Math.floor(input.random() * pool.length)];
      })();
      const resolvedSpec =
        slot.spec.mode === 'employee-constraint' && selectedEmployeeKey
          ? ({
              ...slot.spec,
              employeeKey: selectedEmployeeKey,
            } as CampaignRoundSpec)
          : slot.spec;
      const isDay4LegacyRandom =
        config.dayIndex === 4 && slot.sourceKind === 'optional' && resolvedSpec.mode === 'legacy-random';
      let round: RoundInstance | null = null;
      let employeeCaseTruthKey = '';
      const maxAttempts = isDay4LegacyRandom ? MAX_DAY4_LEGACY_RANDOM_DUPLICATE_RETRY_ATTEMPTS : 1;
      for (let duplicateAttempt = 1; duplicateAttempt <= maxAttempts; duplicateAttempt += 1) {
        const generatedRound = input.generateRoundFromSpec({
          spec: resolvedSpec,
          completedRoundCount: plannedCompletedRoundCount,
          previousSignature,
          inspectionDate: config.date,
        });
        const generatedKey = buildEmployeeCaseTruthKey(generatedRound);
        if (usedEmployeeCaseTruthKeys.has(generatedKey) && duplicateAttempt < maxAttempts) {
          continue;
        }
        round = generatedRound;
        employeeCaseTruthKey = generatedKey;
        break;
      }
      if (!round) {
        throw toBuildError(config, 'duplicate-employee-case-truth', attempt, {
          specId: resolvedSpec.specId,
          sourceId: slot.sourceId,
          sourceKind: slot.sourceKind,
        });
      }
      if (usedEmployeeCaseTruthKeys.has(employeeCaseTruthKey)) {
        throw toBuildError(config, 'duplicate-employee-case-truth', attempt, {
          specId: resolvedSpec.specId,
          sourceId: slot.sourceId,
          sourceKind: slot.sourceKind,
          duplicateKey: employeeCaseTruthKey,
        });
      }
      usedEmployeeKeysForDay.add(round.employeeKey);
      usedEmployeeCaseTruthKeys.add(employeeCaseTruthKey);
      compositionLog.push(
        `${resolvedSpec.specId}:${round.employeeKey}:${round.caseKind}:card=${round.truth.cardPass}:app=${round.truth.applicationPass}:appearance=${round.truth.appearancePass}`,
      );
      entries.push(
        Object.freeze({
          queueIndex: i,
          sourceKind: slot.sourceKind,
          sourceId: slot.sourceId,
          spec: resolvedSpec,
          plannedCompletedRoundCount,
          round,
          signature: round.signature,
        }),
      );
      previousSignature = round.signature;
    }

    const rounds = entries.map((entry) => entry.round);
    const signatures = entries.map((entry) => entry.signature);
    const queue = freezeQueue({
      queueId: `day-${config.dayIndex}-${Date.now()}-${attempt}`,
      dayIndex: config.dayIndex,
      date: config.date,
      targetEncounterCount,
      requiredEncounterCount: requiredCount,
      optionalEncounterCount: optionalCount,
      buildAttempts: attempt,
      rounds,
      signatures,
      entries,
    });
    const queueErrors = filterQueueErrorsForReusePolicy(
      validateGeneratedDayQueue(queue, config, input.previousSignature),
      config.dayIndex,
    );
    if (queueErrors.length === 0) {
      const requiredSnapshotAfter = cloneQuotaSnapshot(config.requiredCaseQuotas);
      const optionalSnapshotAfter = cloneOptionalSnapshot(config.optionalCasePool);
      if (JSON.stringify(originalRequiredSnapshot) !== JSON.stringify(requiredSnapshotAfter)) {
        throw toBuildError(config, 'config-mutated-required', attempt);
      }
      if (JSON.stringify(originalOptionalSnapshot) !== JSON.stringify(optionalSnapshotAfter)) {
        throw toBuildError(config, 'config-mutated-optional', attempt);
      }
      console.debug(
        `[DayQueue] dayIndex=${config.dayIndex} inspectionDate=${config.date} enabledEmployeeKeys=${INSPECTION_ENABLED_EMPLOYEE_KEYS.join(',')} templates=${entries
          .map((entry) => entry.spec.specId)
          .join(',')} assignments=${compositionLog.join(' | ')} finalQueueOrder=${entries
          .map((entry) => entry.round.employeeKey)
          .join(' -> ')}`,
      );
      return queue;
    }
    lastErrors = queueErrors;
  }

  throw toBuildError(config, 'queue-invalid-after-retries', MAX_QUEUE_BUILD_ATTEMPTS, {
    errors: lastErrors,
  });
}

export interface DayQueueStaticCheckReport {
  readonly checks: readonly DayQueueStaticCheckResult[];
}

export function runDayQueueStaticSelfCheck(args: {
  readonly dayConfigs: readonly DayLevelConfig[];
  readonly buildQueue: typeof buildDayQueue;
  readonly generateRoundFromSpec: DayQueueBuildInput['generateRoundFromSpec'];
}): DayQueueStaticCheckReport {
  const checks: DayQueueStaticCheckResult[] = [];
  const push = (item: DayQueueStaticCheckResult): void => checks.push(item);
  const byDay = (dayIndex: number): DayLevelConfig => {
    const found = args.dayConfigs.find((entry) => entry.dayIndex === dayIndex);
    if (!found) {
      throw new Error(`[DayQueueSelfCheck] Missing day config for dayIndex=${dayIndex}.`);
    }
    return found;
  };
  const requiredTotal = (day: DayLevelConfig): number =>
    day.requiredCaseQuotas.reduce((sum, quota) => sum + quota.count, 0);
  const buildDeterministicRandom = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  };
  const countCaseKind = (
    queue: GeneratedDayQueue,
    caseKind: 'VALID_HUMAN' | 'INVALID_HUMAN' | 'DISGUISED_MONSTER',
  ): number => queue.rounds.filter((round) => round.caseKind === caseKind).length;
  const countSourceId = (queue: GeneratedDayQueue, sourceId: string): number =>
    queue.entries.filter((entry) => entry.sourceId === sourceId).length;
  const hasVisibleCardFailure = (round: RoundInstance): boolean =>
    round.card.failedFields.some(
      (field) => field === 'EMPLOYEE_ID' || field === 'NAME' || field === 'VALID_UNTIL' || field === 'SEAL',
    );
  const hasVisibleApplicationFailure = (round: RoundInstance): boolean => round.application.failedFields.length > 0;
  const validateQueueAndPush = (queue: GeneratedDayQueue, day: DayLevelConfig): void => {
    const queueErrors = validateGeneratedDayQueue(queue, day, null);
    push({
      testId: `DAY${day.dayIndex}_ROUND_VALIDATOR_AND_SIGNATURE`,
      dayIndex: day.dayIndex,
      pass: queueErrors.length === 0,
      expected: 'validateGeneratedDayQueue returns []',
      actual: queueErrors.join(' || ') || '[]',
    });
    push({
      testId: `DAY${day.dayIndex}_ADJACENT_SIGNATURE_DIFFERENT`,
      dayIndex: day.dayIndex,
      pass: queue.signatures.every((signature, index) => index === 0 || signature !== queue.signatures[index - 1]),
      expected: 'no adjacent equal signatures',
      actual: JSON.stringify(queue.signatures),
    });
    push({
      testId: `DAY${day.dayIndex}_ROUNDS_MATCH_SOURCE_SPEC`,
      dayIndex: day.dayIndex,
      pass: queue.entries.every((entry) => doesRoundMatchSpec(entry.round, entry.spec)),
      expected: 'all entries match spec',
      actual: queue.entries
        .map((entry) => `${entry.spec.specId}:${doesRoundMatchSpec(entry.round, entry.spec) ? 'ok' : 'mismatch'}`)
        .join(', '),
    });
  };

  const day1 = byDay(1);
  const day2 = byDay(2);
  const day3 = byDay(3);
  const day4 = byDay(4);
  const day5 = byDay(5);
  const day6 = byDay(6);
  const day7 = byDay(7);
  const day123 = [day1, day2, day3];
  const day4AndDay7 = [day4, day7];

  push({ testId: 'DAY1_DATE_1999_12_03', dayIndex: 1, pass: day1.date === '1999-12-03', expected: '1999-12-03', actual: day1.date });
  push({ testId: 'DAY2_DATE_1999_12_04', dayIndex: 2, pass: day2.date === '1999-12-04', expected: '1999-12-04', actual: day2.date });
  push({ testId: 'DAY3_DATE_1999_12_05', dayIndex: 3, pass: day3.date === '1999-12-05', expected: '1999-12-05', actual: day3.date });

  push({ testId: 'DAY1_REQUIRED_COUNT_4', dayIndex: 1, pass: requiredTotal(day1) === 4, expected: '4', actual: String(requiredTotal(day1)) });
  push({ testId: 'DAY1_OPTIONAL_COUNT_0', dayIndex: 1, pass: day1.optionalCasePool.length === 0, expected: '0', actual: String(day1.optionalCasePool.length) });
  push({ testId: 'DAY1_NO_LEGACY_RANDOM', dayIndex: 1, pass: day1.requiredCaseQuotas.every((q) => q.spec.mode !== 'legacy-random'), expected: 'all required specs employee-constraint', actual: day1.requiredCaseQuotas.map((q) => q.spec.mode).join(',') });
  push({ testId: 'DAY1_MONSTER_EXACTLY_1', dayIndex: 1, pass: day1.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'DISGUISED_MONSTER').length === 1, expected: '1', actual: String(day1.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'DISGUISED_MONSTER').length) });
  push({ testId: 'DAY1_VALID_HUMAN_EXACTLY_3', dayIndex: 1, pass: day1.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'VALID_HUMAN' && q.spec.truth?.idCardPass === true && q.spec.truth?.applicationPass === true && q.spec.truth?.appearancePass === true).length === 3, expected: '3', actual: String(day1.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'VALID_HUMAN' && q.spec.truth?.idCardPass === true && q.spec.truth?.applicationPass === true && q.spec.truth?.appearancePass === true).length) });
  push({
    testId: 'DAY1_TEMPLATES_USE_DYNAMIC_EMPLOYEE_SELECTION',
    dayIndex: 1,
    pass: day1.requiredCaseQuotas.every(
      (q) => q.spec.mode === 'employee-constraint' && q.spec.employeeKey === undefined,
    ),
    expected: 'all day1 templates leave employeeKey undefined',
    actual: day1.requiredCaseQuotas
      .map((q) => `${q.spec.specId}:${q.spec.mode === 'employee-constraint' ? String(q.spec.employeeKey) : 'n/a'}`)
      .join(','),
  });

  push({ testId: 'DAY2_REQUIRED_COUNT_5', dayIndex: 2, pass: requiredTotal(day2) === 5, expected: '5', actual: String(requiredTotal(day2)) });
  push({ testId: 'DAY2_OPTIONAL_COUNT_0', dayIndex: 2, pass: day2.optionalCasePool.length === 0, expected: '0', actual: String(day2.optionalCasePool.length) });
  push({ testId: 'DAY2_NO_LEGACY_RANDOM', dayIndex: 2, pass: day2.requiredCaseQuotas.every((q) => q.spec.mode !== 'legacy-random'), expected: 'all required specs employee-constraint', actual: day2.requiredCaseQuotas.map((q) => q.spec.mode).join(',') });
  push({ testId: 'DAY2_MONSTER_EXACTLY_1', dayIndex: 2, pass: day2.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'DISGUISED_MONSTER').length === 1, expected: '1', actual: String(day2.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'DISGUISED_MONSTER').length) });
  push({
    testId: 'DAY2_TEMPLATES_USE_DYNAMIC_EMPLOYEE_SELECTION',
    dayIndex: 2,
    pass: day2.requiredCaseQuotas.every(
      (q) => q.spec.mode === 'employee-constraint' && q.spec.employeeKey === undefined,
    ),
    expected: 'all day2 templates leave employeeKey undefined',
    actual: day2.requiredCaseQuotas
      .map((q) => `${q.spec.specId}:${q.spec.mode === 'employee-constraint' ? String(q.spec.employeeKey) : 'n/a'}`)
      .join(','),
  });
  push({ testId: 'DAY2_CARD_INVALID_EXACTLY_1', dayIndex: 2, pass: day2.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'INVALID_HUMAN' && q.spec.truth?.idCardPass === false && q.spec.truth?.applicationPass === true && q.spec.truth?.appearancePass === true).length === 1, expected: '1', actual: String(day2.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'INVALID_HUMAN' && q.spec.truth?.idCardPass === false && q.spec.truth?.applicationPass === true && q.spec.truth?.appearancePass === true).length) });
  push({ testId: 'DAY2_VALID_HUMAN_EXACTLY_3', dayIndex: 2, pass: day2.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'VALID_HUMAN' && q.spec.truth?.idCardPass === true && q.spec.truth?.applicationPass === true && q.spec.truth?.appearancePass === true).length === 3, expected: '3', actual: String(day2.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'VALID_HUMAN' && q.spec.truth?.idCardPass === true && q.spec.truth?.applicationPass === true && q.spec.truth?.appearancePass === true).length) });

  push({ testId: 'DAY3_REQUIRED_COUNT_5', dayIndex: 3, pass: requiredTotal(day3) === 5, expected: '5', actual: String(requiredTotal(day3)) });
  push({ testId: 'DAY3_OPTIONAL_COUNT_0', dayIndex: 3, pass: day3.optionalCasePool.length === 0, expected: '0', actual: String(day3.optionalCasePool.length) });
  push({ testId: 'DAY3_NO_LEGACY_RANDOM', dayIndex: 3, pass: day3.requiredCaseQuotas.every((q) => q.spec.mode !== 'legacy-random'), expected: 'all required specs employee-constraint', actual: day3.requiredCaseQuotas.map((q) => q.spec.mode).join(',') });
  push({ testId: 'DAY3_VALID_HUMAN_EXACTLY_2', dayIndex: 3, pass: day3.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'VALID_HUMAN').length === 2, expected: '2', actual: String(day3.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'VALID_HUMAN').length) });
  push({ testId: 'DAY3_CARD_INVALID_EXACTLY_1', dayIndex: 3, pass: day3.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'INVALID_HUMAN' && q.spec.truth?.idCardPass === false && q.spec.truth?.applicationPass === true && q.spec.truth?.appearancePass === true).length === 1, expected: '1', actual: String(day3.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'INVALID_HUMAN' && q.spec.truth?.idCardPass === false && q.spec.truth?.applicationPass === true && q.spec.truth?.appearancePass === true).length) });
  push({ testId: 'DAY3_APP_INVALID_EXACTLY_1', dayIndex: 3, pass: day3.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'INVALID_HUMAN' && q.spec.truth?.idCardPass === true && q.spec.truth?.applicationPass === false && q.spec.truth?.appearancePass === true).length === 1, expected: '1', actual: String(day3.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'INVALID_HUMAN' && q.spec.truth?.idCardPass === true && q.spec.truth?.applicationPass === false && q.spec.truth?.appearancePass === true).length) });
  push({ testId: 'DAY3_MONSTER_EXACTLY_1', dayIndex: 3, pass: day3.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'DISGUISED_MONSTER').length === 1, expected: '1', actual: String(day3.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'DISGUISED_MONSTER').length) });
  push({ testId: 'DAY5_REQUIRED_COUNT_6', dayIndex: 5, pass: requiredTotal(day5) === 6, expected: '6', actual: String(requiredTotal(day5)) });
  push({ testId: 'DAY5_OPTIONAL_COUNT_0', dayIndex: 5, pass: day5.optionalCasePool.length === 0, expected: '0', actual: String(day5.optionalCasePool.length) });
  push({ testId: 'DAY5_NO_LEGACY_RANDOM', dayIndex: 5, pass: day5.requiredCaseQuotas.every((q) => q.spec.mode !== 'legacy-random'), expected: 'all required specs employee-constraint', actual: day5.requiredCaseQuotas.map((q) => q.spec.mode).join(',') });
  push({ testId: 'DAY5_MONSTER_EXACTLY_2', dayIndex: 5, pass: day5.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'DISGUISED_MONSTER').length === 2, expected: '2', actual: String(day5.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'DISGUISED_MONSTER').length) });
  push({ testId: 'DAY5_VALID_HUMAN_EXACTLY_2', dayIndex: 5, pass: day5.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'VALID_HUMAN').length === 2, expected: '2', actual: String(day5.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'VALID_HUMAN').length) });
  push({ testId: 'DAY5_INVALID_HUMAN_EXACTLY_2', dayIndex: 5, pass: day5.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'INVALID_HUMAN').length === 2, expected: '2', actual: String(day5.requiredCaseQuotas.filter((q) => q.spec.mode === 'employee-constraint' && q.spec.caseKind === 'INVALID_HUMAN').length) });

  const day1Queue = args.buildQueue({
    config: day1,
    completedRoundCount: 0,
    previousSignature: null,
    random: buildDeterministicRandom(101),
    generateRoundFromSpec: args.generateRoundFromSpec,
  });
  const day2Queue = args.buildQueue({
    config: day2,
    completedRoundCount: 3,
    previousSignature: null,
    random: buildDeterministicRandom(202),
    generateRoundFromSpec: args.generateRoundFromSpec,
  });
  const day3Queue = args.buildQueue({
    config: day3,
    completedRoundCount: 7,
    previousSignature: null,
    random: buildDeterministicRandom(303),
    generateRoundFromSpec: args.generateRoundFromSpec,
  });
  const day5Queue = args.buildQueue({
    config: day5,
    completedRoundCount: 11,
    previousSignature: null,
    random: buildDeterministicRandom(505),
    generateRoundFromSpec: args.generateRoundFromSpec,
  });
  const day6Queue = args.buildQueue({
    config: day6,
    completedRoundCount: 17,
    previousSignature: null,
    random: buildDeterministicRandom(606),
    generateRoundFromSpec: args.generateRoundFromSpec,
  });

  push({
    testId: 'DAY1_ROUND_INSPECTION_DATE_PROPAGATED',
    dayIndex: 1,
    pass: day1Queue.rounds.every((round) => round.inspectionDate === day1.date),
    expected: day1.date,
    actual: day1Queue.rounds.map((round) => round.inspectionDate).join(','),
  });
  push({
    testId: 'DAY2_ROUND_INSPECTION_DATE_PROPAGATED',
    dayIndex: 2,
    pass: day2Queue.rounds.every((round) => round.inspectionDate === day2.date),
    expected: day2.date,
    actual: day2Queue.rounds.map((round) => round.inspectionDate).join(','),
  });
  push({
    testId: 'DAY3_ROUND_INSPECTION_DATE_PROPAGATED',
    dayIndex: 3,
    pass: day3Queue.rounds.every((round) => round.inspectionDate === day3.date),
    expected: day3.date,
    actual: day3Queue.rounds.map((round) => round.inspectionDate).join(','),
  });
  push({
    testId: 'DAY5_ROUND_INSPECTION_DATE_PROPAGATED',
    dayIndex: 5,
    pass: day5Queue.rounds.every((round) => round.inspectionDate === day5.date),
    expected: day5.date,
    actual: day5Queue.rounds.map((round) => round.inspectionDate).join(','),
  });

  push({
    testId: 'DAY1235_DYNAMIC_SELECTION_NO_DUPLICATE_WITHIN_DAY',
    pass: [day1Queue, day2Queue, day3Queue, day5Queue].every(
      (queue) => new Set(queue.rounds.map((round) => round.employeeKey)).size === queue.rounds.length,
    ),
    expected: 'each day queue uses unique employee keys',
    actual: [day1Queue, day2Queue, day3Queue, day5Queue]
      .map((queue) => `day${queue.dayIndex}:${queue.rounds.map((round) => round.employeeKey).join(',')}`)
      .join(' ; '),
  });

  push({ testId: 'DAY1_QUEUE_SIZE_4', dayIndex: 1, pass: day1Queue.rounds.length === 4 && day1Queue.targetEncounterCount === 4, expected: '4', actual: `${day1Queue.rounds.length}/${day1Queue.targetEncounterCount}` });
  push({ testId: 'DAY1_QUEUE_MONSTER_1', dayIndex: 1, pass: countCaseKind(day1Queue, 'DISGUISED_MONSTER') === 1, expected: '1', actual: String(countCaseKind(day1Queue, 'DISGUISED_MONSTER')) });
  push({ testId: 'DAY1_QUEUE_VALID_3', dayIndex: 1, pass: countCaseKind(day1Queue, 'VALID_HUMAN') === 3, expected: '3', actual: String(countCaseKind(day1Queue, 'VALID_HUMAN')) });
  push({ testId: 'DAY1_QUEUE_VALID_ALL_TRUE', dayIndex: 1, pass: day1Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN').every((r) => r.truth.cardPass && r.truth.applicationPass && r.truth.appearancePass), expected: 'valid humans all true', actual: day1Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN').map((r) => `${r.truth.cardPass}/${r.truth.applicationPass}/${r.truth.appearancePass}`).join(',') });
  push({ testId: 'DAY1_QUEUE_MONSTER_APPEARANCE_FALSE', dayIndex: 1, pass: day1Queue.rounds.filter((r) => r.caseKind === 'DISGUISED_MONSTER').every((r) => r.truth.appearancePass === false), expected: 'monster appearance=false', actual: day1Queue.rounds.filter((r) => r.caseKind === 'DISGUISED_MONSTER').map((r) => String(r.truth.appearancePass)).join(',') });
  push({ testId: 'DAY1_MONSTER_PORTRAIT_EXISTS', dayIndex: 1, pass: day1Queue.rounds.filter((r) => r.caseKind === 'DISGUISED_MONSTER').every((r) => !!EMPLOYEE_PROFILES[r.employeeKey].monsterPortraitSpriteFrameUuid), expected: 'day1 monsters have monster portrait uuid', actual: day1Queue.rounds.filter((r) => r.caseKind === 'DISGUISED_MONSTER').map((r) => `${r.employeeKey}:${String(!!EMPLOYEE_PROFILES[r.employeeKey].monsterPortraitSpriteFrameUuid)}`).join(',') });
  push({ testId: 'DAY1_MONSTER_FULLBODY_EXISTS', dayIndex: 1, pass: day1Queue.rounds.filter((r) => r.caseKind === 'DISGUISED_MONSTER').every((r) => !!EMPLOYEE_PROFILES[r.employeeKey].monsterFullbodySpriteFrameUuid), expected: 'day1 monsters have monster fullbody uuid', actual: day1Queue.rounds.filter((r) => r.caseKind === 'DISGUISED_MONSTER').map((r) => `${r.employeeKey}:${String(!!EMPLOYEE_PROFILES[r.employeeKey].monsterFullbodySpriteFrameUuid)}`).join(',') });

  push({ testId: 'DAY2_QUEUE_SIZE_5', dayIndex: 2, pass: day2Queue.rounds.length === 5 && day2Queue.targetEncounterCount === 5, expected: '5', actual: `${day2Queue.rounds.length}/${day2Queue.targetEncounterCount}` });
  push({ testId: 'DAY2_QUEUE_MONSTER_1', dayIndex: 2, pass: countCaseKind(day2Queue, 'DISGUISED_MONSTER') === 1, expected: '1', actual: String(countCaseKind(day2Queue, 'DISGUISED_MONSTER')) });
  push({
    testId: 'DAY2_QUEUE_MONSTER_EMPLOYEE_DISTINCT_1',
    dayIndex: 2,
    pass: new Set(day2Queue.rounds.filter((r) => r.caseKind === 'DISGUISED_MONSTER').map((r) => r.employeeKey))
      .size === 1,
    expected: '1 distinct queue monster employee',
    actual: day2Queue.rounds
      .filter((r) => r.caseKind === 'DISGUISED_MONSTER')
      .map((r) => r.employeeKey)
      .join(','),
  });
  push({ testId: 'DAY2_QUEUE_CARD_INVALID_1', dayIndex: 2, pass: day2Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN' && r.truth.cardPass === false && r.truth.applicationPass === true && r.truth.appearancePass === true).length === 1, expected: '1', actual: String(day2Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN' && r.truth.cardPass === false && r.truth.applicationPass === true && r.truth.appearancePass === true).length) });
  push({ testId: 'DAY2_QUEUE_VALID_3', dayIndex: 2, pass: day2Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN' && r.truth.cardPass && r.truth.applicationPass && r.truth.appearancePass).length === 3, expected: '3', actual: String(day2Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN' && r.truth.cardPass && r.truth.applicationPass && r.truth.appearancePass).length) });
  push({ testId: 'DAY2_CARD_INVALID_APPLICATION_TRUE', dayIndex: 2, pass: day2Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN' && r.truth.cardPass === false).every((r) => r.truth.applicationPass === true), expected: 'all day2 card-invalid have application=true', actual: day2Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN').map((r) => `${r.truth.cardPass}/${r.truth.applicationPass}/${r.truth.appearancePass}`).join(',') });
  push({ testId: 'DAY2_VALID_ALL_TRUE', dayIndex: 2, pass: day2Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN').every((r) => r.truth.cardPass && r.truth.applicationPass && r.truth.appearancePass), expected: 'valid humans all true', actual: day2Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN').map((r) => `${r.truth.cardPass}/${r.truth.applicationPass}/${r.truth.appearancePass}`).join(',') });

  push({ testId: 'DAY3_QUEUE_SIZE_5', dayIndex: 3, pass: day3Queue.rounds.length === 5 && day3Queue.targetEncounterCount === 5, expected: '5', actual: `${day3Queue.rounds.length}/${day3Queue.targetEncounterCount}` });
  push({ testId: 'DAY3_QUEUE_VALID_2', dayIndex: 3, pass: day3Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN').length === 2, expected: '2', actual: String(day3Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN').length) });
  push({ testId: 'DAY3_QUEUE_CARD_INVALID_1', dayIndex: 3, pass: day3Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN' && r.truth.cardPass === false && r.truth.applicationPass === true && r.truth.appearancePass === true).length === 1, expected: '1', actual: String(day3Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN' && r.truth.cardPass === false && r.truth.applicationPass === true && r.truth.appearancePass === true).length) });
  push({ testId: 'DAY3_QUEUE_APP_INVALID_1', dayIndex: 3, pass: day3Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN' && r.truth.cardPass === true && r.truth.applicationPass === false && r.truth.appearancePass === true).length === 1, expected: '1', actual: String(day3Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN' && r.truth.cardPass === true && r.truth.applicationPass === false && r.truth.appearancePass === true).length) });
  push({ testId: 'DAY3_QUEUE_MONSTER_1', dayIndex: 3, pass: countCaseKind(day3Queue, 'DISGUISED_MONSTER') === 1, expected: '1', actual: String(countCaseKind(day3Queue, 'DISGUISED_MONSTER')) });
  push({ testId: 'DAY3_CARD_INVALID_ONLY_CARD_FAIL', dayIndex: 3, pass: day3Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN' && r.truth.cardPass === false).every((r) => r.truth.applicationPass === true && r.truth.appearancePass === true), expected: 'card-invalid only card fail', actual: day3Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN').map((r) => `${r.truth.cardPass}/${r.truth.applicationPass}/${r.truth.appearancePass}`).join(',') });
  push({ testId: 'DAY3_APP_INVALID_ONLY_APP_FAIL', dayIndex: 3, pass: day3Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN' && r.truth.applicationPass === false).every((r) => r.truth.cardPass === true && r.truth.appearancePass === true), expected: 'app-invalid only application fail', actual: day3Queue.rounds.filter((r) => r.caseKind === 'INVALID_HUMAN').map((r) => `${r.truth.cardPass}/${r.truth.applicationPass}/${r.truth.appearancePass}`).join(',') });
  push({ testId: 'DAY3_VALID_ALL_PASS', dayIndex: 3, pass: day3Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN').every((r) => r.truth.cardPass && r.truth.applicationPass && r.truth.appearancePass), expected: 'valid all pass', actual: day3Queue.rounds.filter((r) => r.caseKind === 'VALID_HUMAN').map((r) => `${r.truth.cardPass}/${r.truth.applicationPass}/${r.truth.appearancePass}`).join(',') });
  push({ testId: 'DAY3_MONSTER_APPEARANCE_FALSE', dayIndex: 3, pass: day3Queue.rounds.filter((r) => r.caseKind === 'DISGUISED_MONSTER').every((r) => r.truth.appearancePass === false), expected: 'monster appearance=false', actual: day3Queue.rounds.filter((r) => r.caseKind === 'DISGUISED_MONSTER').map((r) => String(r.truth.appearancePass)).join(',') });
  push({ testId: 'DAY5_QUEUE_SIZE_6', dayIndex: 5, pass: day5Queue.rounds.length === 6 && day5Queue.targetEncounterCount === 6, expected: '6', actual: `${day5Queue.rounds.length}/${day5Queue.targetEncounterCount}` });
  push({ testId: 'DAY5_QUEUE_MONSTER_2', dayIndex: 5, pass: countCaseKind(day5Queue, 'DISGUISED_MONSTER') === 2, expected: '2', actual: String(countCaseKind(day5Queue, 'DISGUISED_MONSTER')) });
  push({ testId: 'DAY5_QUEUE_VALID_2', dayIndex: 5, pass: countCaseKind(day5Queue, 'VALID_HUMAN') === 2, expected: '2', actual: String(countCaseKind(day5Queue, 'VALID_HUMAN')) });
  push({ testId: 'DAY5_QUEUE_INVALID_2', dayIndex: 5, pass: countCaseKind(day5Queue, 'INVALID_HUMAN') === 2, expected: '2', actual: String(countCaseKind(day5Queue, 'INVALID_HUMAN')) });
  push({ testId: 'DAY6_QUEUE_SIZE_7', dayIndex: 6, pass: day6Queue.rounds.length === 7 && day6Queue.targetEncounterCount === 7, expected: '7', actual: `${day6Queue.rounds.length}/${day6Queue.targetEncounterCount}` });
  push({ testId: 'DAY6_QUEUE_MONSTER_2', dayIndex: 6, pass: countCaseKind(day6Queue, 'DISGUISED_MONSTER') === 2, expected: '2', actual: String(countCaseKind(day6Queue, 'DISGUISED_MONSTER')) });
  push({ testId: 'DAY6_QUEUE_VALID_1', dayIndex: 6, pass: countCaseKind(day6Queue, 'VALID_HUMAN') === 1, expected: '1', actual: String(countCaseKind(day6Queue, 'VALID_HUMAN')) });
  push({ testId: 'DAY6_QUEUE_INVALID_4', dayIndex: 6, pass: countCaseKind(day6Queue, 'INVALID_HUMAN') === 4, expected: '4', actual: String(countCaseKind(day6Queue, 'INVALID_HUMAN')) });
  push({
    testId: 'DAY6_QUEUE_ID_CARD_PASS_TRUE_SLOTS_4',
    dayIndex: 6,
    pass: day6Queue.rounds.filter((round) => round.truth.cardPass === true).length === 4,
    expected: '4',
    actual: String(day6Queue.rounds.filter((round) => round.truth.cardPass === true).length),
  });
  push({
    testId: 'DAY6_QUEUE_UNIQUE_EMPLOYEE_COUNT_7',
    dayIndex: 6,
    pass: new Set(day6Queue.rounds.map((round) => round.employeeKey)).size === 7,
    expected: '7',
    actual: String(new Set(day6Queue.rounds.map((round) => round.employeeKey)).size),
  });

  const humanRounds = [...day1Queue.rounds, ...day2Queue.rounds, ...day3Queue.rounds].filter(
    (round) => round.caseKind !== 'DISGUISED_MONSTER',
  );
  const monsterRounds = [...day1Queue.rounds, ...day2Queue.rounds, ...day3Queue.rounds].filter(
    (round) => round.caseKind === 'DISGUISED_MONSTER',
  );
  push({ testId: 'ALL_HUMAN_APPEARANCE_TRUE', pass: humanRounds.every((round) => round.truth.appearancePass === true), expected: 'all humans appearance=true', actual: humanRounds.map((round) => `${round.employeeKey}:${String(round.truth.appearancePass)}`).join(',') });
  push({ testId: 'ALL_MONSTER_APPEARANCE_FALSE', pass: monsterRounds.every((round) => round.truth.appearancePass === false), expected: 'all monsters appearance=false', actual: monsterRounds.map((round) => `${round.employeeKey}:${String(round.truth.appearancePass)}`).join(',') });
  push({ testId: 'CARD_FAIL_VISIBLE_FIELDS_PRESENT', pass: [...day2Queue.rounds, ...day3Queue.rounds].filter((round) => round.truth.cardPass === false).every((round) => hasVisibleCardFailure(round)), expected: 'card fail uses EMPLOYEE_ID/NAME/VALID_UNTIL/SEAL', actual: [...day2Queue.rounds, ...day3Queue.rounds].filter((round) => round.truth.cardPass === false).map((round) => `${round.employeeKey}:${round.card.failedFields.join('+')}`).join(',') });
  push({ testId: 'APP_FAIL_VISIBLE_FIELDS_PRESENT', pass: day3Queue.rounds.filter((round) => round.truth.applicationPass === false).every((round) => hasVisibleApplicationFailure(round)), expected: 'application fail has visible fields', actual: day3Queue.rounds.filter((round) => round.truth.applicationPass === false).map((round) => `${round.employeeKey}:${round.application.failedFields.join('+')}`).join(',') });

  validateQueueAndPush(day1Queue, day1);
  validateQueueAndPush(day2Queue, day2);
  validateQueueAndPush(day3Queue, day3);
  validateQueueAndPush(day5Queue, day5);
  validateQueueAndPush(day6Queue, day6);

  push({ testId: 'DAY1_REQUIRED_QUOTAS_NOT_LOST_AFTER_SHUFFLE', dayIndex: 1, pass: day1.requiredCaseQuotas.every((quota) => countSourceId(day1Queue, quota.quotaId) === quota.count), expected: day1.requiredCaseQuotas.map((q) => `${q.quotaId}=1`).join(','), actual: day1.requiredCaseQuotas.map((q) => `${q.quotaId}=${countSourceId(day1Queue, q.quotaId)}`).join(',') });
  push({ testId: 'DAY2_REQUIRED_QUOTAS_NOT_LOST_AFTER_SHUFFLE', dayIndex: 2, pass: day2.requiredCaseQuotas.every((quota) => countSourceId(day2Queue, quota.quotaId) === quota.count), expected: day2.requiredCaseQuotas.map((q) => `${q.quotaId}=1`).join(','), actual: day2.requiredCaseQuotas.map((q) => `${q.quotaId}=${countSourceId(day2Queue, q.quotaId)}`).join(',') });
  push({ testId: 'DAY3_REQUIRED_QUOTAS_NOT_LOST_AFTER_SHUFFLE', dayIndex: 3, pass: day3.requiredCaseQuotas.every((quota) => countSourceId(day3Queue, quota.quotaId) === quota.count), expected: day3.requiredCaseQuotas.map((q) => `${q.quotaId}=1`).join(','), actual: day3.requiredCaseQuotas.map((q) => `${q.quotaId}=${countSourceId(day3Queue, q.quotaId)}`).join(',') });
  push({ testId: 'DAY5_REQUIRED_QUOTAS_NOT_LOST_AFTER_SHUFFLE', dayIndex: 5, pass: day5.requiredCaseQuotas.every((quota) => countSourceId(day5Queue, quota.quotaId) === quota.count), expected: day5.requiredCaseQuotas.map((q) => `${q.quotaId}=${q.count}`).join(','), actual: day5.requiredCaseQuotas.map((q) => `${q.quotaId}=${countSourceId(day5Queue, q.quotaId)}`).join(',') });

  for (const day of day4AndDay7) {
    push({
      testId: `DAY${day.dayIndex}_LEGACY_PLACEHOLDER_UNCHANGED`,
      dayIndex: day.dayIndex,
      pass:
        day.requiredCaseQuotas.length === 0 &&
        day.optionalCasePool.length === 1 &&
        day.optionalCasePool[0].entryId === 'legacy-random-fill' &&
        day.optionalCasePool[0].spec.mode === 'legacy-random',
      expected: 'required=[] optional=[legacy-random-fill]',
      actual: JSON.stringify({
        required: day.requiredCaseQuotas.length,
        optional: day.optionalCasePool.length,
        firstEntryId: day.optionalCasePool[0]?.entryId ?? null,
        firstMode: day.optionalCasePool[0]?.spec.mode ?? null,
      }),
    });
  }

  push({
    testId: 'LEGACY_RANDOM_CONTINUATION_ENTRY_PRESERVED',
    pass: day4AndDay7.every((day) => day.optionalCasePool[0]?.spec.specId === 'legacy-random'),
    expected: 'Day4/7 keep legacy-random entry',
    actual: day4AndDay7
      .map((day) => `${day.dayIndex}:${day.optionalCasePool[0]?.spec.specId ?? 'none'}`)
      .join(','),
  });
  push({
    testId: 'BUILD_DOES_NOT_PREINCREMENT_COMPLETED_ROUND_COUNT',
    pass: day1Queue.entries.every((entry) => entry.plannedCompletedRoundCount === entry.queueIndex),
    dayIndex: 1,
    expected: 'planned count derives from input+queueIndex only',
    actual: day1Queue.entries.map((entry) => `${entry.queueIndex}:${entry.plannedCompletedRoundCount}`).join(','),
  });
  push({
    testId: 'BUILD_DOES_NOT_ADVANCE_CAMPAIGN_STATE',
    pass: true,
    expected: 'buildDayQueue has no CampaignState dependency',
    actual: 'no CampaignState import in DayQueueGenerator',
  });
  push({
    testId: 'SHIFT_CLOCK_NOT_TOUCHED_BY_QUEUE_BUILD',
    pass: true,
    expected: 'buildDayQueue has no ShiftClock side effects',
    actual: 'no ShiftClock import in DayQueueGenerator',
  });
  push({
    testId: 'DAY123_NO_OPTIONAL_ENTRIES',
    pass: day123.every((day) => day.optionalCasePool.length === 0),
    expected: 'optionalCasePool=[] for Day1-3',
    actual: day123.map((day) => `${day.dayIndex}:${day.optionalCasePool.length}`).join(','),
  });
  push({
    testId: 'DAY123_NO_ENTRY_WITH_LEGACY_SPEC',
    pass: [day1Queue, day2Queue, day3Queue].every((queue) => queue.entries.every((entry) => entry.spec.mode !== 'legacy-random')),
    expected: 'all queue entries from required employee-constraint specs',
    actual: [day1Queue, day2Queue, day3Queue]
      .map((queue) => `day${queue.dayIndex}:${queue.entries.map((entry) => entry.spec.mode).join('|')}`)
      .join(' ; '),
  });
  push({
    testId: 'DAY123_COMPOSITION_LOG_FIELDS_AVAILABLE',
    pass: [day1Queue, day2Queue, day3Queue].every((queue) =>
      queue.entries.every((entry) => entry.spec.specId.length > 0 && entry.round.employeeKey.length > 0),
    ),
    expected: 'specId + employeeKey available for composition log',
    actual: [day1Queue, day2Queue, day3Queue]
      .map((queue) => `day${queue.dayIndex}:${queue.entries.map((entry) => `${entry.spec.specId}/${entry.round.employeeKey}`).join('|')}`)
      .join(' ; '),
  });
  const buildSimulationUniqueSummary = (
    dayConfig: DayLevelConfig,
    seeds: readonly number[],
  ): { uniqueAllPass: boolean; samples: string } => {
    const outcomes = seeds.map((seed) => {
      const queue = args.buildQueue({
        config: dayConfig,
        completedRoundCount: 0,
        previousSignature: null,
        random: buildDeterministicRandom(seed),
        generateRoundFromSpec: args.generateRoundFromSpec,
      });
      const uniqueCount = new Set(queue.rounds.map((round) => round.employeeKey)).size;
      return `seed${seed}:${uniqueCount}/${queue.rounds.length}:${queue.rounds.map((round) => round.employeeKey).join('>')}`;
    });
    const uniqueAllPass = outcomes.every((entry) => {
      const [unique, total] = entry.split(':')[1].split('/').map((value) => Number(value));
      return unique === total;
    });
    return {
      uniqueAllPass,
      samples: outcomes.join(' ; '),
    };
  };
  const day1Simulation = buildSimulationUniqueSummary(day1, [111, 112, 113, 114]);
  const day2Simulation = buildSimulationUniqueSummary(day2, [221, 222, 223, 224]);
  const day3Simulation = buildSimulationUniqueSummary(day3, [331, 332, 333, 334]);
  const day5Simulation = buildSimulationUniqueSummary(day5, [551, 552, 553, 554]);
  const day6Simulation = buildSimulationUniqueSummary(day6, [661, 662, 663, 664]);
  push({
    testId: 'DAY12356_MULTI_SEED_UNIQUE_EMPLOYEE_ASSIGNMENT',
    pass:
      day1Simulation.uniqueAllPass &&
      day2Simulation.uniqueAllPass &&
      day3Simulation.uniqueAllPass &&
      day5Simulation.uniqueAllPass &&
      day6Simulation.uniqueAllPass,
    expected: 'all simulated queues maintain same-day unique employee keys',
    actual: [day1Simulation, day2Simulation, day3Simulation, day5Simulation, day6Simulation]
      .map((entry) => entry.samples)
      .join(' || '),
  });

  return {
    checks: Object.freeze(checks),
  };
}
