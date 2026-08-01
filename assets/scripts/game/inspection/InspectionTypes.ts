export type EmployeeKey =
  | 'carter'
  | 'ethan'
  | 'sam'
  | 'mark'
  | 'jake'
  | 'alice'
  | 'clara'
  | 'grace'
  | 'maya';

export type CaseKind = 'VALID_HUMAN' | 'INVALID_HUMAN' | 'DISGUISED_MONSTER';

export type EvidenceCategory = 'CARD' | 'APPLICATION' | 'APPEARANCE';

export type DifficultyTier = 'EARLY' | 'MID' | 'LATE';

export type EmployeeCardField = 'EMPLOYEE_ID' | 'NAME' | 'VALID_UNTIL' | 'SEAL';

export type ApplicationField =
  | 'EMPLOYEE_ID'
  | 'NAME'
  | 'POSITION'
  | 'DEPARTMENT'
  | 'VALID_UNTIL'
  | 'REASON_FOR_ENTRY';

export type AppearanceCategory =
  | 'EYE_COLOR'
  | 'HAIR_COLOR'
  | 'SKIN_TONE'
  | 'EYEBROWS'
  | 'MOLE'
  | 'EARRINGS'
  | 'NECKLACE'
  | 'SILVER_ACCESSORIES'
  | 'LIPSTICK'
  | 'HAIRSTYLE'
  | 'OTHER_VISIBLE';

export interface AppearanceRule {
  key: string;
  expectedValue: string | boolean;
  description: string;
  category: AppearanceCategory;
}

export interface AppearanceVariantDefinition {
  employeeKey: EmployeeKey;
  variantKey: string;
  spriteFrameUuid: string;
  failedRuleKeys: string[];
}

export interface WindowPortraitPresentation {
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface EmployeeProfile {
  key: EmployeeKey;
  inspectionEnabled: boolean;
  displayName: string;
  employeeId: string;
  validUntil: string;
  position: string;
  department: string;
  departmentPhone: string;
  appearanceRules: AppearanceRule[];
  flavorTraits?: string[];
  portraitSpriteFrameUuid: string;
  disguisedSpriteFrameUuid?: string;
  monsterPortraitSpriteFrameUuid?: string;
  monsterFullbodySpriteFrameUuid?: string;
  windowPortraitPresentation?: WindowPortraitPresentation;
}

export interface EmployeeCardRoundData {
  employeeId: string;
  name: string;
  validUntil: string;
  sealState: 'VALID' | 'MISSING' | 'INVALID' | 'DAMAGED';
  failedFields: EmployeeCardField[];
}

export interface ApplicationRoundData {
  employeeId: string;
  name: string;
  position: string;
  department: string;
  validUntil: string;
  reasonForEntry: string;
  failedFields: ApplicationField[];
}

export interface AppearanceRoundData {
  spriteFrameUuid: string;
  isDisguised: boolean;
  failedRuleKeys: string[];
  variantKey: string;
}

export interface RoundTruth {
  cardPass: boolean;
  applicationPass: boolean;
  appearancePass: boolean;
  correctDecision: 'ALLOW' | 'DENY';
  failedCategories: EvidenceCategory[];
}

export interface RoundInstance {
  roundId: string;
  inspectionDate: string;
  employeeKey: EmployeeKey;
  caseKind: CaseKind;
  card: EmployeeCardRoundData;
  application: ApplicationRoundData;
  appearance: AppearanceRoundData;
  truth: RoundTruth;
  signature: string;
  difficultyTier: DifficultyTier;
}
