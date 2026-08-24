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
  AppearanceCategory,
  AppearanceRule,
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
const VISIBLE_CARD_FAILURE_FIELDS: readonly EmployeeCardField[] = ['EMPLOYEE_ID', 'NAME', 'VALID_UNTIL', 'SEAL'];
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
const MAX_LEGACY_RANDOM_GENERATION_ATTEMPTS = 20;
const DAY6_CARD_FAIL_SPEC_PREFIX = 'day6-card-fail-human';
const DAY6_APPLICATION_FAIL_SPEC_PREFIX = 'day6-application-fail-human';
const DAY6_SUBTLE_APPEARANCE_SPEC_PREFIX = 'day6-disguised-monster';
const DAY_MS = 24 * 60 * 60 * 1000;

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

function parseIsoDateToUtcTime(value: string): number | null {
  if (!validateInspectionDateString(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatUtcDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function addDaysToIsoDate(dateValue: string, offsetDays: number): string {
  const base = parseIsoDateToUtcTime(dateValue);
  if (base === null) {
    return dateValue;
  }
  return formatUtcDate(base + offsetDays * DAY_MS);
}

function mutateName(name: string): string {
  if (name.length <= 2) {
    return `${name}X`;
  }
  return `${name.slice(0, name.length - 1)}${name[name.length - 1] === 'a' ? 'o' : 'a'}`;
}

function mutateNameTypo(name: string): string {
  if (name.length <= 2) {
    return mutateName(name);
  }
  const chars = name.split('');
  const letterIndexes = chars
    .map((ch, index) => ({ ch, index }))
    .filter(({ ch }) => /[a-z]/i.test(ch))
    .map(({ index }) => index);
  if (letterIndexes.length < 2) {
    return mutateName(name);
  }

  if (letterIndexes.length >= 4 && Math.random() < 0.6) {
    const pairIndex = Math.floor(Math.random() * (letterIndexes.length - 1));
    const left = letterIndexes[pairIndex];
    const right = letterIndexes[pairIndex + 1];
    [chars[left], chars[right]] = [chars[right], chars[left]];
    const swapped = chars.join('');
    if (swapped !== name) {
      return swapped;
    }
  }

  const replaceIndex = letterIndexes[Math.floor(Math.random() * letterIndexes.length)];
  const original = chars[replaceIndex];
  const lower = original.toLowerCase();
  const replacementTable: Record<string, string> = {
    a: 'e',
    e: 'a',
    i: 'l',
    l: 'i',
    o: 'a',
    u: 'o',
    c: 'k',
    k: 'c',
    m: 'n',
    n: 'm',
    r: 'n',
    s: 'z',
    t: 'f',
    v: 'w',
    w: 'v',
  };
  const mapped = replacementTable[lower];
  if (mapped) {
    chars[replaceIndex] = original === lower ? mapped : mapped.toUpperCase();
    const replaced = chars.join('');
    if (replaced !== name) {
      return replaced;
    }
  }

  if (letterIndexes.length >= 4) {
    const interior = letterIndexes.slice(1, -1);
    if (interior.length > 0) {
      const omitIndex = interior[Math.floor(Math.random() * interior.length)];
      const omitted = chars.filter((_, index) => index !== omitIndex).join('');
      if (omitted.length >= Math.max(2, name.length - 1) && omitted !== name) {
        return omitted;
      }
    }
  }

  return mutateName(name);
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

function mutateEmployeeIdSingleDigit(employeeId: string): string {
  const chars = employeeId.split('');
  const digitIndexes = chars
    .map((ch, index) => ({ ch, index }))
    .filter(({ ch }) => /[0-9]/.test(ch))
    .map(({ index }) => index);
  if (digitIndexes.length === 0) {
    return mutateEmployeeId(employeeId, true);
  }
  const targetIndex = digitIndexes[Math.floor(Math.random() * digitIndexes.length)];
  const current = chars[targetIndex];
  let next = current;
  while (next === current) {
    next = String(Math.floor(Math.random() * 10));
  }
  chars[targetIndex] = next;
  return chars.join('');
}

function generateSubtleValidUntil(profileValidUntil: string, inspectionDate: string): string {
  const inspectionTime = parseIsoDateToUtcTime(inspectionDate);
  if (inspectionTime === null) {
    return generateAdjacentExpiredDate();
  }
  const profileTime = parseIsoDateToUtcTime(profileValidUntil);
  if (profileTime !== null) {
    const nearProfile = formatUtcDate(profileTime + randomItem([-2, -1, 1, 2]) * DAY_MS);
    const nearGapDays = Math.floor((inspectionTime - parseIsoDateToUtcTime(nearProfile)!) / DAY_MS);
    if (!isValidUntilPass(nearProfile, inspectionDate) && nearGapDays >= 1 && nearGapDays <= 3) {
      return nearProfile;
    }
  }
  return formatUtcDate(inspectionTime + randomItem([-3, -2, -1]) * DAY_MS);
}

function generateSubtleValidPassUntil(inspectionDate: string): string {
  return addDaysToIsoDate(inspectionDate, randomItem([1, 2, 3]));
}

function pickDay6CardFailureField(): EmployeeCardField {
  const roll = Math.random();
  if (roll < 0.34) {
    return 'EMPLOYEE_ID';
  }
  if (roll < 0.5) {
    return 'NAME';
  }
  if (roll < 0.79) {
    return 'VALID_UNTIL';
  }
  return 'SEAL';
}

function pickDay6ApplicationFailureField(): ApplicationField {
  const roll = Math.random();
  if (roll < 0.24) {
    return 'EMPLOYEE_ID';
  }
  if (roll < 0.48) {
    return 'NAME';
  }
  if (roll < 0.69) {
    return 'POSITION';
  }
  if (roll < 0.9) {
    return 'DEPARTMENT';
  }
  return 'REASON_FOR_ENTRY';
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

function mutatePositionSubtle(position: string): string {
  const explicitCandidates: Record<string, readonly string[]> = {
    Researcher: ['Research Specialist', 'Research Analyst'],
    'Research Assistant': ['Assistant Researcher', 'Research Associate'],
    'Research Team Lead': ['Research Lead', 'Lead Researcher'],
    'Production Manager': ['Production Lead', 'Operations Manager'],
    'Production Technician': ['Production Specialist', 'Operations Technician'],
    'Sales Associate': ['Sales Representative', 'Sales Consultant'],
    'Sales Supervisor': ['Sales Lead', 'Senior Sales Associate'],
    'Sales Intern': ['Sales Trainee', 'Junior Sales Associate'],
  };
  const explicit = explicitCandidates[position];
  if (explicit && explicit.length > 0) {
    return randomItem(explicit);
  }

  if (position.includes('Team Lead')) {
    const candidate = position.replace('Team Lead', 'Lead');
    if (candidate !== position) {
      return candidate;
    }
  }
  if (position.includes('Manager')) {
    const candidate = position.replace('Manager', 'Lead');
    if (candidate !== position) {
      return candidate;
    }
  }
  if (position.includes('Assistant')) {
    const candidate = position.replace('Assistant', 'Associate');
    if (candidate !== position) {
      return candidate;
    }
  }
  if (position.includes('Technician')) {
    const candidate = position.replace('Technician', 'Specialist');
    if (candidate !== position) {
      return candidate;
    }
  }
  if (position.includes('Associate')) {
    const candidate = position.replace('Associate', 'Representative');
    if (candidate !== position) {
      return candidate;
    }
  }
  if (position.includes('Supervisor')) {
    const candidate = position.replace('Supervisor', 'Lead');
    if (candidate !== position) {
      return candidate;
    }
  }
  if (position.includes('Intern')) {
    const candidate = position.replace('Intern', 'Trainee');
    if (candidate !== position) {
      return candidate;
    }
  }

  return mutatePosition(position);
}

function mutateDepartmentSubtle(currentDepartment: string): string {
  if (currentDepartment.endsWith('Department')) {
    const candidate = currentDepartment.replace(/Department$/, 'Division');
    if (candidate !== currentDepartment) {
      return candidate;
    }
  }
  if (currentDepartment.endsWith('Division')) {
    const candidate = currentDepartment.replace(/Division$/, 'Department');
    if (candidate !== currentDepartment) {
      return candidate;
    }
  }
  if (currentDepartment.includes('Research')) {
    return 'Research Division';
  }
  if (currentDepartment.includes('Production')) {
    return 'Production Division';
  }
  if (currentDepartment.includes('Sales')) {
    return 'Sales Division';
  }
  return mutateDepartment(currentDepartment);
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
  day6SubtleCardFailure?: boolean;
  day6SubtleApplicationFailure?: boolean;
  day6SubtleAppearanceFailure?: boolean;
}

type Day6AppearanceFailureRuleGroup = 'HAIR' | 'EYE' | 'MOLE' | 'ACCESSORY';

const DAY6_APPEARANCE_RULE_GROUP_WEIGHTS: readonly { group: Day6AppearanceFailureRuleGroup; weight: number }[] = [
  { group: 'HAIR', weight: 35 },
  { group: 'EYE', weight: 25 },
  { group: 'MOLE', weight: 20 },
  { group: 'ACCESSORY', weight: 20 },
];

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
      return this.generateLegacyRandomRound(previousSignature, difficulty, inspectionDate);
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
    const day6SubtleCardFailure = this.shouldUseDay6SubtleCardFailure(spec);
    const day6SubtleApplicationFailure = this.shouldUseDay6SubtleApplicationFailure(spec);
    const day6SubtleAppearanceFailure = this.shouldUseDay6SubtleAppearanceFailure(spec);
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
        day6SubtleCardFailure,
        day6SubtleApplicationFailure,
        day6SubtleAppearanceFailure,
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

  private shouldUseDay6SubtleCardFailure(spec: CampaignRoundSpec): boolean {
    if (spec.mode !== 'employee-constraint') {
      return false;
    }
    if (!spec.specId.startsWith(DAY6_CARD_FAIL_SPEC_PREFIX)) {
      return false;
    }
    if (spec.caseKind !== 'INVALID_HUMAN') {
      return false;
    }
    return (
      spec.truth?.idCardPass === false &&
      spec.truth?.applicationPass === true &&
      spec.truth?.appearancePass === true
    );
  }

  private shouldUseDay6SubtleApplicationFailure(spec: CampaignRoundSpec): boolean {
    if (spec.mode !== 'employee-constraint') {
      return false;
    }
    if (!spec.specId.startsWith(DAY6_APPLICATION_FAIL_SPEC_PREFIX)) {
      return false;
    }
    if (spec.caseKind !== 'INVALID_HUMAN') {
      return false;
    }
    return (
      spec.truth?.idCardPass === true &&
      spec.truth?.applicationPass === false &&
      spec.truth?.appearancePass === true
    );
  }

  private shouldUseDay6SubtleAppearanceFailure(spec: CampaignRoundSpec): boolean {
    if (spec.mode !== 'employee-constraint') {
      return false;
    }
    if (!spec.specId.startsWith(DAY6_SUBTLE_APPEARANCE_SPEC_PREFIX)) {
      return false;
    }
    if (spec.caseKind !== 'DISGUISED_MONSTER') {
      return false;
    }
    return (
      spec.truth?.idCardPass === true &&
      spec.truth?.applicationPass === true &&
      spec.truth?.appearancePass === false
    );
  }

  private pickDay6AppearanceFailureRule(appearanceRules: readonly AppearanceRule[]): AppearanceRule | null {
    const groupBuckets: Record<Day6AppearanceFailureRuleGroup, AppearanceRule[]> = {
      HAIR: [],
      EYE: [],
      MOLE: [],
      ACCESSORY: [],
    };

    const classifyRuleGroup = (rule: AppearanceRule): Day6AppearanceFailureRuleGroup | null => {
      const text = `${rule.key} ${rule.description}`.toLowerCase();
      const categoriesByGroup: Readonly<Record<Day6AppearanceFailureRuleGroup, readonly AppearanceCategory[]>> = {
        HAIR: ['HAIR_COLOR', 'HAIRSTYLE'],
        EYE: ['EYE_COLOR'],
        MOLE: ['MOLE'],
        ACCESSORY: ['EARRINGS', 'NECKLACE', 'SILVER_ACCESSORIES', 'LIPSTICK'],
      };
      for (const group of Object.keys(categoriesByGroup) as Day6AppearanceFailureRuleGroup[]) {
        if (categoriesByGroup[group].includes(rule.category)) {
          return group;
        }
      }
      if (text.includes('hair')) {
        return 'HAIR';
      }
      if (text.includes('eye') || text.includes('iris')) {
        return 'EYE';
      }
      if (text.includes('mole')) {
        return 'MOLE';
      }
      if (
        text.includes('earring') ||
        text.includes('necklace') ||
        text.includes('lipstick') ||
        text.includes('silver') ||
        text.includes('accessor')
      ) {
        return 'ACCESSORY';
      }
      return null;
    };

    for (const rule of appearanceRules) {
      const group = classifyRuleGroup(rule);
      if (group) {
        groupBuckets[group].push(rule);
      }
    }

    const availableGroups = DAY6_APPEARANCE_RULE_GROUP_WEIGHTS.filter((entry) => groupBuckets[entry.group].length > 0);
    if (availableGroups.length > 0) {
      const total = availableGroups.reduce((sum, entry) => sum + entry.weight, 0);
      let roll = Math.random() * total;
      for (const entry of availableGroups) {
        if (roll < entry.weight) {
          return randomItem(groupBuckets[entry.group]);
        }
        roll -= entry.weight;
      }
      const fallbackGroup = availableGroups[availableGroups.length - 1].group;
      return randomItem(groupBuckets[fallbackGroup]);
    }

    if (appearanceRules.length > 0) {
      return randomItem(appearanceRules);
    }
    return null;
  }

  private applyDay6SubtleAppearanceFailure(args: {
    profileAppearanceRules: readonly AppearanceRule[];
    fallbackFailedRuleKeys: readonly string[];
  }): string[] {
    const pickedRule = this.pickDay6AppearanceFailureRule(args.profileAppearanceRules);
    if (pickedRule) {
      return [pickedRule.key];
    }
    if (args.fallbackFailedRuleKeys.length > 0) {
      return [randomItem(args.fallbackFailedRuleKeys)];
    }
    return [];
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

  private generateLegacyRandomRound(
    previousSignature: string | null,
    difficulty: DifficultyTier,
    inspectionDate: string,
  ): RoundInstance {
    let candidate: RoundInstance | null = null;
    for (let attempts = 1; attempts <= MAX_LEGACY_RANDOM_GENERATION_ATTEMPTS; attempts += 1) {
      const employeeKey = this.pickInspectionEnabledEmployeeKey();
      const caseKind = this.pickCaseKindForLegacyRandomEmployee(employeeKey, inspectionDate);
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

    const fallbackPool = INSPECTION_ENABLED_EMPLOYEE_KEYS.filter((key) => key !== candidate?.employeeKey);
    const fallbackEmployee = randomItem(fallbackPool.length > 0 ? fallbackPool : INSPECTION_ENABLED_EMPLOYEE_KEYS);
    const fallbackCaseKind = this.pickCaseKindForLegacyRandomEmployee(fallbackEmployee, inspectionDate);
    const fallbackRound = this.buildRound({
      employeeKey: fallbackEmployee,
      caseKind: fallbackCaseKind,
      difficulty,
      inspectionDate,
    });
    const fallbackValidation = validateRoundInstance(fallbackRound, previousSignature);
    if (!fallbackValidation.ok) {
      throw new Error(`RoundGenerator legacy-random fallback failed: ${fallbackValidation.errors.join('; ')}`);
    }
    return fallbackRound;
  }

  private pickCaseKindForLegacyRandomEmployee(employeeKey: EmployeeKey, inspectionDate: string): CaseKind {
    const profile = EMPLOYEE_PROFILES[employeeKey];
    const variants = getAppearanceVariantsForEmployee(employeeKey);
    const hasQualifiedMonsterVariant = variants.some(
      (variant) =>
        variant.failedRuleKeys.length > 0 &&
        variant.spriteFrameUuid.trim().length > 0 &&
        variant.spriteFrameUuid !== profile.portraitSpriteFrameUuid,
    );
    const canBeValidHuman = this.isProfileCardValidOnDate(employeeKey, inspectionDate);
    if (!hasQualifiedMonsterVariant) {
      return canBeValidHuman ? randomItem(HUMAN_CASE_KIND_POOL) : 'INVALID_HUMAN';
    }
    const pool: readonly CaseKind[] = canBeValidHuman
      ? (['VALID_HUMAN', 'INVALID_HUMAN', 'DISGUISED_MONSTER'] as const)
      : (['INVALID_HUMAN', 'DISGUISED_MONSTER'] as const);
    return randomItem(pool);
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
      !profileCardPassesOnInspectionDate &&
      context.day6SubtleCardFailure !== true;
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
      validUntil: this.generateApplicationValidUntil(context.inspectionDate),
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
      if (context.requestedTruth) {
        this.applyFailuresFromTruthSpec({
          caseKind: context.caseKind,
          difficulty: context.difficulty,
          profileKey: profile.key,
          requestedTruth: context.requestedTruth,
          card,
          application,
          appearance,
          variant: selectedVariant,
          inspectionDate: context.inspectionDate,
          day6SubtleCardFailure: context.day6SubtleCardFailure === true,
          day6SubtleApplicationFailure: context.day6SubtleApplicationFailure === true,
          day6SubtleAppearanceFailure: context.day6SubtleAppearanceFailure === true,
        });
      } else {
        this.applyFailures({
          caseKind: context.caseKind,
          difficulty: context.difficulty,
          targetFailCount,
          profileKey: profile.key,
          card,
          application,
          appearance,
          variant: selectedVariant,
          inspectionDate: context.inspectionDate,
          day6SubtleCardFailure: context.day6SubtleCardFailure === true,
          day6SubtleApplicationFailure: context.day6SubtleApplicationFailure === true,
        });
      }
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

  private generateApplicationValidUntil(inspectionDate: string): string {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const candidate = generateValidUntil();
      if (isValidUntilPass(candidate, inspectionDate)) {
        return candidate;
      }
    }
    // Safety fallback: keep application valid on inspection date.
    return inspectionDate;
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

  private applyCardFailureMutation(args: {
    profile: {
      employeeId: string;
      displayName: string;
      validUntil: string;
    };
    card: {
      employeeId: string;
      name: string;
      validUntil: string;
      sealState: 'VALID' | 'MISSING' | 'INVALID' | 'DAMAGED';
      failedFields: EmployeeCardField[];
    };
    difficulty: DifficultyTier;
    inspectionDate: string;
    subtle: boolean;
  }): void {
    const field = args.subtle ? pickDay6CardFailureField() : randomItem(['EMPLOYEE_ID', 'NAME', 'VALID_UNTIL', 'SEAL'] as const);
    uniquePush(args.card.failedFields, field);
    if (field === 'EMPLOYEE_ID') {
      args.card.employeeId = args.subtle
        ? mutateEmployeeIdSingleDigit(args.profile.employeeId)
        : mutateEmployeeId(args.profile.employeeId, args.difficulty !== 'EARLY');
    } else if (field === 'NAME') {
      args.card.name = args.subtle ? mutateNameTypo(args.profile.displayName) : mutateName(args.profile.displayName);
    } else if (field === 'VALID_UNTIL') {
      args.card.validUntil = args.subtle
        ? generateSubtleValidUntil(args.profile.validUntil, args.inspectionDate)
        : args.difficulty === 'LATE'
          ? generateAdjacentExpiredDate()
          : generateExpiredUntil();
    } else if (field === 'SEAL') {
      args.card.sealState = 'MISSING';
    }
    if (args.subtle && field !== 'VALID_UNTIL' && !isValidUntilPass(args.card.validUntil, args.inspectionDate)) {
      args.card.validUntil = generateSubtleValidPassUntil(args.inspectionDate);
    }
  }

  private applyApplicationFailureMutation(args: {
    profile: {
      employeeId: string;
      displayName: string;
      position: string;
      department: string;
    };
    application: {
      employeeId: string;
      name: string;
      position: string;
      department: string;
      reasonForEntry: string;
      failedFields: ApplicationField[];
    };
    difficulty: DifficultyTier;
    subtle: boolean;
  }): void {
    const field = args.subtle
      ? pickDay6ApplicationFailureField()
      : randomItem(['EMPLOYEE_ID', 'NAME', 'POSITION', 'DEPARTMENT', 'REASON_FOR_ENTRY'] as const);
    uniquePush(args.application.failedFields, field);
    if (field === 'EMPLOYEE_ID') {
      args.application.employeeId = args.subtle
        ? mutateEmployeeIdSingleDigit(args.profile.employeeId)
        : mutateEmployeeId(args.profile.employeeId, args.difficulty !== 'EARLY');
    } else if (field === 'NAME') {
      args.application.name = args.subtle ? mutateNameTypo(args.profile.displayName) : mutateName(args.profile.displayName);
    } else if (field === 'POSITION') {
      args.application.position = args.subtle ? mutatePositionSubtle(args.profile.position) : mutatePosition(args.profile.position);
    } else if (field === 'DEPARTMENT') {
      args.application.department = args.subtle
        ? mutateDepartmentSubtle(args.profile.department)
        : mutateDepartment(args.profile.department);
    } else if (field === 'REASON_FOR_ENTRY') {
      args.application.reasonForEntry = randomItem(APPLICATION_REASON_WRONG_POOL);
    }
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
    inspectionDate: string;
    day6SubtleCardFailure: boolean;
    day6SubtleApplicationFailure: boolean;
  }): void {
    const profile = EMPLOYEE_PROFILES[args.profileKey];

    const availableMutators = shuffle([
      () => {
        this.applyCardFailureMutation({
          profile: {
            employeeId: profile.employeeId,
            displayName: profile.displayName,
            validUntil: profile.validUntil,
          },
          card: args.card,
          difficulty: args.difficulty,
          inspectionDate: args.inspectionDate,
          subtle: args.day6SubtleCardFailure,
        });
      },
      () => {
        this.applyApplicationFailureMutation({
          profile: {
            employeeId: profile.employeeId,
            displayName: profile.displayName,
            position: profile.position,
            department: profile.department,
          },
          application: args.application,
          difficulty: args.difficulty,
          subtle: args.day6SubtleApplicationFailure,
        });
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
      uniquePush(args.application.failedFields, 'REASON_FOR_ENTRY');
      args.application.reasonForEntry = randomItem(APPLICATION_REASON_WRONG_POOL);
    }

    if (args.caseKind === 'DISGUISED_MONSTER' && args.appearance.failedRuleKeys.length === 0 && args.variant.failedRuleKeys.length > 0) {
      args.appearance.failedRuleKeys = [...args.variant.failedRuleKeys];
    }
  }

  private applyFailuresFromTruthSpec(args: {
    caseKind: CaseKind;
    difficulty: DifficultyTier;
    profileKey: EmployeeKey;
    requestedTruth: CampaignRoundTruthConstraint;
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
    inspectionDate: string;
    day6SubtleCardFailure: boolean;
    day6SubtleApplicationFailure: boolean;
    day6SubtleAppearanceFailure: boolean;
  }): void {
    const { requestedTruth } = args;
    const profile = EMPLOYEE_PROFILES[args.profileKey];
    const applyRandomApplicationFieldFailure = (): void => {
      this.applyApplicationFailureMutation({
        profile: {
          employeeId: profile.employeeId,
          displayName: profile.displayName,
          position: profile.position,
          department: profile.department,
        },
        application: args.application,
        difficulty: args.difficulty,
        subtle: args.day6SubtleApplicationFailure,
      });
    };
    const hasIdCardConstraint = requestedTruth.idCardPass === true || requestedTruth.idCardPass === false;
    const hasApplicationConstraint =
      requestedTruth.applicationPass === true || requestedTruth.applicationPass === false;
    const hasAppearanceConstraint =
      requestedTruth.appearancePass === true || requestedTruth.appearancePass === false;
    if (!hasIdCardConstraint && !hasApplicationConstraint && !hasAppearanceConstraint) {
      this.applyFailures({
        caseKind: args.caseKind,
        difficulty: args.difficulty,
        targetFailCount: calculateTargetFailCount(args.difficulty, args.caseKind),
        profileKey: args.profileKey,
        card: args.card,
        application: args.application,
        appearance: args.appearance,
        variant: args.variant,
        inspectionDate: args.inspectionDate,
        day6SubtleCardFailure: args.day6SubtleCardFailure,
        day6SubtleApplicationFailure: args.day6SubtleApplicationFailure,
      });
      return;
    }

    if (args.caseKind === 'DISGUISED_MONSTER') {
      if (args.day6SubtleAppearanceFailure) {
        args.appearance.failedRuleKeys = this.applyDay6SubtleAppearanceFailure({
          profileAppearanceRules: profile.appearanceRules,
          fallbackFailedRuleKeys: args.variant.failedRuleKeys,
        });
      } else {
        args.appearance.failedRuleKeys =
          args.variant.failedRuleKeys.length > 0 ? [...args.variant.failedRuleKeys] : [...args.appearance.failedRuleKeys];
      }
      return;
    }

    if (
      args.caseKind === 'INVALID_HUMAN' &&
      requestedTruth.idCardPass === false &&
      requestedTruth.applicationPass === true &&
      requestedTruth.appearancePass === true
    ) {
      if (args.card.failedFields.length === 0) {
        this.applyCardFailureMutation({
          profile: {
            employeeId: profile.employeeId,
            displayName: profile.displayName,
            validUntil: profile.validUntil,
          },
          card: args.card,
          difficulty: args.difficulty,
          inspectionDate: args.inspectionDate,
          subtle: args.day6SubtleCardFailure,
        });
      }
      args.application.failedFields = [];
      args.appearance.failedRuleKeys = [];
      return;
    }

    if (
      args.caseKind === 'INVALID_HUMAN' &&
      requestedTruth.idCardPass === true &&
      requestedTruth.applicationPass === false &&
      requestedTruth.appearancePass === true
    ) {
      if (args.application.failedFields.length === 0) {
        applyRandomApplicationFieldFailure();
      }
      args.card.failedFields = [];
      args.appearance.failedRuleKeys = [];
      return;
    }

    if (
      args.caseKind === 'VALID_HUMAN' &&
      requestedTruth.idCardPass === true &&
      requestedTruth.applicationPass === true &&
      requestedTruth.appearancePass === true
    ) {
      return;
    }

    this.applyFailures({
      caseKind: args.caseKind,
      difficulty: args.difficulty,
      targetFailCount: calculateTargetFailCount(args.difficulty, args.caseKind),
      profileKey: args.profileKey,
      card: args.card,
      application: args.application,
      appearance: args.appearance,
      variant: args.variant,
      inspectionDate: args.inspectionDate,
      day6SubtleCardFailure: args.day6SubtleCardFailure,
      day6SubtleApplicationFailure: args.day6SubtleApplicationFailure,
    });
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
    return Array.from(all);
  }

  public getRoundBySignatureProbe(previousSignature: string | null): RoundInstance {
    return this.generateNextRound(previousSignature, 'EARLY');
  }

  public generateDebugDateTriplet(): string[] {
    return [generateAdjacentExpiredDate(), addDaysToCurrentDate(0), addDaysToCurrentDate(1)];
  }
}
