import {
  _decorator,
  assetManager,
  Button,
  Color,
  Component,
  Graphics,
  HorizontalTextAlignment,
  isValid,
  Label,
  Node,
  Size,
  Sprite,
  SpriteFrame,
  UITransform,
  VerticalTextAlignment,
} from 'cc';
import type { AppointmentRosterDay, AppointmentRosterEntry } from './appointments/AppointmentTypes';
import { getAppointmentDepartmentLabel } from './appointments/AppointmentDepartmentCatalog';
import { getAppointmentPurposeLabel } from './appointments/AppointmentPurposeCatalog';
import { getVisitorProfile } from './visitors/VisitorProfileCatalog';
import {
  hideInteractivePanel,
  hideInteractivePanelImmediate,
  showInteractivePanel,
} from './InteractivePanelTransition';
import { AudioManager } from '../audio/AudioManager';

const { ccclass } = _decorator;

const DYNAMIC_ROOT_NAME = 'AppointmentRosterDynamicRoot';
const ENTRY_NODE_NAMES = ['AppointmentEntry01Runtime', 'AppointmentEntry02Runtime'] as const;

const ROSTER_DATE_POSITION = { x: 38, y: 355 };
const ENTRY_POSITIONS = [
  { x: 38, y: 190 },
  { x: 38, y: -175 },
] as const;
const EMPTY_STATE_POSITION = { x: 38, y: 50 };

const ENTRY_SIZE = new Size(500, 300);
const PORTRAIT_FRAME_SIZE = new Size(126, 190);
const PORTRAIT_VISUAL_MAX_SIZE = new Size(112, 174);

interface EntryRuntimeNodes {
  readonly root: Node;
  readonly backgroundGraphics: Graphics;
  readonly portraitVisualTransform: UITransform;
  readonly portraitSprite: Sprite;
  readonly nameLabel: Label;
  readonly departmentLabel: Label;
  readonly appearanceLabel: Label;
  readonly purposeLabel: Label;
}

@ccclass('AppointmentRosterController')
export class AppointmentRosterController extends Component {
  private rosterPanelOpen = false;
  private campaignEnabled = true;

  private appointmentRosterPanelRuntime: Node | null = null;
  private appointmentRosterScrim: Node | null = null;
  private appointmentRosterPanelBody: Node | null = null;
  private appointmentRosterCloseButton: Node | null = null;

  private appointmentRosterHitButton: Button | null = null;
  private appointmentRosterCloseButtonComp: Button | null = null;
  private appointmentRosterScrimGraphics: Graphics | null = null;
  private appointmentRosterCloseButtonGraphics: Graphics | null = null;

  private managedButtons: Button[] = [];
  private rosterDay: AppointmentRosterDay | null = null;

  private dynamicRoot: Node | null = null;
  private rosterDateLabel: Label | null = null;
  private entryListRoot: Node | null = null;
  private emptyStateLabel: Label | null = null;
  private entryRuntimeNodes: EntryRuntimeNodes[] = [];

  private portraitFrameCache = new Map<string, SpriteFrame>();
  private portraitLoadRequests = new Map<string, Promise<SpriteFrame>>();
  private rosterRenderGeneration = 0;
  private isDestroying = false;

  onLoad(): void {
    if (this.node.name !== 'AppointmentRosterHit') {
      console.error('[AppointmentRosterController] This script must be mounted on AppointmentRosterHit.');
      this.enabled = false;
      return;
    }

    const deskEvidenceRuntime = this.node.parent;
    if (!deskEvidenceRuntime || deskEvidenceRuntime.name !== 'DeskEvidenceRuntime') {
      console.error('[AppointmentRosterController] DeskEvidenceRuntime not found from AppointmentRosterHit parent.');
      this.enabled = false;
      return;
    }

    const canvas = deskEvidenceRuntime.parent;
    if (!canvas || canvas.name !== 'Canvas') {
      console.error('[AppointmentRosterController] Canvas not found from DeskEvidenceRuntime parent.');
      this.enabled = false;
      return;
    }

    this.appointmentRosterPanelRuntime = canvas.getChildByName('AppointmentRosterPanelRuntime');
    const consoleControls = canvas.getChildByName('ConsoleControls');
    this.appointmentRosterScrim =
      this.appointmentRosterPanelRuntime?.getChildByName('AppointmentRosterScrim') ?? null;
    this.appointmentRosterPanelBody =
      this.appointmentRosterPanelRuntime?.getChildByName('AppointmentRosterPanelBody') ?? null;
    this.appointmentRosterCloseButton =
      this.appointmentRosterPanelRuntime?.getChildByName('AppointmentRosterCloseButton') ?? null;

    this.appointmentRosterHitButton = this.node.getComponent(Button);
    this.appointmentRosterCloseButtonComp = this.appointmentRosterCloseButton?.getComponent(Button) ?? null;
    this.appointmentRosterScrimGraphics = this.appointmentRosterScrim?.getComponent(Graphics) ?? null;
    this.appointmentRosterCloseButtonGraphics =
      this.appointmentRosterCloseButton?.getComponent(Graphics) ?? null;

    const employeeCardHit = deskEvidenceRuntime.getChildByName('EmployeeCardHit');
    const applicationFormHit = deskEvidenceRuntime.getChildByName('ApplicationFormHit');
    const screeningChecklistHit = deskEvidenceRuntime.getChildByName('ScreeningChecklistHit');
    const telephoneHit = deskEvidenceRuntime.getChildByName('TelephoneHit');
    const btnShutterHit = consoleControls?.getChildByName('BtnShutterHit') ?? null;
    const btnAllowHit = consoleControls?.getChildByName('BtnAllowHit') ?? null;
    const btnDenyHit = consoleControls?.getChildByName('BtnDenyHit') ?? null;

    const missing = [
      !this.appointmentRosterPanelRuntime && 'AppointmentRosterPanelRuntime',
      !consoleControls && 'ConsoleControls',
      !this.appointmentRosterScrim && 'AppointmentRosterScrim',
      !this.appointmentRosterPanelBody && 'AppointmentRosterPanelBody',
      !this.appointmentRosterCloseButton && 'AppointmentRosterCloseButton',
      !this.appointmentRosterHitButton && 'AppointmentRosterHit(Button)',
      !this.appointmentRosterCloseButtonComp && 'AppointmentRosterCloseButton(Button)',
      !this.appointmentRosterScrimGraphics && 'AppointmentRosterScrim(Graphics)',
      !this.appointmentRosterCloseButtonGraphics && 'AppointmentRosterCloseButton(Graphics)',
      !employeeCardHit && 'EmployeeCardHit',
      !applicationFormHit && 'ApplicationFormHit',
      !screeningChecklistHit && 'ScreeningChecklistHit',
      !telephoneHit && 'TelephoneHit',
      !btnShutterHit && 'BtnShutterHit',
      !btnAllowHit && 'BtnAllowHit',
      !btnDenyHit && 'BtnDenyHit',
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      console.error(`[AppointmentRosterController] Missing required nodes/components: ${missing.join(', ')}`);
      this.enabled = false;
      return;
    }

    this.managedButtons = [
      employeeCardHit?.getComponent(Button) ?? null,
      applicationFormHit?.getComponent(Button) ?? null,
      screeningChecklistHit?.getComponent(Button) ?? null,
      telephoneHit?.getComponent(Button) ?? null,
      this.appointmentRosterHitButton,
      btnShutterHit?.getComponent(Button) ?? null,
      btnAllowHit?.getComponent(Button) ?? null,
      btnDenyHit?.getComponent(Button) ?? null,
    ].filter((button): button is Button => !!button);

    this.appointmentRosterPanelRuntime!.active = false;
    this.rosterPanelOpen = false;
    this.drawScrim();
    this.drawCloseButton();
    this.ensureRuntimeTree();
    this.refreshRosterView();
  }

  onEnable(): void {
    this.appointmentRosterHitButton?.node.on(Button.EventType.CLICK, this.openAppointmentRoster, this);
    this.appointmentRosterCloseButtonComp?.node.on(Button.EventType.CLICK, this.onAppointmentRosterCloseClick, this);
  }

  onDisable(): void {
    this.appointmentRosterHitButton?.node.off(Button.EventType.CLICK, this.openAppointmentRoster, this);
    this.appointmentRosterCloseButtonComp?.node.off(Button.EventType.CLICK, this.closeAppointmentRoster, this);
    this.invalidateRosterRenderGeneration();
  }

  onDestroy(): void {
    this.isDestroying = true;
    if (this.appointmentRosterPanelRuntime?.isValid) {
      hideInteractivePanelImmediate(this.appointmentRosterPanelRuntime, {
        setInteractable: (interactable) => this.setRosterPanelInteractable(interactable),
      });
    }
    this.invalidateRosterRenderGeneration();
    this.portraitLoadRequests.clear();
  }

  private setRosterPanelInteractable(interactable: boolean): void {
    if (this.appointmentRosterCloseButtonComp) {
      this.appointmentRosterCloseButtonComp.interactable = interactable;
    }
  }

  private openAppointmentRoster(): void {
    if (!this.campaignEnabled || this.rosterPanelOpen || !this.appointmentRosterPanelRuntime) {
      return;
    }
    showInteractivePanel(this.appointmentRosterPanelRuntime, {
      setInteractable: (interactable) => this.setRosterPanelInteractable(interactable),
    });
    AudioManager.getInstance()?.playCachedDocumentFlip();
    this.rosterPanelOpen = true;
    this.setManagedButtonsInteractable(false);
    this.refreshEntryInteractable();
    this.refreshRosterView();
  }

  /** Player-clicked X on appointment roster; play UI click then close. */
  private onAppointmentRosterCloseClick(): void {
    AudioManager.getInstance()?.playCachedSettingsClick();
    this.closeAppointmentRoster();
  }

  private closeAppointmentRoster(): void {
    if (!this.appointmentRosterPanelRuntime) {
      return;
    }
    hideInteractivePanel(
      this.appointmentRosterPanelRuntime,
      () => {
        this.rosterPanelOpen = false;
        this.setManagedButtonsInteractable(true);
        this.refreshEntryInteractable();
        this.invalidateRosterRenderGeneration();
      },
      {
        setInteractable: (interactable) => this.setRosterPanelInteractable(interactable),
      },
    );
  }

  private setManagedButtonsInteractable(interactable: boolean): void {
    for (const button of this.managedButtons) {
      button.interactable = interactable;
    }
  }

  public setCampaignEnabled(enabled: boolean): void {
    this.campaignEnabled = enabled;
    if (!enabled) {
      if (this.appointmentRosterPanelRuntime) {
        hideInteractivePanelImmediate(this.appointmentRosterPanelRuntime, {
          setInteractable: (interactable) => this.setRosterPanelInteractable(interactable),
        });
      }
      this.rosterPanelOpen = false;
      this.setManagedButtonsInteractable(true);
      this.invalidateRosterRenderGeneration();
    }
    this.refreshEntryInteractable();
  }

  public setRosterDay(rosterDay: AppointmentRosterDay | null): void {
    this.rosterDay = rosterDay;
    if (this.rosterPanelOpen) {
      this.refreshRosterView();
    }
  }

  public refreshRosterView(): void {
    if (!this.ensureRuntimeTree()) {
      return;
    }

    const renderGeneration = this.invalidateRosterRenderGeneration();
    this.hideEntryNodes();

    if (!this.rosterDay || this.rosterDay.entries.length === 0) {
      this.showStatusOnly('NO APPOINTMENTS SCHEDULED');
      return;
    }

    const listedEntries = this.rosterDay.entries.filter((entry) => entry.listed);
    if (listedEntries.length === 0) {
      this.showStatusOnly('NO APPOINTMENTS SCHEDULED');
      return;
    }
    if (listedEntries.length > 2) {
      console.error(
        `[AppointmentRosterController] Roster entries exceed display capacity: listed=${listedEntries.length}.`,
      );
      this.showStatusOnly('ROSTER DATA EXCEEDS DISPLAY CAPACITY');
      return;
    }

    if (!this.rosterDateLabel || !this.emptyStateLabel) {
      return;
    }
    this.rosterDateLabel.node.active = true;
    this.rosterDateLabel.string = this.rosterDay.inspectionDate;
    this.emptyStateLabel.node.active = false;

    for (let i = 0; i < this.entryRuntimeNodes.length; i += 1) {
      const runtime = this.entryRuntimeNodes[i];
      const entry = listedEntries[i];
      if (!runtime) {
        continue;
      }
      if (!entry) {
        runtime.root.active = false;
        continue;
      }
      this.renderEntry(runtime, entry, renderGeneration);
    }
  }

  private refreshEntryInteractable(): void {
    if (!this.appointmentRosterHitButton) {
      return;
    }
    this.appointmentRosterHitButton.interactable = this.campaignEnabled && !this.rosterPanelOpen;
  }

  private drawScrim(): void {
    if (!this.appointmentRosterScrimGraphics) {
      return;
    }
    this.appointmentRosterScrimGraphics.clear();
    this.appointmentRosterScrimGraphics.fillColor = new Color(0, 0, 0, 165);
    this.appointmentRosterScrimGraphics.rect(-360, -640, 720, 1280);
    this.appointmentRosterScrimGraphics.fill();
  }

  private drawCloseButton(): void {
    if (!this.appointmentRosterCloseButtonGraphics) {
      return;
    }
    this.appointmentRosterCloseButtonGraphics.clear();
    this.appointmentRosterCloseButtonGraphics.fillColor = new Color(25, 23, 20, 255);
    this.appointmentRosterCloseButtonGraphics.rect(-36, -36, 72, 72);
    this.appointmentRosterCloseButtonGraphics.fill();
    this.appointmentRosterCloseButtonGraphics.lineWidth = 3;
    this.appointmentRosterCloseButtonGraphics.strokeColor = new Color(230, 220, 195, 255);
    this.appointmentRosterCloseButtonGraphics.rect(-36, -36, 72, 72);
    this.appointmentRosterCloseButtonGraphics.stroke();
  }

  private ensureRuntimeTree(): boolean {
    if (!this.appointmentRosterPanelBody) {
      return false;
    }
    this.ensureDynamicRoot();
    if (!this.dynamicRoot) {
      return false;
    }

    const panelBodyTransform = this.appointmentRosterPanelBody.getComponent(UITransform);
    const rootTransform = this.dynamicRoot.getComponent(UITransform) ?? this.dynamicRoot.addComponent(UITransform);
    const panelSize = panelBodyTransform?.contentSize ?? new Size(637.398, 1120);
    rootTransform.setAnchorPoint(0.5, 0.5);
    rootTransform.setContentSize(panelSize);
    this.dynamicRoot.setPosition(0, 0, 0);

    const dateLabelNode = this.ensureNode(this.dynamicRoot, 'RosterDateLabel', new Size(480, 40), ROSTER_DATE_POSITION);
    this.rosterDateLabel = this.setupLabel(dateLabelNode, {
      fontSize: 28,
      horizontalAlign: HorizontalTextAlignment.LEFT,
      verticalAlign: VerticalTextAlignment.CENTER,
      color: new Color(34, 34, 34, 255),
      lineHeight: 32,
      wrap: false,
    });
    this.rosterDateLabel.string = '';

    this.entryListRoot = this.ensureNode(this.dynamicRoot, 'EntryListRoot', panelSize, { x: 0, y: 0 });

    const emptyLabelNode = this.ensureNode(this.dynamicRoot, 'EmptyStateLabel', new Size(480, 80), EMPTY_STATE_POSITION);
    this.emptyStateLabel = this.setupLabel(emptyLabelNode, {
      fontSize: 28,
      horizontalAlign: HorizontalTextAlignment.CENTER,
      verticalAlign: VerticalTextAlignment.CENTER,
      color: new Color(34, 34, 34, 255),
      lineHeight: 34,
      wrap: true,
    });
    this.emptyStateLabel.string = 'NO APPOINTMENTS SCHEDULED';

    if (this.entryRuntimeNodes.length === 0) {
      this.entryRuntimeNodes = ENTRY_NODE_NAMES.map((entryNodeName, index) =>
        this.ensureEntryRuntime(entryNodeName, ENTRY_POSITIONS[index]),
      );
    }
    return true;
  }

  private ensureDynamicRoot(): void {
    if (!this.appointmentRosterPanelBody) {
      return;
    }
    const duplicateRoots = this.appointmentRosterPanelBody.children.filter((child) => child.name === DYNAMIC_ROOT_NAME);
    if (duplicateRoots.length > 1) {
      for (let i = 1; i < duplicateRoots.length; i += 1) {
        duplicateRoots[i].destroy();
      }
      console.warn(
        `[AppointmentRosterController] Found ${duplicateRoots.length} "${DYNAMIC_ROOT_NAME}" nodes; cleaned duplicates.`,
      );
    }

    this.dynamicRoot = this.appointmentRosterPanelBody.getChildByName(DYNAMIC_ROOT_NAME) ?? new Node(DYNAMIC_ROOT_NAME);
    if (!this.dynamicRoot.parent) {
      this.appointmentRosterPanelBody.addChild(this.dynamicRoot);
    }
  }

  private ensureEntryRuntime(nodeName: string, position: { readonly x: number; readonly y: number }): EntryRuntimeNodes {
    if (!this.entryListRoot) {
      throw new Error('[AppointmentRosterController] EntryListRoot is not initialized.');
    }

    const root = this.ensureNode(this.entryListRoot, nodeName, ENTRY_SIZE, position);

    const backgroundNode = this.ensureNode(root, 'EntryBackground', ENTRY_SIZE, { x: 0, y: 0 });
    const backgroundGraphics = backgroundNode.getComponent(Graphics) ?? backgroundNode.addComponent(Graphics);
    this.drawEntryBackground(backgroundGraphics);

    const portraitFrameNode = this.ensureNode(root, 'PortraitFrame', PORTRAIT_FRAME_SIZE, { x: -175, y: 0 });
    const portraitFrameGraphics = portraitFrameNode.getComponent(Graphics) ?? portraitFrameNode.addComponent(Graphics);
    this.drawPortraitFrame(portraitFrameGraphics);

    const portraitVisualNode = this.ensureNode(root, 'PortraitVisual', PORTRAIT_VISUAL_MAX_SIZE, { x: -175, y: 0 });
    const portraitVisualTransform =
      portraitVisualNode.getComponent(UITransform) ?? portraitVisualNode.addComponent(UITransform);
    portraitVisualTransform.setAnchorPoint(0.5, 0.5);
    portraitVisualTransform.setContentSize(PORTRAIT_VISUAL_MAX_SIZE);
    const portraitSprite = portraitVisualNode.getComponent(Sprite) ?? portraitVisualNode.addComponent(Sprite);
    portraitSprite.type = Sprite.Type.SIMPLE;
    portraitSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    portraitSprite.spriteFrame = null;
    portraitSprite.color = Color.WHITE;

    const staleTimeLabelNode = root.getChildByName('TimeLabel');
    if (staleTimeLabelNode) {
      staleTimeLabelNode.destroy();
    }

    const nameLabelNode = this.ensureNode(root, 'NameLabel', new Size(310, 42), { x: -20, y: 100 });
    const departmentLabelNode = this.ensureNode(root, 'DepartmentLabel', new Size(310, 40), { x: -20, y: 52 });
    const appearanceLabelNode = this.ensureNode(root, 'AppearanceLabel', new Size(310, 82), { x: -20, y: -10 });
    const purposeLabelNode = this.ensureNode(root, 'PurposeLabel', new Size(310, 76), { x: -20, y: -88 });

    const nameLabel = this.setupLabel(nameLabelNode, {
      fontSize: 34,
      horizontalAlign: HorizontalTextAlignment.LEFT,
      verticalAlign: VerticalTextAlignment.CENTER,
      color: new Color(26, 26, 26, 255),
      lineHeight: 36,
      wrap: false,
    });
    const departmentLabel = this.setupLabel(departmentLabelNode, {
      fontSize: 24,
      horizontalAlign: HorizontalTextAlignment.LEFT,
      verticalAlign: VerticalTextAlignment.CENTER,
      color: new Color(34, 34, 34, 255),
      lineHeight: 27,
      wrap: false,
    });
    const appearanceLabel = this.setupLabel(appearanceLabelNode, {
      fontSize: 21,
      horizontalAlign: HorizontalTextAlignment.LEFT,
      verticalAlign: VerticalTextAlignment.TOP,
      color: new Color(36, 36, 36, 255),
      lineHeight: 24,
      wrap: true,
    });
    const purposeLabel = this.setupLabel(purposeLabelNode, {
      fontSize: 21,
      horizontalAlign: HorizontalTextAlignment.LEFT,
      verticalAlign: VerticalTextAlignment.TOP,
      color: new Color(42, 42, 42, 255),
      lineHeight: 24,
      wrap: true,
    });

    return {
      root,
      backgroundGraphics,
      portraitVisualTransform,
      portraitSprite,
      nameLabel,
      departmentLabel,
      appearanceLabel,
      purposeLabel,
    };
  }

  private ensureNode(
    parent: Node,
    nodeName: string,
    size: Size,
    position: { readonly x: number; readonly y: number },
  ): Node {
    const node = parent.getChildByName(nodeName) ?? new Node(nodeName);
    if (!node.parent) {
      parent.addChild(node);
    }
    node.setPosition(position.x, position.y, 0);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(size);
    return node;
  }

  private setupLabel(
    node: Node,
    config: {
      readonly fontSize: number;
      readonly horizontalAlign: HorizontalTextAlignment;
      readonly verticalAlign: VerticalTextAlignment;
      readonly color: Color;
      readonly lineHeight: number;
      readonly wrap: boolean;
    },
  ): Label {
    const label = node.getComponent(Label) ?? node.addComponent(Label);
    label.useSystemFont = true;
    label.color = config.color;
    label.fontSize = config.fontSize;
    label.lineHeight = config.lineHeight;
    label.horizontalAlign = config.horizontalAlign;
    label.verticalAlign = config.verticalAlign;
    label.overflow = Label.Overflow.CLAMP;
    label.enableWrapText = config.wrap;
    return label;
  }

  private drawEntryBackground(graphics: Graphics): void {
    graphics.clear();
    graphics.fillColor = new Color(128, 144, 162, 56);
    graphics.rect(-ENTRY_SIZE.width / 2, -ENTRY_SIZE.height / 2, ENTRY_SIZE.width, ENTRY_SIZE.height);
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(40, 40, 40, 150);
    graphics.rect(-ENTRY_SIZE.width / 2, -ENTRY_SIZE.height / 2, ENTRY_SIZE.width, ENTRY_SIZE.height);
    graphics.stroke();
  }

  private drawPortraitFrame(graphics: Graphics): void {
    graphics.clear();
    graphics.fillColor = new Color(0, 0, 0, 0);
    graphics.rect(
      -PORTRAIT_FRAME_SIZE.width / 2,
      -PORTRAIT_FRAME_SIZE.height / 2,
      PORTRAIT_FRAME_SIZE.width,
      PORTRAIT_FRAME_SIZE.height,
    );
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(28, 28, 28, 190);
    graphics.rect(
      -PORTRAIT_FRAME_SIZE.width / 2,
      -PORTRAIT_FRAME_SIZE.height / 2,
      PORTRAIT_FRAME_SIZE.width,
      PORTRAIT_FRAME_SIZE.height,
    );
    graphics.stroke();
  }

  private renderEntry(runtime: EntryRuntimeNodes, entry: AppointmentRosterEntry, generation: number): void {
    runtime.root.active = true;
    runtime.nameLabel.string = '';
    runtime.departmentLabel.string = '';
    runtime.appearanceLabel.string = '';
    runtime.purposeLabel.string = '';

    runtime.portraitSprite.spriteFrame = null;
    runtime.portraitVisualTransform.setContentSize(PORTRAIT_VISUAL_MAX_SIZE);

    const profile = getVisitorProfile(entry.visitorKey);
    if (!profile) {
      console.error(
        `[AppointmentRosterController] Missing visitor profile for visitorKey="${entry.visitorKey}" in appointmentId="${entry.appointmentId}".`,
      );
      runtime.nameLabel.string = 'VISITOR PROFILE ERROR';
      runtime.departmentLabel.string = 'DEPARTMENT: DATA ERROR';
      runtime.appearanceLabel.string = 'APPEARANCE:\nDATA ERROR';
      runtime.purposeLabel.string = 'PURPOSE:\nDATA ERROR';
      return;
    }

    const departmentLabel = getAppointmentDepartmentLabel(entry.targetDepartmentKey);
    if (!departmentLabel) {
      console.error(
        `[AppointmentRosterController] Missing department label for departmentKey="${entry.targetDepartmentKey}" in appointmentId="${entry.appointmentId}".`,
      );
      runtime.nameLabel.string = profile.displayName.toUpperCase();
      runtime.departmentLabel.string = 'DEPARTMENT: DATA ERROR';
      runtime.appearanceLabel.string = `APPEARANCE:\n${this.formatAppearanceFeatures(profile.appearanceFeatures)}`;
      runtime.purposeLabel.string = 'PURPOSE:\nDATA ERROR';
      return;
    }

    const purposeLabel = getAppointmentPurposeLabel(entry.purposeKey);
    if (!purposeLabel) {
      console.error(
        `[AppointmentRosterController] Missing purpose label for purposeKey="${entry.purposeKey}" in appointmentId="${entry.appointmentId}".`,
      );
      runtime.nameLabel.string = profile.displayName.toUpperCase();
      runtime.departmentLabel.string = `DEPARTMENT: ${departmentLabel}`;
      runtime.appearanceLabel.string = `APPEARANCE:\n${this.formatAppearanceFeatures(profile.appearanceFeatures)}`;
      runtime.purposeLabel.string = 'PURPOSE:\nDATA ERROR';
      return;
    }

    runtime.nameLabel.string = profile.displayName.toUpperCase();
    runtime.departmentLabel.string = `DEPARTMENT: ${departmentLabel}`;
    runtime.appearanceLabel.string = `APPEARANCE:\n${this.formatAppearanceFeatures(profile.appearanceFeatures)}`;
    runtime.purposeLabel.string = `PURPOSE:\n${purposeLabel}`;

    this.applyPortraitSpriteFrame(
      runtime,
      profile.visuals.portraitSpriteFrameUuid,
      generation,
      entry.appointmentId,
      entry.visitorKey,
    );
  }

  private showStatusOnly(message: string): void {
    if (this.rosterDateLabel) {
      this.rosterDateLabel.node.active = false;
    }
    for (const runtime of this.entryRuntimeNodes) {
      runtime.root.active = false;
      runtime.portraitSprite.spriteFrame = null;
      runtime.portraitVisualTransform.setContentSize(PORTRAIT_VISUAL_MAX_SIZE);
    }
    if (this.emptyStateLabel) {
      this.emptyStateLabel.node.active = true;
      this.emptyStateLabel.string = message;
    }
  }

  private hideEntryNodes(): void {
    for (const runtime of this.entryRuntimeNodes) {
      runtime.root.active = false;
      runtime.portraitSprite.spriteFrame = null;
      runtime.portraitVisualTransform.setContentSize(PORTRAIT_VISUAL_MAX_SIZE);
    }
  }

  private applyPortraitSpriteFrame(
    runtime: EntryRuntimeNodes,
    portraitSpriteFrameUuid: string,
    generation: number,
    appointmentId: string,
    visitorKey: string,
  ): void {
    this.loadSpriteFrameByUuid(portraitSpriteFrameUuid)
      .then((spriteFrame) => {
        if (!this.canApplyAsyncResult(runtime, generation)) {
          return;
        }
        runtime.portraitSprite.spriteFrame = spriteFrame;
        this.applyPortraitContainLayout(runtime.portraitVisualTransform, spriteFrame);
      })
      .catch((error) => {
        if (!this.canApplyAsyncResult(runtime, generation)) {
          return;
        }
        runtime.portraitSprite.spriteFrame = null;
        runtime.portraitVisualTransform.setContentSize(PORTRAIT_VISUAL_MAX_SIZE);
        console.error(
          `[AppointmentRosterController] Failed to load portrait SpriteFrame: visitorKey="${visitorKey}", appointmentId="${appointmentId}", uuid="${portraitSpriteFrameUuid}".`,
          error,
        );
      });
  }

  private canApplyAsyncResult(runtime: EntryRuntimeNodes, generation: number): boolean {
    return (
      !this.isDestroying &&
      generation === this.rosterRenderGeneration &&
      isValid(runtime.root, true) &&
      isValid(runtime.portraitSprite, true) &&
      isValid(runtime.portraitVisualTransform, true)
    );
  }

  private applyPortraitContainLayout(transform: UITransform, spriteFrame: SpriteFrame): void {
    const sourceSize = spriteFrame.originalSize;
    const sourceWidth = Math.max(1, sourceSize.width);
    const sourceHeight = Math.max(1, sourceSize.height);
    const scale = Math.min(PORTRAIT_VISUAL_MAX_SIZE.width / sourceWidth, PORTRAIT_VISUAL_MAX_SIZE.height / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    transform.setContentSize(width, height);
  }

  private loadSpriteFrameByUuid(uuid: string): Promise<SpriteFrame> {
    const cached = this.portraitFrameCache.get(uuid);
    if (cached) {
      return Promise.resolve(cached);
    }
    const pending = this.portraitLoadRequests.get(uuid);
    if (pending) {
      return pending;
    }

    const request = new Promise<SpriteFrame>((resolve, reject) => {
      assetManager.loadAny(uuid, (error, asset) => {
        if (error) {
          reject(error);
          return;
        }
        const spriteFrame = asset as SpriteFrame | null;
        if (!spriteFrame) {
          reject(new Error(`Loaded asset is not a SpriteFrame for uuid: ${uuid}`));
          return;
        }
        this.portraitFrameCache.set(uuid, spriteFrame);
        resolve(spriteFrame);
      });
    }).finally(() => {
      this.portraitLoadRequests.delete(uuid);
    });

    this.portraitLoadRequests.set(uuid, request);
    return request;
  }

  private formatAppearanceFeatures(features: readonly string[]): string {
    const normalized = features.map((feature) => feature.trim()).filter((feature) => feature.length > 0);
    if (normalized.length === 0) {
      console.error('[AppointmentRosterController] appearanceFeatures is empty when rendering roster entry.');
      return 'DATA ERROR';
    }
    return normalized.join(';\n');
  }

  private invalidateRosterRenderGeneration(): number {
    this.rosterRenderGeneration += 1;
    return this.rosterRenderGeneration;
  }
}
