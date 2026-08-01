import {
  CURRENT_DATE,
  addDaysToCurrentDate,
  generateAdjacentExpiredDate,
  generateExpiredUntil,
  generateValidUntil,
  isValidUntilPass,
  validateInspectionDateString,
} from './InspectionDateRules';
import {
  APPEARANCE_VARIANTS,
  EMPLOYEE_KEYS,
  EMPLOYEE_PROFILES,
  INSPECTION_ENABLED_EMPLOYEE_KEYS,
  REASON_FOR_ENTRY_ON_DUTY,
  canEmployeeServeCase,
  getAppearanceVariantsForEmployee,
} from './EmployeeProfileCatalog';
import { buildRoundSignature } from './RoundSignature';
import type { CampaignRoundSpec, CampaignRoundTruthConstraint } from '../campaign/DayQueueTypes';
import type {
  ApplicationField,
  AppearanceVariantDefinition,
  CaseKind,
  DifficultyTier,
  EmployeeCardField,
  EmployeeKey,
  RoundInstance,
} from './InspectionTypes';
import { validateRoundInstance } from './RoundValidator';
import {
  doesRoundMatchSpec,
  inferCaseKindFromSpec,
  validateRoundSpecFeasibility,
} from '../campaign/DayQueueValidator';

const APPLICATION_REASON_WRONG_POOL = ['ON DELIVERY', 'MAINTENANCE', 'PERSONAL VISIT'];
const VISIBLE_CARD_FAILURE_FIELDS: readonly EmployeeCardField[] = ['EMPLOYEE_ID', 'NAME', 'VALID_UNTIL'];
const VISIBLE_APPLICATION_FAILURE_FIELDS: readonly ApplicationField[] = [
  'EMPLOYEE_ID',
  'NAME',
  'POSITION',
  'DEPARTMENT',
  'VALID_UNTIL',
  'REASON_FOR_ENTRY',
];

const HUMAN_CASE_KIND_POOL: CaseKind[] = ['VALID_HUMAN', 'INVALID_HUMAN'];
const MAX_SPEC_GENERATION_ATTEMPTS = 40;

function randomItem<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

function uniquePush<T>(list: T[], value: T): void {
  if (!list.includes(value)) {
    list.push(value);
  }
}

function shuffle<T>(values: T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function mutateName(name: string): string {
  if (name.length <= 2) {
    return `${name}X`;
  }
  return `${name.slice(0, name.length - 1)}${name[name.length - 1] === 'a' ? 'o' : 'a'}`;
}

function mutateEmployeeId(employeeId: string, subtle: boolean): string {
  if (employeeId.length < 2) {
    return `${employeeId}9`;
  }
  const chars = employeeId.split('');
  if (subtle) {
    const i = Math.max(0, chars.length - 2);
    [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
    const swapped = chars.join('');
    return swapped === employeeId ? `${employeeId.slice(0, -1)}8` : swapped;
  }
  chars[chars.length - 1] = chars[chars.length - 1] === '9' ? '3' : '9';
  return chars.join('');
}

function mutatePosition(position: string): string {
  return `${position} (Temp)`;
}

function mutateDepartment(currentDepartment: string): string {
  if (currentDepartment === 'Research Department') {
    return 'Production Department';
  }
  if (currentDepartment === 'Production Department') {
    return 'Sales Department';
  }
  return 'Research Department';
}

function calculateTargetFailCount(difficulty: DifficultyTier, caseKind: CaseKind): number {
  if (caseKind === 'VALID_HUMAN') {
    return 0;
  }
  if (difficulty === 'EARLY') {
    return 2 + Math.floor(Math.random() * 3); // 2-4
  }
  if (difficulty === 'MID') {
    return 1 + Math.floor(Math.random() * 2); // 1-2
  }
  return 1;
}

function buildRoundId(): string {
  return `round-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

interface BuildContext {
  employeeKey: EmployeeKey;
  caseKind: CaseKind;
  difficulty: DifficultyTier;
  inspectionDate: string;
  requestedTruth?: CampaignRoundTruthConstraint;
}

export class RoundGenerator {
  public computeDifficultyTierFromCompletedRoundCount(completedRoundCount: number): DifficultyTier {
    if (completedRoundCount < 5) {
      return 'EARLY';
    }
    if (completedRoundCount < 10) {
      return 'MID';
    }
    return 'LATE';
  }

  public generateNextRound(
    previousSignature: string | null,
    difficulty: DifficultyTier,
    inspectionDate: string = CURRENT_DATE,
  ): RoundInstance {
    if (!validateInspectionDateString(inspectionDate)) {
      throw new Error(
        `[RoundGenerator] generateNextRound invalid inspectionDate=${inspectionDate} difficulty=${difficulty}`,
      );
    }
    let retries = 0;
    let candidate: RoundInstance | null = null;
    while (retries < 20) {
      retries += 1;
      const employeeKey = this.pickInspectionEnabledEmployeeKey();
      const caseKind = this.pickCaseKindForEmployee(employeeKey);
      candidate = this.buildRound({
        employeeKey,
        caseKind,
        difficulty,
        inspectionDate,
      });
      const validation = validateRoundInstance(candidate, previousSignature);
      if (validation.ok) {
        return candidate;
      }
    }

    // Final fallback: force employee or case change to break repeated signature.
    const fallbackPool = INSPECTION_ENABLED_EMPLOYEE_KEYS.filter((key) => key !== candidate?.employeeKey);
    const fallbackEmployee = randomItem(fallbackPool.length > 0 ? fallbackPool : INSPECTION_ENABLED_EMPLOYEE_KEYS);
    const fallbackCaseKind = this.pickCaseKindForEmployee(fallbackEmployee);
    const fallbackRound = this.buildRound({
      employeeKey: fallbackEmployee,
      caseKind: fallbackCaseKind,
      difficulty,
      inspectionDate,
    });
    const fallbackValidation = validateRoundInstance(fallbackRound, previousSignature);
    if (!fallbackValidation.ok) {
      throw new Error(`RoundGenerator fallback failed: ${fallbackValidation.errors.join('; ')}`);
    }
    return fallbackRound;
  }

  public generateRoundFromSpec(args: {
    readonly spec: CampaignRoundSpec;
    readonly completedRoundCount: number;
    readonly previousSignature: string | null;
    readonly inspectionDate: string;
  }): RoundInstance {
    const { spec, completedRoundCount, previousSignature, inspectionDate } = args;
    if (!validateInspectionDateString(inspectionDate)) {
      throw new Error(
        `[RoundGenerator] generateRoundFromSpec invalid inspectionDate=${inspectionDate} specId=${spec.specId}`,
      );
    }
    const difficulty = this.computeDifficultyTierFromCompletedRoundCount(completedRoundCount);
    if (spec.mode === 'legacy-random') {
      return this.generateNextRound(previousSignature, difficulty, inspectionDate);
    }

    const specErrors = validateRoundSpecFeasibility(spec);
    if (specErrors.length > 0) {
      throw new Error(
        `[RoundGenerator] spec invalid specId=${spec.specId} mode=${spec.mode} caseKind=${String(
          spec.caseKind ?? null,
        )} employeeKey=${String(spec.employeeKey ?? null)} truth=${JSON.stringify(
          spec.truth ?? null,
        )} errors=${specErrors.join(' | ')}`,
      );
    }

    const inferredCaseKind = inferCaseKindFromSpec(spec);
    this.assertSpecCardPassCompatibility(spec, inspectionDate);
    let lastValidationErrors: string[] = [];
    for (let attempts = 1; attempts <= MAX_SPEC_GENERATION_ATTEMPTS; attempts += 1) {
      const employeeKey =
        spec.employeeKey ??
        this.pickEmployeeKeyForSpecTruth({
          requestedTruth: spec.truth,
          inspectionDate,
        });
      const caseKind = spec.caseKind ?? inferredCaseKind ?? this.pickCaseKindForEmployee(employeeKey);
      const candidate = this.buildRound({
        employeeKey,
        caseKind,
        difficulty,
        inspectionDate,
        requestedTruth: spec.truth,
      });
      if (!doesRoundMatchSpec(candidate, spec)) {
        continue;
      }
      if (!this.isConstrainedDocumentFailureVisible(candidate, spec)) {
        continue;
      }
      const validation = validateRoundInstance(candidate, previousSignature);
      if (validation.ok) {
        return candidate;
      }
      lastValidationErrors = validation.errors;
    }

    throw new Error(
      `[RoundGenerator] spec generation failed specId=${spec.specId} mode=${spec.mode} caseKind=${String(
        spec.caseKind ?? inferredCaseKind ?? null,
      )} employeeKey=${String(spec.employeeKey ?? null)} truth=${JSON.stringify(
        spec.truth ?? null,
      )} attempts=${MAX_SPEC_GENERATION_ATTEMPTS} validatorErrors=${lastValidationErrors.join(' | ')}`,
    );
  }

  private getProfileCardValidUntil(employeeKey: EmployeeKey): string {
    const value = EMPLOYEE_PROFILES[employeeKey]?.validUntil;
    if (!value) {
      throw new Error(`[RoundGenerator] missing profile card validUntil for employeeKey=${employeeKey}`);
    }
    return value;
  }

  private isProfileCardValidOnDate(employeeKey: EmployeeKey, inspectionDate: string): boolean {
    return isValidUntilPass(this.getProfileCardValidUntil(employeeKey), inspectionDate);
  }

  private assertSpecCardPassCompatibility(spec: CampaignRoundSpec, inspectionDate: string): void {
    if (spec.mode !== 'employee-constraint') {
      return;
    }
    if (spec.truth?.idCardPass !== true || !spec.employeeKey) {
      return;
    }
    const profileValidUntil = this.getProfileCardValidUntil(spec.employeeKey);
    if (isValidUntilPass(profileValidUntil, inspectionDate)) {
      return;
    }
    throw new Error(
      `[RoundGenerator] spec incompatible with profile validity specId=${spec.specId} employeeKey=${spec.employeeKey} inspectionDate=${inspectionDate} profileValidUntil=${profileValidUntil} requestedIdCardPass=true`,
    );
  }

  private pickEmployeeKeyForSpecTruth(args: {
    requestedTruth: CampaignRoundTruthConstraint | undefined;
    inspectionDate: string;
  }): EmployeeKey {
    if (args.requestedTruth?.idCardPass !== true) {
      return this.pickInspectionEnabledEmployeeKey();
    }
    const eligible = INSPECTION_ENABLED_EMPLOYEE_KEYS.filter((employeeKey) =>
      canEmployeeServeCase({
        employeeKey,
        caseKind: 'VALID_HUMAN',
        inspectionDate: args.inspectionDate,
        requiredTruth: {
          idCardPass: true,
        },
      }),
    );
    if (eligible.length === 0) {
      throw new Error(
        `[RoundGenerator] no employee can satisfy requestedIdCardPass=true inspectionDate=${args.inspectionDate}`,
      );
    }
    return randomItem(eligible);
  }

  private pickInspectionEnabledEmployeeKey(): EmployeeKey {
    if (INSPECTION_ENABLED_EMPLOYEE_KEYS.length === 0) {
      throw new Error('RoundGenerator has no inspectionEnabled employees.');
    }
    return randomItem(INSPECTION_ENABLED_EMPLOYEE_KEYS);
  }

  private pickCaseKindForEmployee(employeeKey: EmployeeKey): CaseKind {
    const profile = EMPLOYEE_PROFILES[employeeKey];
    const variants = getAppearanceVariantsForEmployee(employeeKey);
    const hasQualifiedMonsterVariant = variants.some(
      (variant) =>
        variant.failedRuleKeys.length > 0 &&
        variant.spriteFrameUuid.trim().length > 0 &&
        variant.spriteFrameUuid !== profile.portraitSpriteFrameUuid,
    );
    if (!hasQualifiedMonsterVariant) {
      return randomItem(HUMAN_CASE_KIND_POOL);
    }
    return randomItem(['VALID_HUMAN', 'INVALID_HUMAN', 'DISGUISED_MONSTER'] as const);
  }

  private buildRound(context: BuildContext): RoundInstance {
    const profile = EMPLOYEE_PROFILES[context.employeeKey];
    const profileCardValidUntil = this.getProfileCardValidUntil(profile.key);
    const profileCardPassesOnInspectionDate = isValidUntilPass(profileCardValidUntil, context.inspectionDate);
    if (context.caseKind === 'VALID_HUMAN' && !profileCardPassesOnInspectionDate) {
      throw new Error(
        `[RoundGenerator] VALID_HUMAN incompatible with expired profile employeeKey=${profile.key} inspectionDate=${context.inspectionDate} profileValidUntil=${profileCardValidUntil}`,
      );
    }
    const targetFailCount = calculateTargetFailCount(context.difficulty, context.caseKind);
    const forceNaturalCardExpiryOnly =
      context.caseKind === 'INVALID_HUMAN' &&
      context.requestedTruth?.idCardPass === false &&
      context.requestedTruth?.applicationPass === true &&
      context.requestedTruth?.appearancePass === true &&
      !profileCardPassesOnInspectionDate;
    const card = {
      employeeId: profile.employeeId,
      name: profile.displayName,
      validUntil: profileCardValidUntil,
      sealState: 'VALID' as const,
      failedFields: [] as EmployeeCardField[],
    };
    const application = {
      employeeId: profile.employeeId,
      name: profile.displayName,
      position: profile.position,
      department: profile.department,
      validUntil: generateValidUntil(),
      reasonForEntry: REASON_FOR_ENTRY_ON_DUTY,
      failedFields: [] as ApplicationField[],
    };

    const variants = getAppearanceVariantsForEmployee(profile.key);
    const selectedVariant = this.pickAppearanceVariant(profile.key, variants, context.caseKind);
    const appearance = {
      spriteFrameUuid: selectedVariant.spriteFrameUuid,
      isDisguised: context.caseKind === 'DISGUISED_MONSTER',
      failedRuleKeys:
        context.caseKind === 'DISGUISED_MONSTER' ? [...selectedVariant.failedRuleKeys] : ([] as string[]),
      variantKey: selectedVariant.variantKey,
    };

    if (context.caseKind !== 'VALID_HUMAN' && !forceNaturalCardExpiryOnly) {
      this.applyFailures({
        caseKind: context.caseKind,
        difficulty: context.difficulty,
        targetFailCount,
        profileKey: profile.key,
        card,
        application,
        appearance,
        variant: selectedVariant,
      });
    }

    if (context.caseKind === 'INVALID_HUMAN') {
      appearance.failedRuleKeys = [];
    }

    this.applyInspectionDateCardRule(card, context.inspectionDate);

    if (
      context.caseKind === 'DISGUISED_MONSTER' &&
      card.failedFields.length === 0 &&
      application.failedFields.length === 0 &&
      appearance.failedRuleKeys.length === 0
    ) {
      uniquePush(card.failedFields, 'EMPLOYEE_ID');
      card.employeeId = mutateEmployeeId(profile.employeeId, true);
    }

    const truth = {
      cardPass: card.failedFields.length === 0,
      applicationPass: application.failedFields.length === 0,
      appearancePass: appearance.failedRuleKeys.length === 0,
      correctDecision:
        card.failedFields.length === 0 &&
        application.failedFields.length === 0 &&
        appearance.failedRuleKeys.length === 0
          ? ('ALLOW' as const)
          : ('DENY' as const),
      failedCategories: [
        card.failedFields.length > 0 && 'CARD',
        application.failedFields.length > 0 && 'APPLICATION',
        appearance.failedRuleKeys.length > 0 && 'APPEARANCE',
      ].filter(Boolean) as ('CARD' | 'APPLICATION' | 'APPEARANCE')[],
    };

    const roundWithoutSignature = {
      roundId: buildRoundId(),
      inspectionDate: context.inspectionDate,
      employeeKey: profile.key,
      caseKind: context.caseKind,
      card,
      application,
      appearance,
      truth,
      difficultyTier: context.difficulty,
    };

    const signature = buildRoundSignature(roundWithoutSignature);

    return Object.freeze({
      ...roundWithoutSignature,
      signature,
    });
  }

  private applyInspectionDateCardRule(
    card: {
      validUntil: string;
      failedFields: EmployeeCardField[];
    },
    inspectionDate: string,
  ): void {
    if (!isValidUntilPass(card.validUntil, inspectionDate)) {
      uniquePush(card.failedFields, 'VALID_UNTIL');
    }
  }

  private pickAppearanceVariant(
    employeeKey: EmployeeKey,
    variants: AppearanceVariantDefinition[],
    caseKind: CaseKind,
  ): AppearanceVariantDefinition {
    const profile = EMPLOYEE_PROFILES[employeeKey];
    if (caseKind === 'DISGUISED_MONSTER') {
      const qualifiedMonsterVariants = variants.filter(
        (variant) =>
          variant.failedRuleKeys.length > 0 &&
          variant.spriteFrameUuid.trim().length > 0 &&
          variant.spriteFrameUuid !== profile.portraitSpriteFrameUuid,
      );
      if (qualifiedMonsterVariants.length > 0) {
        return randomItem(qualifiedMonsterVariants);
      }
      throw new Error(`No qualified disguised monster appearance variant for employee: ${employeeKey}`);
    }
    return {
      employeeKey,
      variantKey: `${employeeKey}_normal_portrait`,
      spriteFrameUuid: profile.portraitSpriteFrameUuid,
      failedRuleKeys: [],
    };
  }

  private applyFailures(args: {
    caseKind: CaseKind;
    difficulty: DifficultyTier;
    targetFailCount: number;
    profileKey: EmployeeKey;
    card: {
      employeeId: string;
      name: string;
      validUntil: string;
      sealState: 'VALID' | 'MISSING' | 'INVALID' | 'DAMAGED';
      failedFields: EmployeeCardField[];
    };
    application: {
      employeeId: string;
      name: string;
      position: string;
      department: string;
      validUntil: string;
      reasonForEntry: string;
      failedFields: ApplicationField[];
    };
    appearance: {
      spriteFrameUuid: string;
      isDisguised: boolean;
      failedRuleKeys: string[];
      variantKey: string;
    };
    variant: AppearanceVariantDefinition;
  }): void {
    const profile = EMPLOYEE_PROFILES[args.profileKey];
    const cardPool: EmployeeCardField[] = ['EMPLOYEE_ID', 'NAME', 'VALID_UNTIL', 'SEAL'];
    const appPool: ApplicationField[] = [
      'EMPLOYEE_ID',
      'NAME',
      'POSITION',
      'DEPARTMENT',
      'VALID_UNTIL',
      'REASON_FOR_ENTRY',
    ];

    const availableMutators = shuffle([
      () => {
        const field = randomItem(cardPool);
        uniquePush(args.card.failedFields, field);
        if (field === 'EMPLOYEE_ID') {
          args.card.employeeId = mutateEmployeeId(profile.employeeId, args.difficulty !== 'EARLY');
        } else if (field === 'NAME') {
          args.card.name = mutateName(profile.displayName);
        } else if (field === 'VALID_UNTIL') {
          args.card.validUntil = args.difficulty === 'LATE' ? generateAdjacentExpiredDate() : generateExpiredUntil();
        } else if (field === 'SEAL') {
          args.card.sealState = args.difficulty === 'LATE' ? 'DAMAGED' : 'MISSING';
        }
      },
      () => {
        const field = randomItem(appPool);
        uniquePush(args.application.failedFields, field);
        if (field === 'EMPLOYEE_ID') {
          args.application.employeeId = mutateEmployeeId(profile.employeeId, args.difficulty !== 'EARLY');
        } else if (field === 'NAME') {
          args.application.name = mutateName(profile.displayName);
        } else if (field === 'POSITION') {
          args.application.position = mutatePosition(profile.position);
        } else if (field === 'DEPARTMENT') {
          args.application.department = mutateDepartment(profile.department);
        } else if (field === 'VALID_UNTIL') {
          args.application.validUntil = args.difficulty === 'LATE' ? generateAdjacentExpiredDate() : generateExpiredUntil();
        } else if (field === 'REASON_FOR_ENTRY') {
          args.application.reasonForEntry = randomItem(APPLICATION_REASON_WRONG_POOL);
        }
      },
      () => {
        if (args.variant.failedRuleKeys.length === 0) {
          return;
        }
        args.appearance.failedRuleKeys = [...args.variant.failedRuleKeys];
      },
    ]);

    const mustKeepAppearancePass = args.caseKind === 'INVALID_HUMAN';
    while (
      args.card.failedFields.length + args.application.failedFields.length + args.appearance.failedRuleKeys.length <
      args.targetFailCount
    ) {
      const mutate = randomItem(availableMutators);
      mutate();
      if (mustKeepAppearancePass) {
        args.appearance.failedRuleKeys = [];
      }
      if (args.card.failedFields.length + args.application.failedFields.length > 6) {
        break;
      }
    }

    if (args.caseKind === 'INVALID_HUMAN' && args.card.failedFields.length === 0 && args.application.failedFields.length === 0) {
      uniquePush(args.application.failedFields, 'VALID_UNTIL');
      args.application.validUntil = generateExpiredUntil();
    }

    if (args.caseKind === 'DISGUISED_MONSTER' && args.appearance.failedRuleKeys.length === 0 && args.variant.failedRuleKeys.length > 0) {
      args.appearance.failedRuleKeys = [...args.variant.failedRuleKeys];
    }
  }

  private isConstrainedDocumentFailureVisible(round: RoundInstance, spec: CampaignRoundSpec): boolean {
    if (spec.mode !== 'employee-constraint' || !spec.truth) {
      return true;
    }
    if (spec.truth.idCardPass === false) {
      if (round.card.failedFields.length === 0) {
        return false;
      }
      if (!round.card.failedFields.some((field) => VISIBLE_CARD_FAILURE_FIELDS.includes(field))) {
        return false;
      }
    }
    if (spec.truth.applicationPass === false) {
      if (round.application.failedFields.length === 0) {
        return false;
      }
      if (!round.application.failedFields.some((field) => VISIBLE_APPLICATION_FAILURE_FIELDS.includes(field))) {
        return false;
      }
    }
    return true;
  }

  public getAllRoundSpriteUuids(): string[] {
    const all = new Set<string>();
    for (const key of EMPLOYEE_KEYS) {
      const profile = EMPLOYEE_PROFILES[key];
      all.add(profile.portraitSpriteFrameUuid);
      if (profile.disguisedSpriteFrameUuid) {
        all.add(profile.disguisedSpriteFrameUuid);
      }
      if (profile.monsterPortraitSpriteFrameUuid) {
        all.add(profile.monsterPortraitSpriteFrameUuid);
      }
      if (profile.monsterFullbodySpriteFrameUuid) {
        all.add(profile.monsterFullbodySpriteFrameUuid);
      }
    }
    for (const variant of APPEARANCE_VARIANTS) {
      all.add(variant.spriteFrameUuid);
    }
    return [...all];
  }

  public getRoundBySignatureProbe(previousSignature: string | null): RoundInstance {
    return this.generateNextRound(previousSignature, 'EARLY');
  }

  public generateDebugDateTriplet(): string[] {
    return [generateAdjacentExpiredDate(), addDaysToCurrentDate(0), addDaysToCurrentDate(1)];
  }
}
