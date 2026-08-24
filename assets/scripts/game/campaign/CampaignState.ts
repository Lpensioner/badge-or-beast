import { CampaignDayIndex, DayLevelConfig } from './DayLevelConfig';
import { getDayLevelConfig, isCampaignDayIndex } from './DayCatalog';
import { buildDay4VisitorSession, type Day4VisitorSession } from '../visitors/Day4VisitorSessionGenerator';

export interface DailyDecisionErrorStats {
  readonly wrongAllowCount: number;
  readonly wrongDenyCount: number;
}

export type InspectionFinalDecision = 'allow' | 'deny';
export type DailyDecisionErrorKind = 'wrong-allow' | 'wrong-denial';
export type DailyDecisionErrorSubjectKind = 'employee' | 'visitor';
export type DecisionIssueKind =
  | 'id-card'
  | 'application'
  | 'appearance'
  | 'department'
  | 'purpose'
  | 'monster';

export interface DailyDecisionErrorRecord {
  readonly roundId: string;
  readonly dayIndex: number;
  readonly subjectKind: DailyDecisionErrorSubjectKind;
  readonly subjectKey: string;
  readonly displayName: string;
  readonly portraitSpriteFrameUuid: string | null;
  readonly errorKind: DailyDecisionErrorKind;
  readonly playerDecision: InspectionFinalDecision;
  readonly correctDecision: InspectionFinalDecision;
  readonly issueKinds: readonly DecisionIssueKind[];
}

export type WronglyAllowedMonsterSubjectKind = 'employee' | 'visitor';

export interface WronglyAllowedMonsterRecord {
  readonly roundId: string;
  readonly subjectKind: WronglyAllowedMonsterSubjectKind;
  readonly subjectKey: string;
  readonly monsterFullbodySpriteFrameUuid: string;
}

const ZERO_DAILY_DECISION_ERROR_STATS: DailyDecisionErrorStats = Object.freeze({
  wrongAllowCount: 0,
  wrongDenyCount: 0,
});

export class CampaignStateStore {
  private currentDayIndex: CampaignDayIndex = 1;
  private day4VisitorSession: Day4VisitorSession | null = null;
  private dailyDecisionErrorStats: DailyDecisionErrorStats = ZERO_DAILY_DECISION_ERROR_STATS;
  private dailyDecisionErrors: readonly DailyDecisionErrorRecord[] = Object.freeze([]);
  private wronglyAllowedMonsters: readonly WronglyAllowedMonsterRecord[] = Object.freeze([]);

  public getCurrentDayIndex(): CampaignDayIndex {
    return this.currentDayIndex;
  }

  public getCurrentDayConfig(): DayLevelConfig {
    return getDayLevelConfig(this.currentDayIndex);
  }

  public setCurrentDayIndex(dayIndex: CampaignDayIndex | number): DayLevelConfig {
    if (!isCampaignDayIndex(dayIndex)) {
      throw new Error(
        `[CampaignState] dayIndex=${String(dayIndex)} field=currentDayIndex must be an integer from 1 to 7.`,
      );
    }
    this.currentDayIndex = dayIndex;
    if (this.currentDayIndex !== 4) {
      this.day4VisitorSession = null;
    }
    this.resetDailyDecisionErrorStats();
    this.resetWronglyAllowedMonsters();
    return this.getCurrentDayConfig();
  }

  public restartCurrentDay(dayIndex: CampaignDayIndex | number): DayLevelConfig {
    if (!isCampaignDayIndex(dayIndex)) {
      throw new Error(
        `[CampaignState] dayIndex=${String(dayIndex)} field=currentDayIndex must be an integer from 1 to 7.`,
      );
    }
    const wasDay4 = this.currentDayIndex === 4;
    const existingDay4Session = this.day4VisitorSession;
    this.currentDayIndex = dayIndex;
    if (this.currentDayIndex !== 4) {
      this.day4VisitorSession = null;
    } else {
      this.day4VisitorSession = wasDay4 ? existingDay4Session : null;
    }
    this.resetDailyDecisionErrorStats();
    this.resetWronglyAllowedMonsters();
    return this.getCurrentDayConfig();
  }

  public resetCampaign(): DayLevelConfig {
    this.currentDayIndex = 1;
    this.day4VisitorSession = null;
    this.resetDailyDecisionErrorStats();
    this.resetWronglyAllowedMonsters();
    return this.getCurrentDayConfig();
  }

  public startNewCampaignRunAtDay(dayIndex: CampaignDayIndex | number): DayLevelConfig {
    if (!isCampaignDayIndex(dayIndex)) {
      throw new Error(
        `[CampaignState] dayIndex=${String(dayIndex)} field=currentDayIndex must be an integer from 1 to 7.`,
      );
    }
    this.currentDayIndex = dayIndex;
    // A brand-new day start must not reuse an old Day 4 session.
    this.day4VisitorSession = null;
    this.resetDailyDecisionErrorStats();
    this.resetWronglyAllowedMonsters();
    return this.getCurrentDayConfig();
  }

  public canAdvanceToNextDay(): boolean {
    return this.currentDayIndex < 7;
  }

  public advanceToNextDay(): DayLevelConfig {
    if (!this.canAdvanceToNextDay()) {
      throw new Error('[CampaignState] dayIndex=7 field=currentDayIndex campaign already completed all days.');
    }
    if (this.currentDayIndex === 4) {
      this.day4VisitorSession = null;
    }
    this.currentDayIndex = (this.currentDayIndex + 1) as CampaignDayIndex;
    return this.getCurrentDayConfig();
  }

  public getDailyDecisionErrorStats(): DailyDecisionErrorStats {
    return this.dailyDecisionErrorStats;
  }

  public getDailyDecisionErrors(): readonly DailyDecisionErrorRecord[] {
    return this.dailyDecisionErrors;
  }

  public recordDailyDecisionResult(
    decision: InspectionFinalDecision,
    correctDecision: InspectionFinalDecision,
  ): void {
    if (decision === correctDecision) {
      return;
    }
    this.dailyDecisionErrorStats = this.incrementDailyDecisionErrorStatsForDecision(decision);
  }

  public recordDailyDecisionError(record: DailyDecisionErrorRecord): boolean {
    if (record.roundId.trim().length === 0) {
      console.warn('[CampaignState] Rejecting daily decision error with empty roundId.', record);
      return false;
    }
    if (record.subjectKey.trim().length === 0 || record.displayName.trim().length === 0) {
      console.warn('[CampaignState] Rejecting daily decision error with invalid subject identity.', record);
      return false;
    }
    if (record.playerDecision === record.correctDecision) {
      console.warn('[CampaignState] Rejecting non-error daily decision record.', record);
      return false;
    }
    if (record.dayIndex !== this.currentDayIndex) {
      console.warn('[CampaignState] Rejecting stale daily decision error day mismatch.', {
        recordDayIndex: record.dayIndex,
        currentDayIndex: this.currentDayIndex,
        roundId: record.roundId,
      });
      return false;
    }
    if (this.dailyDecisionErrors.some((existing) => existing.roundId === record.roundId)) {
      return false;
    }
    const frozenRecord: DailyDecisionErrorRecord = Object.freeze({
      roundId: record.roundId,
      dayIndex: record.dayIndex,
      subjectKind: record.subjectKind,
      subjectKey: record.subjectKey,
      displayName: record.displayName,
      portraitSpriteFrameUuid: record.portraitSpriteFrameUuid,
      errorKind: record.errorKind,
      playerDecision: record.playerDecision,
      correctDecision: record.correctDecision,
      issueKinds: Object.freeze([...record.issueKinds]),
    });
    this.dailyDecisionErrors = Object.freeze([...this.dailyDecisionErrors, frozenRecord]);
    this.dailyDecisionErrorStats = this.incrementDailyDecisionErrorStatsForDecision(record.playerDecision);
    return true;
  }

  public undoLastDailyDecisionError(roundId: string): boolean {
    if (this.dailyDecisionErrors.length <= 0) {
      return false;
    }
    const lastRecord = this.dailyDecisionErrors[this.dailyDecisionErrors.length - 1];
    if (lastRecord.roundId !== roundId) {
      return false;
    }
    this.dailyDecisionErrors = Object.freeze(this.dailyDecisionErrors.slice(0, -1));
    this.dailyDecisionErrorStats = this.decrementDailyDecisionErrorStatsForDecision(lastRecord.playerDecision);
    return true;
  }

  public getWronglyAllowedMonsters(): readonly WronglyAllowedMonsterRecord[] {
    return this.wronglyAllowedMonsters;
  }

  public recordWronglyAllowedMonster(record: WronglyAllowedMonsterRecord): boolean {
    if (
      record.roundId.trim().length === 0 ||
      record.subjectKey.trim().length === 0 ||
      record.monsterFullbodySpriteFrameUuid.trim().length === 0
    ) {
      console.warn('[CampaignState] Rejecting invalid wrongly-allowed monster record.', record);
      return false;
    }
    if (this.wronglyAllowedMonsters.some((existing) => existing.roundId === record.roundId)) {
      return false;
    }
    const frozenRecord = Object.freeze({
      roundId: record.roundId,
      subjectKind: record.subjectKind,
      subjectKey: record.subjectKey,
      monsterFullbodySpriteFrameUuid: record.monsterFullbodySpriteFrameUuid,
    });
    this.wronglyAllowedMonsters = Object.freeze([...this.wronglyAllowedMonsters, frozenRecord]);
    return true;
  }

  public undoLastWronglyAllowedMonster(roundId: string): boolean {
    if (this.wronglyAllowedMonsters.length <= 0) {
      return false;
    }
    const lastRecord = this.wronglyAllowedMonsters[this.wronglyAllowedMonsters.length - 1];
    if (lastRecord.roundId !== roundId) {
      return false;
    }
    this.wronglyAllowedMonsters = Object.freeze(this.wronglyAllowedMonsters.slice(0, -1));
    return true;
  }

  public getOrCreateDay4VisitorSession(random?: () => number): Day4VisitorSession {
    if (this.currentDayIndex !== 4) {
      throw new Error('[CampaignState] Day4 visitor session can only be created while currentDayIndex=4.');
    }
    if (!this.day4VisitorSession) {
      this.day4VisitorSession = buildDay4VisitorSession({ random });
    }
    return this.day4VisitorSession;
  }

  public getActiveDay4VisitorSession(): Day4VisitorSession | null {
    return this.day4VisitorSession;
  }

  private resetDailyDecisionErrorStats(): void {
    this.dailyDecisionErrorStats = ZERO_DAILY_DECISION_ERROR_STATS;
    this.dailyDecisionErrors = Object.freeze([]);
  }

  private resetWronglyAllowedMonsters(): void {
    this.wronglyAllowedMonsters = Object.freeze([]);
  }

  private incrementDailyDecisionErrorStatsForDecision(
    decision: InspectionFinalDecision,
  ): DailyDecisionErrorStats {
    return Object.freeze({
      wrongAllowCount:
        this.dailyDecisionErrorStats.wrongAllowCount + (decision === 'allow' ? 1 : 0),
      wrongDenyCount:
        this.dailyDecisionErrorStats.wrongDenyCount + (decision === 'deny' ? 1 : 0),
    });
  }

  private decrementDailyDecisionErrorStatsForDecision(
    decision: InspectionFinalDecision,
  ): DailyDecisionErrorStats {
    return Object.freeze({
      wrongAllowCount: Math.max(
        0,
        this.dailyDecisionErrorStats.wrongAllowCount - (decision === 'allow' ? 1 : 0),
      ),
      wrongDenyCount: Math.max(
        0,
        this.dailyDecisionErrorStats.wrongDenyCount - (decision === 'deny' ? 1 : 0),
      ),
    });
  }
}

export const campaignState = new CampaignStateStore();
