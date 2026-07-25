import {
  _decorator,
  Button,
  Component,
  isValid,
  Label,
  Node,
  Sprite,
  SpriteFrame,
  tween,
  Tween,
  UITransform,
  Vec3,
} from 'cc';

const { ccclass } = _decorator;

const OPEN_DURATION = 0.22;
const CLOSE_DURATION = 0.18;
const OPEN_EASING = 'cubicOut' as const;
const CLOSE_EASING = 'cubicInOut' as const;
const MOVE_RATIO = 0.7;

interface CachedButtonState {
  button: Button;
  enabled: boolean;
  interactable: boolean;
}

interface RegisteredButtonHandler {
  button: Button;
  callback: () => void;
}

type InspectionSubjectId = 'carter' | 'ethan';

type EmployeeFileId = 'carter' | 'ethan';

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

  private detailCloseHandler: (() => void) | null = null;

  private readonly drawerButtons: Button[] = [];

  private readonly fileButtons: Button[] = [];

  private detailCloseButton: Button | null = null;

  private readonly registeredDrawerHandlers: RegisteredButtonHandler[] = [];

  private readonly registeredFileHandlers: RegisteredButtonHandler[] = [];

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
  private carterPortraitFrame: SpriteFrame | null = null;
  private ethanPortraitFrame: SpriteFrame | null = null;

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
    this.ready = true;
  }

  onEnable(): void {
    if (!this.ready) {
      this.forceCloseDetailVisibility();
    }
  }

  onDestroy(): void {
    this.isDestroying = true;
    this.unregisterEvents();
    this.stopAllTweensSafely();
    this.drawerClickHandlers.length = 0;
    this.fileClickHandlers.length = 0;
    this.baseButtonStates.length = 0;
    this.drawerButtons.length = 0;
    this.fileButtons.length = 0;
    this.detailCloseButton = null;
    this.detailCloseHit = null;
    this.fileDetailContentNodes.length = 0;
    this.fileDetailContent = null;
    this.detailPanel = null;
    this.openRuntime = null;
  }

  public setActiveInspectionSubject(_subjectId: InspectionSubjectId): void {}

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
    this.forceCloseDetailVisibility();

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
      this.detailPanel.active = false;
    }
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

    this.detailCloseHandler = (): void => {
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
  }

  private handleDrawerClick(index: number): void {
    if (!this.ready || this.isAnimating || this.isDetailOpen) {
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

    this.isAnimating = true;
    this.currentOpenIndex = index;
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
        this.isAnimating = false;
      })
      .start();
  }

  private closeDrawer(index: number, onComplete?: () => void): void {
    if (!this.ready || this.isAnimating || this.isDestroying || !this.isControllerAlive()) {
      return;
    }

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

    if (index !== this.currentOpenIndex) {
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
    this.setDrawerButtonsInteractable(false);

    for (const fileHit of this.fileHits) {
      if (this.isNodeAlive(fileHit)) {
        fileHit.active = false;
      }
    }

    this.detailPanel.active = true;
    this.setFileDetailContentVisible(true);
    if (!this.applyEmployeeFileEntry(index)) {
      this.setFileDetailContentVisible(false);
      this.detailPanel.active = false;
      this.setDrawerButtonsInteractable(true);
      if (this.currentOpenIndex >= 0 && this.isNodeAlive(this.fileHits[this.currentOpenIndex])) {
        this.fileHits[this.currentOpenIndex].active = true;
      }
      return;
    }
    this.isDetailOpen = true;
  }

  private applyEmployeeFileEntry(index: number): boolean {
    const definition = this.getEmployeeFileDefinition(index);
    if (definition) {
      return this.applyEmployeeFileDefinition(definition);
    }
    const fallbackEntry = this.getFallbackEmployeeFileEntry(index);
    return this.applyFallbackEmployeeFileEntry(fallbackEntry);
  }

  private getEmployeeFileDefinition(index: number): EmployeeFileDefinition | null {
    this.resolvePortraitSourcesIfNeeded();
    if (index === 0 && this.carterPortraitFrame) {
      return {
        id: 'carter',
        department: 'Research Department',
        departmentPhone: '9527',
        displayName: 'Carter',
        employeeId: '017320',
        position: 'Researcher',
        portraitFrame: this.carterPortraitFrame,
        appearanceFeatures: [
          'Orange hair',
          'Orange-yellow eyeshadow',
          'A mole above the collarbone',
        ],
        behavioralHabits: [],
      };
    }
    if (index === 1 && this.ethanPortraitFrame) {
      return {
        id: 'ethan',
        department: 'Research Lab 103',
        departmentPhone: '3103',
        displayName: 'Ethan',
        employeeId: '867530',
        position: 'Researcher 103',
        portraitFrame: this.ethanPortraitFrame,
        appearanceFeatures: ['Large, prominent eyes'],
        behavioralHabits: ['Frequently adjusts and plays with his hairstyle'],
      };
    }
    return null;
  }

  private getFallbackEmployeeFileEntry(index: number): EmployeeFileFallbackEntry {
    this.resolvePortraitSourcesIfNeeded();
    return {
      displayName: '—',
      employeeId: 'Employee ID: —',
      department: '—',
      departmentPhone: 'Department Phone: —',
      position: 'Position: —',
      appearance: '—',
      habits: '—',
      portraitFrame: index === 2 ? this.ethanPortraitFrame : null,
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
    }
    this.applyStatusVisibilityPolicy();
    return true;
  }

  private resolvePortraitSourcesIfNeeded(): void {
    if (!this.carterPortraitFrame && this.filePortraitSprite?.spriteFrame) {
      this.carterPortraitFrame = this.filePortraitSprite.spriteFrame;
    }
    if (this.ethanPortraitFrame) {
      return;
    }
    const canvas = this.node.parent?.parent;
    const assetSources = canvas?.getChildByName('InspectionSubjectAssetSources') ?? null;
    const ethanPortraitSource = assetSources?.getChildByName('EthanPortraitSource') ?? null;
    const ethanPortraitSprite = ethanPortraitSource?.getComponent(Sprite) ?? null;
    this.ethanPortraitFrame = ethanPortraitSprite?.spriteFrame ?? null;
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

    this.setFileDetailContentVisible(false);
    this.detailPanel.active = false;
    this.isDetailOpen = false;
    this.setDrawerButtonsInteractable(true);

    if (this.currentOpenIndex >= 0 && this.isNodeAlive(this.fileHits[this.currentOpenIndex])) {
      this.fileHits[this.currentOpenIndex].active = true;
    }
  }

  private setBaseButtonsInteractable(enabled: boolean): void {
    if (enabled) {
      this.restoreBaseButtonStates();
      return;
    }

    for (const state of this.baseButtonStates) {
      if (isValid(state.button, true) && isValid(state.button.node, true)) {
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
