import type { DayOptionalCaseEntry, DayRequiredCaseQuota } from './DayQueueTypes';

export type CampaignDayIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CampaignDifficultyTier =
  | 'tutorial-appearance'
  | 'tutorial-card'
  | 'tutorial-application'
  | 'visitor-introduction'
  | 'subtle-errors'
  | 'compound-errors'
  | 'final-comprehensive';

export type CampaignEvidenceKey =
  | 'employee-files'
  | 'employee-card'
  | 'application-form'
  | 'checklist'
  | 'appearance'
  | 'appointment-roster'
  | 'telephone';

export type CampaignChecklistCategory = 'id-card' | 'application' | 'appearance';

export interface DayLevelConfig {
  readonly dayIndex: CampaignDayIndex;
  readonly date: string;
  readonly shiftStartMinutes: number;
  readonly shiftEndMinutes: number;
  readonly realDurationSeconds: number;
  readonly encounterCountMin: number;
  readonly encounterCountMax: number;
  readonly difficultyTier: CampaignDifficultyTier;
  readonly enabledEvidence: readonly CampaignEvidenceKey[];
  readonly requiredChecklistCategories: readonly CampaignChecklistCategory[];
  readonly visitorSystemEnabled: boolean;
  readonly departmentPhoneEnabled: boolean;
  readonly requiredCaseQuotas: readonly DayRequiredCaseQuota[];
  readonly optionalCasePool: readonly DayOptionalCaseEntry[];
}
