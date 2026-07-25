import {
  _decorator,
  Button,
  Color,
  Component,
  Graphics,
  isValid,
  Label,
  Node,
  Quat,
  Sprite,
  SpriteFrame,
  Tween,
  tween,
  UITransform,
  Vec3,
} from 'cc';
import { ShutterToggleController } from './ShutterToggleController';

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
}

interface VisitorDialogueOptions {
  readonly autoCloseSeconds?: number;
  readonly allowTapDismiss?: boolean;
  readonly minimumVisibleSeconds?: number;
}

@ccclass('VisitorIntroSequenceController')
export class VisitorIntroSequenceController extends Component {
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
  private sequenceCompletion: (() => void) | null = null;

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
  }

  start(): void {
    if (!this.ready || this.hasPlayedIntro) {
      return;
    }
    this.hasPlayedIntro = true;
    const characterFrame = this.carterCharacter?.getComponent(Sprite)?.spriteFrame ?? null;
    if (!characterFrame) {
      this.playForInspectionSubject();
      return;
    }
    this.prepareInspectionSubject(characterFrame);
    this.playForInspectionSubject();
  }

  onDestroy(): void {
    this.isDestroying = true;
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

  public playForInspectionSubject(onComplete?: () => void): boolean {
    if (!this.ready || this.isDestroying) {
      return false;
    }
    if (!this.preparedCharacterFrame) {
      return false;
    }
    this.clearIntroRuntimeState();
    this.sequenceCompletion = onComplete ?? null;
    this.playIntroSequence();
    return true;
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

  private cacheFinalStates(): void {
    this.finalStatesCaptured = false;
    this.carterFinalState = this.captureTransformState(this.carterCharacter);
    this.employeeCardFinalState = this.captureTransformState(this.employeeCardVisual);
    this.applicationFormFinalState = this.captureTransformState(this.applicationFormVisual);
    this.finalStatesCaptured =
      this.carterFinalState !== null &&
      this.employeeCardFinalState !== null &&
      this.applicationFormFinalState !== null;
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

  private playIntroSequence(): void {
    if (
      !this.ready ||
      !this.shutterController ||
      !isValid(this.shutterController, true) ||
      !this.viewportUi ||
      !this.characterUi ||
      !this.finalStatesCaptured ||
      !this.inputStatesCaptured ||
      this.isDestroying
    ) {
      return;
    }
    if (!this.applyPreparedFrames()) {
      return;
    }

    this.introPlaying = true;
    this.introFinished = false;
    this.lockMainInput();
    this.shutterController.setInteractionEnabled(false);
    if (!this.shutterController.prepareClosedForIntro()) {
      console.error('[VisitorIntroSequenceController] Failed to prepare shutter closed state.');
      this.restoreButtonStates();
      return;
    }

    this.computeDocumentSpawnPositions();
    this.applyIntroInitialStates();

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
    tween(this.carterCharacter)
      .to(0.54, { position: this.carterFinalState.position.clone() }, { easing: 'cubicOut' })
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
      return;
    }

    tween(this.employeeCardVisual)
      .to(
        0.36,
        {
          position: this.employeeCardFinalState.position.clone(),
          scale: this.employeeCardFinalState.scale.clone(),
        },
        { easing: 'backOut' },
      )
      .start();

    tween(this.applicationFormVisual)
      .delay(0.09)
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

    this.restoreFinalStates();
    this.restoreButtonStates();
    if (this.shutterController && isValid(this.shutterController, true)) {
      this.shutterController.setInteractionEnabled(this.getCachedInteractable('BtnShutterHit'));
    }
    const completion = this.sequenceCompletion;
    this.sequenceCompletion = null;
    completion?.();
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
    this.sequenceCompletion = null;
    if (this.greetingDismissButton && isValid(this.greetingDismissButton, true)) {
      this.greetingDismissButton.interactable = false;
    }
    if (this.greetingRuntime && isValid(this.greetingRuntime, true)) {
      this.greetingRuntime.active = false;
    }
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

    const startX =
      -(this.viewportUi.contentSize.width / 2) - (this.characterUi.contentSize.width / 2) - 20;
    this.carterCharacter.setPosition(
      new Vec3(startX, this.carterFinalState.position.y, this.carterFinalState.position.z),
    );
    this.carterCharacter.setScale(this.carterFinalState.scale.clone());
    this.carterCharacter.setRotation(this.carterFinalState.rotation.clone());
    this.carterCharacter.active = this.carterFinalState.active;

    const cardStartScale = this.employeeCardFinalState.scale.clone().multiplyScalar(0.24);
    this.employeeCardVisual.setPosition(this.documentSpawnPosition);
    this.employeeCardVisual.setScale(cardStartScale);
    this.employeeCardVisual.setRotation(this.employeeCardFinalState.rotation.clone());
    this.employeeCardVisual.active = true;

    const formStartScale = this.applicationFormFinalState.scale.clone().multiplyScalar(0.24);
    this.applicationFormVisual.setPosition(this.applicationSpawnPosition);
    this.applicationFormVisual.setScale(formStartScale);
    this.applicationFormVisual.setRotation(this.applicationFormFinalState.rotation.clone());
    this.applicationFormVisual.active = true;
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
    this.cacheFinalStates();
    return this.finalStatesCaptured;
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
  }

  private getCachedInteractable(nodeName: string): boolean {
    return this.buttonStates.find((state) => state.nodeName === nodeName)?.interactable ?? false;
  }

  private captureTransformState(node: Node | null): TransformStateCache | null {
    if (!node || !isValid(node, true)) {
      return null;
    }
    return {
      position: node.position.clone(),
      scale: node.scale.clone(),
      rotation: node.rotation.clone(),
      active: node.active,
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
    node.active = state.active;
  }

  private shouldSkipTweenCallback(): boolean {
    return this.isDestroying || !isValid(this, true) || !isValid(this.node, true);
  }

  private normalizeDialogueSeconds(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return fallback;
    }
    return value;
  }
}
