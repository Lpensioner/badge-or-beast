import { _decorator, Component } from 'cc';
import { CampaignDayIndex, DayLevelConfig } from './DayLevelConfig';

const { ccclass } = _decorator;

type ShiftPeriod = 'AM' | 'PM';

export interface ShiftClockSnapshot {
  readonly dayIndex: CampaignDayIndex;
  readonly date: string;
  readonly elapsedRealSeconds: number;
  readonly durationSeconds: number;
  readonly gameMinuteOfDay: number;
  readonly displayTime: string;
  readonly period: ShiftPeriod;
  readonly progress: number;
  readonly running: boolean;
  readonly paused: boolean;
  readonly reachedShiftEnd: boolean;
}

export interface ShiftClockCallbacks {
  readonly onDisplayChanged?: (snapshot: ShiftClockSnapshot) => void;
  readonly onShiftEnd?: (snapshot: ShiftClockSnapshot) => void;
}

interface ShiftClockRuntimeState {
  elapsedRealSeconds: number;
  running: boolean;
  paused: boolean;
  reachedShiftEnd: boolean;
  lastDisplayedGameMinute: number | null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function normalizeDurationSeconds(durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return 1;
  }
  return durationSeconds;
}

function computeGameMinuteOfDayForElapsed(config: DayLevelConfig, elapsedRealSeconds: number): number {
  const durationSeconds = normalizeDurationSeconds(config.realDurationSeconds);
  const clampedElapsed = clampNumber(elapsedRealSeconds, 0, durationSeconds);
  if (clampedElapsed >= durationSeconds) {
    return config.shiftEndMinutes;
  }

  const progress = clampedElapsed / durationSeconds;
  const shiftStartSeconds = config.shiftStartMinutes * 60;
  const shiftEndSeconds = config.shiftEndMinutes * 60;
  const currentGameSeconds = shiftStartSeconds + progress * (shiftEndSeconds - shiftStartSeconds);
  return Math.floor(currentGameSeconds / 60);
}

function buildSnapshot(
  config: DayLevelConfig,
  state: ShiftClockRuntimeState,
  minuteOfDay: number,
): ShiftClockSnapshot {
  const durationSeconds = normalizeDurationSeconds(config.realDurationSeconds);
  const clampedElapsed = clampNumber(state.elapsedRealSeconds, 0, durationSeconds);
  const { displayTime, period } = formatShiftTime(minuteOfDay);
  return {
    dayIndex: config.dayIndex,
    date: config.date,
    elapsedRealSeconds: clampedElapsed,
    durationSeconds,
    gameMinuteOfDay: minuteOfDay,
    displayTime,
    period,
    progress: clampNumber(clampedElapsed / durationSeconds, 0, 1),
    running: state.running,
    paused: state.paused,
    reachedShiftEnd: state.reachedShiftEnd,
  };
}

function resetRuntimeState(state: ShiftClockRuntimeState): void {
  state.elapsedRealSeconds = 0;
  state.running = false;
  state.paused = true;
  state.reachedShiftEnd = false;
  state.lastDisplayedGameMinute = null;
}

function advanceElapsed(
  state: ShiftClockRuntimeState,
  deltaTime: number,
  durationSeconds: number,
): void {
  if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
    return;
  }
  state.elapsedRealSeconds = clampNumber(state.elapsedRealSeconds + deltaTime, 0, durationSeconds);
}

export function formatShiftTime(gameMinuteOfDay: number): {
  readonly displayTime: string;
  readonly period: ShiftPeriod;
} {
  const minuteOfDay = clampNumber(Math.floor(gameMinuteOfDay), 0, 1439);
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const period: ShiftPeriod = hour24 < 12 ? 'AM' : 'PM';
  const hour12Raw = hour24 % 12;
  const hour12 = hour12Raw === 0 ? 12 : hour12Raw;
  const hh = hour12.toString().padStart(2, '0');
  const mm = minute.toString().padStart(2, '0');
  return {
    displayTime: `${hh}:${mm}`,
    period,
  };
}

function buildDefaultTestConfig(dayIndex: CampaignDayIndex, date: string): DayLevelConfig {
  return {
    dayIndex,
    date,
    shiftStartMinutes: 540,
    shiftEndMinutes: 1020,
    realDurationSeconds: 600,
    encounterCountMin: 3,
    encounterCountMax: 3,
    difficultyTier: 'tutorial-appearance',
    enabledEvidence: ['employee-files', 'checklist', 'appearance'],
    requiredChecklistCategories: ['appearance'],
    visitorSystemEnabled: false,
    departmentPhoneEnabled: false,
  };
}

function assertCondition(testId: number, condition: boolean, detail: string): void {
  if (!condition) {
    throw new Error(`[ShiftClockTest#${testId}] ${detail}`);
  }
}

export function assertShiftClockMathSelfCheck(): void {
  const day1 = buildDefaultTestConfig(1, '1999-12-03');
  const checkSnapshot = (testId: number, elapsed: number, expectedDisplay: string, expectedPeriod: ShiftPeriod) => {
    const runtime: ShiftClockRuntimeState = {
      elapsedRealSeconds: elapsed,
      running: true,
      paused: false,
      reachedShiftEnd: false,
      lastDisplayedGameMinute: null,
    };
    const minute = computeGameMinuteOfDayForElapsed(day1, runtime.elapsedRealSeconds);
    const snapshot = buildSnapshot(day1, runtime, minute);
    assertCondition(
      testId,
      snapshot.displayTime === expectedDisplay && snapshot.period === expectedPeriod,
      `expected ${expectedDisplay} ${expectedPeriod}, got ${snapshot.displayTime} ${snapshot.period}`,
    );
  };

  checkSnapshot(1, 0, '09:00', 'AM');
  checkSnapshot(2, 75, '10:00', 'AM');
  checkSnapshot(3, 150, '11:00', 'AM');
  checkSnapshot(4, 225, '12:00', 'PM');
  checkSnapshot(5, 300, '01:00', 'PM');
  checkSnapshot(6, 375, '02:00', 'PM');
  checkSnapshot(7, 450, '03:00', 'PM');
  checkSnapshot(8, 525, '04:00', 'PM');
  checkSnapshot(9, 600, '05:00', 'PM');
  checkSnapshot(10, 800, '05:00', 'PM');
  checkSnapshot(11, -5, '09:00', 'AM');

  const runtime: ShiftClockRuntimeState = {
    elapsedRealSeconds: 120,
    running: true,
    paused: false,
    reachedShiftEnd: false,
    lastDisplayedGameMinute: null,
  };
  runtime.paused = true;
  const beforePause = runtime.elapsedRealSeconds;
  if (runtime.running && !runtime.paused && !runtime.reachedShiftEnd) {
    advanceElapsed(runtime, 50, day1.realDurationSeconds);
  }
  assertCondition(12, runtime.elapsedRealSeconds === beforePause, 'pause should keep elapsed unchanged.');
  runtime.paused = false;
  if (runtime.running && !runtime.paused && !runtime.reachedShiftEnd) {
    advanceElapsed(runtime, 50, day1.realDurationSeconds);
  }
  assertCondition(13, runtime.elapsedRealSeconds > beforePause, 'resume should continue elapsed progression.');
  resetRuntimeState(runtime);
  const minuteAfterReset = computeGameMinuteOfDayForElapsed(day1, runtime.elapsedRealSeconds);
  const resetSnapshot = buildSnapshot(day1, runtime, minuteAfterReset);
  assertCondition(
    14,
    resetSnapshot.displayTime === '09:00' && resetSnapshot.period === 'AM',
    `expected reset 09:00 AM, got ${resetSnapshot.displayTime} ${resetSnapshot.period}`,
  );
  runtime.running = true;
  runtime.paused = false;
  const elapsedBeforeSecondStart = runtime.elapsedRealSeconds;
  runtime.running = true;
  runtime.paused = false;
  assertCondition(15, runtime.elapsedRealSeconds === elapsedBeforeSecondStart, 'repeat start must not reset elapsed.');
  runtime.reachedShiftEnd = true;
  runtime.paused = true;
  if (runtime.running && !runtime.reachedShiftEnd && runtime.paused) {
    runtime.paused = false;
  }
  assertCondition(16, runtime.reachedShiftEnd && runtime.paused, 'resume after shift end must stay paused.');

  const day2 = buildDefaultTestConfig(2, '1999-12-04');
  const day2Minute = computeGameMinuteOfDayForElapsed(day2, 0);
  const day2Snapshot = buildSnapshot(day2, runtime, day2Minute);
  assertCondition(
    17,
    day2Snapshot.dayIndex === 2 && day2Snapshot.date === '1999-12-04',
    `expected day2 snapshot, got day=${day2Snapshot.dayIndex} date=${day2Snapshot.date}`,
  );

  const noon = formatShiftTime(12 * 60);
  assertCondition(18, noon.displayTime === '12:00' && noon.period === 'PM', '12:00 should be PM.');
  const midnight = formatShiftTime(0);
  assertCondition(19, midnight.displayTime === '12:00' && midnight.period === 'AM', '00:00 should be 12:00 AM.');
  const oneOhFivePm = formatShiftTime(13 * 60 + 5);
  assertCondition(
    20,
    oneOhFivePm.displayTime === '01:05' && oneOhFivePm.period === 'PM',
    `expected 01:05 PM, got ${oneOhFivePm.displayTime} ${oneOhFivePm.period}`,
  );
}

@ccclass('ShiftClockController')
export class ShiftClockController extends Component {
  private dayConfig: DayLevelConfig | null = null;
  private callbacks: ShiftClockCallbacks = {};
  private state: ShiftClockRuntimeState = {
    elapsedRealSeconds: 0,
    running: false,
    paused: true,
    reachedShiftEnd: false,
    lastDisplayedGameMinute: null,
  };

  public configure(config: DayLevelConfig, callbacks: ShiftClockCallbacks): void {
    this.dayConfig = config;
    this.callbacks = callbacks;
    resetRuntimeState(this.state);
    this.emitDisplayIfNeeded(true);
    console.info('[ShiftClock] configured', {
      dayIndex: config.dayIndex,
      date: config.date,
      shiftStartMinutes: config.shiftStartMinutes,
      shiftEndMinutes: config.shiftEndMinutes,
      realDurationSeconds: config.realDurationSeconds,
    });
  }

  public clearCallbacks(): void {
    this.callbacks = {};
  }

  public start(): void {
    if (!this.dayConfig) {
      throw new Error('[ShiftClock] start requires configure() first.');
    }
    if (this.state.reachedShiftEnd) {
      return;
    }
    const wasStoppedOrPaused = !this.state.running || this.state.paused;
    this.state.running = true;
    this.state.paused = false;
    if (wasStoppedOrPaused) {
      console.info('[ShiftClock] started', {
        dayIndex: this.dayConfig.dayIndex,
        date: this.dayConfig.date,
      });
    }
  }

  public pause(): void {
    if (!this.state.running) {
      return;
    }
    this.state.paused = true;
  }

  public resume(): void {
    if (!this.state.running) {
      return;
    }
    if (this.state.reachedShiftEnd) {
      return;
    }
    if (!this.state.paused) {
      return;
    }
    this.state.paused = false;
  }

  public stop(): void {
    this.state.running = false;
    this.state.paused = true;
  }

  public reset(config?: DayLevelConfig): void {
    if (config) {
      this.dayConfig = config;
    }
    if (!this.dayConfig) {
      throw new Error('[ShiftClock] reset requires existing config.');
    }
    resetRuntimeState(this.state);
    this.emitDisplayIfNeeded(true);
  }

  public getSnapshot(): ShiftClockSnapshot | null {
    if (!this.dayConfig) {
      return null;
    }
    const minute = computeGameMinuteOfDayForElapsed(this.dayConfig, this.state.elapsedRealSeconds);
    return buildSnapshot(this.dayConfig, this.state, minute);
  }

  update(deltaTime: number): void {
    if (!this.dayConfig) {
      return;
    }
    if (!this.state.running || this.state.paused || this.state.reachedShiftEnd) {
      return;
    }

    const durationSeconds = normalizeDurationSeconds(this.dayConfig.realDurationSeconds);
    advanceElapsed(this.state, deltaTime, durationSeconds);
    this.emitDisplayIfNeeded(false);

    if (this.state.elapsedRealSeconds >= durationSeconds && !this.state.reachedShiftEnd) {
      this.state.reachedShiftEnd = true;
      this.state.paused = true;
      this.emitDisplayIfNeeded(true);
      const snapshot = this.getSnapshot();
      if (snapshot) {
        console.info('[ShiftClock] shift end reached', {
          dayIndex: snapshot.dayIndex,
          date: snapshot.date,
          elapsedRealSeconds: snapshot.elapsedRealSeconds,
          displayTime: snapshot.displayTime,
          period: snapshot.period,
        });
        this.callbacks.onShiftEnd?.(snapshot);
      }
    }
  }

  onDestroy(): void {
    this.state.running = false;
    this.state.paused = true;
    this.callbacks = {};
  }

  private emitDisplayIfNeeded(force: boolean): void {
    if (!this.dayConfig) {
      return;
    }
    const minute = computeGameMinuteOfDayForElapsed(this.dayConfig, this.state.elapsedRealSeconds);
    if (!force && this.state.lastDisplayedGameMinute === minute) {
      return;
    }
    this.state.lastDisplayedGameMinute = minute;
    const snapshot = buildSnapshot(this.dayConfig, this.state, minute);
    this.callbacks.onDisplayChanged?.(snapshot);
  }
}
