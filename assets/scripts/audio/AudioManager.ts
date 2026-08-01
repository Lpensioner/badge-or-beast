import {
  _decorator,
  AudioClip,
  AudioSource,
  Component,
  Input,
  Node,
  director,
  input,
  resources,
  sys,
} from 'cc';
import {
  GameAudioCatalog,
  GameAudioId,
  MusicId,
  SoundEffectId,
  VoiceId,
} from './GameAudioCatalog';

const { ccclass } = _decorator;

const AUDIO_MANAGER_NODE_NAME = 'AudioManager';
const SETTINGS_STORAGE_KEY = 'game.audio.settings.v1';

const VOLUME_SOUND_EFFECTS = 0.8;
const VOLUME_MUSIC = 0.35;
const VOLUME_VOICE = 1.0;

interface AudioSettingsState {
  soundEnabled: boolean;
  musicEnabled: boolean;
  voiceEnabled: boolean;
}

const DEFAULT_SETTINGS: AudioSettingsState = {
  soundEnabled: true,
  musicEnabled: true,
  voiceEnabled: true,
};

@ccclass('AudioManager')
export class AudioManager extends Component {
  private static instance: AudioManager | null = null;

  private musicSource: AudioSource | null = null;
  private voiceSource: AudioSource | null = null;
  private sfxSource: AudioSource | null = null;
  private alarmSource: AudioSource | null = null;

  private soundEnabled = DEFAULT_SETTINGS.soundEnabled;
  private musicEnabled = DEFAULT_SETTINGS.musicEnabled;
  private voiceEnabled = DEFAULT_SETTINGS.voiceEnabled;

  private clipCache = new Map<GameAudioId, AudioClip>();
  private loadingClips = new Map<GameAudioId, Promise<AudioClip | null>>();

  private userGestureReceived = false;
  private firstInteractionBound = false;
  private currentMusicId: MusicId | null = null;
  private desiredMusicId: MusicId | null = null;
  private musicRequestSerial = 0;
  private voiceRequestSerial = 0;
  /** Wall-clock busy fence for Voice one-shots (AudioSource.playing may not track playOneShot). */
  private voicePlaybackBusyUntilMs = 0;

  public static getInstance(): AudioManager | null {
    if (AudioManager.instance?.isValid) {
      return AudioManager.instance;
    }
    return null;
  }

  public static ensureInstance(): AudioManager {
    const existing = AudioManager.getInstance();
    if (existing) {
      return existing;
    }

    const scene = director.getScene();
    if (!scene) {
      throw new Error('[AudioManager] Cannot create instance: no active scene.');
    }

    const existingNode = scene.getChildByName(AUDIO_MANAGER_NODE_NAME);
    if (existingNode?.isValid) {
      const existingComp = existingNode.getComponent(AudioManager);
      if (existingComp?.isValid) {
        AudioManager.instance = existingComp;
        director.addPersistRootNode(existingNode);
        return existingComp;
      }
    }

    const node = new Node(AUDIO_MANAGER_NODE_NAME);
    scene.addChild(node);
    const manager = node.addComponent(AudioManager);
    director.addPersistRootNode(node);
    AudioManager.instance = manager;
    return manager;
  }

  onLoad(): void {
    if (AudioManager.instance && AudioManager.instance !== this && AudioManager.instance.isValid) {
      console.warn('[AudioManager] Duplicate instance detected; destroying the new node.');
      this.node.destroy();
      return;
    }

    AudioManager.instance = this;
    this.loadSettingsFromStorage();
    this.ensureAudioSources();
    director.addPersistRootNode(this.node);
    this.bindFirstInteractionUnlock();
    this.preloadCoreClips();
    // HomeScene entry: request BGM immediately (do not wait for Start button).
    this.startHomeBackgroundMusic();
  }

  onDestroy(): void {
    this.unbindFirstInteractionUnlock();
    if (AudioManager.instance === this) {
      AudioManager.instance = null;
    }
    this.musicSource = null;
    this.voiceSource = null;
    this.sfxSource = null;
    this.alarmSource = null;
    this.desiredMusicId = null;
    this.clipCache.clear();
    this.loadingClips.clear();
  }

  public getSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public getMusicEnabled(): boolean {
    return this.musicEnabled;
  }

  public getVoiceEnabled(): boolean {
    return this.voiceEnabled;
  }

  public setSoundEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    this.persistSettings();
    if (!enabled) {
      this.stopAllSoundEffects();
    }
  }

  public setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.persistSettings();
    if (!enabled) {
      this.stopMusic();
      return;
    }
    this.ensureBackgroundMusic(true);
  }

  public setVoiceEnabled(enabled: boolean): void {
    this.voiceEnabled = enabled;
    this.persistSettings();
    if (!enabled) {
      this.stopVoice();
    }
  }

  /**
   * Web autoplay unlock: browsers may block the HomeScene enter attempt until a gesture.
   * Calling this inside a real touch/mouse callback resumes BGM without requiring Start.
   */
  public handleUserGesture(): void {
    this.userGestureReceived = true;
    if (!this.musicEnabled) {
      return;
    }
    const source = this.musicSource;
    if (source?.isValid && source.clip && this.currentMusicId && !source.playing) {
      // Clip was prepared on HomeScene enter but autoplay was blocked — resume now.
      source.play();
      return;
    }
    this.ensureBackgroundMusic(false);
  }

  /** Start default looping BGM for HomeScene entry. */
  public startHomeBackgroundMusic(): void {
    this.ensureBackgroundMusic(false);
  }

  public ensureBackgroundMusic(forceRestart = false): void {
    if (!this.musicEnabled) {
      return;
    }
    this.playMusic(GameAudioCatalog.DefaultMusicId, true, forceRestart);
  }

  public playMusic(id: MusicId, loop = true, forceRestart = false): void {
    if (!this.musicEnabled) {
      return;
    }

    const musicSource = this.musicSource;
    if (!musicSource?.isValid) {
      return;
    }

    this.desiredMusicId = id;

    if (
      !forceRestart &&
      this.currentMusicId === id &&
      musicSource.playing &&
      musicSource.clip
    ) {
      return;
    }

    // Prepared on enter but not audible yet (common on Web) — just call play again.
    if (
      !forceRestart &&
      this.currentMusicId === id &&
      musicSource.clip &&
      !musicSource.playing
    ) {
      musicSource.loop = loop;
      musicSource.volume = VOLUME_MUSIC;
      musicSource.play();
      return;
    }

    const requestSerial = ++this.musicRequestSerial;
    const path = GameAudioCatalog.getPath(id);
    if (!path) {
      console.error(`[AudioManager] Unknown music id: ${id}`);
      return;
    }

    const cached = this.clipCache.get(id);
    if (cached) {
      this.applyMusicClip(cached, id, loop, requestSerial);
      return;
    }

    this.loadClip(id)
      .then((clip) => {
        if (!clip) {
          console.error(`[AudioManager] Failed to load music. id=${id} path=${path}`);
          return;
        }
        this.applyMusicClip(clip, id, loop, requestSerial);
      })
      .catch((error: unknown) => {
        console.error(`[AudioManager] Unexpected music load error. id=${id} path=${path}`, error);
      });
  }

  public stopMusic(): void {
    this.musicRequestSerial += 1;
    this.desiredMusicId = null;
    this.currentMusicId = null;
    if (this.musicSource?.isValid) {
      this.musicSource.stop();
    }
  }

  public playVoice(id: VoiceId): void {
    if (!this.voiceEnabled) {
      return;
    }

    const voiceSource = this.voiceSource;
    if (!voiceSource?.isValid) {
      return;
    }

    const requestSerial = ++this.voiceRequestSerial;
    const path = GameAudioCatalog.getPath(id);
    if (!path) {
      console.error(`[AudioManager] Unknown voice id: ${id}`);
      return;
    }

    this.loadClip(id)
      .then((clip) => {
        if (requestSerial !== this.voiceRequestSerial) {
          return;
        }
        if (!this.isValid || !this.voiceEnabled) {
          return;
        }
        if (!this.voiceSource?.isValid) {
          return;
        }
        if (!clip) {
          console.error(`[AudioManager] Failed to load voice. id=${id} path=${path}`);
          return;
        }

        this.voiceSource.stop();
        this.voiceSource.clip = clip;
        this.voiceSource.loop = false;
        this.voiceSource.volume = VOLUME_VOICE;
        this.voiceSource.play();
      })
      .catch((error: unknown) => {
        console.error(`[AudioManager] Unexpected voice load error. id=${id} path=${path}`, error);
      });
  }

  public stopVoice(): void {
    this.voiceRequestSerial += 1;
    this.voicePlaybackBusyUntilMs = 0;
    if (this.voiceSource?.isValid) {
      this.voiceSource.stop();
    }
  }

  public playSoundEffect(id: SoundEffectId): void {
    if (!this.soundEnabled) {
      return;
    }
    if (!this.sfxSource?.isValid) {
      return;
    }

    const path = GameAudioCatalog.getPath(id);
    if (!path) {
      console.error(`[AudioManager] Unknown sound effect id: ${id}`);
      return;
    }

    const cached = this.clipCache.get(id);
    if (cached) {
      this.sfxSource.playOneShot(cached, 1);
      return;
    }

    // Non-settings callers may still request uncached clips; settings click never uses this path.
    this.loadClip(id)
      .then((clip) => {
        if (!this.isValid || !this.soundEnabled) {
          return;
        }
        if (!this.sfxSource?.isValid) {
          return;
        }
        if (!clip) {
          console.error(`[AudioManager] Failed to load sound effect. id=${id} path=${path}`);
          return;
        }

        this.sfxSource.playOneShot(clip, 1);
      })
      .catch((error: unknown) => {
        console.error(
          `[AudioManager] Unexpected sound effect load error. id=${id} path=${path}`,
          error,
        );
      });
  }

  /**
   * Play the Settings UI click using a pre-cached AudioClip only.
   * If the clip is not cached yet, skips silently (never late catch-up playback).
   */
  public playCachedSettingsClick(): void {
    if (!this.soundEnabled) {
      return;
    }
    const source = this.sfxSource;
    if (!source?.isValid) {
      return;
    }
    const clip = this.clipCache.get(GameAudioCatalog.SettingsClickId);
    if (!clip) {
      return;
    }
    source.playOneShot(clip, 1);
  }

  public playSettingsClick(): void {
    this.playCachedSettingsClick();
  }

  /**
   * Play document-flip SFX using a pre-cached AudioClip only.
   * If the clip is not cached yet, skips silently (never late catch-up playback).
   */
  public playCachedDocumentFlip(): void {
    if (!this.soundEnabled) {
      return;
    }
    const source = this.sfxSource;
    if (!source?.isValid) {
      return;
    }
    const clip = this.clipCache.get(GameAudioCatalog.DocumentFlipId);
    if (!clip) {
      return;
    }
    source.playOneShot(clip, 1);
  }

  /**
   * Play shutter move SFX using a pre-cached AudioClip only.
   * Same clip for both open and close. Skips silently if not cached yet.
   */
  public playCachedShutterMove(): void {
    if (!this.soundEnabled) {
      return;
    }
    const source = this.sfxSource;
    if (!source?.isValid) {
      return;
    }
    const clip = this.clipCache.get(GameAudioCatalog.ShutterMoveId);
    if (!clip) {
      return;
    }
    source.playOneShot(clip, 1);
  }

  /**
   * Play drawer move SFX using a pre-cached AudioClip only.
   * Same clip for both open and close. Skips silently if not cached yet.
   */
  public playCachedDrawerMove(): void {
    if (!this.soundEnabled) {
      return;
    }
    const source = this.sfxSource;
    if (!source?.isValid) {
      return;
    }
    const clip = this.clipCache.get(GameAudioCatalog.DrawerMoveId);
    if (!clip) {
      return;
    }
    source.playOneShot(clip, 1);
  }

  /**
   * Play phone dial SFX using a pre-cached AudioClip only.
   * If the clip is not cached yet, skips silently (never late catch-up playback).
   */
  public playCachedPhoneDial(): void {
    if (!this.soundEnabled) {
      return;
    }
    const source = this.sfxSource;
    if (!source?.isValid) {
      return;
    }
    const clip = this.clipCache.get(GameAudioCatalog.PhoneDialId);
    if (!clip) {
      return;
    }
    source.playOneShot(clip, 1);
  }

  /**
   * Play phone connected SFX using a pre-cached AudioClip only.
   * If the clip is not cached yet, skips silently (never late catch-up playback).
   */
  public playCachedPhoneConnected(): void {
    if (!this.soundEnabled) {
      return;
    }
    const source = this.sfxSource;
    if (!source?.isValid) {
      return;
    }
    const clip = this.clipCache.get(GameAudioCatalog.PhoneConnectedId);
    if (!clip) {
      return;
    }
    source.playOneShot(clip, 1);
  }

  /**
   * Play checklist decision-mark SFX using a pre-cached AudioClip only.
   * Same clip for both check (√) and cross (×). Skips silently if not cached yet.
   */
  public playCachedDecisionMark(): void {
    if (!this.soundEnabled) {
      return;
    }
    const source = this.sfxSource;
    if (!source?.isValid) {
      return;
    }
    const clip = this.clipCache.get(GameAudioCatalog.DecisionMarkId);
    if (!clip) {
      return;
    }
    source.playOneShot(clip, 1);
  }

  /**
   * Play character enter/exit footstep SFX using a pre-cached AudioClip only.
   * If the clip is not cached yet, skips silently (never late catch-up playback).
   *
   * Uses the shared SfxSource main channel (stop + play) instead of playOneShot so
   * a previous footstep can be cut before the next enter/exit. playOneShot cannot be
   * stopped and would otherwise stack exit+next-enter into one long trail.
   */
  public playCachedFootsteps(): void {
    if (!this.soundEnabled) {
      return;
    }
    const source = this.sfxSource;
    if (!source?.isValid) {
      return;
    }
    const clip = this.clipCache.get(GameAudioCatalog.FootstepsId);
    if (!clip) {
      return;
    }
    source.stop();
    source.clip = clip;
    source.loop = false;
    source.volume = VOLUME_SOUND_EFFECTS;
    source.play();
  }

  /** Stop an in-flight footstep on the shared SFX channel, if that is what is playing. */
  public stopCachedFootsteps(): void {
    const source = this.sfxSource;
    if (!source?.isValid) {
      return;
    }
    const foot = this.clipCache.get(GameAudioCatalog.FootstepsId);
    if (!foot || source.clip !== foot) {
      return;
    }
    if (source.playing) {
      source.stop();
    }
  }

  /**
   * Play alien dialogue voice using a pre-cached AudioClip only.
   * Controlled by Voice Acting (voiceEnabled). Skips silently if not cached yet.
   * Skips if Voice channel is already busy (no Alien/Complaint stacking).
   */
  public playCachedAlienVoice(): void {
    this.playCachedVoiceClip(GameAudioCatalog.AlienVoiceId);
  }

  /**
   * Play formal-complaint voice using a pre-cached AudioClip only.
   * Controlled by Voice Acting (voiceEnabled). Skips silently if not cached yet.
   * ComplaintEvent replaces any in-flight alien one-shot (no stacking).
   */
  public playCachedComplaintVoice(): void {
    if (!this.voiceEnabled) {
      return;
    }
    // End prior DialogueEvent audio before ComplaintEvent so the two never overlap.
    this.stopVoice();
    this.playCachedVoiceClip(GameAudioCatalog.ComplaintVoiceId);
  }

  private playCachedVoiceClip(id: GameAudioId): void {
    if (!this.voiceEnabled) {
      return;
    }
    const source = this.voiceSource;
    if (!source?.isValid) {
      return;
    }
    if (this.isVoiceChannelBusy(source)) {
      return;
    }
    const clip = this.clipCache.get(id);
    if (!clip) {
      return;
    }
    source.playOneShot(clip, 1);
    this.markVoiceChannelBusy(clip);
  }

  private isVoiceChannelBusy(source: AudioSource): boolean {
    if (source.playing) {
      return true;
    }
    return Date.now() < this.voicePlaybackBusyUntilMs;
  }

  private markVoiceChannelBusy(clip: AudioClip): void {
    const durationSec = typeof clip.getDuration === 'function' ? clip.getDuration() : 0;
    const durationMs = Math.max(50, Math.ceil(Math.max(0, durationSec) * 1000));
    this.voicePlaybackBusyUntilMs = Date.now() + durationMs;
  }

  /**
   * Start looping alarm on the dedicated alarm AudioSource.
   * No-op if already playing or Sound Effects are off.
   */
  public startAlarmLoop(): void {
    if (!this.soundEnabled) {
      return;
    }
    const source = this.alarmSource;
    if (!source?.isValid) {
      return;
    }
    if (source.playing && source.clip === this.clipCache.get(GameAudioCatalog.AlarmId)) {
      return;
    }

    const cached = this.clipCache.get(GameAudioCatalog.AlarmId);
    if (cached) {
      this.applyAlarmClip(cached);
      return;
    }

    this.loadClip(GameAudioCatalog.AlarmId)
      .then((clip) => {
        if (!this.isValid || !this.soundEnabled) {
          return;
        }
        if (!this.alarmSource?.isValid) {
          return;
        }
        if (!clip) {
          console.error(
            `[AudioManager] Failed to load alarm. id=${GameAudioCatalog.AlarmId}`,
          );
          return;
        }
        if (
          this.alarmSource.playing &&
          this.alarmSource.clip === clip
        ) {
          return;
        }
        this.applyAlarmClip(clip);
      })
      .catch((error: unknown) => {
        console.error('[AudioManager] Unexpected alarm load error.', error);
      });
  }

  public stopAlarmLoop(): void {
    if (this.alarmSource?.isValid) {
      this.alarmSource.stop();
    }
  }

  public stopAllSoundEffects(): void {
    // playOneShot instances are fire-and-forget in the public API; stop the shared source only.
    if (this.sfxSource?.isValid) {
      this.sfxSource.stop();
    }
    this.stopAlarmLoop();
  }

  public isSettingsClickCached(): boolean {
    return this.clipCache.has(GameAudioCatalog.SettingsClickId);
  }

  private applyMusicClip(
    clip: AudioClip,
    id: MusicId,
    loop: boolean,
    requestSerial: number,
  ): void {
    if (requestSerial !== this.musicRequestSerial) {
      return;
    }
    if (this.desiredMusicId !== id) {
      return;
    }
    if (!this.isValid || !this.musicEnabled) {
      return;
    }
    if (!this.musicSource?.isValid) {
      return;
    }

    this.musicSource.stop();
    this.musicSource.clip = clip;
    this.musicSource.loop = loop;
    this.musicSource.volume = VOLUME_MUSIC;
    this.musicSource.play();
    this.currentMusicId = id;
  }

  private bindFirstInteractionUnlock(): void {
    if (this.firstInteractionBound) {
      return;
    }
    this.firstInteractionBound = true;
    input.on(Input.EventType.TOUCH_END, this.onFirstInteraction, this);
    input.on(Input.EventType.MOUSE_UP, this.onFirstInteraction, this);
  }

  private unbindFirstInteractionUnlock(): void {
    if (!this.firstInteractionBound) {
      return;
    }
    this.firstInteractionBound = false;
    input.off(Input.EventType.TOUCH_END, this.onFirstInteraction, this);
    input.off(Input.EventType.MOUSE_UP, this.onFirstInteraction, this);
  }

  private onFirstInteraction = (): void => {
    this.unbindFirstInteractionUnlock();
    this.handleUserGesture();
  };

  private preloadCoreClips(): void {
    // Warm Settings click, document flip, shutter/alarm/drawer/phone/decision-mark,
    // footsteps, voice acting, and BGM before interactions.
    // loadClip deduplicates in-flight requests via loadingClips.
    void this.loadClip(GameAudioCatalog.SettingsClickId);
    void this.loadClip(GameAudioCatalog.DocumentFlipId);
    void this.loadClip(GameAudioCatalog.ShutterMoveId);
    void this.loadClip(GameAudioCatalog.AlarmId);
    void this.loadClip(GameAudioCatalog.DrawerMoveId);
    void this.loadClip(GameAudioCatalog.PhoneDialId);
    void this.loadClip(GameAudioCatalog.PhoneConnectedId);
    void this.loadClip(GameAudioCatalog.DecisionMarkId);
    void this.loadClip(GameAudioCatalog.FootstepsId);
    void this.loadClip(GameAudioCatalog.AlienVoiceId);
    void this.loadClip(GameAudioCatalog.ComplaintVoiceId);
    void this.loadClip(GameAudioCatalog.DefaultMusicId);
  }

  private applyAlarmClip(clip: AudioClip): void {
    if (!this.alarmSource?.isValid) {
      return;
    }
    this.alarmSource.stop();
    this.alarmSource.clip = clip;
    this.alarmSource.loop = true;
    this.alarmSource.volume = VOLUME_SOUND_EFFECTS;
    this.alarmSource.play();
  }

  private ensureAudioSources(): void {
    let musicNode = this.node.getChildByName('MusicSource');
    if (!musicNode) {
      musicNode = new Node('MusicSource');
      this.node.addChild(musicNode);
    }
    this.musicSource = musicNode.getComponent(AudioSource) ?? musicNode.addComponent(AudioSource);
    this.musicSource.playOnAwake = false;
    this.musicSource.loop = true;
    this.musicSource.volume = VOLUME_MUSIC;

    let voiceNode = this.node.getChildByName('VoiceSource');
    if (!voiceNode) {
      voiceNode = new Node('VoiceSource');
      this.node.addChild(voiceNode);
    }
    this.voiceSource = voiceNode.getComponent(AudioSource) ?? voiceNode.addComponent(AudioSource);
    this.voiceSource.playOnAwake = false;
    this.voiceSource.loop = false;
    this.voiceSource.volume = VOLUME_VOICE;

    let sfxNode = this.node.getChildByName('SfxSource');
    if (!sfxNode) {
      sfxNode = new Node('SfxSource');
      this.node.addChild(sfxNode);
    }
    this.sfxSource = sfxNode.getComponent(AudioSource) ?? sfxNode.addComponent(AudioSource);
    this.sfxSource.playOnAwake = false;
    this.sfxSource.loop = false;
    this.sfxSource.volume = VOLUME_SOUND_EFFECTS;

    let alarmNode = this.node.getChildByName('AlarmSource');
    if (!alarmNode) {
      alarmNode = new Node('AlarmSource');
      this.node.addChild(alarmNode);
    }
    this.alarmSource = alarmNode.getComponent(AudioSource) ?? alarmNode.addComponent(AudioSource);
    this.alarmSource.playOnAwake = false;
    this.alarmSource.loop = true;
    this.alarmSource.volume = VOLUME_SOUND_EFFECTS;
  }

  private loadClip(id: GameAudioId): Promise<AudioClip | null> {
    const cached = this.clipCache.get(id);
    if (cached) {
      return Promise.resolve(cached);
    }

    const inflight = this.loadingClips.get(id);
    if (inflight) {
      return inflight;
    }

    const path = GameAudioCatalog.getPath(id);
    const category = GameAudioCatalog.getCategory(id);
    if (!path || !category) {
      console.error(`[AudioManager] Missing catalog entry for id=${id}`);
      return Promise.resolve(null);
    }

    const promise = new Promise<AudioClip | null>((resolve) => {
      resources.load(path, AudioClip, (error, clip) => {
        this.loadingClips.delete(id);
        if (error || !clip) {
          console.error(
            `[AudioManager] resources.load failed. id=${id} path=${path} category=${category}`,
            error,
          );
          resolve(null);
          return;
        }
        this.clipCache.set(id, clip);
        resolve(clip);
      });
    });

    this.loadingClips.set(id, promise);
    return promise;
  }

  private loadSettingsFromStorage(): void {
    try {
      if (!sys.localStorage) {
        this.applySettings(DEFAULT_SETTINGS);
        return;
      }
      const raw = sys.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) {
        this.applySettings(DEFAULT_SETTINGS);
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        this.applySettings(DEFAULT_SETTINGS);
        return;
      }
      const record = parsed as Record<string, unknown>;
      this.applySettings({
        soundEnabled: typeof record.soundEnabled === 'boolean'
          ? record.soundEnabled
          : DEFAULT_SETTINGS.soundEnabled,
        musicEnabled: typeof record.musicEnabled === 'boolean'
          ? record.musicEnabled
          : DEFAULT_SETTINGS.musicEnabled,
        voiceEnabled: typeof record.voiceEnabled === 'boolean'
          ? record.voiceEnabled
          : DEFAULT_SETTINGS.voiceEnabled,
      });
    } catch (error: unknown) {
      console.warn('[AudioManager] Failed to load audio settings; using defaults.', error);
      this.applySettings(DEFAULT_SETTINGS);
    }
  }

  private applySettings(settings: AudioSettingsState): void {
    this.soundEnabled = settings.soundEnabled;
    this.musicEnabled = settings.musicEnabled;
    this.voiceEnabled = settings.voiceEnabled;
  }

  private persistSettings(): void {
    const payload: AudioSettingsState = {
      soundEnabled: this.soundEnabled,
      musicEnabled: this.musicEnabled,
      voiceEnabled: this.voiceEnabled,
    };
    try {
      if (!sys.localStorage) {
        return;
      }
      sys.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error: unknown) {
      console.warn('[AudioManager] Failed to persist audio settings.', error);
    }
  }
}
