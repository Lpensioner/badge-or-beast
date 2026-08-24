import {
  CampaignChecklistCategory,
  CampaignDayIndex,
  CampaignEvidenceKey,
  DayLevelConfig,
} from './DayLevelConfig';
import type { CampaignRoundSpec, DayOptionalCaseEntry, DayRequiredCaseQuota } from './DayQueueTypes';

const EXPECTED_CAMPAIGN_DATES = [
  '1999-12-03',
  '1999-12-04',
  '1999-12-05',
  '1999-12-06',
  '1999-12-07',
  '1999-12-08',
  '1999-12-09',
] as const;

const DATE_TEXT_RE = /^\d{4}-\d{2}-\d{2}$/;
const FULL_CHECKLIST_SET: readonly CampaignChecklistCategory[] = ['id-card', 'application', 'appearance'];

export interface MonsterThreatTimingConfig {
  readonly openWindowBreakSeconds: number;
  readonly closedShutterBreakSeconds: number;
  readonly phoneDialSeconds: number;
}

type MonsterThreatTimingDay = 1 | 2 | 3 | 4;

const MONSTER_THREAT_TIMING_BY_DAY: Readonly<Record<MonsterThreatTimingDay, MonsterThreatTimingConfig>> =
  Object.freeze({
    1: Object.freeze({
      openWindowBreakSeconds: 6.0,
      closedShutterBreakSeconds: 10.0,
      phoneDialSeconds: 10.0,
    }),
    2: Object.freeze({
      openWindowBreakSeconds: 5.5,
      closedShutterBreakSeconds: 9.0,
      phoneDialSeconds: 9.0,
    }),
    3: Object.freeze({
      openWindowBreakSeconds: 5.0,
      closedShutterBreakSeconds: 8.0,
      phoneDialSeconds: 8.0,
    }),
    4: Object.freeze({
      openWindowBreakSeconds: 4.5,
      closedShutterBreakSeconds: 7.0,
      phoneDialSeconds: 7.0,
    }),
  });

function clampMonsterThreatTimingDay(day: number): MonsterThreatTimingDay {
  if (!Number.isFinite(day)) {
    return 1;
  }
  const normalized = Math.floor(day);
  if (normalized <= 1) {
    return 1;
  }
  if (normalized >= 4) {
    return 4;
  }
  return normalized as 2 | 3;
}

export function getMonsterThreatTimingForDay(day: number): MonsterThreatTimingConfig {
  return MONSTER_THREAT_TIMING_BY_DAY[clampMonsterThreatTimingDay(day)];
}

function freezeRoundSpec(spec: CampaignRoundSpec): CampaignRoundSpec {
  if (spec.mode === 'legacy-random') {
    return Object.freeze({
      specId: spec.specId,
      mode: spec.mode,
    });
  }
  return Object.freeze({
    specId: spec.specId,
    mode: spec.mode,
    caseKind: spec.caseKind,
    employeeKey: spec.employeeKey,
    truth: spec.truth ? Object.freeze({ ...spec.truth }) : undefined,
  });
}

function freezeRequiredQuotas(values: readonly DayRequiredCaseQuota[]): readonly DayRequiredCaseQuota[] {
  return Object.freeze(
    values.map((quota) =>
      Object.freeze({
        quotaId: quota.quotaId,
        count: quota.count,
        spec: freezeRoundSpec(quota.spec),
      }),
    ),
  );
}

function freezeOptionalPool(values: readonly DayOptionalCaseEntry[]): readonly DayOptionalCaseEntry[] {
  return Object.freeze(
    values.map((entry) =>
      Object.freeze({
        entryId: entry.entryId,
        weight: entry.weight,
        spec: freezeRoundSpec(entry.spec),
      }),
    ),
  );
}

function freezeDayLevelConfig(config: DayLevelConfig): DayLevelConfig {
  return Object.freeze({
    ...config,
    enabledEvidence: Object.freeze([...config.enabledEvidence]),
    requiredChecklistCategories: Object.freeze([...config.requiredChecklistCategories]),
    requiredCaseQuotas: freezeRequiredQuotas(config.requiredCaseQuotas),
    optionalCasePool: freezeOptionalPool(config.optionalCasePool),
  });
}

function createLegacyRandomOptionalPool(): readonly DayOptionalCaseEntry[] {
  return Object.freeze([
    Object.freeze({
      entryId: 'legacy-random-fill',
      weight: 1,
      spec: Object.freeze({
        specId: 'legacy-random',
        mode: 'legacy-random',
      } as const),
    }),
  ]);
}

function createEmptyRequiredQuotas(): readonly DayRequiredCaseQuota[] {
  return Object.freeze([]);
}

function createDay1RequiredQuotas(): readonly DayRequiredCaseQuota[] {
  return freezeRequiredQuotas([
    {
      quotaId: 'day1-valid-human-01',
      count: 1,
      spec: {
        specId: 'day1-valid-human-01',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day1-valid-human-02',
      count: 1,
      spec: {
        specId: 'day1-valid-human-02',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day1-obvious-monster-01',
      count: 1,
      spec: {
        specId: 'day1-obvious-monster-01',
        mode: 'employee-constraint',
        caseKind: 'DISGUISED_MONSTER',
        truth: {
          appearancePass: false,
        },
      },
    },
    {
      quotaId: 'day1-valid-human-03',
      count: 1,
      spec: {
        specId: 'day1-valid-human-03',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
  ]);
}

function createDay2RequiredQuotas(): readonly DayRequiredCaseQuota[] {
  return freezeRequiredQuotas([
    {
      quotaId: 'day2-obvious-monster-01',
      count: 1,
      spec: {
        specId: 'day2-obvious-monster-01',
        mode: 'employee-constraint',
        caseKind: 'DISGUISED_MONSTER',
        truth: {
          appearancePass: false,
        },
      },
    },
    {
      quotaId: 'day2-valid-human-02',
      count: 1,
      spec: {
        specId: 'day2-valid-human-02',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day2-card-fail-human-01',
      count: 1,
      spec: {
        specId: 'day2-card-fail-human-01',
        mode: 'employee-constraint',
        caseKind: 'INVALID_HUMAN',
        truth: {
          idCardPass: false,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day2-valid-human-01',
      count: 1,
      spec: {
        specId: 'day2-valid-human-01',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day2-valid-human-03',
      count: 1,
      spec: {
        specId: 'day2-valid-human-03',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
  ]);
}

function createDay3RequiredQuotas(): readonly DayRequiredCaseQuota[] {
  return freezeRequiredQuotas([
    {
      quotaId: 'day3-valid-human-01',
      count: 1,
      spec: {
        specId: 'day3-valid-human-01',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day3-application-fail-human-01',
      count: 1,
      spec: {
        specId: 'day3-application-fail-human-01',
        mode: 'employee-constraint',
        caseKind: 'INVALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: false,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day3-card-fail-human-01',
      count: 1,
      spec: {
        specId: 'day3-card-fail-human-01',
        mode: 'employee-constraint',
        caseKind: 'INVALID_HUMAN',
        truth: {
          idCardPass: false,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day3-obvious-monster-01',
      count: 1,
      spec: {
        specId: 'day3-obvious-monster-01',
        mode: 'employee-constraint',
        caseKind: 'DISGUISED_MONSTER',
        truth: {
          appearancePass: false,
        },
      },
    },
    {
      quotaId: 'day3-valid-human-02',
      count: 1,
      spec: {
        specId: 'day3-valid-human-02',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
  ]);
}

function createDay5RequiredQuotas(): readonly DayRequiredCaseQuota[] {
  return freezeRequiredQuotas([
    {
      quotaId: 'day5-valid-human-01',
      count: 1,
      spec: {
        specId: 'day5-valid-human-01',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day5-card-fail-human-01',
      count: 1,
      spec: {
        specId: 'day5-card-fail-human-01',
        mode: 'employee-constraint',
        caseKind: 'INVALID_HUMAN',
        truth: {
          idCardPass: false,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day5-application-fail-human-01',
      count: 1,
      spec: {
        specId: 'day5-application-fail-human-01',
        mode: 'employee-constraint',
        caseKind: 'INVALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: false,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day5-obvious-monster-01',
      count: 1,
      spec: {
        specId: 'day5-obvious-monster-01',
        mode: 'employee-constraint',
        caseKind: 'DISGUISED_MONSTER',
        truth: {
          appearancePass: false,
        },
      },
    },
    {
      quotaId: 'day5-obvious-monster-02',
      count: 1,
      spec: {
        specId: 'day5-obvious-monster-02',
        mode: 'employee-constraint',
        caseKind: 'DISGUISED_MONSTER',
        truth: {
          appearancePass: false,
        },
      },
    },
    {
      quotaId: 'day5-valid-human-02',
      count: 1,
      spec: {
        specId: 'day5-valid-human-02',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
  ]);
}

function createDay6RequiredQuotas(): readonly DayRequiredCaseQuota[] {
  return freezeRequiredQuotas([
    {
      quotaId: 'day6-valid-human-01',
      count: 1,
      spec: {
        specId: 'day6-valid-human-01',
        mode: 'employee-constraint',
        caseKind: 'VALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day6-card-fail-human-01',
      count: 1,
      spec: {
        specId: 'day6-card-fail-human-01',
        mode: 'employee-constraint',
        caseKind: 'INVALID_HUMAN',
        truth: {
          idCardPass: false,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day6-application-fail-human-01',
      count: 1,
      spec: {
        specId: 'day6-application-fail-human-01',
        mode: 'employee-constraint',
        caseKind: 'INVALID_HUMAN',
        truth: {
          idCardPass: true,
          applicationPass: false,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day6-disguised-monster-01',
      count: 1,
      spec: {
        specId: 'day6-disguised-monster-01',
        mode: 'employee-constraint',
        caseKind: 'DISGUISED_MONSTER',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: false,
        },
      },
    },
    {
      quotaId: 'day6-disguised-monster-02',
      count: 1,
      spec: {
        specId: 'day6-disguised-monster-02',
        mode: 'employee-constraint',
        caseKind: 'DISGUISED_MONSTER',
        truth: {
          idCardPass: true,
          applicationPass: true,
          appearancePass: false,
        },
      },
    },
    {
      quotaId: 'day6-card-fail-human-02',
      count: 1,
      spec: {
        specId: 'day6-card-fail-human-02',
        mode: 'employee-constraint',
        caseKind: 'INVALID_HUMAN',
        truth: {
          idCardPass: false,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
    {
      quotaId: 'day6-card-fail-human-03',
      count: 1,
      spec: {
        specId: 'day6-card-fail-human-03',
        mode: 'employee-constraint',
        caseKind: 'INVALID_HUMAN',
        truth: {
          idCardPass: false,
          applicationPass: true,
          appearancePass: true,
        },
      },
    },
  ]);
}

function createDayCatalog(): readonly DayLevelConfig[] {
  const configs: readonly DayLevelConfig[] = [
    {
      dayIndex: 1,
      date: '1999-12-03',
      shiftStartMinutes: 540,
      shiftEndMinutes: 1020,
      realDurationSeconds: 600,
      encounterCountMin: 4,
      encounterCountMax: 4,
      difficultyTier: 'tutorial-appearance',
      enabledEvidence: ['employee-files', 'checklist', 'appearance'],
      requiredChecklistCategories: ['appearance'],
      visitorSystemEnabled: false,
      departmentPhoneEnabled: false,
      requiredCaseQuotas: createDay1RequiredQuotas(),
      optionalCasePool: freezeOptionalPool([]),
    },
    {
      dayIndex: 2,
      date: '1999-12-04',
      shiftStartMinutes: 540,
      shiftEndMinutes: 1020,
      realDurationSeconds: 600,
      encounterCountMin: 5,
      encounterCountMax: 5,
      difficultyTier: 'tutorial-card',
      enabledEvidence: ['employee-files', 'employee-card', 'checklist', 'appearance'],
      requiredChecklistCategories: ['id-card', 'appearance'],
      visitorSystemEnabled: false,
      departmentPhoneEnabled: false,
      requiredCaseQuotas: createDay2RequiredQuotas(),
      optionalCasePool: freezeOptionalPool([]),
    },
    {
      dayIndex: 3,
      date: '1999-12-05',
      shiftStartMinutes: 540,
      shiftEndMinutes: 1020,
      realDurationSeconds: 600,
      encounterCountMin: 5,
      encounterCountMax: 5,
      difficultyTier: 'tutorial-application',
      enabledEvidence: ['employee-files', 'employee-card', 'application-form', 'checklist', 'appearance'],
      requiredChecklistCategories: ['id-card', 'application', 'appearance'],
      visitorSystemEnabled: false,
      departmentPhoneEnabled: false,
      requiredCaseQuotas: createDay3RequiredQuotas(),
      optionalCasePool: freezeOptionalPool([]),
    },
    {
      dayIndex: 4,
      date: '1999-12-06',
      shiftStartMinutes: 540,
      shiftEndMinutes: 1020,
      realDurationSeconds: 600,
      encounterCountMin: 2,
      encounterCountMax: 2,
      difficultyTier: 'visitor-introduction',
      enabledEvidence: [
        'employee-files',
        'employee-card',
        'application-form',
        'checklist',
        'appearance',
        'appointment-roster',
        'telephone',
      ],
      requiredChecklistCategories: ['id-card', 'application', 'appearance'],
      visitorSystemEnabled: true,
      departmentPhoneEnabled: true,
      requiredCaseQuotas: createEmptyRequiredQuotas(),
      optionalCasePool: createLegacyRandomOptionalPool(),
    },
    {
      dayIndex: 5,
      date: '1999-12-07',
      shiftStartMinutes: 540,
      shiftEndMinutes: 1020,
      realDurationSeconds: 600,
      encounterCountMin: 6,
      encounterCountMax: 6,
      difficultyTier: 'subtle-errors',
      enabledEvidence: [
        'employee-files',
        'employee-card',
        'application-form',
        'checklist',
        'appearance',
        'appointment-roster',
        'telephone',
      ],
      requiredChecklistCategories: ['id-card', 'application', 'appearance'],
      visitorSystemEnabled: true,
      departmentPhoneEnabled: true,
      requiredCaseQuotas: createDay5RequiredQuotas(),
      optionalCasePool: freezeOptionalPool([]),
    },
    {
      dayIndex: 6,
      date: '1999-12-08',
      shiftStartMinutes: 540,
      shiftEndMinutes: 1020,
      realDurationSeconds: 600,
      encounterCountMin: 7,
      encounterCountMax: 7,
      difficultyTier: 'compound-errors',
      enabledEvidence: [
        'employee-files',
        'employee-card',
        'application-form',
        'checklist',
        'appearance',
        'appointment-roster',
        'telephone',
      ],
      requiredChecklistCategories: ['id-card', 'application', 'appearance'],
      visitorSystemEnabled: true,
      departmentPhoneEnabled: true,
      requiredCaseQuotas: createDay6RequiredQuotas(),
      optionalCasePool: freezeOptionalPool([]),
    },
    {
      dayIndex: 7,
      date: '1999-12-09',
      shiftStartMinutes: 540,
      shiftEndMinutes: 1020,
      realDurationSeconds: 600,
      encounterCountMin: 6,
      encounterCountMax: 6,
      difficultyTier: 'final-comprehensive',
      enabledEvidence: [
        'employee-files',
        'employee-card',
        'application-form',
        'checklist',
        'appearance',
        'appointment-roster',
        'telephone',
      ],
      requiredChecklistCategories: ['id-card', 'application', 'appearance'],
      visitorSystemEnabled: true,
      departmentPhoneEnabled: true,
      requiredCaseQuotas: createEmptyRequiredQuotas(),
      optionalCasePool: createLegacyRandomOptionalPool(),
    },
  ];

  return Object.freeze(configs.map((config) => freezeDayLevelConfig(config)));
}

export const CAMPAIGN_DAY_CONFIGS: readonly DayLevelConfig[] = createDayCatalog();
export const HIGHEST_IMPLEMENTED_CAMPAIGN_DAY: CampaignDayIndex = 6;

export function isCampaignDayIndex(value: number): value is CampaignDayIndex {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function throwDayConfigError(dayIndex: number, field: string, detail: string): never {
  throw new Error(`[DayCatalog] dayIndex=${dayIndex} field=${field} ${detail}`);
}

function throwDayQuotaError(args: {
  readonly dayIndex: number;
  readonly quotaId: string;
  readonly specId: string;
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
}): never {
  throw new Error(
    `[DayCatalog] dayIndex=${args.dayIndex} quotaId=${args.quotaId} specId=${args.specId} field=${args.field} expected=${args.expected} actual=${args.actual}`,
  );
}

function ensureNoDuplicateItems(dayIndex: number, field: string, values: readonly string[]): void {
  if (new Set(values).size !== values.length) {
    throwDayConfigError(dayIndex, field, 'contains duplicate entries.');
  }
}

function ensureValidRoundSpec(dayIndex: number, field: string, spec: CampaignRoundSpec): void {
  if (!spec.specId || spec.specId.trim().length === 0) {
    throwDayConfigError(dayIndex, field, 'specId must be non-empty.');
  }
  if (spec.mode !== 'legacy-random' && spec.mode !== 'employee-constraint') {
    throwDayConfigError(dayIndex, field, `unsupported mode="${String((spec as { mode?: unknown }).mode)}".`);
  }
}

function ensurePlaceholderQueuePlan(config: DayLevelConfig): void {
  if (config.requiredCaseQuotas.length !== 0) {
    throwDayConfigError(config.dayIndex, 'requiredCaseQuotas', 'Day 6-7 placeholder requires empty requiredCaseQuotas.');
  }
  if (config.optionalCasePool.length !== 1) {
    throwDayConfigError(config.dayIndex, 'optionalCasePool', 'Day 6-7 placeholder requires exactly one optional entry.');
  }
  const entry = config.optionalCasePool[0];
  if (entry.entryId !== 'legacy-random-fill') {
    throwDayConfigError(config.dayIndex, 'optionalCasePool.entryId', 'Day 6-7 placeholder entryId must be legacy-random-fill.');
  }
  if (entry.weight !== 1) {
    throwDayConfigError(config.dayIndex, 'optionalCasePool.weight', 'Day 6-7 placeholder weight must be 1.');
  }
  if (entry.spec.mode !== 'legacy-random' || entry.spec.specId !== 'legacy-random') {
    throwDayConfigError(
      config.dayIndex,
      'optionalCasePool.spec',
      'Day 6-7 placeholder spec must be { specId: legacy-random, mode: legacy-random }.',
    );
  }
}

function sumRequiredQuotaCount(config: DayLevelConfig): number {
  return config.requiredCaseQuotas.reduce((sum, quota) => sum + quota.count, 0);
}

function expectDayTotalAndOptional(
  config: DayLevelConfig,
  expectedTotal: number,
  expectedOptionalLength: number,
): void {
  const actualTotal = sumRequiredQuotaCount(config);
  if (actualTotal !== expectedTotal) {
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: '-',
      specId: '-',
      field: 'requiredTotal',
      expected: String(expectedTotal),
      actual: String(actualTotal),
    });
  }
  if (config.optionalCasePool.length !== expectedOptionalLength) {
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: '-',
      specId: '-',
      field: 'optionalCasePool.length',
      expected: String(expectedOptionalLength),
      actual: String(config.optionalCasePool.length),
    });
  }
}

function assertEmployeeConstraintQuota(
  config: DayLevelConfig,
  quota: DayRequiredCaseQuota,
): asserts quota is DayRequiredCaseQuota & {
  readonly spec: Extract<CampaignRoundSpec, { mode: 'employee-constraint' }>;
} {
  if (quota.spec.mode !== 'employee-constraint') {
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: quota.quotaId,
      specId: quota.spec.specId,
      field: 'spec.mode',
      expected: 'employee-constraint',
      actual: quota.spec.mode,
    });
  }
}

function assertDay1CampaignContract(config: DayLevelConfig): void {
  expectDayTotalAndOptional(config, 4, 0);
  let validHumanCount = 0;
  let monsterCount = 0;
  for (const quota of config.requiredCaseQuotas) {
    if (quota.count !== 1) {
      throwDayQuotaError({
        dayIndex: config.dayIndex,
        quotaId: quota.quotaId,
        specId: quota.spec.specId,
        field: 'count',
        expected: '1',
        actual: String(quota.count),
      });
    }
    assertEmployeeConstraintQuota(config, quota);
    const spec = quota.spec;
    const truth = spec.truth;
    if (
      spec.caseKind === 'VALID_HUMAN' &&
      truth?.idCardPass === true &&
      truth?.applicationPass === true &&
      truth?.appearancePass === true
    ) {
      validHumanCount += 1;
      continue;
    }
    if (spec.caseKind === 'DISGUISED_MONSTER' && truth?.appearancePass === false) {
      if (truth.idCardPass !== undefined || truth.applicationPass !== undefined) {
        throwDayQuotaError({
          dayIndex: config.dayIndex,
          quotaId: quota.quotaId,
          specId: spec.specId,
          field: 'truth.documentPass',
          expected: 'undefined/undefined',
          actual: `${String(truth.idCardPass)}/${String(truth.applicationPass)}`,
        });
      }
      monsterCount += 1;
      continue;
    }
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: quota.quotaId,
      specId: spec.specId,
      field: 'day1.casePattern',
      expected: 'valid-human|monster',
      actual: `caseKind=${String(spec.caseKind ?? null)} truth=${JSON.stringify(truth ?? null)}`,
    });
  }
  if (validHumanCount !== 3 || monsterCount !== 1) {
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: '-',
      specId: '-',
      field: 'day1.caseComposition',
      expected: 'valid=3 monster=1',
      actual: `valid=${validHumanCount} monster=${monsterCount}`,
    });
  }
}

function assertDay2CampaignContract(config: DayLevelConfig): void {
  expectDayTotalAndOptional(config, 5, 0);
  let monsterCount = 0;
  let cardInvalidCount = 0;
  let validHumanCount = 0;
  for (const quota of config.requiredCaseQuotas) {
    if (quota.count !== 1) {
      throwDayQuotaError({
        dayIndex: config.dayIndex,
        quotaId: quota.quotaId,
        specId: quota.spec.specId,
        field: 'count',
        expected: '1',
        actual: String(quota.count),
      });
    }
    assertEmployeeConstraintQuota(config, quota);
    const spec = quota.spec;
    const truth = spec.truth;
    if (spec.caseKind === 'DISGUISED_MONSTER' && truth?.appearancePass === false) {
      if (truth.idCardPass !== undefined || truth.applicationPass !== undefined) {
        throwDayQuotaError({
          dayIndex: config.dayIndex,
          quotaId: quota.quotaId,
          specId: spec.specId,
          field: 'truth.documentPass',
          expected: 'undefined/undefined',
          actual: `${String(truth.idCardPass)}/${String(truth.applicationPass)}`,
        });
      }
      monsterCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'INVALID_HUMAN' &&
      truth?.idCardPass === false &&
      truth?.applicationPass === true &&
      truth?.appearancePass === true
    ) {
      cardInvalidCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'VALID_HUMAN' &&
      truth?.idCardPass === true &&
      truth?.applicationPass === true &&
      truth?.appearancePass === true
    ) {
      validHumanCount += 1;
      continue;
    }
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: quota.quotaId,
      specId: spec.specId,
      field: 'day2.casePattern',
      expected: 'monster|card-invalid-human|valid-human',
      actual: `caseKind=${String(spec.caseKind ?? null)} truth=${JSON.stringify(truth ?? null)}`,
    });
  }
  if (monsterCount !== 1 || cardInvalidCount !== 1 || validHumanCount !== 3) {
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: '-',
      specId: '-',
      field: 'day2.caseComposition',
      expected: 'monster=1 cardInvalid=1 valid=3',
      actual: `monster=${monsterCount} cardInvalid=${cardInvalidCount} valid=${validHumanCount}`,
    });
  }
}

function assertDay3CampaignContract(config: DayLevelConfig): void {
  expectDayTotalAndOptional(config, 5, 0);
  let monsterCount = 0;
  let validHumanCount = 0;
  let cardInvalidCount = 0;
  let applicationInvalidCount = 0;
  for (const quota of config.requiredCaseQuotas) {
    if (quota.count !== 1) {
      throwDayQuotaError({
        dayIndex: config.dayIndex,
        quotaId: quota.quotaId,
        specId: quota.spec.specId,
        field: 'count',
        expected: '1',
        actual: String(quota.count),
      });
    }
    assertEmployeeConstraintQuota(config, quota);
    const spec = quota.spec;
    const truth = spec.truth;
    if (spec.caseKind === 'DISGUISED_MONSTER' && truth?.appearancePass === false) {
      if (truth.idCardPass !== undefined || truth.applicationPass !== undefined) {
        throwDayQuotaError({
          dayIndex: config.dayIndex,
          quotaId: quota.quotaId,
          specId: spec.specId,
          field: 'truth.documentPass',
          expected: 'undefined/undefined',
          actual: `${String(truth.idCardPass)}/${String(truth.applicationPass)}`,
        });
      }
      monsterCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'VALID_HUMAN' &&
      truth?.idCardPass === true &&
      truth?.applicationPass === true &&
      truth?.appearancePass === true
    ) {
      validHumanCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'INVALID_HUMAN' &&
      truth?.idCardPass === false &&
      truth?.applicationPass === true &&
      truth?.appearancePass === true
    ) {
      cardInvalidCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'INVALID_HUMAN' &&
      truth?.idCardPass === true &&
      truth?.applicationPass === false &&
      truth?.appearancePass === true
    ) {
      applicationInvalidCount += 1;
      continue;
    }
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: quota.quotaId,
      specId: spec.specId,
      field: 'day3.casePattern',
      expected: 'monster|valid-human|card-invalid-human|application-invalid-human',
      actual: `caseKind=${String(spec.caseKind ?? null)} truth=${JSON.stringify(truth ?? null)}`,
    });
  }
  if (
    monsterCount !== 1 ||
    validHumanCount !== 2 ||
    cardInvalidCount !== 1 ||
    applicationInvalidCount !== 1
  ) {
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: '-',
      specId: '-',
      field: 'day3.caseComposition',
      expected: 'monster=1 valid=2 cardInvalid=1 applicationInvalid=1',
      actual: `monster=${monsterCount} valid=${validHumanCount} cardInvalid=${cardInvalidCount} applicationInvalid=${applicationInvalidCount}`,
    });
  }
}

function assertDay5CampaignContract(config: DayLevelConfig): void {
  expectDayTotalAndOptional(config, 6, 0);
  let monsterCount = 0;
  let validHumanCount = 0;
  let cardInvalidCount = 0;
  let applicationInvalidCount = 0;
  for (const quota of config.requiredCaseQuotas) {
    if (quota.count !== 1) {
      throwDayQuotaError({
        dayIndex: config.dayIndex,
        quotaId: quota.quotaId,
        specId: quota.spec.specId,
        field: 'count',
        expected: '1',
        actual: String(quota.count),
      });
    }
    assertEmployeeConstraintQuota(config, quota);
    const spec = quota.spec;
    const truth = spec.truth;
    if (spec.caseKind === 'DISGUISED_MONSTER') {
      if (truth?.appearancePass !== false) {
        throwDayQuotaError({
          dayIndex: config.dayIndex,
          quotaId: quota.quotaId,
          specId: spec.specId,
          field: 'truth.appearancePass',
          expected: 'false',
          actual: String(truth?.appearancePass),
        });
      }
      monsterCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'VALID_HUMAN' &&
      truth?.idCardPass === true &&
      truth?.applicationPass === true &&
      truth?.appearancePass === true
    ) {
      validHumanCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'INVALID_HUMAN' &&
      truth?.idCardPass === false &&
      truth?.applicationPass === true &&
      truth?.appearancePass === true
    ) {
      cardInvalidCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'INVALID_HUMAN' &&
      truth?.idCardPass === true &&
      truth?.applicationPass === false &&
      truth?.appearancePass === true
    ) {
      applicationInvalidCount += 1;
      continue;
    }
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: quota.quotaId,
      specId: spec.specId,
      field: 'day5.casePattern',
      expected: 'monster|valid-human|card-invalid-human|application-invalid-human',
      actual: `caseKind=${String(spec.caseKind ?? null)} truth=${JSON.stringify(truth ?? null)}`,
    });
  }
  if (
    monsterCount !== 2 ||
    validHumanCount !== 2 ||
    cardInvalidCount !== 1 ||
    applicationInvalidCount !== 1
  ) {
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: '-',
      specId: '-',
      field: 'day5.caseComposition',
      expected: 'monster=2 valid=2 cardInvalid=1 applicationInvalid=1',
      actual: `monster=${monsterCount} valid=${validHumanCount} cardInvalid=${cardInvalidCount} applicationInvalid=${applicationInvalidCount}`,
    });
  }
}

function assertDay6CampaignContract(config: DayLevelConfig): void {
  expectDayTotalAndOptional(config, 7, 0);
  let monsterCount = 0;
  let validHumanCount = 0;
  let cardInvalidCount = 0;
  let applicationInvalidCount = 0;
  let idCardPassTrueCount = 0;
  for (const quota of config.requiredCaseQuotas) {
    if (quota.count !== 1) {
      throwDayQuotaError({
        dayIndex: config.dayIndex,
        quotaId: quota.quotaId,
        specId: quota.spec.specId,
        field: 'count',
        expected: '1',
        actual: String(quota.count),
      });
    }
    assertEmployeeConstraintQuota(config, quota);
    const spec = quota.spec;
    const truth = spec.truth;
    if (truth?.idCardPass === true) {
      idCardPassTrueCount += 1;
    }
    if (spec.caseKind === 'DISGUISED_MONSTER') {
      if (truth?.appearancePass !== false) {
        throwDayQuotaError({
          dayIndex: config.dayIndex,
          quotaId: quota.quotaId,
          specId: spec.specId,
          field: 'truth.appearancePass',
          expected: 'false',
          actual: String(truth?.appearancePass),
        });
      }
      monsterCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'VALID_HUMAN' &&
      truth?.idCardPass === true &&
      truth?.applicationPass === true &&
      truth?.appearancePass === true
    ) {
      validHumanCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'INVALID_HUMAN' &&
      truth?.idCardPass === false &&
      truth?.applicationPass === true &&
      truth?.appearancePass === true
    ) {
      cardInvalidCount += 1;
      continue;
    }
    if (
      spec.caseKind === 'INVALID_HUMAN' &&
      truth?.idCardPass === true &&
      truth?.applicationPass === false &&
      truth?.appearancePass === true
    ) {
      applicationInvalidCount += 1;
      continue;
    }
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: quota.quotaId,
      specId: spec.specId,
      field: 'day6.casePattern',
      expected: 'monster|valid-human|card-invalid-human|application-invalid-human',
      actual: `caseKind=${String(spec.caseKind ?? null)} truth=${JSON.stringify(truth ?? null)}`,
    });
  }
  if (
    monsterCount !== 2 ||
    validHumanCount !== 1 ||
    cardInvalidCount !== 3 ||
    applicationInvalidCount !== 1
  ) {
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: '-',
      specId: '-',
      field: 'day6.caseComposition',
      expected: 'monster=2 valid=1 cardInvalid=3 applicationInvalid=1',
      actual: `monster=${monsterCount} valid=${validHumanCount} cardInvalid=${cardInvalidCount} applicationInvalid=${applicationInvalidCount}`,
    });
  }
  if (idCardPassTrueCount !== 4) {
    throwDayQuotaError({
      dayIndex: config.dayIndex,
      quotaId: '-',
      specId: '-',
      field: 'day6.idCardPassTrueSlots',
      expected: '4',
      actual: String(idCardPassTrueCount),
    });
  }
}

function ensureChecklistEvidenceDependency(
  dayIndex: number,
  category: CampaignChecklistCategory,
  enabledEvidence: readonly CampaignEvidenceKey[],
): void {
  if (category === 'id-card' && !enabledEvidence.includes('employee-card')) {
    throwDayConfigError(dayIndex, 'requiredChecklistCategories', 'id-card requires employee-card evidence.');
  }
  if (category === 'application' && !enabledEvidence.includes('application-form')) {
    throwDayConfigError(dayIndex, 'requiredChecklistCategories', 'application requires application-form evidence.');
  }
  if (category === 'appearance' && !enabledEvidence.includes('appearance')) {
    throwDayConfigError(dayIndex, 'requiredChecklistCategories', 'appearance requires appearance evidence.');
  }
}

function ensureFullChecklistEnabledFromDay3(config: DayLevelConfig): void {
  if (config.dayIndex < 3) {
    return;
  }
  for (const required of FULL_CHECKLIST_SET) {
    if (!config.requiredChecklistCategories.includes(required)) {
      throwDayConfigError(
        config.dayIndex,
        'requiredChecklistCategories',
        `must include "${required}" from Day 3 onward.`,
      );
    }
  }
}

function ensureVisitorAndPhoneEnabledFromDay4(config: DayLevelConfig): void {
  if (config.dayIndex < 4) {
    return;
  }
  if (!config.visitorSystemEnabled) {
    throwDayConfigError(config.dayIndex, 'visitorSystemEnabled', 'must be true from Day 4 onward.');
  }
  if (!config.departmentPhoneEnabled) {
    throwDayConfigError(config.dayIndex, 'departmentPhoneEnabled', 'must be true from Day 4 onward.');
  }
}

export function assertDayCatalogValid(): void {
  if (CAMPAIGN_DAY_CONFIGS.length !== 7) {
    throw new Error(
      `[DayCatalog] dayIndex=0 field=CAMPAIGN_DAY_CONFIGS expected exactly 7 entries, got ${CAMPAIGN_DAY_CONFIGS.length}.`,
    );
  }

  CAMPAIGN_DAY_CONFIGS.forEach((config, index) => {
    const expectedDay = (index + 1) as CampaignDayIndex;
    const expectedDate = EXPECTED_CAMPAIGN_DATES[index];

    if (config.dayIndex !== expectedDay) {
      throwDayConfigError(config.dayIndex, 'dayIndex', `must equal ${expectedDay}.`);
    }
    if (!DATE_TEXT_RE.test(config.date)) {
      throwDayConfigError(config.dayIndex, 'date', 'must be YYYY-MM-DD.');
    }
    if (config.date !== expectedDate) {
      throwDayConfigError(config.dayIndex, 'date', `must equal ${expectedDate}.`);
    }
    if (config.shiftStartMinutes !== 540) {
      throwDayConfigError(config.dayIndex, 'shiftStartMinutes', 'must equal 540.');
    }
    if (config.shiftEndMinutes !== 1020) {
      throwDayConfigError(config.dayIndex, 'shiftEndMinutes', 'must equal 1020.');
    }
    if (config.realDurationSeconds !== 600) {
      throwDayConfigError(config.dayIndex, 'realDurationSeconds', 'must equal 600.');
    }
    if (config.encounterCountMin < 1) {
      throwDayConfigError(config.dayIndex, 'encounterCountMin', 'must be >= 1.');
    }
    if (config.encounterCountMax < config.encounterCountMin) {
      throwDayConfigError(config.dayIndex, 'encounterCountMax', 'must be >= encounterCountMin.');
    }

    ensureNoDuplicateItems(config.dayIndex, 'enabledEvidence', config.enabledEvidence);
    ensureNoDuplicateItems(
      config.dayIndex,
      'requiredChecklistCategories',
      config.requiredChecklistCategories,
    );
    if (!Array.isArray(config.requiredCaseQuotas)) {
      throwDayConfigError(config.dayIndex, 'requiredCaseQuotas', 'must exist and be an array.');
    }
    if (!Array.isArray(config.optionalCasePool)) {
      throwDayConfigError(config.dayIndex, 'optionalCasePool', 'must exist and be an array.');
    }

    const quotaIds: string[] = [];
    let requiredTotal = 0;
    for (const quota of config.requiredCaseQuotas) {
      quotaIds.push(quota.quotaId);
      if (!Number.isInteger(quota.count) || quota.count <= 0) {
        throwDayConfigError(config.dayIndex, `requiredCaseQuotas[${quota.quotaId}].count`, 'must be a positive integer.');
      }
      requiredTotal += quota.count;
      ensureValidRoundSpec(config.dayIndex, `requiredCaseQuotas[${quota.quotaId}].spec`, quota.spec);
    }
    ensureNoDuplicateItems(config.dayIndex, 'requiredCaseQuotas.quotaId', quotaIds);

    const entryIds: string[] = [];
    for (const entry of config.optionalCasePool) {
      entryIds.push(entry.entryId);
      if (!Number.isFinite(entry.weight) || entry.weight <= 0) {
        throwDayConfigError(config.dayIndex, `optionalCasePool[${entry.entryId}].weight`, 'must be a finite positive number.');
      }
      ensureValidRoundSpec(config.dayIndex, `optionalCasePool[${entry.entryId}].spec`, entry.spec);
    }
    ensureNoDuplicateItems(config.dayIndex, 'optionalCasePool.entryId', entryIds);
    if (requiredTotal > config.encounterCountMax) {
      throwDayConfigError(
        config.dayIndex,
        'requiredCaseQuotas',
        `required total ${requiredTotal} must be <= encounterCountMax ${config.encounterCountMax}.`,
      );
    }
    if (requiredTotal < config.encounterCountMin && config.optionalCasePool.length === 0) {
      throwDayConfigError(
        config.dayIndex,
        'optionalCasePool',
        'must be non-empty when required total is below encounterCountMin.',
      );
    }

    for (const category of config.requiredChecklistCategories) {
      ensureChecklistEvidenceDependency(config.dayIndex, category, config.enabledEvidence);
    }

    if (config.visitorSystemEnabled && !config.enabledEvidence.includes('appointment-roster')) {
      throwDayConfigError(config.dayIndex, 'enabledEvidence', 'visitor system requires appointment-roster.');
    }
    if (config.departmentPhoneEnabled && !config.enabledEvidence.includes('telephone')) {
      throwDayConfigError(config.dayIndex, 'enabledEvidence', 'department phone requires telephone.');
    }

    if (config.dayIndex === 1) {
      if (config.enabledEvidence.includes('employee-card')) {
        throwDayConfigError(config.dayIndex, 'enabledEvidence', 'Day 1 must not enable employee-card.');
      }
      if (config.enabledEvidence.includes('application-form')) {
        throwDayConfigError(config.dayIndex, 'enabledEvidence', 'Day 1 must not enable application-form.');
      }
    }
    if (config.dayIndex === 2 && config.enabledEvidence.includes('application-form')) {
      throwDayConfigError(config.dayIndex, 'enabledEvidence', 'Day 2 must not enable application-form.');
    }

    ensureFullChecklistEnabledFromDay3(config);
    ensureVisitorAndPhoneEnabledFromDay4(config);
    if (config.dayIndex >= 7) {
      ensurePlaceholderQueuePlan(config);
    }
  });

  assertDay1CampaignContract(CAMPAIGN_DAY_CONFIGS[0]);
  assertDay2CampaignContract(CAMPAIGN_DAY_CONFIGS[1]);
  assertDay3CampaignContract(CAMPAIGN_DAY_CONFIGS[2]);
  assertDay5CampaignContract(CAMPAIGN_DAY_CONFIGS[4]);
  assertDay6CampaignContract(CAMPAIGN_DAY_CONFIGS[5]);
  ensurePlaceholderQueuePlan(CAMPAIGN_DAY_CONFIGS[6]);
}

export function getDayLevelConfig(dayIndex: CampaignDayIndex | number): DayLevelConfig {
  if (!isCampaignDayIndex(dayIndex)) {
    throw new Error(`[DayCatalog] dayIndex=${String(dayIndex)} field=dayIndex must be an integer from 1 to 7.`);
  }
  const config = CAMPAIGN_DAY_CONFIGS[dayIndex - 1];
  if (!config) {
    throw new Error(`[DayCatalog] dayIndex=${dayIndex} field=CAMPAIGN_DAY_CONFIGS missing day config.`);
  }
  return config;
}

export function isImplementedCampaignDay(dayIndex: number): dayIndex is CampaignDayIndex {
  return isCampaignDayIndex(dayIndex) && dayIndex <= HIGHEST_IMPLEMENTED_CAMPAIGN_DAY;
}

export function isLastImplementedCampaignDay(dayIndex: number): boolean {
  return isImplementedCampaignDay(dayIndex) && dayIndex === HIGHEST_IMPLEMENTED_CAMPAIGN_DAY;
}
