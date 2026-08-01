import type { CampaignDayIndex } from './DayLevelConfig';
import { HIGHEST_IMPLEMENTED_CAMPAIGN_DAY, isCampaignDayIndex, isImplementedCampaignDay } from './DayCatalog';
import { getHighestUnlockedDay } from './CampaignProgressStore';

let requestedStartDay: CampaignDayIndex | null = null;

export function setRequestedStartDay(dayIndex: number): boolean {
  if (!isCampaignDayIndex(dayIndex)) {
    console.warn('[CampaignLaunchRequest] Ignoring invalid requested day index.', { dayIndex });
    return false;
  }
  requestedStartDay = dayIndex;
  return true;
}

export function hasRequestedStartDay(): boolean {
  return requestedStartDay !== null;
}

export function clearRequestedStartDay(): void {
  requestedStartDay = null;
}

export function consumeRequestedStartDay(): CampaignDayIndex {
  const consumed = requestedStartDay;
  requestedStartDay = null;
  if (consumed === null) {
    return 1;
  }
  if (!isCampaignDayIndex(consumed) || !isImplementedCampaignDay(consumed)) {
    console.warn('[CampaignLaunchRequest] Requested day is invalid or not implemented; fallback to Day 1.', {
      requestedDay: consumed,
      highestImplementedDay: HIGHEST_IMPLEMENTED_CAMPAIGN_DAY,
    });
    return 1;
  }
  const highestUnlockedDay = getHighestUnlockedDay();
  if (consumed > highestUnlockedDay) {
    console.warn('[CampaignLaunchRequest] Requested day is locked; fallback to Day 1.', {
      requestedDay: consumed,
      highestUnlockedDay,
    });
    return 1;
  }
  return consumed;
}
