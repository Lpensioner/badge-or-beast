import { sys } from 'cc';
import type { CampaignDayIndex } from './DayLevelConfig';
import { isCampaignDayIndex } from './DayCatalog';

const CAMPAIGN_PROGRESS_STORAGE_KEY = 'badge_or_beast_campaign_progress_v1';
const CAMPAIGN_DAY_INDEX_MIN = 1;
const CAMPAIGN_DAY_INDEX_MAX = 7;
const DEFAULT_HIGHEST_UNLOCKED_DAY: CampaignDayIndex = 1;

interface CampaignProgressSaveV1 {
  readonly schemaVersion: 1;
  readonly highestUnlockedDay: number;
}

function isStorageAvailable(): boolean {
  return Boolean(sys.localStorage);
}

function clampToCampaignDayIndex(value: number): CampaignDayIndex {
  if (!Number.isInteger(value)) {
    return DEFAULT_HIGHEST_UNLOCKED_DAY;
  }
  const clamped = Math.max(CAMPAIGN_DAY_INDEX_MIN, Math.min(CAMPAIGN_DAY_INDEX_MAX, value));
  return clamped as CampaignDayIndex;
}

function sanitizeHighestUnlockedDay(raw: unknown): CampaignDayIndex {
  if (typeof raw !== 'number') {
    return DEFAULT_HIGHEST_UNLOCKED_DAY;
  }
  return clampToCampaignDayIndex(raw);
}

function parseStoredProgress(rawText: string | null): CampaignProgressSaveV1 | null {
  if (!rawText || rawText.trim().length <= 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(rawText) as Partial<CampaignProgressSaveV1> | null;
    if (!parsed || parsed.schemaVersion !== 1) {
      return null;
    }
    if (!Number.isInteger(parsed.highestUnlockedDay)) {
      return null;
    }
    return {
      schemaVersion: 1,
      highestUnlockedDay: parsed.highestUnlockedDay,
    };
  } catch (error) {
    console.warn('[CampaignProgressStore] Corrupted campaign progress JSON; falling back to Day 1.', error);
    return null;
  }
}

function buildSaveData(highestUnlockedDay: CampaignDayIndex): CampaignProgressSaveV1 {
  return Object.freeze({
    schemaVersion: 1 as const,
    highestUnlockedDay,
  });
}

function readStoredHighestUnlockedDay(): CampaignDayIndex {
  if (!isStorageAvailable()) {
    return DEFAULT_HIGHEST_UNLOCKED_DAY;
  }
  const raw = sys.localStorage.getItem(CAMPAIGN_PROGRESS_STORAGE_KEY);
  const parsed = parseStoredProgress(raw);
  if (!parsed) {
    return DEFAULT_HIGHEST_UNLOCKED_DAY;
  }
  return sanitizeHighestUnlockedDay(parsed.highestUnlockedDay);
}

function writeStoredHighestUnlockedDay(day: CampaignDayIndex): void {
  if (!isStorageAvailable()) {
    return;
  }
  const saveData = buildSaveData(day);
  try {
    sys.localStorage.setItem(CAMPAIGN_PROGRESS_STORAGE_KEY, JSON.stringify(saveData));
  } catch (error) {
    console.warn('[CampaignProgressStore] Failed to persist campaign progress.', error);
  }
}

export function getCampaignProgressStorageKey(): string {
  return CAMPAIGN_PROGRESS_STORAGE_KEY;
}

export function getHighestUnlockedDay(): CampaignDayIndex {
  return readStoredHighestUnlockedDay();
}

export function hasUnlockedDaySelection(): boolean {
  return getHighestUnlockedDay() >= 2;
}

export function isDayUnlocked(dayIndex: number): boolean {
  if (!isCampaignDayIndex(dayIndex)) {
    return false;
  }
  return dayIndex <= getHighestUnlockedDay();
}

export function unlockDay(dayIndex: number): CampaignDayIndex {
  if (!Number.isInteger(dayIndex)) {
    return getHighestUnlockedDay();
  }
  const currentHighest = getHighestUnlockedDay();
  const clampedTarget = clampToCampaignDayIndex(dayIndex);
  const nextHighest = Math.max(currentHighest, clampedTarget) as CampaignDayIndex;
  if (nextHighest !== currentHighest) {
    writeStoredHighestUnlockedDay(nextHighest);
  }
  return nextHighest;
}

export function resetCorruptedProgressToDefault(): CampaignDayIndex {
  writeStoredHighestUnlockedDay(DEFAULT_HIGHEST_UNLOCKED_DAY);
  return DEFAULT_HIGHEST_UNLOCKED_DAY;
}
