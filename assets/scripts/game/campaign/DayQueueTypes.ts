import type { RoundInstance, CaseKind, EmployeeKey } from '../inspection/InspectionTypes';
import type { CampaignDayIndex, DayLevelConfig } from './DayLevelConfig';

export interface CampaignRoundTruthConstraint {
  readonly idCardPass?: boolean;
  readonly applicationPass?: boolean;
  readonly appearancePass?: boolean;
}

export interface LegacyRandomRoundSpec {
  readonly specId: string;
  readonly mode: 'legacy-random';
}

export interface EmployeeConstraintRoundSpec {
  readonly specId: string;
  readonly mode: 'employee-constraint';
  readonly caseKind?: CaseKind;
  readonly employeeKey?: EmployeeKey;
  readonly truth?: CampaignRoundTruthConstraint;
}

export type CampaignRoundSpec = LegacyRandomRoundSpec | EmployeeConstraintRoundSpec;

export interface DayRequiredCaseQuota {
  readonly quotaId: string;
  readonly spec: CampaignRoundSpec;
  readonly count: number;
}

export interface DayOptionalCaseEntry {
  readonly entryId: string;
  readonly spec: CampaignRoundSpec;
  readonly weight: number;
}

export interface GeneratedDayQueueEntry {
  readonly queueIndex: number;
  readonly sourceKind: 'required' | 'optional';
  readonly sourceId: string;
  readonly spec: CampaignRoundSpec;
  readonly plannedCompletedRoundCount: number;
  readonly round: RoundInstance;
  readonly signature: string;
}

export interface GeneratedDayQueue {
  readonly queueId: string;
  readonly dayIndex: CampaignDayIndex;
  readonly date: string;
  readonly targetEncounterCount: number;
  readonly requiredEncounterCount: number;
  readonly optionalEncounterCount: number;
  readonly buildAttempts: number;
  readonly rounds: readonly RoundInstance[];
  readonly signatures: readonly string[];
  readonly entries: readonly GeneratedDayQueueEntry[];
}

export interface DayQueueBuildInput {
  readonly config: DayLevelConfig;
  readonly completedRoundCount: number;
  readonly previousSignature: string | null;
  readonly random: () => number;
  readonly generateRoundFromSpec: (args: {
    readonly spec: CampaignRoundSpec;
    readonly completedRoundCount: number;
    readonly previousSignature: string | null;
    readonly inspectionDate: string;
  }) => RoundInstance;
}

export interface DayQueueStaticCheckResult {
  readonly testId: string;
  readonly pass: boolean;
  readonly dayIndex?: number;
  readonly quotaId?: string;
  readonly specId?: string;
  readonly employeeKey?: EmployeeKey;
  readonly expected: string;
  readonly actual: string;
}
