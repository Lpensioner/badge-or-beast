/**
 * Centralized game audio resource catalog.
 * Business scripts must use IDs from this catalog instead of raw resource paths.
 */

export enum AudioCategory {
  Music = 'music',
  Voice = 'voice',
  SoundEffect = 'soundEffect',
}

export enum MusicId {
  BgmTenseAmbientLoop = 'bgm_tense_ambient_loop',
}

export enum VoiceId {
  AlienSpeech01 = 'voice_alien_speech_01',
  Complaint01 = 'voice_complaint_01',
}

export enum SoundEffectId {
  HammerHit01 = 'sfx_hammer_hit_01',
  DecisionMark01 = 'sfx_decision_mark_01',
  UiSettingsClick01 = 'sfx_ui_settings_click_01',
  PhoneDial01 = 'sfx_phone_dial_01',
  PhoneConnected01 = 'sfx_phone_connected_01',
  DocumentFlip01 = 'sfx_document_flip_01',
  Alarm01 = 'sfx_alarm_01',
  ShutterClose01 = 'sfx_shutter_close_01',
  DrawerMove01 = 'sfx_drawer_move_01',
  Footsteps01 = 'sfx_footsteps_01',
}

export type GameAudioId = MusicId | VoiceId | SoundEffectId;

interface AudioEntry {
  id: GameAudioId;
  category: AudioCategory;
  /** resources.load path without file extension */
  path: string;
}

const AUDIO_ENTRIES: readonly AudioEntry[] = [
  {
    id: MusicId.BgmTenseAmbientLoop,
    category: AudioCategory.Music,
    path: 'audio/music/bgm_tense_ambient_loop',
  },
  {
    id: VoiceId.AlienSpeech01,
    category: AudioCategory.Voice,
    path: 'audio/voice/voice_alien_speech_01',
  },
  {
    id: VoiceId.Complaint01,
    category: AudioCategory.Voice,
    path: 'audio/voice/voice_complaint_01',
  },
  {
    id: SoundEffectId.HammerHit01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_hammer_hit_01',
  },
  {
    id: SoundEffectId.DecisionMark01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_decision_mark_01',
  },
  {
    id: SoundEffectId.UiSettingsClick01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_ui_settings_click_01',
  },
  {
    id: SoundEffectId.PhoneDial01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_phone_dial_01',
  },
  {
    id: SoundEffectId.PhoneConnected01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_phone_connected_01',
  },
  {
    id: SoundEffectId.DocumentFlip01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_document_flip_01',
  },
  {
    id: SoundEffectId.Alarm01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_alarm_01',
  },
  {
    id: SoundEffectId.ShutterClose01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_shutter_close_01',
  },
  {
    id: SoundEffectId.DrawerMove01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_drawer_move_01',
  },
  {
    id: SoundEffectId.Footsteps01,
    category: AudioCategory.SoundEffect,
    path: 'audio/sfx/sfx_footsteps_01',
  },
];

const AUDIO_PATH_BY_ID = new Map<GameAudioId, string>(
  AUDIO_ENTRIES.map((entry) => [entry.id, entry.path]),
);

const AUDIO_CATEGORY_BY_ID = new Map<GameAudioId, AudioCategory>(
  AUDIO_ENTRIES.map((entry) => [entry.id, entry.category]),
);

export class GameAudioCatalog {
  public static readonly DefaultMusicId = MusicId.BgmTenseAmbientLoop;
  public static readonly SettingsClickId = SoundEffectId.UiSettingsClick01;
  public static readonly DocumentFlipId = SoundEffectId.DocumentFlip01;
  /** Shared move SFX for both shutter open and close. */
  public static readonly ShutterMoveId = SoundEffectId.ShutterClose01;
  public static readonly AlarmId = SoundEffectId.Alarm01;
  /** Shared move SFX for both drawer open and close. */
  public static readonly DrawerMoveId = SoundEffectId.DrawerMove01;
  public static readonly PhoneDialId = SoundEffectId.PhoneDial01;
  public static readonly PhoneConnectedId = SoundEffectId.PhoneConnected01;
  /** Shared mark SFX for checklist check (√) and cross (×). */
  public static readonly DecisionMarkId = SoundEffectId.DecisionMark01;
  /** Alien speech voice for NPC / impostor dialogue display. */
  public static readonly AlienVoiceId = VoiceId.AlienSpeech01;
  /** Formal complaint voice when a wrong rejection files a complaint. */
  public static readonly ComplaintVoiceId = VoiceId.Complaint01;
  /** Character enter/exit footstep SFX. */
  public static readonly FootstepsId = SoundEffectId.Footsteps01;

  public static getPath(id: GameAudioId): string | null {
    return AUDIO_PATH_BY_ID.get(id) ?? null;
  }

  public static getCategory(id: GameAudioId): AudioCategory | null {
    return AUDIO_CATEGORY_BY_ID.get(id) ?? null;
  }

  public static getAllEntries(): readonly AudioEntry[] {
    return AUDIO_ENTRIES;
  }
}
