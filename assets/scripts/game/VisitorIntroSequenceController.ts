import {
  _decorator,
  Button,
  Color,
  Component,
  Graphics,
  HorizontalTextAlignment,
  isValid,
  Label,
  LabelOutline,
  LabelShadow,
  Node,
  Quat,
  resources,
  Size,
  Sprite,
  SpriteFrame,
  Tween,
  tween,
  UITransform,
  UIOpacity,
  Vec2,
  Vec3,
  VerticalTextAlignment,
} from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { ShutterToggleController } from './ShutterToggleController';
import { EMPLOYEE_PROFILES } from './inspection/EmployeeProfileCatalog';
import type { EmployeeKey, WindowPortraitPresentation } from './inspection/InspectionTypes';
import type { VisitorClaimDialogue } from './visitors/VisitorClaimDialogueResolver';

const { ccclass } = _decorator;

interface ButtonStateCache {
  nodeName: string;
  button: Button;
  enabled: boolean;
  interactable: boolean;
}

interface TransformStateCache {
  position: Vec3;
  scale: Vec3;
  rotation: Quat;
  active: boolean;
  opacity: number | null;
  siblingIndex: number;
}

/** Business message kind for Voice Acting routing. */
export type VisitorMessageKind = 'dialogue' | 'complaint' | 'system';

interface VisitorDialogueOptions {
  readonly autoCloseSeconds?: number;
  readonly allowTapDismiss?: boolean;
  readonly minimumVisibleSeconds?: number;
  /**
   * dialogue = character speech → Alien Voice
   * complaint = character filing a complaint → Complaint Voice
   * system = UI / system notification → no Voice Acting
   */
  readonly messageKind?: VisitorMessageKind;
}

export interface VisitorIntroRunContext {
  readonly roundId: string | null;
  readonly employeeKey: string | null;
  readonly caseKind: string | null;
}

export type VisitorIntroResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
    };

export interface VisitorClaimSequenceRunContext {
  readonly roundId: string;
  readonly dialogue: VisitorClaimDialogue;
}

export type VisitorClaimSequenceFailureReason =
  | 'duplicate_sequence_in_progress'
  | 'duplicate_sequence_completed'
  | 'employee_intro_in_progress'
  | 'superseded_by_new_request'
  | 'cancelled'
  | 'destroyed'
  | 'stale_sequence'
  | 'dialogue_unavailable'
  | 'invalid_context';

export type VisitorClaimSequenceRunResult =
  | {
      readonly ok: true;
      readonly roundId: string;
    }
  | {
      readonly ok: false;
      readonly roundId: string | null;
      readonly reason: VisitorClaimSequenceFailureReason;
    };

export interface ShiftDisplayState {
  readonly nightIndex: number;
  readonly dateText: string;
  readonly timeText: string;
  readonly periodText: string;
}

export interface CampaignShiftDisplayState {
  readonly dayIndex: number;
  readonly date: string;
  readonly displayTime: string;
  readonly period: 'AM' | 'PM';
}

export interface CampaignShiftCompletionDisplayState {
  readonly dayIndex: number;
  readonly date: string;
  readonly displayTime: string;
  readonly period: 'AM' | 'PM';
}

export interface CampaignDocumentDeliveryAvailability {
  readonly employeeCardEnabled: boolean;
  readonly applicationFormEnabled: boolean;
}

@ccclass('VisitorIntroSequenceController')
export class VisitorIntroSequenceController extends Component {
  private static readonly DOCUMENT_INTRO_SCALE_FACTOR = 0.24;
  private static readonly VISITOR_CLAIM_MINIMUM_VISIBLE_SECONDS = 0.25;
  private static readonly SHIFT_CLOCK_PANEL_SPRITEFRAME_PATH =
    'ui/game/control_room/ui_shift_clock_panel_bg/spriteFrame';
  private static readonly PURGE_PANEL_SPRITEFRAME_PATH =
    'ui/game/control_room/ui_purge_procedure_1214/spriteFrame';
  private static readonly SHIFT_CLOCK_PANEL_POSITION = new Vec3(-4, 484.9, 0);
  private static readonly SHIFT_CLOCK_PANEL_SIZE = new Size(400.4, 207.4);
  private static readonly PURGE_PANEL_SOURCE_WIDTH = 777;
  private static readonly PURGE_PANEL_SOURCE_HEIGHT = 1233;
  private static readonly PURGE_PANEL_SAFE_PADDING = 2;
  private static readonly PURGE_PANEL_SLOT_BOUNDS = Object.freeze({
    left: 200,
    right: 354,
    top: 121,
    bottom: -121,
  });
  private static readonly SHIFT_CLOCK_TEXT_COLOR = new Color(255, 38, 28, 255);
  private static readonly SHIFT_CLOCK_TEXT_OUTLINE_COLOR = new Color(120, 12, 8, 220);
  private static readonly SHIFT_CLOCK_TEXT_SHADOW_COLOR = new Color(255, 20, 14, 180);
  private static readonly SHIFT_CLOCK_DEFAULT_DISPLAY: ShiftDisplayState = Object.freeze({
    nightIndex: 1,
    dateText: '1999-12-03 FRI',
    timeText: '01:00',
    periodText: 'AM',
  });
  private static readonly SHIFT_CLOCK_SMOKE_TEST_DISPLAY: ShiftDisplayState = Object.freeze({
    nightIndex: 2,
    dateText: '1999-12-04 SAT',
    timeText: '02:30',
    periodText: 'AM',
  });
  private ready = false;
  private hasPlayedIntro = false;
  private introFinished = false;
  private introPlaying = false;
  private isDestroying = false;
  private finalStatesCaptured = false;
  private inputStatesCaptured = false;

  private windowRuntime: Node | null = null;
  private windowViewport: Node | null = null;
  private shutterVisual: Node | null = null;
  private carterCharacter: Node | null = null;
  private deskEvidenceRuntime: Node | null = null;
  private employeeCardVisual: Node | null = null;
  private applicationFormVisual: Node | null = null;
  private consoleControls: Node | null = null;
  private btnShutterHit: Node | null = null;
  private shutterController: ShutterToggleController | null = null;

  private viewportUi: UITransform | null = null;
  private characterUi: UITransform | null = null;
  private deskUi: UITransform | null = null;

  private buttonStates: ButtonStateCache[] = [];

  private carterFinalState: TransformStateCache | null = null;
  private employeeCardFinalState: TransformStateCache | null = null;
  private applicationFormFinalState: TransformStateCache | null = null;

  private documentSpawnPosition = new Vec3();
  private applicationSpawnPosition = new Vec3();

  private greetingRuntime: Node | null = null;
  private greetingPanelGraphics: Graphics | null = null;
  private greetingLabel: Label | null = null;
  private greetingDismissButton: Button | null = null;

  private readonly universalGreetingPool: readonly string[] = [
    'Good evening. Here are my identification and application documents.',
    'Hello. I’m here for today’s screening. These are my documents.',
    'Good evening. I’ve brought the required paperwork.',
    'Hello. Please take a look at my identification and application form.',
    'Evening. Here are the documents you need to review.',
    'Good evening. Everything should be included in these papers.',
    'Hello. I believe my documents are in order.',
    'Evening. Here are my identification papers for inspection.',
  ];

  private lastGreetingIndex = -1;
  private isGreetingVisible = false;
  private greetingCompletion: (() => void) | null = null;
  private greetingSessionId = 0;
  private greetingAutoHideSessionId = 0;
  private greetingMinimumVisibleSessionId = 0;
  private allowCurrentDialogueTapDismiss = true;
  private currentDialogueMinimumVisibleElapsed = true;
  private preparedCharacterFrame: SpriteFrame | null = null;
  private pendingResultResolver: ((result: VisitorIntroResult) => void) | null = null;
  private pendingAcceptedCallback: (() => void) | null = null;
  private lastBlockReason: string | null = null;
  private activeIntroRoundId: string | null = null;
  private completedIntroRoundId: string | null = null;
  private visitorClaimSequenceGeneration = 0;
  private activeVisitorClaimSequenceRoundId: string | null = null;
  private completedVisitorClaimSequenceRoundId: string | null = null;
  private pendingVisitorClaimSequence:
    | {
        readonly generation: number;
        readonly roundId: string;
        readonly resolve: (result: VisitorClaimSequenceRunResult) => void;
      }
    | null = null;
  private readonly introRequestCountByRound = new Map<string, number>();
  private activeRunContext: VisitorIntroRunContext = {
    roundId: null,
    employeeKey: null,
    caseKind: null,
  };
  private shiftClockPanelRuntime: Node | null = null;
  private shiftClockPanelBgSprite: Sprite | null = null;
  private purgeProcedurePanelVisual: Node | null = null;
  private purgeProcedurePanelSprite: Sprite | null = null;
  private shiftDayLabel: Label | null = null;
  private shiftDateLabel: Label | null = null;
  private shiftTimeLabel: Label | null = null;
  private shiftPeriodLabel: Label | null = null;
  private shiftClockSpriteLoadAttempted = false;
  private purgePanelSpriteLoadAttempted = false;
  private purgePanelSpriteLoadLogged = false;
  private campaignDocumentDeliveryAvailability: CampaignDocumentDeliveryAvailability = {
    employeeCardEnabled: true,
    applicationFormEnabled: true,
  };

  private readonly handleGreetingDismissClick = (): void => {
    if (!this.allowCurrentDialogueTapDismiss || !this.currentDialogueMinimumVisibleElapsed) {
      return;
    }
    this.hideGreeting();
  };

  private readonly handleGreetingAutoHide = (): void => {
    if (this.greetingAutoHideSessionId !== this.greetingSessionId) {
      return;
    }
    this.hideGreeting();
  };

  private readonly handleGreetingMinimumVisibleElapsed = (): void => {
    if (!this.isGreetingVisible) {
      return;
    }
    if (this.greetingMinimumVisibleSessionId !== this.greetingSessionId) {
      return;
    }
    this.currentDialogueMinimumVisibleElapsed = true;
    if (
      this.allowCurrentDialogueTapDismiss &&
      this.greetingDismissButton &&
      isValid(this.greetingDismissButton, true)
    ) {
      this.greetingDismissButton.interactable = true;
    }
  };

  onLoad(): void {
    this.ready = this.resolveNodes();
    if (!this.ready) {
      return;
    }

    this.drawGreetingPanel();
    this.resetGreetingInitialState();
    this.registerGreetingEvents();
    this.cacheFinalStates();
    this.cacheButtonStates();
    this.hideDocumentsBeforeDelivery();
    this.initializeShiftClockPanelRuntime();
    this.setCampaignShiftDisplay({
      dayIndex: 1,
      date: '1999-12-03',
      displayTime: '09:00',
      period: 'AM',
    });
  }

  start(): void {
    if (!this.ready) {
      return;
    }
    // Round intro must be owned by EvidencePreviewController after a valid round context exists.
    this.hasPlayedIntro = false;
  }

  onDestroy(): void {
    this.isDestroying = true;
    this.cancelVisitorClaimSequence('destroyed');
    this.introPlaying = false;
    this.activeIntroRoundId = null;
    this.resolvePendingResult({ ok: false, reason: 'destroyed' });
    this.unschedule(this.handleGreetingAutoHide);
    this.unschedule(this.handleGreetingMinimumVisibleElapsed);
    this.unregisterGreetingEvents();
    this.isGreetingVisible = false;
    this.greetingCompletion = null;
    if (this.greetingRuntime && isValid(this.greetingRuntime, true)) {
      this.greetingRuntime.active = false;
    }
    this.stopAllTweens();
    this.restoreButtonStates();
    if (this.shutterController && isValid(this.shutterController, true)) {
      this.shutterController.setInteractionEnabled(this.getCachedInteractable('BtnShutterHit'));
    }
    this.buttonStates.length = 0;
  }

  public prepareInspectionSubject(characterFrame: SpriteFrame): boolean {
    if (!this.ready || this.isDestroying) {
      return false;
    }
    this.preparedCharacterFrame = characterFrame;
    return this.applyPreparedFrames();
  }

  public playForInspectionSubject(
    context?: VisitorIntroRunContext,
    onAccepted?: () => void,
  ): Promise<VisitorIntroResult> {
    this.activeRunContext = context ?? {
      roundId: null,
      employeeKey: null,
      caseKind: null,
    };
    this.logIntroStage('request received');

    if (!this.ready || this.isDestroying) {
      return Promise.resolve(this.blockIntro('controller_not_ready_or_destroying'));
    }
    if (!this.hasValidRoundContext(this.activeRunContext)) {
      return Promise.resolve(this.rejectInvalidRoundContext());
    }
    if (this.activeVisitorClaimSequenceRoundId !== null) {
      return Promise.resolve(this.blockIntro('visitor_claim_sequence_in_progress'));
    }
    const roundId = this.activeRunContext.roundId;
    this.incrementIntroRequestCount(roundId);
    if (this.introPlaying && this.activeIntroRoundId === roundId) {
      return Promise.resolve(this.blockIntro('duplicate_intro_in_progress'));
    }
    if (this.completedIntroRoundId === roundId) {
      return Promise.resolve(this.blockIntro('duplicate_intro_completed'));
    }
    if (!this.cacheFinalStates()) {
      return Promise.resolve(this.blockIntro('final_states_not_captured'));
    }
    if (!this.preparedCharacterFrame) {
      return Promise.resolve(this.blockIntro('prepared_character_frame_missing'));
    }

    this.resolvePendingResult({ ok: false, reason: 'superseded_by_new_request' });
    this.clearIntroRuntimeState();
    this.lastBlockReason = null;
    this.pendingAcceptedCallback = onAccepted ?? null;
    this.activeIntroRoundId = roundId;

    const started = this.playIntroSequence();
    if (!started) {
      this.activeIntroRoundId = null;
      return Promise.resolve({
        ok: false,
        reason: this.lastBlockReason ?? 'intro_sequence_rejected_by_guard',
      });
    }
    return new Promise((resolve) => {
      this.pendingResultResolver = resolve;
    });
  }

  public async playVisitorClaimSequence(
    context: VisitorClaimSequenceRunContext,
  ): Promise<VisitorClaimSequenceRunResult> {
    const validatedRoundId = this.validateVisitorClaimSequenceContext(context);
    if (!validatedRoundId) {
      return { ok: false, roundId: null, reason: 'invalid_context' };
    }

    if (!this.ready || this.isDestroying) {
      return { ok: false, roundId: validatedRoundId, reason: 'destroyed' };
    }

    if (this.isEmployeeIntroSequenceInProgress()) {
      return { ok: false, roundId: validatedRoundId, reason: 'employee_intro_in_progress' };
    }

    if (this.activeVisitorClaimSequenceRoundId === validatedRoundId) {
      return { ok: false, roundId: validatedRoundId, reason: 'duplicate_sequence_in_progress' };
    }

    if (this.completedVisitorClaimSequenceRoundId === validatedRoundId) {
      return { ok: false, roundId: validatedRoundId, reason: 'duplicate_sequence_completed' };
    }

    if (
      this.activeVisitorClaimSequenceRoundId !== null &&
      this.activeVisitorClaimSequenceRoundId !== validatedRoundId
    ) {
      this.cancelActiveVisitorClaimSequence('superseded_by_new_request');
    }

    this.visitorClaimSequenceGeneration += 1;
    const sequenceGeneration = this.visitorClaimSequenceGeneration;
    this.activeVisitorClaimSequenceRoundId = validatedRoundId;

    return await new Promise<VisitorClaimSequenceRunResult>((resolve) => {
      this.pendingVisitorClaimSequence = {
        generation: sequenceGeneration,
        roundId: validatedRoundId,
        resolve,
      };
      void this.runVisitorClaimSequence(context.dialogue, validatedRoundId, sequenceGeneration);
    });
  }

  public cancelVisitorClaimSequence(
    reason: 'cancelled' | 'superseded_by_new_request' | 'destroyed' = 'cancelled',
  ): boolean {
    return this.cancelActiveVisitorClaimSequence(reason);
  }

  private cancelActiveVisitorClaimSequence(
    reason: 'cancelled' | 'superseded_by_new_request' | 'destroyed',
  ): boolean {
    const activeRoundId = this.activeVisitorClaimSequenceRoundId;
    if (!activeRoundId) {
      return false;
    }

    this.visitorClaimSequenceGeneration += 1;
    this.activeVisitorClaimSequenceRoundId = null;
    this.forceCloseGreetingPanel();

    const pending = this.pendingVisitorClaimSequence;
    if (pending && pending.roundId === activeRoundId) {
      this.pendingVisitorClaimSequence = null;
      pending.resolve({ ok: false, roundId: activeRoundId, reason });
    }

    return true;
  }

  /**
   * Walk the character out of the window to the right, then hide and snap back to the
   * cached window-center pose (so the next intro can cacheFinalStates correctly).
   * Footsteps play once at the start of a valid exit move. No-op if already hidden.
   */
  public playCharacterExit(): Promise<void> {
    return new Promise((resolve) => {
      if (
        !this.ready ||
        this.isDestroying ||
        !this.carterCharacter ||
        !this.viewportUi ||
        !this.characterUi ||
        !isValid(this.carterCharacter, true)
      ) {
        resolve();
        return;
      }
      if (!this.carterCharacter.active) {
        resolve();
        return;
      }
      if (this.exitPlaying) {
        const previous = this.exitCompletion;
        this.exitCompletion = () => {
          previous?.();
          resolve();
        };
        return;
      }

      this.exitPlaying = true;
      this.exitCompletion = resolve;
      Tween.stopAllByTarget(this.carterCharacter);

      const endX =
        this.viewportUi.contentSize.width / 2 +
        this.characterUi.contentSize.width / 2 +
        20;
      const current = this.carterCharacter.position;
      const target = new Vec3(endX, current.y, current.z);

      // Bind SFX to the move-animation start (not buttons / dialogue / sprite swaps).
      AudioManager.getInstance()?.playCachedFootsteps();

      tween(this.carterCharacter)
        .to(0.54, { position: target }, { easing: 'cubicIn' })
        .call(() => {
          this.settleCharacterAfterExit();
          this.finishCharacterExit();
        })
        .start();
    });
  }

  public showVisitorDialogue(text: string, options?: VisitorDialogueOptions): Promise<void> {
    if (
      !this.ready ||
      this.isDestroying ||
      !this.greetingRuntime ||
      !this.greetingLabel ||
      !this.greetingDismissButton ||
      !isValid(this.greetingRuntime, true) ||
      !isValid(this.greetingLabel, true) ||
      !isValid(this.greetingDismissButton, true) ||
      !isValid(this.greetingDismissButton.node, true)
    ) {
      return Promise.resolve();
    }

    const autoCloseSeconds = this.normalizeDialogueSeconds(options?.autoCloseSeconds, 0);
    const minimumVisibleSeconds = this.normalizeDialogueSeconds(options?.minimumVisibleSeconds, 0);
    const allowTapDismiss = options?.allowTapDismiss ?? true;

    if (this.isGreetingVisible) {
      this.hideGreeting();
    }

    const sessionId = this.greetingSessionId + 1;
    this.greetingSessionId = sessionId;
    this.greetingAutoHideSessionId = sessionId;
    this.greetingMinimumVisibleSessionId = sessionId;
    this.allowCurrentDialogueTapDismiss = allowTapDismiss;
    this.currentDialogueMinimumVisibleElapsed = minimumVisibleSeconds <= 0;

    this.unschedule(this.handleGreetingAutoHide);
    this.unschedule(this.handleGreetingMinimumVisibleElapsed);
    // Voice Acting by business event: dialogue → alien, complaint → complaint, system → silent.
    const messageKind = options?.messageKind ?? 'dialogue';
    if (messageKind === 'dialogue') {
      AudioManager.getInstance()?.playCachedAlienVoice();
    } else if (messageKind === 'complaint') {
      AudioManager.getInstance()?.playCachedComplaintVoice();
    }
    this.greetingLabel.string = text;
    this.greetingRuntime.active = true;
    this.isGreetingVisible = true;
    this.greetingDismissButton.interactable =
      allowTapDismiss && this.currentDialogueMinimumVisibleElapsed;

    return new Promise((resolve) => {
      this.greetingCompletion = resolve;
      if (minimumVisibleSeconds > 0) {
        this.scheduleOnce(this.handleGreetingMinimumVisibleElapsed, minimumVisibleSeconds);
      }
      if (autoCloseSeconds > 0) {
        this.scheduleOnce(this.handleGreetingAutoHide, autoCloseSeconds);
      }
    });
  }

  public setShiftDisplay(display: ShiftDisplayState): void {
    const normalized = this.normalizeShiftDisplay(display);
    if (this.shiftDayLabel && isValid(this.shiftDayLabel, true)) {
      this.shiftDayLabel.string = `NIGHT ${normalized.nightIndex}`;
    }
    if (this.shiftDateLabel && isValid(this.shiftDateLabel, true)) {
      this.shiftDateLabel.string = normalized.dateText;
    }
    if (this.shiftTimeLabel && isValid(this.shiftTimeLabel, true)) {
      this.shiftTimeLabel.string = normalized.timeText;
    }
    if (this.shiftPeriodLabel && isValid(this.shiftPeriodLabel, true)) {
      this.shiftPeriodLabel.string = normalized.periodText;
    }
  }

  public setCampaignShiftDisplay(display: CampaignShiftDisplayState): void {
    const dayIndex = Number.isFinite(display.dayIndex) ? Math.max(1, Math.floor(display.dayIndex)) : 1;
    const dateText = display.date?.trim() || '1999-12-03';
    const timeText = display.displayTime?.trim() || '09:00';
    const periodText = display.period === 'PM' ? 'PM' : 'AM';
    if (this.shiftDayLabel && isValid(this.shiftDayLabel, true)) {
      this.shiftDayLabel.string = `DAY ${dayIndex}`;
    }
    if (this.shiftDateLabel && isValid(this.shiftDateLabel, true)) {
      this.shiftDateLabel.string = dateText;
    }
    if (this.shiftTimeLabel && isValid(this.shiftTimeLabel, true)) {
      this.shiftTimeLabel.string = timeText;
    }
    if (this.shiftPeriodLabel && isValid(this.shiftPeriodLabel, true)) {
      this.shiftPeriodLabel.string = periodText;
    }
  }

  public setCampaignShiftCompletionDisplay(display: CampaignShiftCompletionDisplayState): void {
    const dayIndex = Number.isFinite(display.dayIndex) ? Math.max(1, Math.floor(display.dayIndex)) : 1;
    const dateText = display.date?.trim() || '1999-12-03';
    const timeText = display.displayTime?.trim() || '09:00';
    const periodText = display.period === 'PM' ? 'PM' : 'AM';
    if (this.shiftDayLabel && isValid(this.shiftDayLabel, true)) {
      this.shiftDayLabel.string = `DAY ${dayIndex} COMPLETE`;
    }
    if (this.shiftDateLabel && isValid(this.shiftDateLabel, true)) {
      this.shiftDateLabel.string = dateText;
    }
    if (this.shiftTimeLabel && isValid(this.shiftTimeLabel, true)) {
      this.shiftTimeLabel.string = timeText;
    }
    if (this.shiftPeriodLabel && isValid(this.shiftPeriodLabel, true)) {
      this.shiftPeriodLabel.string = periodText;
    }
  }

  public setCampaignDocumentDeliveryAvailability(
    availability: CampaignDocumentDeliveryAvailability,
  ): void {
    this.campaignDocumentDeliveryAvailability = {
      employeeCardEnabled: availability.employeeCardEnabled,
      applicationFormEnabled: availability.applicationFormEnabled,
    };
    if (!availability.employeeCardEnabled && this.employeeCardVisual && isValid(this.employeeCardVisual, true)) {
      this.employeeCardVisual.active = false;
    }
    if (
      !availability.applicationFormEnabled &&
      this.applicationFormVisual &&
      isValid(this.applicationFormVisual, true)
    ) {
      this.applicationFormVisual.active = false;
    }
    if (!availability.employeeCardEnabled || !availability.applicationFormEnabled) {
      this.setDocumentHitInteractable(
        availability.employeeCardEnabled && this.getCachedInteractable('EmployeeCardHit'),
        availability.applicationFormEnabled && this.getCachedInteractable('ApplicationFormHit'),
      );
    }
  }

  private resolveNodes(): boolean {
    if (this.node.name !== 'Canvas') {
      console.error('[VisitorIntroSequenceController] This script must be mounted on Canvas.');
      return false;
    }

    this.windowRuntime = this.node.getChildByName('WindowRuntime');
    this.windowViewport = this.windowRuntime?.getChildByName('WindowViewport') ?? null;
    this.shutterVisual = this.windowViewport?.getChildByName('WindowShutterVisual') ?? null;
    this.carterCharacter = this.windowViewport?.getChildByName('CarterCharacter') ?? null;

    this.deskEvidenceRuntime = this.node.getChildByName('DeskEvidenceRuntime');
    this.employeeCardVisual = this.deskEvidenceRuntime?.getChildByName('EmployeeCardVisual') ?? null;
    this.applicationFormVisual = this.deskEvidenceRuntime?.getChildByName('ApplicationFormVisual') ?? null;

    this.consoleControls = this.node.getChildByName('ConsoleControls');
    this.btnShutterHit = this.consoleControls?.getChildByName('BtnShutterHit') ?? null;
    this.shutterController = this.btnShutterHit?.getComponent(ShutterToggleController) ?? null;

    this.greetingRuntime = this.node.getChildByName('VisitorGreetingRuntime');
    const greetingPanel = this.greetingRuntime?.getChildByName('VisitorGreetingPanel') ?? null;
    const greetingLabelNode = greetingPanel?.getChildByName('VisitorGreetingLabel') ?? null;
    const greetingDismissHit = this.greetingRuntime?.getChildByName('VisitorGreetingDismissHit') ?? null;
    this.greetingPanelGraphics = greetingPanel?.getComponent(Graphics) ?? null;
    this.greetingLabel = greetingLabelNode?.getComponent(Label) ?? null;
    this.greetingDismissButton = greetingDismissHit?.getComponent(Button) ?? null;

    this.viewportUi = this.windowViewport?.getComponent(UITransform) ?? null;
    this.characterUi = this.carterCharacter?.getComponent(UITransform) ?? null;
    this.deskUi = this.deskEvidenceRuntime?.getComponent(UITransform) ?? null;

    const missing = [
      !this.windowRuntime && 'WindowRuntime',
      !this.windowViewport && 'WindowViewport',
      !this.shutterVisual && 'WindowShutterVisual',
      !this.carterCharacter && 'CarterCharacter',
      !this.deskEvidenceRuntime && 'DeskEvidenceRuntime',
      !this.employeeCardVisual && 'EmployeeCardVisual',
      !this.applicationFormVisual && 'ApplicationFormVisual',
      !this.consoleControls && 'ConsoleControls',
      !this.btnShutterHit && 'BtnShutterHit',
      !this.shutterController && 'BtnShutterHit(ShutterToggleController)',
      !this.greetingRuntime && 'VisitorGreetingRuntime',
      !greetingPanel && 'VisitorGreetingPanel',
      !greetingLabelNode && 'VisitorGreetingLabel',
      !greetingDismissHit && 'VisitorGreetingDismissHit',
      !this.greetingPanelGraphics && 'VisitorGreetingPanel(Graphics)',
      !this.greetingLabel && 'VisitorGreetingLabel(Label)',
      !this.greetingDismissButton && 'VisitorGreetingDismissHit(Button)',
      !this.viewportUi && 'WindowViewport(UITransform)',
      !this.characterUi && 'CarterCharacter(UITransform)',
      !this.deskUi && 'DeskEvidenceRuntime(UITransform)',
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      console.error(
        `[VisitorIntroSequenceController] Missing required nodes/components: ${missing.join(', ')}`,
      );
      return false;
    }

    return true;
  }

  private initializeShiftClockPanelRuntime(): void {
    this.shiftClockPanelRuntime =
      this.node.getChildByName('ShiftClockPanelRuntime') ?? new Node('ShiftClockPanelRuntime');
    if (!this.shiftClockPanelRuntime.parent) {
      this.node.addChild(this.shiftClockPanelRuntime);
    }
    this.shiftClockPanelRuntime.setSiblingIndex(1);
    this.shiftClockPanelRuntime.setPosition(VisitorIntroSequenceController.SHIFT_CLOCK_PANEL_POSITION);
    this.shiftClockPanelRuntime.setScale(1, 1, 1);
    const rootTransform =
      this.shiftClockPanelRuntime.getComponent(UITransform) ??
      this.shiftClockPanelRuntime.addComponent(UITransform);
    rootTransform.setContentSize(VisitorIntroSequenceController.SHIFT_CLOCK_PANEL_SIZE);
    rootTransform.setAnchorPoint(0.5, 0.5);

    const panelBgNode = this.ensureShiftClockNode(
      this.shiftClockPanelRuntime,
      'ShiftClockPanelBg',
      VisitorIntroSequenceController.SHIFT_CLOCK_PANEL_SIZE,
      new Vec3(0, 0, 0),
    );
    panelBgNode.setPosition(6, -1, 0);
    panelBgNode.setScale(1.035, 1.035, 1);
    this.shiftClockPanelBgSprite = panelBgNode.getComponent(Sprite) ?? panelBgNode.addComponent(Sprite);
    this.shiftClockPanelBgSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.tryLoadShiftClockPanelSprite();
    this.initializePurgeProcedurePanelVisual(panelBgNode);

    this.shiftDayLabel = this.ensureShiftClockLabel({
      parent: this.shiftClockPanelRuntime,
      nodeName: 'ShiftDayLabel',
      position: new Vec3(-110, 47, 0),
      size: new Size(132, 26),
      fontSize: 23,
      align: HorizontalTextAlignment.LEFT,
    });
    this.shiftDateLabel = this.ensureShiftClockLabel({
      parent: this.shiftClockPanelRuntime,
      nodeName: 'ShiftDateLabel',
      position: new Vec3(44, 47, 0),
      size: new Size(194, 28),
      fontSize: 23,
      align: HorizontalTextAlignment.CENTER,
    });
    this.shiftTimeLabel = this.ensureShiftClockLabel({
      parent: this.shiftClockPanelRuntime,
      nodeName: 'ShiftTimeLabel',
      position: new Vec3(-12, -8, 0),
      size: new Size(192, 82),
      fontSize: 62,
      align: HorizontalTextAlignment.CENTER,
    });
    this.shiftPeriodLabel = this.ensureShiftClockLabel({
      parent: this.shiftClockPanelRuntime,
      nodeName: 'ShiftPeriodLabel',
      position: new Vec3(102, -14, 0),
      size: new Size(64, 36),
      fontSize: 24,
      align: HorizontalTextAlignment.LEFT,
    });
  }

  private ensureShiftClockNode(parent: Node, name: string, size: Size, position: Vec3): Node {
    const node = parent.getChildByName(name) ?? new Node(name);
    if (!node.parent) {
      parent.addChild(node);
    }
    node.setPosition(position);
    node.setScale(1, 1, 1);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(size);
    transform.setAnchorPoint(0.5, 0.5);
    return node;
  }

  private ensureShiftClockLabel(config: {
    readonly parent: Node;
    readonly nodeName: string;
    readonly position: Vec3;
    readonly size: Size;
    readonly fontSize: number;
    readonly align: HorizontalTextAlignment;
  }): Label {
    const node = this.ensureShiftClockNode(config.parent, config.nodeName, config.size, config.position);
    const label = node.getComponent(Label) ?? node.addComponent(Label);
    label.useSystemFont = true;
    label.fontFamily = 'Courier New';
    label.color = VisitorIntroSequenceController.SHIFT_CLOCK_TEXT_COLOR;
    label.horizontalAlign = config.align;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.fontSize = config.fontSize;
    label.lineHeight = Math.round(config.fontSize * 1.08);
    const outline = node.getComponent(LabelOutline) ?? node.addComponent(LabelOutline);
    outline.color = VisitorIntroSequenceController.SHIFT_CLOCK_TEXT_OUTLINE_COLOR;
    outline.width = Math.max(1, Math.round(config.fontSize / 18));
    const shadow = node.getComponent(LabelShadow) ?? node.addComponent(LabelShadow);
    shadow.color = VisitorIntroSequenceController.SHIFT_CLOCK_TEXT_SHADOW_COLOR;
    shadow.offset = new Vec2(0, 0);
    shadow.blur = Math.max(4, Math.round(config.fontSize / 6));
    return label;
  }

  private initializePurgeProcedurePanelVisual(panelBgNode: Node): void {
    if (!this.shiftClockPanelRuntime || !isValid(this.shiftClockPanelRuntime, true)) {
      return;
    }
    const slot = VisitorIntroSequenceController.PURGE_PANEL_SLOT_BOUNDS;
    const safePadding = VisitorIntroSequenceController.PURGE_PANEL_SAFE_PADDING;
    const targetWidth = Math.max(0, slot.right - slot.left - safePadding * 2);
    const targetHeight = Math.max(0, slot.top - slot.bottom - safePadding * 2);
    const containScale = Math.min(
      targetWidth / VisitorIntroSequenceController.PURGE_PANEL_SOURCE_WIDTH,
      targetHeight / VisitorIntroSequenceController.PURGE_PANEL_SOURCE_HEIGHT,
    );
    if (!Number.isFinite(containScale) || containScale <= 0) {
      console.warn('[ShiftClockPanel] Purge panel contain scale is invalid.', {
        targetWidth,
        targetHeight,
      });
      return;
    }
    const displayWidth = VisitorIntroSequenceController.PURGE_PANEL_SOURCE_WIDTH * containScale;
    const displayHeight = VisitorIntroSequenceController.PURGE_PANEL_SOURCE_HEIGHT * containScale;
    const localX = (slot.left + slot.right) / 2;
    const localY = (slot.top + slot.bottom) / 2;

    const visualNode =
      this.shiftClockPanelRuntime.getChildByName('PurgeProcedurePanelVisual') ??
      new Node('PurgeProcedurePanelVisual');
    if (!visualNode.parent) {
      this.shiftClockPanelRuntime.addChild(visualNode);
    }
    visualNode.active = true;
    visualNode.setPosition(localX, localY, 0);
    visualNode.setScale(1, 1, 1);
    visualNode.setRotationFromEuler(0, 0, 0);
    const visualTransform = visualNode.getComponent(UITransform) ?? visualNode.addComponent(UITransform);
    visualTransform.setAnchorPoint(0.5, 0.5);
    visualTransform.setContentSize(displayWidth, displayHeight);
    const visualSprite = visualNode.getComponent(Sprite) ?? visualNode.addComponent(Sprite);
    visualSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    visualSprite.type = Sprite.Type.SIMPLE;
    visualSprite.color = Color.WHITE;
    visualSprite.grayscale = false;

    const panelBgSibling = panelBgNode.getSiblingIndex();
    visualNode.setSiblingIndex(panelBgSibling + 1);
    this.purgeProcedurePanelVisual = visualNode;
    this.purgeProcedurePanelSprite = visualSprite;
    this.tryLoadPurgePanelSprite();

    console.info('[ShiftClockPanel] Purge panel overlay contain layout', {
      slotBounds: {
        left: slot.left,
        right: slot.right,
        top: slot.top,
        bottom: slot.bottom,
      },
      safePadding,
      targetWidth,
      targetHeight,
      containScale,
      displayWidth,
      displayHeight,
      position: { x: localX, y: localY, z: 0 },
      siblingIndex: visualNode.getSiblingIndex(),
      distanceToShiftTimeLabelRightEdge: slot.left - (-12 + 192 / 2),
      distanceToPanelRightEdge: 200.2 - (localX + displayWidth / 2),
    });
  }

  private tryLoadShiftClockPanelSprite(): void {
    if (this.shiftClockSpriteLoadAttempted) {
      return;
    }
    this.shiftClockSpriteLoadAttempted = true;
    resources.load(
      VisitorIntroSequenceController.SHIFT_CLOCK_PANEL_SPRITEFRAME_PATH,
      SpriteFrame,
      (error, spriteFrame) => {
        if (error) {
          console.warn('[ShiftClockPanel] Failed to load panel sprite frame from resources.', error);
          return;
        }
        if (
          this.isDestroying ||
          !this.shiftClockPanelBgSprite ||
          !isValid(this.shiftClockPanelBgSprite, true) ||
          !spriteFrame
        ) {
          return;
        }
        this.shiftClockPanelBgSprite.spriteFrame = spriteFrame;
      },
    );
  }

  private tryLoadPurgePanelSprite(): void {
    if (
      !this.purgeProcedurePanelSprite ||
      !isValid(this.purgeProcedurePanelSprite, true) ||
      !this.purgeProcedurePanelVisual ||
      !isValid(this.purgeProcedurePanelVisual, true)
    ) {
      return;
    }
    const cachedSpriteFrame = resources.get(
      VisitorIntroSequenceController.PURGE_PANEL_SPRITEFRAME_PATH,
      SpriteFrame,
    );
    if (cachedSpriteFrame) {
      if (this.purgeProcedurePanelSprite.spriteFrame !== cachedSpriteFrame) {
        this.purgeProcedurePanelSprite.spriteFrame = cachedSpriteFrame;
      }
      if (!this.purgePanelSpriteLoadLogged) {
        this.purgePanelSpriteLoadLogged = true;
        console.info('[ShiftClockPanel] purge procedure panel loaded.');
      }
      this.purgePanelSpriteLoadAttempted = true;
      return;
    }
    if (this.purgePanelSpriteLoadAttempted) {
      return;
    }
    this.purgePanelSpriteLoadAttempted = true;
    resources.load(
      VisitorIntroSequenceController.PURGE_PANEL_SPRITEFRAME_PATH,
      SpriteFrame,
      (error, spriteFrame) => {
        if (error) {
          console.error('[ShiftClockPanel] failed to load purge procedure panel.', error);
          return;
        }
        const visualNode = this.purgeProcedurePanelVisual;
        const visualSprite = this.purgeProcedurePanelSprite;
        if (
          this.isDestroying ||
          !isValid(this.node, true) ||
          !visualNode ||
          !isValid(visualNode, true) ||
          !visualSprite ||
          !isValid(visualSprite, true) ||
          visualSprite.node !== visualNode ||
          !spriteFrame
        ) {
          return;
        }
        visualSprite.spriteFrame = spriteFrame;
        if (!this.purgePanelSpriteLoadLogged) {
          this.purgePanelSpriteLoadLogged = true;
          console.info('[ShiftClockPanel] purge procedure panel loaded.');
        }
      },
    );
  }

  private normalizeShiftDisplay(display: ShiftDisplayState): ShiftDisplayState {
    const fallback = VisitorIntroSequenceController.SHIFT_CLOCK_DEFAULT_DISPLAY;
    const nightIndexRaw = Number.isFinite(display.nightIndex) ? Math.floor(display.nightIndex) : fallback.nightIndex;
    const nightIndex = Math.max(1, nightIndexRaw);
    return {
      nightIndex,
      dateText: display.dateText?.trim() || fallback.dateText,
      timeText: display.timeText?.trim() || fallback.timeText,
      periodText: display.periodText?.trim() || fallback.periodText,
    };
  }

  private runShiftClockDisplaySmokeTest(): void {
    this.setShiftDisplay(VisitorIntroSequenceController.SHIFT_CLOCK_DEFAULT_DISPLAY);
    this.setShiftDisplay(VisitorIntroSequenceController.SHIFT_CLOCK_SMOKE_TEST_DISPLAY);
    this.setShiftDisplay(VisitorIntroSequenceController.SHIFT_CLOCK_DEFAULT_DISPLAY);
    console.info('[ShiftClockPanel] Smoke test applied and reset to default display.');
  }

  private cacheFinalStates(): boolean {
    if (this.finalStatesCaptured) {
      return true;
    }
    const carterState = this.captureTransformState(this.carterCharacter);
    const employeeCardState = this.captureTransformState(this.employeeCardVisual);
    const applicationState = this.captureTransformState(this.applicationFormVisual);
    this.finalStatesCaptured =
      carterState !== null && employeeCardState !== null && applicationState !== null;
    if (!this.finalStatesCaptured) {
      return false;
    }
    this.carterFinalState = carterState;
    this.employeeCardFinalState = employeeCardState;
    this.applicationFormFinalState = applicationState;
    return true;
  }

  private cacheButtonStates(): void {
    this.inputStatesCaptured = false;
    this.buttonStates.length = 0;
    const desk = this.deskEvidenceRuntime;
    const controls = this.consoleControls;
    if (!desk || !controls || !isValid(desk, true) || !isValid(controls, true)) {
      this.ready = false;
      return;
    }
    const closedRuntime = desk.getChildByName('EmployeeDrawersClosedRuntime');

    const targets = [
      desk.getChildByName('EmployeeCardHit'),
      desk.getChildByName('ApplicationFormHit'),
      desk.getChildByName('ScreeningChecklistHit'),
      desk.getChildByName('TelephoneHit'),
      desk.getChildByName('AppointmentRosterHit'),
      closedRuntime?.getChildByName('EmployeeDrawer01Hit') ?? null,
      closedRuntime?.getChildByName('EmployeeDrawer02Hit') ?? null,
      closedRuntime?.getChildByName('EmployeeDrawer03Hit') ?? null,
      controls.getChildByName('BtnShutterHit'),
      controls.getChildByName('BtnAllowHit'),
      controls.getChildByName('BtnDenyHit'),
    ];

    const missingButtons: string[] = [];
    for (const node of targets) {
      if (!node) {
        missingButtons.push('UnknownHitNode');
        continue;
      }
      const button = node.getComponent(Button);
      if (!button) {
        missingButtons.push(`${node.name}(Button)`);
        continue;
      }
      this.buttonStates.push({
        nodeName: node.name,
        button,
        enabled: button.enabled,
        interactable: button.interactable,
      });
    }

    if (missingButtons.length > 0) {
      console.error(
        `[VisitorIntroSequenceController] Missing button components: ${missingButtons.join(', ')}`,
      );
      this.ready = false;
      return;
    }
    this.inputStatesCaptured = true;
  }

  private playIntroSequence(): boolean {
    if (
      !this.ready ||
      !this.shutterController ||
      !isValid(this.shutterController, true) ||
      !this.viewportUi ||
      !this.characterUi ||
      !this.inputStatesCaptured ||
      this.isDestroying
    ) {
      this.blockIntro('core_guard_failed');
      return false;
    }
    if (!this.cacheFinalStates()) {
      this.blockIntro('final_states_not_captured');
      return false;
    }
    this.restoreFinalStates();
    this.hideDocumentsBeforeDelivery();
    if (!this.applyPreparedFrames()) {
      this.blockIntro('apply_prepared_frames_failed');
      return false;
    }
    this.logIntroStage('guards passed');

    this.introPlaying = true;
    this.introFinished = false;
    if (this.pendingAcceptedCallback) {
      this.pendingAcceptedCallback();
      this.pendingAcceptedCallback = null;
    }
    this.lockMainInput();
    this.setDocumentHitInteractable(false, false);
    this.shutterController.setInteractionEnabled(false);
    if (!this.shutterController.prepareClosedForIntro()) {
      console.error('[VisitorIntroSequenceController] Failed to prepare shutter closed state.');
      this.restoreButtonStates();
      this.blockIntro('shutter_prepare_closed_failed');
      return false;
    }

    this.computeDocumentSpawnPositions();
    this.applyIntroInitialStates();
    this.logNodesPreparedState();
    this.logIntroStage('nodes prepared');

    tween(this.node)
      .delay(0.1)
      .call(() => {
        if (this.shouldSkipTweenCallback()) {
          return;
        }
        this.shutterController?.openForIntro();
      })
      .delay(0.66)
      .call(() => {
        if (this.shouldSkipTweenCallback()) {
          return;
        }
        this.logIntroStage('subject reveal started');
        this.playCharacterEnter();
      })
      .delay(0.64)
      .call(() => {
        if (this.shouldSkipTweenCallback()) {
          return;
        }
        this.playDocumentPopIn();
      })
      .start();
    return true;
  }

  private playCharacterEnter(): void {
    if (
      this.shouldSkipTweenCallback() ||
      !this.carterCharacter ||
      !this.carterFinalState ||
      !isValid(this.carterCharacter, true)
    ) {
      return;
    }
    // Bind SFX to the move-animation start (not dialogue / sprite swaps / teleport resets).
    AudioManager.getInstance()?.playCachedFootsteps();
    tween(this.carterCharacter)
      .to(0.54, { position: this.getActiveCharacterPresentationPosition() }, { easing: 'cubicOut' })
      .call(() => {
        // End footsteps with the move so the clip cannot trail into idle / later SFX.
        AudioManager.getInstance()?.stopCachedFootsteps();
      })
      .start();
  }

  private playDocumentPopIn(): void {
    if (
      this.shouldSkipTweenCallback() ||
      !this.employeeCardVisual ||
      !this.applicationFormVisual ||
      !this.employeeCardFinalState ||
      !this.applicationFormFinalState ||
      !isValid(this.employeeCardVisual, true) ||
      !isValid(this.applicationFormVisual, true)
    ) {
      this.blockIntro('document_nodes_or_states_invalid');
      return;
    }
    const employeeCardSprite = this.employeeCardVisual.getComponent(Sprite);
    const applicationFormSprite = this.applicationFormVisual.getComponent(Sprite);
    if (!employeeCardSprite?.spriteFrame) {
      this.blockIntro('employee_card_sprite_frame_missing_before_delivery');
      return;
    }
    if (!applicationFormSprite?.spriteFrame) {
      this.blockIntro('application_sprite_frame_missing_before_delivery');
      return;
    }

    this.setDocumentHitInteractable(false, false);
    this.applicationFormVisual.active = false;
    const { employeeCardEnabled } = this.campaignDocumentDeliveryAvailability;
    if (!employeeCardEnabled) {
      this.employeeCardVisual.active = false;
      this.playApplicationDelivery();
      return;
    }
    this.employeeCardVisual.active = true;
    this.logEmployeeCardMadeVisible();
    this.logIntroStage('employee card delivery started');
    tween(this.employeeCardVisual)
      .to(
        0.36,
        {
          position: this.employeeCardFinalState.position.clone(),
          scale: this.employeeCardFinalState.scale.clone(),
        },
        { easing: 'backOut' },
      )
      .call(() => {
        if (this.shouldSkipTweenCallback()) {
          return;
        }
        this.setDocumentHitInteractable(true, false);
        this.applicationFormVisual.active = false;
        this.logIntroStage('employee card delivery completed');
        this.playApplicationDelivery();
      })
      .start();
  }

  private playApplicationDelivery(): void {
    if (
      this.shouldSkipTweenCallback() ||
      !this.applicationFormVisual ||
      !this.applicationFormFinalState ||
      !isValid(this.applicationFormVisual, true)
    ) {
      return;
    }
    const { applicationFormEnabled } = this.campaignDocumentDeliveryAvailability;
    if (!applicationFormEnabled) {
      this.applicationFormVisual.active = false;
      this.logIntroStage('greeting started');
      this.showRandomGreeting(() => {
        this.finishIntroSequence();
      });
      return;
    }
    this.applicationFormVisual.active = true;
    this.logApplicationMadeVisible();
    this.logIntroStage('application delivery started');
    tween(this.applicationFormVisual)
      .to(
        0.36,
        {
          position: this.applicationFormFinalState.position.clone(),
          scale: this.applicationFormFinalState.scale.clone(),
        },
        { easing: 'backOut' },
      )
      .call(() => {
        if (this.shouldSkipTweenCallback()) {
          return;
        }
        this.setDocumentHitInteractable(true, true);
        this.logIntroStage('application delivery completed');
        this.logIntroStage('greeting started');
        this.showRandomGreeting(() => {
          this.finishIntroSequence();
        });
      })
      .start();
  }

  private finishIntroSequence(): void {
    if (this.introFinished || this.shouldSkipTweenCallback()) {
      return;
    }
    this.introFinished = true;
    this.introPlaying = false;
    this.completedIntroRoundId = this.activeRunContext.roundId ?? this.completedIntroRoundId;
    this.activeIntroRoundId = null;

    this.restoreFinalStates();
    this.applyActiveCharacterPresentationTransform();
    if (!this.campaignDocumentDeliveryAvailability.employeeCardEnabled && this.employeeCardVisual) {
      this.employeeCardVisual.active = false;
    }
    if (!this.campaignDocumentDeliveryAvailability.applicationFormEnabled && this.applicationFormVisual) {
      this.applicationFormVisual.active = false;
    }
    this.logFinalVisualState();
    this.restoreButtonStates();
    if (this.shutterController && isValid(this.shutterController, true)) {
      this.shutterController.setInteractionEnabled(this.getCachedInteractable('BtnShutterHit'));
    }
    this.logFinalDocumentVisibility();
    this.logIntroStage('sequence completed');
    this.resolvePendingResult({ ok: true });
  }

  private drawGreetingPanel(): void {
    if (!this.greetingPanelGraphics || !isValid(this.greetingPanelGraphics, true)) {
      return;
    }
    this.greetingPanelGraphics.clear();
    this.greetingPanelGraphics.fillColor = Color.WHITE;
    this.greetingPanelGraphics.strokeColor = Color.BLACK;
    this.greetingPanelGraphics.lineWidth = 4;
    this.greetingPanelGraphics.rect(-340, -55, 680, 110);
    this.greetingPanelGraphics.fill();
    this.greetingPanelGraphics.stroke();
  }

  private resetGreetingInitialState(): void {
    this.isGreetingVisible = false;
    this.greetingCompletion = null;
    this.greetingSessionId = 0;
    this.greetingAutoHideSessionId = 0;
    this.greetingMinimumVisibleSessionId = 0;
    this.allowCurrentDialogueTapDismiss = true;
    this.currentDialogueMinimumVisibleElapsed = true;
    this.unschedule(this.handleGreetingMinimumVisibleElapsed);
    if (this.greetingRuntime && isValid(this.greetingRuntime, true)) {
      this.greetingRuntime.active = false;
    }
    if (this.greetingDismissButton && isValid(this.greetingDismissButton, true)) {
      this.greetingDismissButton.interactable = false;
    }
    if (this.greetingLabel && isValid(this.greetingLabel, true)) {
      this.greetingLabel.string = '';
    }
  }

  private registerGreetingEvents(): void {
    if (
      !this.greetingDismissButton ||
      !isValid(this.greetingDismissButton, true) ||
      !isValid(this.greetingDismissButton.node, true)
    ) {
      return;
    }
    this.greetingDismissButton.node.on(
      Button.EventType.CLICK,
      this.handleGreetingDismissClick,
      this,
    );
  }

  private unregisterGreetingEvents(): void {
    if (
      this.greetingDismissButton &&
      isValid(this.greetingDismissButton, true) &&
      isValid(this.greetingDismissButton.node, true)
    ) {
      this.greetingDismissButton.node.off(
        Button.EventType.CLICK,
        this.handleGreetingDismissClick,
        this,
      );
    }
  }

  private pickUniversalGreeting(): string {
    const total = this.universalGreetingPool.length;
    if (total === 0) {
      return '';
    }
    if (total === 1) {
      this.lastGreetingIndex = 0;
      return this.universalGreetingPool[0];
    }
    let next = Math.floor(Math.random() * total);
    if (next === this.lastGreetingIndex) {
      next = (next + 1 + Math.floor(Math.random() * (total - 1))) % total;
    }
    this.lastGreetingIndex = next;
    return this.universalGreetingPool[next];
  }

  private showRandomGreeting(onComplete: () => void): void {
    if (!this.ready || this.isDestroying) {
      if (!this.shouldSkipTweenCallback()) {
        onComplete();
      }
      return;
    }
    void this
      .showVisitorDialogue(this.pickUniversalGreeting(), {
        autoCloseSeconds: 2.0,
        allowTapDismiss: true,
        minimumVisibleSeconds: 0,
      })
      .then(() => {
        if (!this.shouldSkipTweenCallback()) {
          onComplete();
        }
      });
  }

  private async runVisitorClaimSequence(
    dialogue: VisitorClaimDialogue,
    roundId: string,
    sequenceGeneration: number,
  ): Promise<void> {
    const staleResult: VisitorClaimSequenceRunResult = {
      ok: false,
      roundId,
      reason: 'stale_sequence',
    };
    try {
      for (const line of dialogue) {
        if (!this.isActiveVisitorClaimSequence(roundId, sequenceGeneration)) {
          this.resolvePendingVisitorClaimSequenceForGeneration(sequenceGeneration, staleResult);
          return;
        }
        await this.showVisitorDialogue(line.text, {
          allowTapDismiss: true,
          minimumVisibleSeconds: VisitorIntroSequenceController.VISITOR_CLAIM_MINIMUM_VISIBLE_SECONDS,
        });
        if (!this.isActiveVisitorClaimSequence(roundId, sequenceGeneration)) {
          this.resolvePendingVisitorClaimSequenceForGeneration(sequenceGeneration, staleResult);
          return;
        }
      }
    } catch {
      this.resolvePendingVisitorClaimSequenceForGeneration(sequenceGeneration, {
        ok: false,
        roundId,
        reason: 'dialogue_unavailable',
      });
      return;
    }

    if (!this.isActiveVisitorClaimSequence(roundId, sequenceGeneration)) {
      this.resolvePendingVisitorClaimSequenceForGeneration(sequenceGeneration, staleResult);
      return;
    }

    this.activeVisitorClaimSequenceRoundId = null;
    this.completedVisitorClaimSequenceRoundId = roundId;
    this.forceCloseGreetingPanel();
    this.resolvePendingVisitorClaimSequenceForGeneration(sequenceGeneration, {
      ok: true,
      roundId,
    });
  }

  private hideGreeting(): void {
    if (!this.isGreetingVisible) {
      return;
    }
    this.isGreetingVisible = false;
    this.unschedule(this.handleGreetingAutoHide);
    this.unschedule(this.handleGreetingMinimumVisibleElapsed);
    this.allowCurrentDialogueTapDismiss = true;
    this.currentDialogueMinimumVisibleElapsed = true;

    if (this.greetingDismissButton && isValid(this.greetingDismissButton, true)) {
      this.greetingDismissButton.interactable = false;
    }
    if (this.greetingRuntime && isValid(this.greetingRuntime, true)) {
      this.greetingRuntime.active = false;
    }

    const completion = this.greetingCompletion;
    this.greetingCompletion = null;
    if (!completion || this.shouldSkipTweenCallback()) {
      return;
    }
    completion();
  }

  private forceCloseGreetingPanel(): void {
    if (!this.isGreetingVisible) {
      return;
    }
    this.isGreetingVisible = false;
    this.unschedule(this.handleGreetingAutoHide);
    this.unschedule(this.handleGreetingMinimumVisibleElapsed);
    this.allowCurrentDialogueTapDismiss = true;
    this.currentDialogueMinimumVisibleElapsed = true;
    if (this.greetingDismissButton && isValid(this.greetingDismissButton, true)) {
      this.greetingDismissButton.interactable = false;
    }
    if (this.greetingRuntime && isValid(this.greetingRuntime, true)) {
      this.greetingRuntime.active = false;
    }
    const completion = this.greetingCompletion;
    this.greetingCompletion = null;
    if (completion) {
      completion();
    }
  }

  private clearIntroRuntimeState(): void {
    this.unschedule(this.handleGreetingAutoHide);
    this.unschedule(this.handleGreetingMinimumVisibleElapsed);
    this.stopAllTweens();
    this.introFinished = false;
    this.introPlaying = false;
    this.isGreetingVisible = false;
    this.greetingCompletion = null;
    this.greetingSessionId = 0;
    this.greetingAutoHideSessionId = 0;
    this.greetingMinimumVisibleSessionId = 0;
    this.allowCurrentDialogueTapDismiss = true;
    this.currentDialogueMinimumVisibleElapsed = true;
    this.pendingAcceptedCallback = null;
    if (this.greetingDismissButton && isValid(this.greetingDismissButton, true)) {
      this.greetingDismissButton.interactable = false;
    }
    if (this.greetingRuntime && isValid(this.greetingRuntime, true)) {
      this.greetingRuntime.active = false;
    }
    this.hideDocumentsBeforeDelivery();
  }

  private computeDocumentSpawnPositions(): void {
    if (!this.viewportUi || !this.deskUi) {
      return;
    }

    const bottomCenterInViewport = new Vec3(0, -this.viewportUi.contentSize.height / 2, 0);
    const world = this.viewportUi.convertToWorldSpaceAR(bottomCenterInViewport);
    const inDesk = this.deskUi.convertToNodeSpaceAR(world);
    inDesk.y -= 15;

    this.documentSpawnPosition = inDesk.clone();
    this.applicationSpawnPosition = new Vec3(inDesk.x + 10, inDesk.y, inDesk.z);
  }

  private applyIntroInitialStates(): void {
    if (
      this.isDestroying ||
      !this.carterCharacter ||
      !this.employeeCardVisual ||
      !this.applicationFormVisual ||
      !this.carterFinalState ||
      !this.employeeCardFinalState ||
      !this.applicationFormFinalState ||
      !this.viewportUi ||
      !this.characterUi ||
      !isValid(this.carterCharacter, true) ||
      !isValid(this.employeeCardVisual, true) ||
      !isValid(this.applicationFormVisual, true)
    ) {
      return;
    }

    const viewportLeftStartX =
      -(this.viewportUi.contentSize.width / 2) - (this.characterUi.contentSize.width / 2) - 20;
    const finalPosition = this.getActiveCharacterPresentationPosition();
    const finalScale = this.getActiveCharacterPresentationScale();
    const introOffsetX = viewportLeftStartX - finalPosition.x;
    const startX = finalPosition.x + introOffsetX;
    this.carterCharacter.setPosition(
      new Vec3(startX, finalPosition.y, finalPosition.z),
    );
    this.carterCharacter.setScale(finalScale);
    this.carterCharacter.setRotation(this.carterFinalState.rotation.clone());
    this.carterCharacter.active = true;

    const cardStartScale = this.employeeCardFinalState.scale
      .clone()
      .multiplyScalar(VisitorIntroSequenceController.DOCUMENT_INTRO_SCALE_FACTOR);
    this.employeeCardVisual.setPosition(this.documentSpawnPosition);
    this.employeeCardVisual.setScale(cardStartScale);
    this.employeeCardVisual.setRotation(this.employeeCardFinalState.rotation.clone());
    this.employeeCardVisual.active = false;

    const formStartScale = this.applicationFormFinalState.scale
      .clone()
      .multiplyScalar(VisitorIntroSequenceController.DOCUMENT_INTRO_SCALE_FACTOR);
    this.applicationFormVisual.setPosition(this.applicationSpawnPosition);
    this.applicationFormVisual.setScale(formStartScale);
    this.applicationFormVisual.setRotation(this.applicationFormFinalState.rotation.clone());
    this.applicationFormVisual.active = false;
  }

  private lockMainInput(): void {
    if (!this.inputStatesCaptured) {
      return;
    }
    for (const state of this.buttonStates) {
      if (isValid(state.button, true) && isValid(state.button.node, true)) {
        state.button.interactable = false;
      }
    }
  }

  private restoreButtonStates(): void {
    if (!this.inputStatesCaptured) {
      return;
    }
    for (const state of this.buttonStates) {
      if (isValid(state.button, true) && isValid(state.button.node, true)) {
        state.button.interactable = state.interactable;
      }
    }
    this.setDocumentHitInteractable(
      this.campaignDocumentDeliveryAvailability.employeeCardEnabled &&
        this.getCachedInteractable('EmployeeCardHit'),
      this.campaignDocumentDeliveryAvailability.applicationFormEnabled &&
        this.getCachedInteractable('ApplicationFormHit'),
    );
  }

  private restoreFinalStates(): void {
    if (!this.finalStatesCaptured || this.isDestroying) {
      return;
    }
    this.applyTransformState(this.carterCharacter, this.carterFinalState);
    this.applyTransformState(this.employeeCardVisual, this.employeeCardFinalState);
    this.applyTransformState(this.applicationFormVisual, this.applicationFormFinalState);
  }

  private stopAllTweens(): void {
    const wasExiting = this.exitPlaying;
    if (isValid(this.node, true)) {
      Tween.stopAllByTarget(this.node);
    }
    if (this.carterCharacter && isValid(this.carterCharacter, true)) {
      Tween.stopAllByTarget(this.carterCharacter);
    }
    if (this.employeeCardVisual && isValid(this.employeeCardVisual, true)) {
      Tween.stopAllByTarget(this.employeeCardVisual);
    }
    if (this.applicationFormVisual && isValid(this.applicationFormVisual, true)) {
      Tween.stopAllByTarget(this.applicationFormVisual);
    }
    if (wasExiting) {
      this.settleCharacterAfterExit();
      this.finishCharacterExit();
    }
  }

  private settleCharacterAfterExit(): void {
    // Cut exit footsteps before the next intro can start another footstep.
    AudioManager.getInstance()?.stopCachedFootsteps();
    if (!this.carterCharacter || !isValid(this.carterCharacter, true)) {
      return;
    }
    // Snap back to window-center pose while hidden so the next subject's
    // cacheFinalStates does not capture the off-screen exit position.
    if (this.carterFinalState) {
      this.carterCharacter.setPosition(this.carterFinalState.position.clone());
      this.carterCharacter.setScale(this.carterFinalState.scale.clone());
      this.carterCharacter.setRotation(this.carterFinalState.rotation.clone());
    }
    this.carterCharacter.active = false;
  }

  private finishCharacterExit(): void {
    this.exitPlaying = false;
    const completion = this.exitCompletion;
    this.exitCompletion = null;
    completion?.();
  }

  private applyPreparedFrames(): boolean {
    if (
      !this.preparedCharacterFrame ||
      !this.carterCharacter ||
      !this.employeeCardVisual ||
      !this.applicationFormVisual
    ) {
      return false;
    }
    const characterSprite = this.carterCharacter.getComponent(Sprite);
    if (!characterSprite) {
      return false;
    }
    characterSprite.spriteFrame = this.preparedCharacterFrame;
    this.applyCharacterContainByFrame(this.preparedCharacterFrame);
    return true;
  }

  private applyCharacterContainByFrame(frame: SpriteFrame): void {
    if (!this.characterUi || !this.viewportUi) {
      return;
    }
    const sourceWidth = frame.originalSize.width > 0 ? frame.originalSize.width : frame.texture?.width ?? 0;
    const sourceHeight = frame.originalSize.height > 0 ? frame.originalSize.height : frame.texture?.height ?? 0;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return;
    }
    const maxWidth = this.viewportUi.contentSize.width * 0.62;
    const maxHeight = this.viewportUi.contentSize.height * 0.92;
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    this.characterUi.setContentSize(sourceWidth * scale, sourceHeight * scale);
    this.applyActiveCharacterPresentationTransform();
  }

  private applyActiveCharacterPresentationTransform(): void {
    if (!this.carterCharacter || !isValid(this.carterCharacter, true)) {
      return;
    }
    this.carterCharacter.setPosition(this.getActiveCharacterPresentationPosition());
    this.carterCharacter.setScale(this.getActiveCharacterPresentationScale());
  }

  private getActiveCharacterPresentationPosition(): Vec3 {
    if (!this.carterFinalState) {
      return this.carterCharacter?.position.clone() ?? new Vec3();
    }
    const presentation = this.resolveActiveEmployeeWindowPortraitPresentation();
    return new Vec3(
      this.carterFinalState.position.x + presentation.offsetX,
      this.carterFinalState.position.y + presentation.offsetY,
      this.carterFinalState.position.z,
    );
  }

  private getActiveCharacterPresentationScale(): Vec3 {
    if (!this.carterFinalState) {
      return this.carterCharacter?.scale.clone() ?? new Vec3(1, 1, 1);
    }
    const presentation = this.resolveActiveEmployeeWindowPortraitPresentation();
    return new Vec3(
      this.carterFinalState.scale.x * presentation.scale,
      this.carterFinalState.scale.y * presentation.scale,
      this.carterFinalState.scale.z,
    );
  }

  private resolveActiveEmployeeWindowPortraitPresentation(): {
    scale: number;
    offsetX: number;
    offsetY: number;
  } {
    const defaults = { scale: 1, offsetX: 0, offsetY: 0 };
    const employeeKey = this.activeRunContext.employeeKey;
    if (!employeeKey) {
      return defaults;
    }
    if (!(employeeKey in EMPLOYEE_PROFILES)) {
      return defaults;
    }
    const profile = EMPLOYEE_PROFILES[employeeKey as EmployeeKey];
    const presentation: WindowPortraitPresentation | undefined = profile.windowPortraitPresentation;
    if (!presentation) {
      return defaults;
    }
    const scale = Number.isFinite(presentation.scale) && (presentation.scale ?? 0) > 0 ? presentation.scale! : 1;
    const offsetX = Number.isFinite(presentation.offsetX) ? presentation.offsetX! : 0;
    const offsetY = Number.isFinite(presentation.offsetY) ? presentation.offsetY! : 0;
    return { scale, offsetX, offsetY };
  }

  private getCachedInteractable(nodeName: string): boolean {
    return this.buttonStates.find((state) => state.nodeName === nodeName)?.interactable ?? false;
  }

  private hideDocumentsBeforeDelivery(): void {
    if (this.isDestroying) {
      return;
    }
    if (this.employeeCardVisual && isValid(this.employeeCardVisual, true)) {
      Tween.stopAllByTarget(this.employeeCardVisual);
      this.employeeCardVisual.active = false;
    }
    if (this.applicationFormVisual && isValid(this.applicationFormVisual, true)) {
      Tween.stopAllByTarget(this.applicationFormVisual);
      this.applicationFormVisual.active = false;
    }
    this.setDocumentHitInteractable(false, false);
    this.logDocumentsHiddenBeforeDelivery();
  }

  private captureTransformState(node: Node | null): TransformStateCache | null {
    if (!node || !isValid(node, true)) {
      return null;
    }
    const uiOpacity = node.getComponent(UIOpacity);
    return {
      position: node.position.clone(),
      scale: node.scale.clone(),
      rotation: node.rotation.clone(),
      active: node.active,
      opacity: uiOpacity?.opacity ?? null,
      siblingIndex: node.getSiblingIndex(),
    };
  }

  private applyTransformState(node: Node | null, state: TransformStateCache | null): void {
    if (
      this.isDestroying ||
      !node ||
      !state ||
      !isValid(node, true) ||
      !state.position ||
      !state.scale ||
      !state.rotation
    ) {
      return;
    }
    node.setPosition(state.position.clone());
    node.setScale(state.scale.clone());
    node.setRotation(state.rotation.clone());
    const uiOpacity = node.getComponent(UIOpacity);
    if (uiOpacity && state.opacity !== null) {
      uiOpacity.opacity = state.opacity;
    }
    if (node.parent && isValid(node.parent, true)) {
      node.setSiblingIndex(state.siblingIndex);
    }
    node.active = state.active;
  }

  private shouldSkipTweenCallback(): boolean {
    return this.isDestroying || !isValid(this, true) || !isValid(this.node, true);
  }

  private logIntroStage(
    stage:
      | 'request received'
      | 'guards passed'
      | 'nodes prepared'
      | 'subject reveal started'
      | 'employee card delivery started'
      | 'employee card delivery completed'
      | 'application delivery started'
      | 'application delivery completed'
      | 'greeting started'
      | 'sequence completed',
  ): void {
    console.info(`[VisitorIntro] ${stage}`, {
      roundId: this.activeRunContext.roundId,
      employeeKey: this.activeRunContext.employeeKey,
      caseKind: this.activeRunContext.caseKind,
    });
  }

  private blockIntro(reason: string): VisitorIntroResult {
    this.lastBlockReason = reason;
    this.introPlaying = false;
    if (this.activeRunContext.roundId && this.activeIntroRoundId === this.activeRunContext.roundId) {
      this.activeIntroRoundId = null;
    }
    console.error('[VisitorIntro] blocked', {
      roundId: this.activeRunContext.roundId,
      employeeKey: this.activeRunContext.employeeKey,
      caseKind: this.activeRunContext.caseKind,
      blockReason: reason,
      state: {
        ready: this.ready,
        hasPlayedIntro: this.hasPlayedIntro,
        introPlaying: this.introPlaying,
        introFinished: this.introFinished,
        isDestroying: this.isDestroying,
        finalStatesCaptured: this.finalStatesCaptured,
        inputStatesCaptured: this.inputStatesCaptured,
        hasPreparedCharacterFrame: Boolean(this.preparedCharacterFrame),
      },
      missingNodes: this.collectMissingNodeNames(),
    });
    this.restoreButtonStates();
    this.resolvePendingResult({ ok: false, reason });
    return { ok: false, reason };
  }

  private rejectInvalidRoundContext(): VisitorIntroResult {
    this.lastBlockReason = 'invalid_round_context';
    console.error('[VisitorIntro] blocked', {
      roundId: this.activeRunContext.roundId,
      employeeKey: this.activeRunContext.employeeKey,
      caseKind: this.activeRunContext.caseKind,
      blockReason: 'invalid_round_context',
    });
    return { ok: false, reason: 'invalid_round_context' };
  }

  private hasValidRoundContext(
    context: VisitorIntroRunContext,
  ): context is { roundId: string; employeeKey: string; caseKind: string } {
    return Boolean(context.roundId && context.employeeKey && context.caseKind);
  }

  private incrementIntroRequestCount(roundId: string): void {
    this.introRequestCountByRound.set(roundId, (this.introRequestCountByRound.get(roundId) ?? 0) + 1);
  }

  private getIntroRequestCountForCurrentRound(): number {
    const roundId = this.activeRunContext.roundId;
    if (!roundId) {
      return 0;
    }
    return this.introRequestCountByRound.get(roundId) ?? 0;
  }

  private setDocumentHitInteractable(employeeCard: boolean, applicationForm: boolean): void {
    this.setButtonInteractableByName('EmployeeCardHit', employeeCard);
    this.setButtonInteractableByName('ApplicationFormHit', applicationForm);
  }

  private getButtonInteractableByName(nodeName: string): boolean | null {
    const cached = this.buttonStates.find((state) => state.nodeName === nodeName) ?? null;
    if (!cached || !isValid(cached.button, true) || !isValid(cached.button.node, true)) {
      return null;
    }
    return cached.button.interactable;
  }

  private setButtonInteractableByName(nodeName: string, interactable: boolean): void {
    const cached = this.buttonStates.find((state) => state.nodeName === nodeName) ?? null;
    if (!cached || !isValid(cached.button, true) || !isValid(cached.button.node, true)) {
      return;
    }
    cached.button.interactable = interactable;
  }

  private logDocumentsHiddenBeforeDelivery(): void {
    console.info('[VisitorIntro] documents hidden before delivery', {
      roundId: this.activeRunContext.roundId,
      employeeKey: this.activeRunContext.employeeKey,
      caseKind: this.activeRunContext.caseKind,
      employeeCard: {
        active: this.employeeCardVisual?.active ?? null,
        hitInteractable: this.getButtonInteractableByName('EmployeeCardHit'),
        position: this.employeeCardVisual
          ? {
              x: this.employeeCardVisual.position.x,
              y: this.employeeCardVisual.position.y,
              z: this.employeeCardVisual.position.z,
            }
          : null,
        scale: this.employeeCardVisual
          ? {
              x: this.employeeCardVisual.scale.x,
              y: this.employeeCardVisual.scale.y,
              z: this.employeeCardVisual.scale.z,
            }
          : null,
      },
      application: {
        active: this.applicationFormVisual?.active ?? null,
        hitInteractable: this.getButtonInteractableByName('ApplicationFormHit'),
        position: this.applicationFormVisual
          ? {
              x: this.applicationFormVisual.position.x,
              y: this.applicationFormVisual.position.y,
              z: this.applicationFormVisual.position.z,
            }
          : null,
        scale: this.applicationFormVisual
          ? {
              x: this.applicationFormVisual.scale.x,
              y: this.applicationFormVisual.scale.y,
              z: this.applicationFormVisual.scale.z,
            }
          : null,
      },
    });
  }

  private logEmployeeCardMadeVisible(): void {
    console.info('[VisitorIntro] employee card made visible', {
      roundId: this.activeRunContext.roundId,
      employeeKey: this.activeRunContext.employeeKey,
      caseKind: this.activeRunContext.caseKind,
    });
  }

  private logApplicationMadeVisible(): void {
    console.info('[VisitorIntro] application made visible', {
      roundId: this.activeRunContext.roundId,
      employeeKey: this.activeRunContext.employeeKey,
      caseKind: this.activeRunContext.caseKind,
    });
  }

  private logFinalDocumentVisibility(): void {
    console.info('[VisitorIntro] final document visibility', {
      roundId: this.activeRunContext.roundId,
      employeeKey: this.activeRunContext.employeeKey,
      caseKind: this.activeRunContext.caseKind,
      employeeCard: {
        active: this.employeeCardVisual?.active ?? null,
        hitInteractable: this.getButtonInteractableByName('EmployeeCardHit'),
      },
      application: {
        active: this.applicationFormVisual?.active ?? null,
        hitInteractable: this.getButtonInteractableByName('ApplicationFormHit'),
      },
    });
  }

  private collectMissingNodeNames(): string[] {
    return [
      !this.windowRuntime && 'WindowRuntime',
      !this.windowViewport && 'WindowViewport',
      !this.shutterVisual && 'WindowShutterVisual',
      !this.carterCharacter && 'CarterCharacter',
      !this.employeeCardVisual && 'EmployeeCardVisual',
      !this.applicationFormVisual && 'ApplicationFormVisual',
      !this.shutterController && 'BtnShutterHit(ShutterToggleController)',
      !this.greetingRuntime && 'VisitorGreetingRuntime',
      !this.greetingLabel && 'VisitorGreetingLabel(Label)',
      !this.greetingDismissButton && 'VisitorGreetingDismissHit(Button)',
      !this.viewportUi && 'WindowViewport(UITransform)',
      !this.characterUi && 'CarterCharacter(UITransform)',
      !this.deskUi && 'DeskEvidenceRuntime(UITransform)',
    ].filter(Boolean) as string[];
  }

  private logNodesPreparedState(): void {
    console.info('[VisitorIntro] nodes prepared state', {
      roundId: this.activeRunContext.roundId,
      employeeKey: this.activeRunContext.employeeKey,
      caseKind: this.activeRunContext.caseKind,
      subjectNode: this.captureNodeState(this.carterCharacter),
      employeeCardNode: this.captureNodeState(this.employeeCardVisual),
      applicationNode: this.captureNodeState(this.applicationFormVisual),
    });
  }

  private logFinalVisualState(): void {
    console.info('[VisitorIntro] final visual state', {
      roundId: this.activeRunContext.roundId,
      employeeKey: this.activeRunContext.employeeKey,
      caseKind: this.activeRunContext.caseKind,
      introRequestCountForRound: this.getIntroRequestCountForCurrentRound(),
      subjectNode: this.captureNodeState(this.carterCharacter),
      employeeCardNode: this.captureNodeState(this.employeeCardVisual),
      applicationNode: this.captureNodeState(this.applicationFormVisual),
    });
  }

  private captureNodeState(node: Node | null): Record<string, unknown> | null {
    if (!node || !isValid(node, true)) {
      return null;
    }
    const sprite = node.getComponent(Sprite);
    const uiTransform = node.getComponent(UITransform);
    const uiOpacity = node.getComponent(UIOpacity);
    const parent = node.parent;
    const parentOpacity = parent?.getComponent(UIOpacity) ?? null;
    return {
      path: this.buildNodePath(node),
      active: node.active,
      spriteEnabled: sprite?.enabled ?? null,
      hasSpriteFrame: Boolean(sprite?.spriteFrame),
      opacity: uiOpacity?.opacity ?? null,
      position: { x: node.position.x, y: node.position.y, z: node.position.z },
      scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
      size: uiTransform
        ? { width: uiTransform.contentSize.width, height: uiTransform.contentSize.height }
        : null,
      anchor: uiTransform ? { x: uiTransform.anchorX, y: uiTransform.anchorY } : null,
      siblingIndex: node.getSiblingIndex(),
      parentActive: parent?.active ?? null,
      parentOpacity: parentOpacity?.opacity ?? null,
    };
  }

  private buildNodePath(node: Node): string {
    const names: string[] = [];
    let cursor: Node | null = node;
    while (cursor) {
      names.unshift(cursor.name);
      cursor = cursor.parent;
    }
    return names.join('/');
  }

  private resolvePendingResult(result: VisitorIntroResult): void {
    const resolver = this.pendingResultResolver;
    this.pendingResultResolver = null;
    if (resolver) {
      resolver(result);
    }
  }

  private resolvePendingVisitorClaimSequenceForGeneration(
    sequenceGeneration: number,
    result: VisitorClaimSequenceRunResult,
  ): void {
    const pending = this.pendingVisitorClaimSequence;
    if (!pending || pending.generation !== sequenceGeneration) {
      return;
    }
    this.pendingVisitorClaimSequence = null;
    pending.resolve(result);
  }

  private isEmployeeIntroSequenceInProgress(): boolean {
    return this.introPlaying || this.activeIntroRoundId !== null || this.pendingResultResolver !== null;
  }

  private isActiveVisitorClaimSequence(roundId: string, sequenceGeneration: number): boolean {
    return (
      !this.isDestroying &&
      this.visitorClaimSequenceGeneration === sequenceGeneration &&
      this.activeVisitorClaimSequenceRoundId === roundId
    );
  }

  private validateVisitorClaimSequenceContext(context: VisitorClaimSequenceRunContext): string | null {
    if (!context || typeof context !== 'object') {
      return null;
    }
    if (typeof context.roundId !== 'string' || context.roundId.trim().length === 0) {
      return null;
    }
    if (!Array.isArray(context.dialogue) || context.dialogue.length !== 3) {
      return null;
    }
    const expectedKinds = ['claimed-name', 'claimed-department', 'claimed-purpose'] as const;
    for (let index = 0; index < expectedKinds.length; index += 1) {
      const line = context.dialogue[index];
      if (!line || typeof line !== 'object' || line.kind !== expectedKinds[index]) {
        return null;
      }
      if (
        typeof line.text !== 'string' ||
        line.text.trim().length === 0 ||
        line.text.includes('\n') ||
        line.text.includes('\r')
      ) {
        return null;
      }
    }
    return context.roundId;
  }

  private normalizeDialogueSeconds(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return fallback;
    }
    return value;
  }
}
