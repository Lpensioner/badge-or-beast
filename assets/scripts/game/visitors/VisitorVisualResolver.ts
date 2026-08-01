import type { VisitorProfile } from './VisitorTypes';
import type { VisitorCaseKind, VisitorInspectionRound, VisitorMismatchKind } from './VisitorRoundTypes';

export type VisitorVisualKind =
  | 'portrait'
  | 'disguised'
  | 'monster-portrait'
  | 'monster-fullbody';

function assertNever(value: never, context: string): never {
  throw new Error(`[VisitorVisualResolver] Unexpected ${context}: ${String(value)}`);
}

function assertRoundProvided(round: VisitorInspectionRound): void {
  if (!round) {
    throw new Error('[VisitorVisualResolver] Missing visitor inspection round.');
  }
}

function assertProfileProvided(profile: VisitorProfile): void {
  if (!profile) {
    throw new Error('[VisitorVisualResolver] Missing visitor profile.');
  }
}

function assertVisitorSubjectKind(round: VisitorInspectionRound): void {
  if (round.subjectKind !== 'visitor') {
    throw new Error('[VisitorVisualResolver] Visitor round subject kind must be "visitor".');
  }
}

function assertMatchingVisitorKey(round: VisitorInspectionRound, profile: VisitorProfile): void {
  if (round.visitorKey !== profile.visitorKey) {
    throw new Error('[VisitorVisualResolver] Visitor round/profile key mismatch.');
  }
}

function assertNonEmptyVisualUuid(
  visitorKey: VisitorProfile['visitorKey'],
  visualKind: VisitorVisualKind,
  uuid: string,
): string {
  if (typeof uuid !== 'string' || uuid.trim().length === 0) {
    throw new Error(
      `[VisitorVisualResolver] Empty SpriteFrame UUID for visitorKey="${visitorKey}", visualKind="${visualKind}".`,
    );
  }

  return uuid;
}

function hasAppearanceMismatch(mismatchKinds: readonly VisitorMismatchKind[]): boolean {
  return mismatchKinds.includes('appearance');
}

export function resolveVisitorInitialVisualKind(
  caseKind: VisitorCaseKind,
  mismatchKinds: readonly VisitorMismatchKind[],
): Extract<VisitorVisualKind, 'portrait' | 'disguised'> {
  switch (caseKind) {
    case 'valid-visitor':
      return 'portrait';
    case 'disguised-monster-visitor':
      return hasAppearanceMismatch(mismatchKinds) ? 'disguised' : 'portrait';
    default:
      return assertNever(caseKind, 'visitor case kind');
  }
}

export function resolveVisitorVisualSpriteFrameUuid(
  profile: VisitorProfile,
  visualKind: VisitorVisualKind,
): string {
  assertProfileProvided(profile);

  let uuid: string;
  switch (visualKind) {
    case 'portrait':
      uuid = profile.visuals.portraitSpriteFrameUuid;
      break;
    case 'disguised':
      uuid = profile.visuals.disguisedSpriteFrameUuid;
      break;
    case 'monster-portrait':
      uuid = profile.visuals.monsterPortraitSpriteFrameUuid;
      break;
    case 'monster-fullbody':
      uuid = profile.visuals.monsterFullbodySpriteFrameUuid;
      break;
    default:
      return assertNever(visualKind, 'visitor visual kind');
  }

  return assertNonEmptyVisualUuid(profile.visitorKey, visualKind, uuid);
}

export function resolveVisitorInitialVisualSpriteFrameUuid(
  round: VisitorInspectionRound,
  profile: VisitorProfile,
): string {
  assertRoundProvided(round);
  assertProfileProvided(profile);
  assertVisitorSubjectKind(round);
  assertMatchingVisitorKey(round, profile);

  const initialVisualKind = resolveVisitorInitialVisualKind(round.caseKind, round.mismatchKinds);
  return resolveVisitorVisualSpriteFrameUuid(profile, initialVisualKind);
}
