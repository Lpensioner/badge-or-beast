import type { VisitorKey, VisitorProfile, VisitorVisualAssetRefs } from './VisitorTypes';

const SPRITE_FRAME_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}@[a-z0-9]+$/i;

const VISITOR_PROFILES_BY_KEY: Readonly<Record<VisitorKey, VisitorProfile>> = {
  edward: {
    visitorKey: 'edward',
    displayName: 'Edward',
    visuals: {
      portraitSpriteFrameUuid: 'd2228939-d053-454a-af98-e8122c580b5e@f9941',
      disguisedSpriteFrameUuid: '7b90403a-77c4-4b84-b35d-cf772223009e@f9941',
      monsterPortraitSpriteFrameUuid: '21d42ea0-5bc2-489b-a1a2-d2a23994d01f@f9941',
      monsterFullbodySpriteFrameUuid: '36ece0d5-310c-48ea-8b9b-102e98cdf9b5@f9941',
    },
    appearanceFeatures: ['WEARS GLASSES', 'WEARS A STUD EARRING'],
  },
  nadia: {
    visitorKey: 'nadia',
    displayName: 'Nadia',
    visuals: {
      portraitSpriteFrameUuid: '3ebae69b-3b00-4ab9-97bd-e1ab58cf62f6@f9941',
      disguisedSpriteFrameUuid: 'e6de89a7-9289-4423-a616-29c01659aa55@f9941',
      monsterPortraitSpriteFrameUuid: '23c7533f-3c9f-472f-8a19-226ee2a226fa@f9941',
      monsterFullbodySpriteFrameUuid: '580fd27a-5a15-4564-b775-5862c6eed41d@f9941',
    },
    appearanceFeatures: [
      'HAS A MOLE NEAR THE OUTER CORNER OF HER RIGHT EYE',
      'HAS VISIBLE EAR PIERCINGS',
    ],
  },
} as const;

const VISITOR_PROFILES_BY_KEY_FROZEN: Readonly<Record<VisitorKey, VisitorProfile>> = Object.freeze(
  (Object.keys(VISITOR_PROFILES_BY_KEY) as VisitorKey[]).reduce((acc, key) => {
    const profile = VISITOR_PROFILES_BY_KEY[key];
    const frozenProfile: VisitorProfile = Object.freeze({
      visitorKey: profile.visitorKey,
      displayName: profile.displayName,
      visuals: Object.freeze({
        portraitSpriteFrameUuid: profile.visuals.portraitSpriteFrameUuid,
        disguisedSpriteFrameUuid: profile.visuals.disguisedSpriteFrameUuid,
        monsterPortraitSpriteFrameUuid: profile.visuals.monsterPortraitSpriteFrameUuid,
        monsterFullbodySpriteFrameUuid: profile.visuals.monsterFullbodySpriteFrameUuid,
      }),
      appearanceFeatures: Object.freeze([...profile.appearanceFeatures]),
    });
    acc[key] = frozenProfile;
    return acc;
  }, {} as Record<VisitorKey, VisitorProfile>),
);

export const VISITOR_PROFILES: readonly VisitorProfile[] = Object.freeze(
  (Object.keys(VISITOR_PROFILES_BY_KEY_FROZEN) as VisitorKey[]).map((key) => VISITOR_PROFILES_BY_KEY_FROZEN[key]),
);

function getVisitorVisualUuidList(visuals: VisitorVisualAssetRefs): readonly string[] {
  return [
    visuals.portraitSpriteFrameUuid,
    visuals.disguisedSpriteFrameUuid,
    visuals.monsterPortraitSpriteFrameUuid,
    visuals.monsterFullbodySpriteFrameUuid,
  ] as const;
}

function validateVisitorProfileCatalog(): void {
  const profileKeySet = new Set<VisitorKey>();
  const spriteFrameOwnerByUuid = new Map<string, VisitorKey>();

  for (const [recordKey, profile] of Object.entries(VISITOR_PROFILES_BY_KEY_FROZEN) as [VisitorKey, VisitorProfile][]) {
    if (profileKeySet.has(recordKey)) {
      throw new Error(`[VisitorProfileCatalog] Duplicate visitor key: ${recordKey}`);
    }
    profileKeySet.add(recordKey);

    if (profile.visitorKey !== recordKey) {
      throw new Error(
        `[VisitorProfileCatalog] Key mismatch: record key is "${recordKey}" but profile.visitorKey is "${profile.visitorKey}"`,
      );
    }

    if (profile.displayName.trim().length === 0) {
      throw new Error(`[VisitorProfileCatalog] displayName is empty for visitor: ${recordKey}`);
    }

    const visualUuids = getVisitorVisualUuidList(profile.visuals);
    const uniqueVisualUuids = new Set<string>();
    for (const uuid of visualUuids) {
      if (uuid.trim().length === 0) {
        throw new Error(`[VisitorProfileCatalog] Empty SpriteFrame UUID in visitor: ${recordKey}`);
      }
      if (!SPRITE_FRAME_UUID_PATTERN.test(uuid)) {
        throw new Error(`[VisitorProfileCatalog] Invalid SpriteFrame UUID format in ${recordKey}: ${uuid}`);
      }
      uniqueVisualUuids.add(uuid);

      const existingOwner = spriteFrameOwnerByUuid.get(uuid);
      if (existingOwner && existingOwner !== recordKey) {
        throw new Error(
          `[VisitorProfileCatalog] Cross-visitor SpriteFrame UUID collision: ${uuid} used by ${existingOwner} and ${recordKey}`,
        );
      }
      spriteFrameOwnerByUuid.set(uuid, recordKey);
    }

    if (uniqueVisualUuids.size !== visualUuids.length) {
      throw new Error(`[VisitorProfileCatalog] Duplicate state SpriteFrame UUIDs found for visitor: ${recordKey}`);
    }

    if (profile.appearanceFeatures.length === 0) {
      throw new Error(`[VisitorProfileCatalog] appearanceFeatures is empty for visitor: ${recordKey}`);
    }
    const uniqueAppearanceFeatures = new Set<string>();
    for (const feature of profile.appearanceFeatures) {
      const normalized = feature.trim();
      if (normalized.length === 0) {
        throw new Error(`[VisitorProfileCatalog] Empty appearance feature for visitor: ${recordKey}`);
      }
      if (uniqueAppearanceFeatures.has(normalized)) {
        throw new Error(
          `[VisitorProfileCatalog] Duplicate appearance feature "${normalized}" for visitor: ${recordKey}`,
        );
      }
      uniqueAppearanceFeatures.add(normalized);
    }
  }
}

validateVisitorProfileCatalog();

export function getVisitorProfile(visitorKey: VisitorKey): VisitorProfile | null {
  return VISITOR_PROFILES_BY_KEY_FROZEN[visitorKey] ?? null;
}

export function getAllVisitorProfiles(): readonly VisitorProfile[] {
  return [...VISITOR_PROFILES];
}
