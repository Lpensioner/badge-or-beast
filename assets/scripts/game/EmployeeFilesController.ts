import {
  _decorator,
  assetManager,
  Button,
  Component,
  EventTouch,
  isValid,
  Label,
  Mask,
  Node,
  Sprite,
  SpriteFrame,
  tween,
  Tween,
  UITransform,
  Vec3,
} from 'cc';
import {
  hideInteractivePanel,
  hideInteractivePanelImmediate,
  showInteractivePanel,
} from './InteractivePanelTransition';
import { AudioManager } from '../audio/AudioManager';
import { EMPLOYEE_PROFILES } from './inspection/EmployeeProfileCatalog';

const { ccclass } = _decorator;

const OPEN_DURATION = 0.22;
const CLOSE_DURATION = 0.18;
const OPEN_EASING = 'cubicOut' as const;
const CLOSE_EASING = 'cubicInOut' as const;
const MOVE_RATIO = 0.7;
const SAM_PORTRAIT_SPRITEFRAME_UUID = '4109284e-e557-4d77-9bbc-ec2a80ae0ac0@f9941';
const MARK_PORTRAIT_SPRITEFRAME_UUID = '7ef2a95f-1202-4dae-b870-3a7a9081053f@f9941';
const JAKE_PORTRAIT_SPRITEFRAME_UUID = '2acf45bf-0a65-4f48-8b15-c21ddb8017ea@f9941';
const ALICE_PORTRAIT_SPRITEFRAME_UUID = 'edcdcd60-e964-4dd4-aa1c-8b7efd9aafd8@f9941';
const CLARA_PORTRAIT_SPRITEFRAME_UUID = 'fc16b2e5-0f2f-4338-8a46-71271e897659@f9941';
const GRACE_PORTRAIT_SPRITEFRAME_UUID = '8c81e690-9798-424b-92ce-187d07f59875@f9941';
const MAYA_PORTRAIT_SPRITEFRAME_UUID = '248475dc-6653-4d97-b5eb-55fafd7efa14@f9941';
const PLAYER_TRUE_IDENTITY_PORTRAIT_SPRITEFRAME_UUID = '8ada3c94-c810-48f3-a7b0-2e22bb5f760b@f9941';

interface CachedButtonState {
  nodeName: string;
  button: Button;
  enabled: boolean;
  interactable: boolean;
}

interface RegisteredButtonHandler {
  button: Button;
  callback: () => void;
}

type InspectionSubjectId = 'carter' | 'ethan';
interface Day0EndingPlayerProfile {
  readonly name: string;
  readonly employeeId: string;
  readonly department: string;
  readonly position: string;
  readonly appearanceFeatures: readonly string[];
}

const DAY0_ENDING_PLAYER_PROFILE: Day0EndingPlayerProfile = Object.freeze({
  name: 'UNKNOWN',
  employeeId: 'UNKNOWN',
  department: 'AUDITOR RECORD',
  position: 'SECURITY REVIEWER',
  appearanceFeatures: Object.freeze([
    'Facial record matches your profile',
    'Identity verification incomplete',
    'Registered appearance differs from current form',
  ]),
});

export type EmployeeFileId =
  | 'carter'
  | 'ethan'
  | 'sam'
  | 'mark'
  | 'jake'
  | 'alice'
  | 'clara'
  | 'grace'
  | 'maya';

export interface EmployeeFileVisibleRules {
  readonly appearanceFeatures: readonly string[];
  readonly behavioralHabits: readonly string[];
}

export const EMPLOYEE_FILE_VISIBLE_RULES: Readonly<Record<EmployeeFileId, EmployeeFileVisibleRules>> = {
  carter: {
    appearanceFeatures: ['Orange hair', 'Orange-yellow eyeshadow', 'A mole above the collarbone'],
    behavioralHabits: [],
  },
  ethan: {
    appearanceFeatures: ['Large, prominent eyes'],
    behavioralHabits: [],
  },
  sam: {
    appearanceFeatures: ['Pale, warm-toned skin'],
    behavioralHabits: ['Carefully maintains his hairstyle'],
  },
  mark: {
    appearanceFeatures: ['Thick, prominent eyebrows', 'No facial moles'],
    behavioralHabits: [],
  },
  jake: {
    appearanceFeatures: ['Gray-blue irises'],
    behavioralHabits: ['Carefully maintains and protects his eyebrows'],
  },
  alice: {
    appearanceFeatures: ['Gray-blue irises'],
    behavioralHabits: ['Usually wears earrings'],
  },
  clara: {
    appearanceFeatures: ['Golden blonde hair'],
    behavioralHabits: ['Wears vivid red lipstick'],
  },
  grace: {
    appearanceFeatures: ['Golden blonde hair'],
    behavioralHabits: ['Does not wear necklaces'],
  },
  maya: {
    appearanceFeatures: ['A small mole near the tip of her nose'],
    behavioralHabits: ['Does not wear silver accessories'],
  },
};

interface EmployeeFileDefinition {
  readonly id: EmployeeFileId;
  readonly department: string;
  readonly departmentPhone: string;
  readonly displayName: string;
  readonly employeeId: string;
  readonly position: string;
  readonly portraitFrame: SpriteFrame;
  readonly appearanceFeatures: readonly string[];
  readonly behavioralHabits: readonly string[];
}

interface EmployeeFilePortraitFraming {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

interface EmployeeFileFallbackEntry {
  readonly department: string;
  readonly departmentPhone: string;
  readonly displayName: string;
  readonly employeeId: string;
  readonly position: string;
  readonly appearance: string;
  readonly habits: string;
  readonly portraitFrame: SpriteFrame | null;
}

const EMPLOYEE_FILE_PORTRAIT_FRAMING: Readonly<
  Partial<Record<EmployeeFileId, EmployeeFilePortraitFraming>>
> = (() => {
  const presentation = EMPLOYEE_PROFILES.jake.windowPortraitPresentation;
  if (!presentation) {
    return {};
  }
  const scale = Number.isFinite(presentation.scale) && (presentation.scale ?? 0) > 0 ? presentation.scale! : 1;
  const offsetX = Number.isFinite(presentation.offsetX) ? presentation.offsetX! : 0;
  const offsetY = Number.isFinite(presentation.offsetY) ? presentation.offsetY! : 0;
  const fileScale = scale * 1.12;
  const fileOffsetY = offsetY - 40;
  return {
    jake: {
      scale: fileScale,
      offsetX,
      offsetY: fileOffsetY,
    },
  };
})();

@ccclass('EmployeeFilesController')
export class EmployeeFilesController extends Component {
  private readonly drawerVisuals: Node[] = [];

  private readonly drawerHits: Node[] = [];

  private readonly openVisuals: Node[] = [];

  private readonly fileHits: Node[] = [];

  private readonly closedPositions: Vec3[] = [];

  private readonly openedPositions: Vec3[] = [];

  private readonly baseButtonStates: CachedButtonState[] = [];

  private readonly drawerClickHandlers: Array<() => void> = [];

  private readonly fileClickHandlers: Array<() => void> = [];

  private readonly detailTabClickHandlers: Array<() => void> = [];

  private detailCloseHandler: (() => void) | null = null;

  private readonly drawerButtons: Button[] = [];

  private readonly fileButtons: Button[] = [];

  private detailCloseButton: Button | null = null;

  private readonly detailTabHits: Node[] = [];

  private readonly detailTabButtons: Button[] = [];

  private readonly registeredDrawerHandlers: RegisteredButtonHandler[] = [];

  private readonly registeredFileHandlers: RegisteredButtonHandler[] = [];

  private readonly registeredDetailTabHandlers: RegisteredButtonHandler[] = [];

  private registeredDetailCloseHandler: RegisteredButtonHandler | null = null;

  private openRuntime: Node | null = null;

  private detailPanel: Node | null = null;

  private fileDetailContent: Node | null = null;

  private readonly fileDetailContentNodes: Node[] = [];

  private detailCloseHit: Node | null = null;

  private currentOpenIndex = -1;

  private isAnimating = false;

  private isDetailOpen = false;

  private ready = false;

  private isDestroying = false;

  private fileDepartmentLabel: Label | null = null;
  private fileDepartmentPhoneLabel: Label | null = null;
  private filePortraitSprite: Sprite | null = null;
  private fileNameLabel: Label | null = null;
  private fileEmployeeIdLabel: Label | null = null;
  private filePositionLabel: Label | null = null;
  private fileAppearanceTitleLabel: Label | null = null;
  private fileAppearanceContentLabel: Label | null = null;
  private fileHabitsTitleLabel: Label | null = null;
  private fileHabitsContentLabel: Label | null = null;
  private fileHabitsTitleNode: Node | null = null;
  private fileHabitsContentNode: Node | null = null;
  private fileStatusLabel: Label | null = null;
  private fileStatusNode: Node | null = null;
  private portraitBaseWidth = 0;
  private portraitBaseHeight = 0;
  private readonly portraitBasePosition = new Vec3();
  private readonly portraitBaseScale = new Vec3(1, 1, 1);
  private hasPortraitBaseTransform = false;
  private carterPortraitFrame: SpriteFrame | null = null;
  private ethanPortraitFrame: SpriteFrame | null = null;
  private samPortraitFrame: SpriteFrame | null = null;
  private markPortraitFrame: SpriteFrame | null = null;
  private jakePortraitFrame: SpriteFrame | null = null;
  private alicePortraitFrame: SpriteFrame | null = null;
  private claraPortraitFrame: SpriteFrame | null = null;
  private gracePortraitFrame: SpriteFrame | null = null;
  private mayaPortraitFrame: SpriteFrame | null = null;
  private playerTrueIdentityPortraitFrame: SpriteFrame | null = null;
  private samPortraitLoading = false;
  private markPortraitLoading = false;
  private jakePortraitLoading = false;
  private alicePortraitLoading = false;
  private claraPortraitLoading = false;
  private gracePortraitLoading = false;
  private mayaPortraitLoading = false;
  private playerTrueIdentityPortraitLoading = false;
  private activeEmployeeFileDrawerIndex = -1;
  private activeEmployeeFileTabIndex = 0;
  private day0EndingArchiveRevealModeActive = false;
  private day0EndingArchiveRevealProfileId: EmployeeFileId = 'ethan';
  private day0EndingArchiveRevealDetailClosedCallback: (() => void) | null = null;
  private deskEvidenceRuntime: Node | null = null;
  private outsideCloseHitRuntime: Node | null = null;

  private static readonly EXTERNAL_INTERACTION_ALLOWED_WHEN_DRAWER_OPEN = new Set<string>([
    'TelephoneHit',
    'AppointmentRosterHit',
  ]);
  private static readonly OUTSIDE_CLOSE_BLOCK_TARGET_NAMES = new Set<string>([
    'TelephoneHit',
    'AppointmentRosterHit',
    'EmployeeCardHit',
    'ApplicationFormHit',
    'ScreeningChecklistHit',
    'EmployeeDrawer01Hit',
    'EmployeeDrawer02Hit',
    'EmployeeDrawer03Hit',
    'BtnAllowHit',
    'BtnDenyHit',
    'ui_btn_help',
    'ui_btn_hint',
  ]);
  private static readonly OUTSIDE_CLOSE_HIT_NODE_NAME = 'EmployeeDrawerOutsideCloseHitRuntime';

  onLoad(): void {
    if (this.node.name !== 'EmployeeDrawersClosedRuntime') {
      this.fail('This script must be mounted on EmployeeDrawersClosedRuntime.');
      return;
    }

    if (!this.resolveNodes()) {
      return;
    }

    this.forceCloseDetailVisibility();

    if (!this.captureClosedPositions()) {
      return;
    }

    if (!this.captureBaseButtonStates()) {
      return;
    }

    this.enforceInitialState();
    this.registerEvents();
    this.resolvePortraitSourcesIfNeeded();
    this.ready = true;
  }

  onEnable(): void {
    if (!this.ready) {
      this.forceCloseDetailVisibility();
    }
  }

  onDestroy(): void {
    this.isDestroying = true;
    if (this.detailPanel && isValid(this.detailPanel, true)) {
      hideInteractivePanelImmediate(this.detailPanel, {
        setInteractable: (interactable) => this.setDetailPanelInteractable(interactable),
      });
    }
    this.unregisterEvents();
    this.stopAllTweensSafely();
    this.drawerClickHandlers.length = 0;
    this.fileClickHandlers.length = 0;
    this.detailTabClickHandlers.length = 0;
    this.baseButtonStates.length = 0;
    this.drawerButtons.length = 0;
    this.fileButtons.length = 0;
    this.detailTabButtons.length = 0;
    this.detailTabHits.length = 0;
    this.detailCloseButton = null;
    this.detailCloseHit = null;
    this.fileDetailContentNodes.length = 0;
    this.fileDetailContent = null;
    this.detailPanel = null;
    this.openRuntime = null;
    if (this.outsideCloseHitRuntime && isValid(this.outsideCloseHitRuntime, true)) {
      this.outsideCloseHitRuntime.removeFromParent();
    }
    this.outsideCloseHitRuntime = null;
    this.deskEvidenceRuntime = null;
    this.samPortraitFrame = null;
    this.markPortraitFrame = null;
    this.jakePortraitFrame = null;
    this.alicePortraitFrame = null;
    this.claraPortraitFrame = null;
    this.gracePortraitFrame = null;
    this.mayaPortraitFrame = null;
    this.playerTrueIdentityPortraitFrame = null;
    this.samPortraitLoading = false;
    this.markPortraitLoading = false;
    this.jakePortraitLoading = false;
    this.alicePortraitLoading = false;
    this.claraPortraitLoading = false;
    this.gracePortraitLoading = false;
    this.mayaPortraitLoading = false;
    this.playerTrueIdentityPortraitLoading = false;
    this.day0EndingArchiveRevealDetailClosedCallback = null;
  }

  public setActiveInspectionSubject(_subjectId: InspectionSubjectId): void {}

  public setDay0EndingArchiveRevealDetailClosedCallback(callback: (() => void) | null): void {
    this.day0EndingArchiveRevealDetailClosedCallback = callback;
  }

  public enterDay0EndingArchiveRevealMode(profileId: EmployeeFileId = 'ethan'): boolean {
    if (!this.ready || this.isAnimating || this.isDestroying || !this.isControllerAlive()) {
      return false;
    }
    this.resolvePortraitSourcesIfNeeded();
    AudioManager.getInstance()?.playCachedDrawerMove();
    this.day0EndingArchiveRevealModeActive = true;
    this.day0EndingArchiveRevealProfileId = profileId;
    this.forceCloseDetailVisibility();
    this.currentOpenIndex = -1;
    this.isAnimating = false;
    this.setOutsideCloseHitActive(false);
    this.activeEmployeeFileDrawerIndex = -1;
    this.activeEmployeeFileTabIndex = 0;
    this.restoreBaseButtonStates();
    this.setDrawerButtonsInteractable(true);

    for (let index = 0; index < this.drawerVisuals.length; index += 1) {
      if (!this.isNodeAlive(this.drawerVisuals[index]) || !this.isNodeAlive(this.drawerHits[index])) {
        continue;
      }
      this.openVisuals[index].active = true;
      this.fileHits[index].active = true;
      this.drawerVisuals[index].setPosition(this.openedPositions[index]);
      this.drawerHits[index].setPosition(this.openedPositions[index]);
      const drawerButton = this.drawerButtons[index];
      if (drawerButton && isValid(drawerButton, true)) {
        drawerButton.interactable = false;
        drawerButton.enabled = false;
      }
      const fileButton = this.fileButtons[index];
      if (fileButton && isValid(fileButton, true)) {
        fileButton.interactable = this.hasDrawerFileDetail(index);
        fileButton.enabled = this.hasDrawerFileDetail(index);
      }
    }
    return true;
  }

  public exitDay0EndingArchiveRevealMode(): void {
    if (this.isDestroying || !this.node || !this.node.isValid) {
      return;
    }
    this.day0EndingArchiveRevealModeActive = false;
    this.day0EndingArchiveRevealProfileId = 'ethan';
    this.enforceInitialState();
    this.restoreBaseButtonStates();
  }

  public closeOpenDrawerForExternalInteraction(onClosed?: () => void): boolean {
    if (!this.ready || this.isAnimating || this.isDestroying || this.isDetailOpen) {
      return false;
    }
    const openIndex = this.currentOpenIndex;
    if (openIndex < 0) {
      return false;
    }
    this.closeDrawer(openIndex, () => {
      if (!this.isControllerAlive()) {
        return;
      }
      this.restoreBaseButtonStates();
      onClosed?.();
    });
    return true;
  }

  private readonly handleDeskEvidenceTouchEnd = (event: EventTouch): void => {
    if (!this.ready || this.isDestroying || this.currentOpenIndex < 0 || this.isAnimating || this.isDetailOpen) {
      return;
    }
    if (!this.deskEvidenceRuntime || !this.isNodeAlive(this.deskEvidenceRuntime)) {
      return;
    }
    const target = event.target as Node | null;
    if (!target || !this.isNodeAlive(target)) {
      return;
    }
    if (this.isOutsideCloseBlockedTarget(target)) {
      return;
    }
    this.closeOpenDrawerForExternalInteraction();
  };

  private readonly handleOutsideCloseHitTouchEnd = (_event: EventTouch): void => {
    if (!this.ready || this.isDestroying || this.currentOpenIndex < 0 || this.isAnimating || this.isDetailOpen) {
      return;
    }
    this.closeOpenDrawerForExternalInteraction();
  };

  private isOutsideCloseBlockedTarget(target: Node): boolean {
    let cursor: Node | null = target;
    while (cursor && this.isNodeAlive(cursor)) {
      if (EmployeeFilesController.OUTSIDE_CLOSE_BLOCK_TARGET_NAMES.has(cursor.name)) {
        return true;
      }
      cursor = cursor.parent;
    }
    return false;
  }

  private createOutsideCloseHitRuntime(): void {
    if (!this.deskEvidenceRuntime || !this.isNodeAlive(this.deskEvidenceRuntime)) {
      this.outsideCloseHitRuntime = null;
      return;
    }
    let runtime = this.deskEvidenceRuntime.getChildByName(
      EmployeeFilesController.OUTSIDE_CLOSE_HIT_NODE_NAME,
    );
    if (!runtime || !this.isNodeAlive(runtime)) {
      runtime = new Node(EmployeeFilesController.OUTSIDE_CLOSE_HIT_NODE_NAME);
      runtime.layer = this.deskEvidenceRuntime.layer;
      this.deskEvidenceRuntime.insertChild(runtime, 0);
    }
    runtime.setSiblingIndex(0);
    runtime.setPosition(0, 0, 0);
    const runtimeTransform = runtime.getComponent(UITransform) ?? runtime.addComponent(UITransform);
    runtimeTransform.setAnchorPoint(0.5, 0.5);
    const drawerTransform = this.node.getComponent(UITransform);
    const deskTransform = this.deskEvidenceRuntime.getComponent(UITransform);
    const width = drawerTransform?.contentSize.width ?? deskTransform?.contentSize.width ?? 720;
    const height = drawerTransform?.contentSize.height ?? deskTransform?.contentSize.height ?? 1280;
    runtimeTransform.setContentSize(width, height);
    runtime.active = false;
    this.outsideCloseHitRuntime = runtime;
  }

  private setOutsideCloseHitActive(active: boolean): void {
    if (!this.outsideCloseHitRuntime || !this.isNodeAlive(this.outsideCloseHitRuntime)) {
      return;
    }
    this.outsideCloseHitRuntime.active = active;
  }

  private resolveNodes(): boolean {
    this.openRuntime = this.node.getChildByName('EmployeeDrawersOpenRuntime');
    if (!this.openRuntime) {
      this.fail('Missing node: EmployeeDrawersOpenRuntime');
      return false;
    }

    const drawerVisualNames = [
      'EmployeeDrawer01Visual',
      'EmployeeDrawer02Visual',
      'EmployeeDrawer03Visual',
    ];
    const drawerHitNames = [
      'EmployeeDrawer01Hit',
      'EmployeeDrawer02Hit',
      'EmployeeDrawer03Hit',
    ];
    const openVisualNames = [
      'EmployeeDrawer01OpenVisual',
      'EmployeeDrawer02OpenVisual',
      'EmployeeDrawer03OpenVisual',
    ];
    const fileHitNames = [
      'EmployeeDrawer01FileHit',
      'EmployeeDrawer02FileHit',
      'EmployeeDrawer03FileHit',
    ];

    for (const name of drawerVisualNames) {
      const node = this.node.getChildByName(name);
      if (!node) {
        this.fail(`Missing node: ${name}`);
        return false;
      }
      this.drawerVisuals.push(node);
    }

    for (const name of drawerHitNames) {
      const node = this.node.getChildByName(name);
      if (!node) {
        this.fail(`Missing node: ${name}`);
        return false;
      }
      const button = node.getComponent(Button);
      if (!button) {
        this.fail(`Missing Button on node: ${name}`);
        return false;
      }
      this.drawerHits.push(node);
      this.drawerButtons.push(button);
    }

    for (const name of openVisualNames) {
      const node = this.openRuntime.getChildByName(name);
      if (!node) {
        this.fail(`Missing node: ${name}`);
        return false;
      }
      this.openVisuals.push(node);
    }

    for (const name of fileHitNames) {
      const node = this.openRuntime.getChildByName(name);
      if (!node) {
        this.fail(`Missing node: ${name}`);
        return false;
      }
      const button = node.getComponent(Button);
      if (!button) {
        this.fail(`Missing Button on node: ${name}`);
        return false;
      }
      this.fileHits.push(node);
      this.fileButtons.push(button);
    }

    const deskEvidenceRuntime = this.node.parent;
    if (!deskEvidenceRuntime || deskEvidenceRuntime.name !== 'DeskEvidenceRuntime') {
      this.fail('Missing node: DeskEvidenceRuntime');
      return false;
    }
    this.deskEvidenceRuntime = deskEvidenceRuntime;
    this.createOutsideCloseHitRuntime();

    const canvas = deskEvidenceRuntime.parent;
    if (!canvas || canvas.name !== 'Canvas') {
      this.fail('Missing node: Canvas');
      return false;
    }

    this.detailPanel = canvas.getChildByName('EmployeeFileDetailPanelRuntime');
    if (!this.detailPanel) {
      this.fail('Missing node: EmployeeFileDetailPanelRuntime');
      return false;
    }

    this.fileDetailContent = this.detailPanel.getChildByName('EmployeeFileDetailContentRuntime');
    if (!this.fileDetailContent) {
      this.fail('Missing node: EmployeeFileDetailContentRuntime');
      return false;
    }
    this.fileDetailContentNodes.length = 0;
    const contentNodeNames = [
      'FileDepartmentLabel',
      'FileDepartmentPhoneLabel',
      'FilePortraitSprite',
      'FileNameLabel',
      'FileEmployeeIdLabel',
      'FilePositionLabel',
      'FileAppearanceTitleLabel',
      'FileAppearanceContentLabel',
      'FileHabitsTitleLabel',
      'FileHabitsContentLabel',
    ];
    for (const name of contentNodeNames) {
      const contentNode = this.fileDetailContent.getChildByName(name);
      if (!contentNode) {
        this.fail(`Missing node: ${name}`);
        return false;
      }
      this.fileDetailContentNodes.push(contentNode);
    }

    this.fileDepartmentLabel =
      this.fileDetailContent.getChildByName('FileDepartmentLabel')?.getComponent(Label) ?? null;
    this.fileDepartmentPhoneLabel =
      this.fileDetailContent.getChildByName('FileDepartmentPhoneLabel')?.getComponent(Label) ?? null;
    this.filePortraitSprite =
      this.fileDetailContent.getChildByName('FilePortraitSprite')?.getComponent(Sprite) ?? null;
    this.fileNameLabel = this.fileDetailContent.getChildByName('FileNameLabel')?.getComponent(Label) ?? null;
    this.fileEmployeeIdLabel =
      this.fileDetailContent.getChildByName('FileEmployeeIdLabel')?.getComponent(Label) ?? null;
    this.filePositionLabel =
      this.fileDetailContent.getChildByName('FilePositionLabel')?.getComponent(Label) ?? null;
    this.fileAppearanceTitleLabel =
      this.fileDetailContent.getChildByName('FileAppearanceTitleLabel')?.getComponent(Label) ?? null;
    this.fileAppearanceContentLabel =
      this.fileDetailContent.getChildByName('FileAppearanceContentLabel')?.getComponent(Label) ?? null;
    this.fileHabitsTitleLabel =
      this.fileDetailContent.getChildByName('FileHabitsTitleLabel')?.getComponent(Label) ?? null;
    this.fileHabitsContentLabel =
      this.fileDetailContent.getChildByName('FileHabitsContentLabel')?.getComponent(Label) ?? null;
    this.fileHabitsTitleNode = this.fileHabitsTitleLabel?.node ?? null;
    this.fileHabitsContentNode = this.fileHabitsContentLabel?.node ?? null;
    this.fileStatusNode = this.fileDetailContent.getChildByName('FileStatusLabel') ?? null;
    this.fileStatusLabel = this.fileStatusNode?.getComponent(Label) ?? null;
    const portraitTransform = this.filePortraitSprite?.getComponent(UITransform) ?? null;
    if (portraitTransform) {
      this.portraitBaseWidth = portraitTransform.contentSize.width;
      this.portraitBaseHeight = portraitTransform.contentSize.height;
    }
    this.ensurePortraitMaskContainer();
    const portraitNode = this.filePortraitSprite?.node ?? null;
    if (portraitNode && isValid(portraitNode, true)) {
      this.portraitBasePosition.set(portraitNode.position.x, portraitNode.position.y, portraitNode.position.z);
      this.portraitBaseScale.set(portraitNode.scale.x, portraitNode.scale.y, portraitNode.scale.z);
      this.hasPortraitBaseTransform = true;
    }

    this.detailCloseHit = this.detailPanel.getChildByName('EmployeeFileDetailCloseHit');
    if (!this.detailCloseHit) {
      this.fail('Missing node: EmployeeFileDetailCloseHit');
      return false;
    }
    this.detailCloseButton = this.detailCloseHit.getComponent(Button);
    if (!this.detailCloseButton) {
      this.fail('Missing Button on node: EmployeeFileDetailCloseHit');
      return false;
    }

    const detailTabNames = [
      'EmployeeFileDetailTab01Hit',
      'EmployeeFileDetailTab02Hit',
      'EmployeeFileDetailTab03Hit',
      'EmployeeFileDetailTab04Hit',
    ];
    for (const name of detailTabNames) {
      const node = this.detailPanel.getChildByName(name);
      if (!node) {
        this.fail(`Missing node: ${name}`);
        return false;
      }
      const button = node.getComponent(Button);
      if (!button) {
        this.fail(`Missing Button on node: ${name}`);
        return false;
      }
      this.detailTabHits.push(node);
      this.detailTabButtons.push(button);
    }

    const consoleControls = canvas.getChildByName('ConsoleControls');
    if (!consoleControls) {
      this.fail('Missing node: ConsoleControls');
      return false;
    }

    const deskHitNames = [
      'EmployeeCardHit',
      'ApplicationFormHit',
      'ScreeningChecklistHit',
      'TelephoneHit',
      'AppointmentRosterHit',
    ];
    const consoleHitNames = ['BtnShutterHit', 'BtnAllowHit', 'BtnDenyHit'];

    for (const name of deskHitNames) {
      const node = deskEvidenceRuntime.getChildByName(name);
      if (!node) {
        this.fail(`Missing node: ${name}`);
        return false;
      }
      if (!node.getComponent(Button)) {
        this.fail(`Missing Button on node: ${name}`);
        return false;
      }
    }

    for (const name of consoleHitNames) {
      const node = consoleControls.getChildByName(name);
      if (!node) {
        this.fail(`Missing node: ${name}`);
        return false;
      }
      if (!node.getComponent(Button)) {
        this.fail(`Missing Button on node: ${name}`);
        return false;
      }
    }

    return true;
  }

  private captureClosedPositions(): boolean {
    this.closedPositions.length = 0;
    this.openedPositions.length = 0;

    for (let index = 0; index < this.drawerVisuals.length; index += 1) {
      const visual = this.drawerVisuals[index];
      const uiTransform = visual.getComponent(UITransform);
      if (!uiTransform) {
        this.fail(`Missing UITransform on node: ${visual.name}`);
        return false;
      }

      const closedPosition = visual.position.clone();
      this.closedPositions.push(closedPosition);

      const moveDistance = uiTransform.contentSize.height * MOVE_RATIO;
      this.openedPositions.push(
        new Vec3(closedPosition.x, closedPosition.y - moveDistance, closedPosition.z),
      );

      this.drawerHits[index].setPosition(closedPosition);
      visual.setPosition(closedPosition);
    }

    return true;
  }

  private captureBaseButtonStates(): boolean {
    this.baseButtonStates.length = 0;

    const deskEvidenceRuntime = this.node.parent;
    const canvas = deskEvidenceRuntime?.parent;
    const consoleControls = canvas?.getChildByName('ConsoleControls') ?? null;
    if (!deskEvidenceRuntime || !consoleControls) {
      this.fail('Unable to cache base button states.');
      return false;
    }

    const nodeNames = [
      'EmployeeCardHit',
      'ApplicationFormHit',
      'ScreeningChecklistHit',
      'TelephoneHit',
      'AppointmentRosterHit',
      'BtnShutterHit',
      'BtnAllowHit',
      'BtnDenyHit',
    ];

    for (const name of nodeNames) {
      const owner =
        name.startsWith('Btn') ? consoleControls : deskEvidenceRuntime;
      const node = owner.getChildByName(name);
      const button = node?.getComponent(Button) ?? null;
      if (!button) {
        this.fail(`Missing Button on node: ${name}`);
        return false;
      }
      this.baseButtonStates.push({
        nodeName: name,
        button,
        enabled: button.enabled,
        interactable: button.interactable,
      });
    }

    return true;
  }

  private enforceInitialState(): void {
    this.currentOpenIndex = -1;
    this.isAnimating = false;
    this.activeEmployeeFileDrawerIndex = -1;
    this.activeEmployeeFileTabIndex = 0;
    this.forceCloseDetailVisibility();
    this.setOutsideCloseHitActive(false);
    this.setDetailTabInteractable([false, false, false, false]);

    for (let index = 0; index < this.drawerVisuals.length; index += 1) {
      this.openVisuals[index].active = false;
      this.fileHits[index].active = false;
      this.drawerVisuals[index].setPosition(this.closedPositions[index]);
      this.drawerHits[index].setPosition(this.closedPositions[index]);
    }
  }

  private forceCloseDetailVisibility(): void {
    this.isDetailOpen = false;
    this.setFileDetailContentVisible(false);

    if (this.detailPanel && isValid(this.detailPanel, true)) {
      hideInteractivePanelImmediate(this.detailPanel, {
        setInteractable: (interactable) => this.setDetailPanelInteractable(interactable),
      });
    }
  }

  private setDetailPanelInteractable(interactable: boolean): void {
    if (this.detailCloseButton && isValid(this.detailCloseButton, true)) {
      this.detailCloseButton.interactable = interactable;
    }
    if (!interactable) {
      this.setDetailTabInteractable([false, false, false, false]);
      return;
    }
    if (this.day0EndingArchiveRevealModeActive) {
      this.setDetailTabInteractable([false, false, false, false]);
      return;
    }
    if (this.activeEmployeeFileDrawerIndex === 0) {
      this.setDetailTabInteractable([true, true, true, false]);
      return;
    }
    if (this.activeEmployeeFileDrawerIndex === 1) {
      this.setDetailTabInteractable([true, true, false, false]);
      return;
    }
    if (this.activeEmployeeFileDrawerIndex === 2) {
      this.setDetailTabInteractable([true, true, true, true]);
      return;
    }
    this.setDetailTabInteractable([false, false, false, false]);
  }

  private setFileDetailContentVisible(visible: boolean): void {
    if (this.isDestroying) {
      return;
    }
    if (!this.fileDetailContent || !isValid(this.fileDetailContent, true)) {
      return;
    }
    for (const node of this.fileDetailContentNodes) {
      if (!isValid(node, true)) {
        return;
      }
    }
    for (const node of this.fileDetailContentNodes) {
      node.active = visible;
    }
    this.fileDetailContent.active = visible;
  }

  private registerEvents(): void {
    this.registeredDrawerHandlers.length = 0;
    this.registeredFileHandlers.length = 0;
    this.registeredDetailTabHandlers.length = 0;
    this.registeredDetailCloseHandler = null;

    for (let index = 0; index < this.drawerButtons.length; index += 1) {
      const button = this.drawerButtons[index];
      if (!isValid(button, true) || !isValid(button.node, true)) {
        continue;
      }
      const handler = (): void => {
        this.handleDrawerClick(index);
      };
      this.drawerClickHandlers.push(handler);
      button.node.on(Button.EventType.CLICK, handler, this);
      this.registeredDrawerHandlers.push({
        button,
        callback: handler,
      });
    }

    for (let index = 0; index < this.fileButtons.length; index += 1) {
      const button = this.fileButtons[index];
      if (!isValid(button, true) || !isValid(button.node, true)) {
        continue;
      }
      const handler = (): void => {
        this.handleFileClick(index);
      };
      this.fileClickHandlers.push(handler);
      button.node.on(Button.EventType.CLICK, handler, this);
      this.registeredFileHandlers.push({
        button,
        callback: handler,
      });
    }

    for (let index = 0; index < this.detailTabButtons.length; index += 1) {
      const button = this.detailTabButtons[index];
      if (!isValid(button, true) || !isValid(button.node, true)) {
        continue;
      }
      const handler = (): void => {
        this.selectEmployeeFileDetailTab(index);
      };
      this.detailTabClickHandlers.push(handler);
      button.node.on(Button.EventType.CLICK, handler, this);
      this.registeredDetailTabHandlers.push({
        button,
        callback: handler,
      });
    }

    this.detailCloseHandler = (): void => {
      AudioManager.getInstance()?.playCachedSettingsClick();
      this.closeFileDetail();
    };
    if (
      this.detailCloseButton &&
      this.detailCloseHandler &&
      isValid(this.detailCloseButton, true) &&
      isValid(this.detailCloseButton.node, true)
    ) {
      this.detailCloseButton.node.on(Button.EventType.CLICK, this.detailCloseHandler, this);
      this.registeredDetailCloseHandler = {
        button: this.detailCloseButton,
        callback: this.detailCloseHandler,
      };
    }
    if (this.deskEvidenceRuntime && isValid(this.deskEvidenceRuntime, true)) {
      this.deskEvidenceRuntime.on(Node.EventType.TOUCH_END, this.handleDeskEvidenceTouchEnd, this);
    }
    if (this.outsideCloseHitRuntime && isValid(this.outsideCloseHitRuntime, true)) {
      this.outsideCloseHitRuntime.on(Node.EventType.TOUCH_END, this.handleOutsideCloseHitTouchEnd, this);
    }
  }

  private unregisterEvents(): void {
    for (const entry of this.registeredDrawerHandlers) {
      if (
        entry.button &&
        isValid(entry.button, true) &&
        entry.button.node &&
        isValid(entry.button.node, true)
      ) {
        entry.button.node.off(Button.EventType.CLICK, entry.callback, this);
      }
    }
    this.registeredDrawerHandlers.length = 0;

    for (const entry of this.registeredFileHandlers) {
      if (
        entry.button &&
        isValid(entry.button, true) &&
        entry.button.node &&
        isValid(entry.button.node, true)
      ) {
        entry.button.node.off(Button.EventType.CLICK, entry.callback, this);
      }
    }
    this.registeredFileHandlers.length = 0;

    for (const entry of this.registeredDetailTabHandlers) {
      if (
        entry.button &&
        isValid(entry.button, true) &&
        entry.button.node &&
        isValid(entry.button.node, true)
      ) {
        entry.button.node.off(Button.EventType.CLICK, entry.callback, this);
      }
    }
    this.registeredDetailTabHandlers.length = 0;

    if (
      this.registeredDetailCloseHandler &&
      isValid(this.registeredDetailCloseHandler.button, true) &&
      isValid(this.registeredDetailCloseHandler.button.node, true)
    ) {
      this.registeredDetailCloseHandler.button.node.off(
        Button.EventType.CLICK,
        this.registeredDetailCloseHandler.callback,
        this,
      );
    }
    this.registeredDetailCloseHandler = null;
    this.detailCloseHandler = null;
    if (this.deskEvidenceRuntime && isValid(this.deskEvidenceRuntime, true)) {
      this.deskEvidenceRuntime.off(Node.EventType.TOUCH_END, this.handleDeskEvidenceTouchEnd, this);
    }
    if (this.outsideCloseHitRuntime && isValid(this.outsideCloseHitRuntime, true)) {
      this.outsideCloseHitRuntime.off(Node.EventType.TOUCH_END, this.handleOutsideCloseHitTouchEnd, this);
    }
  }

  private handleDrawerClick(index: number): void {
    if (!this.ready || this.isAnimating || this.isDetailOpen) {
      return;
    }
    if (this.day0EndingArchiveRevealModeActive) {
      // In Day0 ending reveal, only exposed file hits should open detail.
      return;
    }

    if (this.currentOpenIndex === index) {
      this.closeDrawer(index);
      return;
    }

    if (this.currentOpenIndex >= 0) {
      this.switchDrawer(index);
      return;
    }

    this.openDrawer(index);
  }

  private openDrawer(index: number): void {
    if (!this.ready || this.isAnimating || this.isDestroying || !this.isControllerAlive()) {
      return;
    }

    AudioManager.getInstance()?.playCachedDrawerMove();

    this.isAnimating = true;
    this.currentOpenIndex = index;
    this.setOutsideCloseHitActive(true);
    this.openVisuals[index].active = true;
    this.setBaseButtonsInteractable(false);

    const visual = this.drawerVisuals[index];
    const hit = this.drawerHits[index];
    const target = this.openedPositions[index];

    Tween.stopAllByTarget(visual);
    Tween.stopAllByTarget(hit);

    tween(visual).to(OPEN_DURATION, { position: target }, { easing: OPEN_EASING }).start();
    tween(hit)
      .to(OPEN_DURATION, { position: target }, { easing: OPEN_EASING })
      .call(() => {
        if (!this.isControllerAlive() || !this.isNodeAlive(this.fileHits[index])) {
          return;
        }
        this.fileHits[index].active = true;
        if (this.fileButtons[index] && isValid(this.fileButtons[index], true)) {
          this.fileButtons[index].interactable = this.hasDrawerFileDetail(index);
        }
        this.isAnimating = false;
      })
      .start();
  }

  private closeDrawer(index: number, onComplete?: () => void): void {
    if (!this.ready || this.isAnimating || this.isDestroying || !this.isControllerAlive()) {
      return;
    }

    AudioManager.getInstance()?.playCachedDrawerMove();

    this.isAnimating = true;
    this.fileHits[index].active = false;

    const visual = this.drawerVisuals[index];
    const hit = this.drawerHits[index];
    const target = this.closedPositions[index];

    Tween.stopAllByTarget(visual);
    Tween.stopAllByTarget(hit);

    tween(visual).to(CLOSE_DURATION, { position: target }, { easing: CLOSE_EASING }).start();
    tween(hit)
      .to(CLOSE_DURATION, { position: target }, { easing: CLOSE_EASING })
      .call(() => {
        if (!this.isControllerAlive() || !this.isNodeAlive(this.openVisuals[index])) {
          return;
        }
        this.openVisuals[index].active = false;
        if (this.currentOpenIndex === index) {
          this.currentOpenIndex = -1;
        }
        if (this.currentOpenIndex === -1) {
          this.setOutsideCloseHitActive(false);
        }
        this.isAnimating = false;
        if (onComplete) {
          onComplete();
        } else if (this.currentOpenIndex === -1 && !this.isDetailOpen) {
          this.restoreBaseButtonStates();
        }
      })
      .start();
  }

  private switchDrawer(index: number): void {
    const previousIndex = this.currentOpenIndex;
    if (previousIndex < 0) {
      this.openDrawer(index);
      return;
    }

    this.closeDrawer(previousIndex, () => {
      this.openDrawer(index);
    });
  }

  private handleFileClick(index: number): void {
    if (!this.ready || this.isAnimating || this.isDetailOpen) {
      return;
    }
    if (this.day0EndingArchiveRevealModeActive) {
      this.openDay0EndingArchiveRevealProfile(index);
      return;
    }

    if (index !== this.currentOpenIndex) {
      return;
    }
    if (!this.hasDrawerFileDetail(index)) {
      return;
    }

    this.openFileDetail(index);
  }

  private openFileDetail(index: number): void {
    if (
      !this.ready ||
      this.isAnimating ||
      this.isDetailOpen ||
      !this.detailPanel ||
      !this.fileDetailContent ||
      this.isDestroying ||
      !this.isControllerAlive() ||
      !this.isNodeAlive(this.detailPanel) ||
      !this.isNodeAlive(this.fileDetailContent)
    ) {
      return;
    }

    if (index !== this.currentOpenIndex) {
      return;
    }

    AudioManager.getInstance()?.playCachedDocumentFlip();
    this.setDrawerButtonsInteractable(false);

    for (const fileHit of this.fileHits) {
      if (this.isNodeAlive(fileHit)) {
        fileHit.active = false;
      }
    }

    this.activeEmployeeFileDrawerIndex = index;
    this.activeEmployeeFileTabIndex = 0;
    if (index === 0) {
      this.setDetailTabInteractable([true, true, true, false]);
    } else if (index === 1) {
      this.setDetailTabInteractable([true, true, false, false]);
    } else if (index === 2) {
      this.setDetailTabInteractable([true, true, true, true]);
    } else {
      this.setDetailTabInteractable([false, false, false, false]);
    }

    showInteractivePanel(this.detailPanel, {
      setInteractable: (interactable) => this.setDetailPanelInteractable(interactable),
    });
    this.setFileDetailContentVisible(true);
    if (!this.applyEmployeeFileEntry(this.activeEmployeeFileDrawerIndex, this.activeEmployeeFileTabIndex)) {
      this.setFileDetailContentVisible(false);
      hideInteractivePanelImmediate(this.detailPanel, {
        setInteractable: (interactable) => this.setDetailPanelInteractable(interactable),
      });
      this.setDrawerButtonsInteractable(true);
      if (this.currentOpenIndex >= 0 && this.isNodeAlive(this.fileHits[this.currentOpenIndex])) {
        this.fileHits[this.currentOpenIndex].active = true;
      }
      return;
    }
    this.isDetailOpen = true;
  }

  private openDay0EndingArchiveRevealProfile(index: number): void {
    if (
      !this.ready ||
      this.isAnimating ||
      this.isDetailOpen ||
      !this.detailPanel ||
      !this.fileDetailContent ||
      this.isDestroying ||
      !this.isControllerAlive() ||
      !this.isNodeAlive(this.detailPanel) ||
      !this.isNodeAlive(this.fileDetailContent)
    ) {
      return;
    }

    const revealDefinition = this.getDay0EndingArchiveRevealDefinition();
    if (!revealDefinition) {
      return;
    }

    AudioManager.getInstance()?.playCachedDocumentFlip();
    this.activeEmployeeFileDrawerIndex = index;
    this.activeEmployeeFileTabIndex = 0;
    this.currentOpenIndex = index;
    this.setDetailTabInteractable([false, false, false, false]);
    this.setDrawerButtonsInteractable(false);
    this.setFileDetailContentVisible(true);

    showInteractivePanel(this.detailPanel, {
      setInteractable: (interactable) => this.setDetailPanelInteractable(interactable),
    });

    if (!this.applyEmployeeFileDefinition(revealDefinition)) {
      this.setFileDetailContentVisible(false);
      hideInteractivePanelImmediate(this.detailPanel, {
        setInteractable: (interactable) => this.setDetailPanelInteractable(interactable),
      });
      this.setDrawerButtonsInteractable(true);
      return;
    }
    this.isDetailOpen = true;
  }

  private getDay0EndingArchiveRevealDefinition(): EmployeeFileDefinition | null {
    this.resolvePortraitSourcesIfNeeded();
    if (this.day0EndingArchiveRevealProfileId === 'ethan' && this.playerTrueIdentityPortraitFrame) {
      return {
        id: 'ethan',
        department: DAY0_ENDING_PLAYER_PROFILE.department,
        departmentPhone: 'UNKNOWN',
        displayName: DAY0_ENDING_PLAYER_PROFILE.name,
        employeeId: DAY0_ENDING_PLAYER_PROFILE.employeeId,
        position: DAY0_ENDING_PLAYER_PROFILE.position,
        portraitFrame: this.playerTrueIdentityPortraitFrame,
        appearanceFeatures: DAY0_ENDING_PLAYER_PROFILE.appearanceFeatures,
        behavioralHabits: [],
      };
    }
    return null;
  }

  private applyEmployeeFileEntry(drawerIndex: number, tabIndex: number): boolean {
    if (drawerIndex === 0 && tabIndex === 2 && !this.samPortraitFrame) {
      this.resolvePortraitSourcesIfNeeded();
      return false;
    }
    if (drawerIndex === 1 && tabIndex === 0 && !this.markPortraitFrame) {
      this.resolvePortraitSourcesIfNeeded();
      return false;
    }
    if (drawerIndex === 1 && tabIndex === 1 && !this.jakePortraitFrame) {
      this.resolvePortraitSourcesIfNeeded();
      return false;
    }
    if (drawerIndex === 2 && tabIndex === 0 && !this.alicePortraitFrame) {
      this.resolvePortraitSourcesIfNeeded();
      return false;
    }
    if (drawerIndex === 2 && tabIndex === 1 && !this.claraPortraitFrame) {
      this.resolvePortraitSourcesIfNeeded();
      return false;
    }
    if (drawerIndex === 2 && tabIndex === 2 && !this.gracePortraitFrame) {
      this.resolvePortraitSourcesIfNeeded();
      return false;
    }
    if (drawerIndex === 2 && tabIndex === 3 && !this.mayaPortraitFrame) {
      this.resolvePortraitSourcesIfNeeded();
      return false;
    }
    const definition = this.getEmployeeFileDefinition(drawerIndex, tabIndex);
    if (definition) {
      return this.applyEmployeeFileDefinition(definition);
    }
    const fallbackEntry = this.getFallbackEmployeeFileEntry(drawerIndex);
    return this.applyFallbackEmployeeFileEntry(fallbackEntry);
  }

  private getEmployeeFileDefinition(drawerIndex: number, tabIndex: number): EmployeeFileDefinition | null {
    this.resolvePortraitSourcesIfNeeded();
    if (drawerIndex === 0 && tabIndex === 0 && this.carterPortraitFrame) {
      const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES.carter;
      return {
        id: 'carter',
        department: 'Research Department',
        departmentPhone: '9527',
        displayName: 'Carter',
        employeeId: '017320',
        position: 'Researcher',
        portraitFrame: this.carterPortraitFrame,
        appearanceFeatures: visibleRules.appearanceFeatures,
        behavioralHabits: visibleRules.behavioralHabits,
      };
    }
    if (drawerIndex === 0 && tabIndex === 1 && this.ethanPortraitFrame) {
      const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES.ethan;
      return {
        id: 'ethan',
        department: 'Research Department',
        departmentPhone: '9527',
        displayName: 'Ethan',
        employeeId: '867530',
        position: 'Research Assistant',
        portraitFrame: this.ethanPortraitFrame,
        appearanceFeatures: visibleRules.appearanceFeatures,
        behavioralHabits: visibleRules.behavioralHabits,
      };
    }
    if (drawerIndex === 0 && tabIndex === 2 && this.samPortraitFrame) {
      const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES.sam;
      return {
        id: 'sam',
        department: 'Research Department',
        departmentPhone: '9527',
        displayName: 'Sam',
        employeeId: '481206',
        position: 'Research Team Lead',
        portraitFrame: this.samPortraitFrame,
        appearanceFeatures: visibleRules.appearanceFeatures,
        behavioralHabits: visibleRules.behavioralHabits,
      };
    }
    if (drawerIndex === 1 && tabIndex === 0 && this.markPortraitFrame) {
      const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES.mark;
      return {
        id: 'mark',
        department: 'Production Department',
        departmentPhone: '6842',
        displayName: 'Mark',
        employeeId: '624817',
        position: 'Production Manager',
        portraitFrame: this.markPortraitFrame,
        appearanceFeatures: visibleRules.appearanceFeatures,
        behavioralHabits: visibleRules.behavioralHabits,
      };
    }
    if (drawerIndex === 1 && tabIndex === 1 && this.jakePortraitFrame) {
      const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES.jake;
      return {
        id: 'jake',
        department: 'Production Department',
        departmentPhone: '6842',
        displayName: 'Jake',
        employeeId: '624935',
        position: 'Production Technician',
        portraitFrame: this.jakePortraitFrame,
        appearanceFeatures: visibleRules.appearanceFeatures,
        behavioralHabits: visibleRules.behavioralHabits,
      };
    }
    if (drawerIndex === 2 && tabIndex === 0 && this.alicePortraitFrame) {
      const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES.alice;
      return {
        id: 'alice',
        department: 'Sales Department',
        departmentPhone: '7716',
        displayName: 'Alice',
        employeeId: '731204',
        position: 'Sales Associate',
        portraitFrame: this.alicePortraitFrame,
        appearanceFeatures: visibleRules.appearanceFeatures,
        behavioralHabits: visibleRules.behavioralHabits,
      };
    }
    if (drawerIndex === 2 && tabIndex === 1 && this.claraPortraitFrame) {
      const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES.clara;
      return {
        id: 'clara',
        department: 'Sales Department',
        departmentPhone: '7716',
        displayName: 'Clara',
        employeeId: '731318',
        position: 'Sales Supervisor',
        portraitFrame: this.claraPortraitFrame,
        appearanceFeatures: visibleRules.appearanceFeatures,
        behavioralHabits: visibleRules.behavioralHabits,
      };
    }
    if (drawerIndex === 2 && tabIndex === 2 && this.gracePortraitFrame) {
      const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES.grace;
      return {
        id: 'grace',
        department: 'Sales Department',
        departmentPhone: '7716',
        displayName: 'Grace',
        employeeId: '731426',
        position: 'Sales Associate',
        portraitFrame: this.gracePortraitFrame,
        appearanceFeatures: visibleRules.appearanceFeatures,
        behavioralHabits: visibleRules.behavioralHabits,
      };
    }
    if (drawerIndex === 2 && tabIndex === 3 && this.mayaPortraitFrame) {
      const visibleRules = EMPLOYEE_FILE_VISIBLE_RULES.maya;
      return {
        id: 'maya',
        department: 'Sales Department',
        departmentPhone: '7716',
        displayName: 'Maya',
        employeeId: '731587',
        position: 'Sales Intern',
        portraitFrame: this.mayaPortraitFrame,
        appearanceFeatures: visibleRules.appearanceFeatures,
        behavioralHabits: visibleRules.behavioralHabits,
      };
    }
    return null;
  }

  private getFallbackEmployeeFileEntry(drawerIndex: number): EmployeeFileFallbackEntry {
    this.resolvePortraitSourcesIfNeeded();
    return {
      displayName: '—',
      employeeId: 'Employee ID: —',
      department: '—',
      departmentPhone: 'Department Phone: —',
      position: 'Position: —',
      appearance: '—',
      habits: '—',
      portraitFrame: null,
    };
  }

  private applyEmployeeFileDefinition(definition: EmployeeFileDefinition): boolean {
    if (this.fileDepartmentLabel) {
      this.fileDepartmentLabel.string = definition.department;
    }
    if (this.fileDepartmentPhoneLabel) {
      this.fileDepartmentPhoneLabel.string = `Department Phone: ${definition.departmentPhone}`;
    }
    if (this.fileNameLabel) {
      this.fileNameLabel.string = definition.displayName;
    }
    if (this.fileEmployeeIdLabel) {
      this.fileEmployeeIdLabel.string = `Employee ID: ${definition.employeeId}`;
    }
    if (this.filePositionLabel) {
      this.filePositionLabel.string = `Position: ${definition.position}`;
    }
    if (this.fileAppearanceContentLabel) {
      this.fileAppearanceContentLabel.string = this.formatFeatureList(definition.appearanceFeatures);
    }
    if (this.fileAppearanceTitleLabel?.node && isValid(this.fileAppearanceTitleLabel.node, true)) {
      this.fileAppearanceTitleLabel.node.active = true;
    }
    if (this.filePortraitSprite) {
      this.filePortraitSprite.spriteFrame = definition.portraitFrame;
      this.applyPortraitContainSize(definition.portraitFrame);
      this.applyPortraitFraming(definition.id);
    }
    const hasBehavioralHabits = definition.behavioralHabits.length > 0;
    if (this.fileHabitsTitleNode && isValid(this.fileHabitsTitleNode, true)) {
      this.fileHabitsTitleNode.active = hasBehavioralHabits;
    }
    if (this.fileHabitsContentNode && isValid(this.fileHabitsContentNode, true)) {
      this.fileHabitsContentNode.active = hasBehavioralHabits;
    }
    if (this.fileHabitsContentLabel) {
      this.fileHabitsContentLabel.string = hasBehavioralHabits
        ? this.formatFeatureList(definition.behavioralHabits)
        : '';
    }
    this.applyStatusVisibilityPolicy();
    return true;
  }

  private applyFallbackEmployeeFileEntry(entry: EmployeeFileFallbackEntry): boolean {
    if (this.fileDepartmentLabel) {
      this.fileDepartmentLabel.string = entry.department;
    }
    if (this.fileDepartmentPhoneLabel) {
      this.fileDepartmentPhoneLabel.string = entry.departmentPhone;
    }
    if (this.fileNameLabel) {
      this.fileNameLabel.string = entry.displayName;
    }
    if (this.fileEmployeeIdLabel) {
      this.fileEmployeeIdLabel.string = entry.employeeId;
    }
    if (this.filePositionLabel) {
      this.filePositionLabel.string = entry.position;
    }
    if (this.fileAppearanceContentLabel) {
      this.fileAppearanceContentLabel.string = entry.appearance;
    }
    if (this.fileHabitsTitleNode && isValid(this.fileHabitsTitleNode, true)) {
      this.fileHabitsTitleNode.active = true;
    }
    if (this.fileHabitsContentNode && isValid(this.fileHabitsContentNode, true)) {
      this.fileHabitsContentNode.active = true;
    }
    if (this.fileHabitsContentLabel) {
      this.fileHabitsContentLabel.string = entry.habits;
    }
    if (this.filePortraitSprite) {
      this.filePortraitSprite.spriteFrame = entry.portraitFrame;
      this.applyPortraitContainSize(entry.portraitFrame);
      this.applyPortraitFraming(null);
    }
    this.applyStatusVisibilityPolicy();
    return true;
  }

  private resolvePortraitSourcesIfNeeded(): void {
    if (!this.carterPortraitFrame && this.filePortraitSprite?.spriteFrame) {
      this.carterPortraitFrame = this.filePortraitSprite.spriteFrame;
    }
    if (!this.ethanPortraitFrame) {
      const canvas = this.node.parent?.parent;
      const assetSources = canvas?.getChildByName('InspectionSubjectAssetSources') ?? null;
      const ethanPortraitSource = assetSources?.getChildByName('EthanPortraitSource') ?? null;
      const ethanPortraitSprite = ethanPortraitSource?.getComponent(Sprite) ?? null;
      this.ethanPortraitFrame = ethanPortraitSprite?.spriteFrame ?? null;
    }
    this.loadSamPortraitIfNeeded();
    this.loadMarkPortraitIfNeeded();
    this.loadJakePortraitIfNeeded();
    this.loadAlicePortraitIfNeeded();
    this.loadClaraPortraitIfNeeded();
    this.loadGracePortraitIfNeeded();
    this.loadMayaPortraitIfNeeded();
    this.loadPlayerTrueIdentityPortraitIfNeeded();
  }

  private loadSamPortraitIfNeeded(): void {
    if (this.samPortraitFrame || this.samPortraitLoading) {
      return;
    }
    this.samPortraitLoading = true;
    assetManager.loadAny(SAM_PORTRAIT_SPRITEFRAME_UUID, (error, asset) => {
      this.samPortraitLoading = false;
      if (error) {
        console.warn('[EmployeeFilesController] Failed to load Sam portrait sprite frame.', error);
        return;
      }
      const frame = asset as SpriteFrame | null;
      if (!frame) {
        return;
      }
      this.samPortraitFrame = frame;
      if (
        this.isDetailOpen &&
        this.activeEmployeeFileDrawerIndex === 0 &&
        this.activeEmployeeFileTabIndex === 2
      ) {
        this.applyEmployeeFileEntry(this.activeEmployeeFileDrawerIndex, this.activeEmployeeFileTabIndex);
      }
    });
  }

  private loadMarkPortraitIfNeeded(): void {
    if (this.markPortraitFrame || this.markPortraitLoading) {
      return;
    }
    this.markPortraitLoading = true;
    assetManager.loadAny(MARK_PORTRAIT_SPRITEFRAME_UUID, (error, asset) => {
      this.markPortraitLoading = false;
      if (error) {
        console.warn('[EmployeeFilesController] Failed to load Mark portrait sprite frame.', error);
        return;
      }
      const frame = asset as SpriteFrame | null;
      if (!frame) {
        return;
      }
      this.markPortraitFrame = frame;
      if (
        this.isDetailOpen &&
        this.activeEmployeeFileDrawerIndex === 1 &&
        this.activeEmployeeFileTabIndex === 0
      ) {
        this.applyEmployeeFileEntry(this.activeEmployeeFileDrawerIndex, this.activeEmployeeFileTabIndex);
      }
    });
  }

  private loadJakePortraitIfNeeded(): void {
    if (this.jakePortraitFrame || this.jakePortraitLoading) {
      return;
    }
    this.jakePortraitLoading = true;
    assetManager.loadAny(JAKE_PORTRAIT_SPRITEFRAME_UUID, (error, asset) => {
      this.jakePortraitLoading = false;
      if (error) {
        console.warn('[EmployeeFilesController] Failed to load Jake portrait sprite frame.', error);
        return;
      }
      const frame = asset as SpriteFrame | null;
      if (!frame) {
        return;
      }
      this.jakePortraitFrame = frame;
      if (
        this.isDetailOpen &&
        this.activeEmployeeFileDrawerIndex === 1 &&
        this.activeEmployeeFileTabIndex === 1
      ) {
        this.applyEmployeeFileEntry(this.activeEmployeeFileDrawerIndex, this.activeEmployeeFileTabIndex);
      }
    });
  }

  private loadAlicePortraitIfNeeded(): void {
    if (this.alicePortraitFrame || this.alicePortraitLoading) {
      return;
    }
    this.alicePortraitLoading = true;
    assetManager.loadAny(ALICE_PORTRAIT_SPRITEFRAME_UUID, (error, asset) => {
      this.alicePortraitLoading = false;
      if (error) {
        console.warn('[EmployeeFilesController] Failed to load Alice portrait sprite frame.', error);
        return;
      }
      const frame = asset as SpriteFrame | null;
      if (!frame) {
        return;
      }
      this.alicePortraitFrame = frame;
      if (
        this.isDetailOpen &&
        this.activeEmployeeFileDrawerIndex === 2 &&
        this.activeEmployeeFileTabIndex === 0
      ) {
        this.applyEmployeeFileEntry(this.activeEmployeeFileDrawerIndex, this.activeEmployeeFileTabIndex);
      }
    });
  }

  private loadClaraPortraitIfNeeded(): void {
    if (this.claraPortraitFrame || this.claraPortraitLoading) {
      return;
    }
    this.claraPortraitLoading = true;
    assetManager.loadAny(CLARA_PORTRAIT_SPRITEFRAME_UUID, (error, asset) => {
      this.claraPortraitLoading = false;
      if (error) {
        console.warn('[EmployeeFilesController] Failed to load Clara portrait sprite frame.', error);
        return;
      }
      const frame = asset as SpriteFrame | null;
      if (!frame) {
        return;
      }
      this.claraPortraitFrame = frame;
      if (
        this.isDetailOpen &&
        this.activeEmployeeFileDrawerIndex === 2 &&
        this.activeEmployeeFileTabIndex === 1
      ) {
        this.applyEmployeeFileEntry(this.activeEmployeeFileDrawerIndex, this.activeEmployeeFileTabIndex);
      }
    });
  }

  private loadGracePortraitIfNeeded(): void {
    if (this.gracePortraitFrame || this.gracePortraitLoading) {
      return;
    }
    this.gracePortraitLoading = true;
    assetManager.loadAny(GRACE_PORTRAIT_SPRITEFRAME_UUID, (error, asset) => {
      this.gracePortraitLoading = false;
      if (error) {
        console.warn('[EmployeeFilesController] Failed to load Grace portrait sprite frame.', error);
        return;
      }
      const frame = asset as SpriteFrame | null;
      if (!frame) {
        return;
      }
      this.gracePortraitFrame = frame;
      if (
        this.isDetailOpen &&
        this.activeEmployeeFileDrawerIndex === 2 &&
        this.activeEmployeeFileTabIndex === 2
      ) {
        this.applyEmployeeFileEntry(this.activeEmployeeFileDrawerIndex, this.activeEmployeeFileTabIndex);
      }
    });
  }

  private loadMayaPortraitIfNeeded(): void {
    if (this.mayaPortraitFrame || this.mayaPortraitLoading) {
      return;
    }
    this.mayaPortraitLoading = true;
    assetManager.loadAny(MAYA_PORTRAIT_SPRITEFRAME_UUID, (error, asset) => {
      this.mayaPortraitLoading = false;
      if (error) {
        console.warn('[EmployeeFilesController] Failed to load Maya portrait sprite frame.', error);
        return;
      }
      const frame = asset as SpriteFrame | null;
      if (!frame) {
        return;
      }
      this.mayaPortraitFrame = frame;
      if (
        this.isDetailOpen &&
        this.activeEmployeeFileDrawerIndex === 2 &&
        this.activeEmployeeFileTabIndex === 3
      ) {
        this.applyEmployeeFileEntry(this.activeEmployeeFileDrawerIndex, this.activeEmployeeFileTabIndex);
      }
    });
  }

  private loadPlayerTrueIdentityPortraitIfNeeded(): void {
    if (this.playerTrueIdentityPortraitFrame || this.playerTrueIdentityPortraitLoading) {
      return;
    }
    this.playerTrueIdentityPortraitLoading = true;
    assetManager.loadAny(PLAYER_TRUE_IDENTITY_PORTRAIT_SPRITEFRAME_UUID, (error, asset) => {
      this.playerTrueIdentityPortraitLoading = false;
      if (error) {
        console.warn(
          '[EmployeeFilesController] Failed to load Day0 ending player true identity portrait sprite frame.',
          error,
        );
        return;
      }
      const frame = asset as SpriteFrame | null;
      if (!frame) {
        return;
      }
      this.playerTrueIdentityPortraitFrame = frame;
      if (this.isDetailOpen && this.day0EndingArchiveRevealModeActive) {
        const revealDefinition = this.getDay0EndingArchiveRevealDefinition();
        if (revealDefinition) {
          this.applyEmployeeFileDefinition(revealDefinition);
        }
      }
    });
  }

  private formatFeatureList(items: readonly string[]): string {
    if (items.length === 0) {
      return '';
    }
    return items.map((item) => `- ${item}`).join('\n');
  }

  private applyStatusVisibilityPolicy(): void {
    if (this.fileStatusLabel) {
      this.fileStatusLabel.string = '';
    }
    if (this.fileStatusNode && isValid(this.fileStatusNode, true)) {
      this.fileStatusNode.active = false;
    }
  }

  private applyPortraitContainSize(frame: SpriteFrame | null): void {
    if (!this.filePortraitSprite) {
      return;
    }
    const portraitTransform = this.filePortraitSprite.getComponent(UITransform);
    if (!portraitTransform || this.portraitBaseWidth <= 0 || this.portraitBaseHeight <= 0) {
      return;
    }
    if (!frame) {
      portraitTransform.setContentSize(this.portraitBaseWidth, this.portraitBaseHeight);
      return;
    }
    const sourceWidth = frame.originalSize.width > 0 ? frame.originalSize.width : frame.texture?.width ?? 0;
    const sourceHeight = frame.originalSize.height > 0 ? frame.originalSize.height : frame.texture?.height ?? 0;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      portraitTransform.setContentSize(this.portraitBaseWidth, this.portraitBaseHeight);
      return;
    }
    const scale = Math.min(this.portraitBaseWidth / sourceWidth, this.portraitBaseHeight / sourceHeight);
    portraitTransform.setContentSize(sourceWidth * scale, sourceHeight * scale);
  }

  private ensurePortraitMaskContainer(): void {
    if (!this.filePortraitSprite || !isValid(this.filePortraitSprite.node, true)) {
      return;
    }
    const portraitNode = this.filePortraitSprite.node;
    const portraitParent = portraitNode.parent;
    if (!portraitParent || !isValid(portraitParent, true)) {
      return;
    }
    if (portraitParent.getComponent(Mask)) {
      portraitParent.active = true;
      return;
    }
    const portraitTransform = portraitNode.getComponent(UITransform);
    const maskWidth =
      this.portraitBaseWidth > 0 ? this.portraitBaseWidth : portraitTransform?.contentSize.width ?? 0;
    const maskHeight =
      this.portraitBaseHeight > 0 ? this.portraitBaseHeight : portraitTransform?.contentSize.height ?? 0;
    if (maskWidth <= 0 || maskHeight <= 0) {
      return;
    }

    const originalPosition = portraitNode.position.clone();
    const originalScale = portraitNode.scale.clone();
    const siblingIndex = portraitNode.getSiblingIndex();

    const maskNode = new Node('FilePortraitMaskRuntime');
    maskNode.layer = portraitNode.layer;
    portraitParent.insertChild(maskNode, siblingIndex);
    maskNode.setPosition(originalPosition.x, originalPosition.y, originalPosition.z);
    maskNode.setScale(1, 1, 1);
    maskNode.setRotationFromEuler(0, 0, 0);
    maskNode.active = true;

    const maskTransform = maskNode.addComponent(UITransform);
    maskTransform.setAnchorPoint(0.5, 0.5);
    maskTransform.setContentSize(maskWidth, maskHeight);

    const mask = maskNode.addComponent(Mask);
    mask.type = Mask.Type.RECT;

    portraitNode.removeFromParent();
    maskNode.addChild(portraitNode);
    portraitNode.setPosition(0, 0, 0);
    portraitNode.setScale(originalScale.x, originalScale.y, originalScale.z);
    portraitNode.setRotationFromEuler(0, 0, 0);
  }

  private applyPortraitFraming(fileId: EmployeeFileId | null): void {
    if (!this.filePortraitSprite || !isValid(this.filePortraitSprite.node, true)) {
      return;
    }
    const portraitNode = this.filePortraitSprite.node;
    const basePosition = this.hasPortraitBaseTransform ? this.portraitBasePosition : portraitNode.position;
    const baseScale = this.hasPortraitBaseTransform ? this.portraitBaseScale : new Vec3(1, 1, 1);

    portraitNode.setPosition(basePosition.x, basePosition.y, basePosition.z);
    portraitNode.setScale(baseScale.x, baseScale.y, baseScale.z);

    if (!fileId) {
      return;
    }
    const framing = EMPLOYEE_FILE_PORTRAIT_FRAMING[fileId];
    if (!framing) {
      return;
    }
    const uniformScale = Number.isFinite(framing.scale) && framing.scale > 0 ? framing.scale : 1;
    const offsetX = Number.isFinite(framing.offsetX) ? framing.offsetX : 0;
    const offsetY = Number.isFinite(framing.offsetY) ? framing.offsetY : 0;
    portraitNode.setScale(baseScale.x * uniformScale, baseScale.y * uniformScale, baseScale.z);
    portraitNode.setPosition(basePosition.x + offsetX, basePosition.y + offsetY, basePosition.z);
  }

  private closeFileDetail(): void {
    if (
      !this.ready ||
      !this.isDetailOpen ||
      !this.detailPanel ||
      !this.fileDetailContent ||
      this.isDestroying ||
      !this.isControllerAlive() ||
      !this.isNodeAlive(this.detailPanel) ||
      !this.isNodeAlive(this.fileDetailContent)
    ) {
      return;
    }

    hideInteractivePanel(
      this.detailPanel,
      () => {
        if (!this.isControllerAlive()) {
          return;
        }
        this.setFileDetailContentVisible(false);
        this.isDetailOpen = false;
        this.activeEmployeeFileDrawerIndex = -1;
        this.activeEmployeeFileTabIndex = 0;
        this.setDetailTabInteractable([false, false, false, false]);
        this.setDrawerButtonsInteractable(true);
        if (this.day0EndingArchiveRevealModeActive) {
          this.currentOpenIndex = -1;
          for (const fileHit of this.fileHits) {
            if (this.isNodeAlive(fileHit)) {
              fileHit.active = false;
            }
          }
          this.day0EndingArchiveRevealDetailClosedCallback?.();
          return;
        }

        if (this.currentOpenIndex >= 0 && this.isNodeAlive(this.fileHits[this.currentOpenIndex])) {
          this.fileHits[this.currentOpenIndex].active = true;
        }
      },
      {
        setInteractable: (interactable) => this.setDetailPanelInteractable(interactable),
      },
    );
  }

  private setBaseButtonsInteractable(enabled: boolean): void {
    if (enabled) {
      this.restoreBaseButtonStates();
      return;
    }

    for (const state of this.baseButtonStates) {
      if (isValid(state.button, true) && isValid(state.button.node, true)) {
        if (EmployeeFilesController.EXTERNAL_INTERACTION_ALLOWED_WHEN_DRAWER_OPEN.has(state.nodeName)) {
          continue;
        }
        state.button.interactable = false;
      }
    }
  }

  private setDrawerButtonsInteractable(enabled: boolean): void {
    for (const button of this.drawerButtons) {
      if (isValid(button, true) && isValid(button.node, true)) {
        button.interactable = enabled;
      }
    }
  }

  private restoreBaseButtonStates(): void {
    for (const state of this.baseButtonStates) {
      if (isValid(state.button, true) && isValid(state.button.node, true)) {
        state.button.interactable = state.interactable;
      }
    }
  }

  private setDetailTabInteractable(states: readonly boolean[]): void {
    if (!Array.isArray(this.detailTabButtons)) {
      return;
    }
    for (let index = 0; index < this.detailTabButtons.length; index += 1) {
      const button = this.detailTabButtons[index];
      if (isValid(button, true) && isValid(button.node, true)) {
        button.interactable = states[index] ?? false;
      }
    }
  }

  private selectEmployeeFileDetailTab(tabIndex: number): void {
    if (
      !this.ready ||
      !this.isDetailOpen ||
      this.isAnimating ||
      this.isDestroying
    ) {
      return;
    }
    const maxTabIndex = this.getMaxTabIndexForDrawer(this.activeEmployeeFileDrawerIndex);
    if (maxTabIndex < 0 || tabIndex < 0 || tabIndex > maxTabIndex) {
      return;
    }
    if (tabIndex === this.activeEmployeeFileTabIndex) {
      return;
    }
    AudioManager.getInstance()?.playCachedDocumentFlip();
    if (!this.applyEmployeeFileEntry(this.activeEmployeeFileDrawerIndex, tabIndex)) {
      return;
    }
    this.activeEmployeeFileTabIndex = tabIndex;
  }

  private hasDrawerFileDetail(drawerIndex: number): boolean {
    return drawerIndex === 0 || drawerIndex === 1 || drawerIndex === 2;
  }

  private getMaxTabIndexForDrawer(drawerIndex: number): number {
    if (drawerIndex === 0) {
      return 2;
    }
    if (drawerIndex === 1) {
      return 1;
    }
    if (drawerIndex === 2) {
      return 3;
    }
    return -1;
  }

  private stopAllTweensSafely(): void {
    if (isValid(this.node, true)) {
      Tween.stopAllByTarget(this.node);
    }
    for (const visual of this.drawerVisuals) {
      if (this.isNodeAlive(visual)) {
        Tween.stopAllByTarget(visual);
      }
    }
    for (const hit of this.drawerHits) {
      if (this.isNodeAlive(hit)) {
        Tween.stopAllByTarget(hit);
      }
    }
  }

  private isControllerAlive(): boolean {
    return !this.isDestroying && isValid(this, true) && isValid(this.node, true);
  }

  private isNodeAlive(node: Node | null | undefined): node is Node {
    return !!node && isValid(node, true);
  }

  private fail(message: string): void {
    console.error(`[EmployeeFilesController] ${message}`);
    this.ready = false;
    this.enabled = false;
  }
}
