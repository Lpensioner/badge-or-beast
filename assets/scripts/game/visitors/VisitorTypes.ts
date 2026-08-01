export type VisitorKey = 'edward' | 'nadia';

export interface VisitorVisualAssetRefs {
  /**
   * Roster identity portrait and the canonical human baseline for this visitor.
   */
  readonly portraitSpriteFrameUuid: string;
  /**
   * Human-looking disguise used when a monster impersonates this visitor.
   */
  readonly disguisedSpriteFrameUuid: string;
  /**
   * Close-up form after monster manifestation.
   */
  readonly monsterPortraitSpriteFrameUuid: string;
  /**
   * Full-body form for threat or attack phases.
   */
  readonly monsterFullbodySpriteFrameUuid: string;
}

export interface VisitorProfile {
  readonly visitorKey: VisitorKey;
  readonly displayName: string;
  readonly visuals: VisitorVisualAssetRefs;
  readonly appearanceFeatures: readonly string[];
}
