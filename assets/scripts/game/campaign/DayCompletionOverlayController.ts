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
  Node,
  EventTouch,
  resources,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
  VerticalTextAlignment,
  Widget,
} from 'cc';
import type { CampaignDayIndex } from './DayLevelConfig';

const { ccclass } = _decorator;

export interface DayCompletionOverlayData {
  readonly dayIndex: CampaignDayIndex;
  readonly date: string;
  readonly completedEncounters: number;
  readonly totalEncounters: number;
  readonly wrongAllowCount: number;
  readonly wrongDenyCount: number;
  readonly mode: 'next-day' | 'implemented-content-complete';
  readonly nextDayIndex?: CampaignDayIndex;
  readonly nextDate?: string;
}

interface DayCompletionOverlayCallbacks {
  readonly onContinueRequested?: () => void;
}

interface OverlayLabels {
  readonly titleLabel: Label;
  readonly dayLabel: Label;
  readonly dateLabel: Label;
  readonly inspectionCaptionLabel: Label;
  readonly inspectionCountLabel: Label;
  readonly mistakesCaptionLabel: Label;
  readonly mistakesCountLabel: Label;
  readonly nextShiftCaptionLabel: Label;
  readonly nextShiftLabel: Label;
  readonly buildLimitLabel: Label;
  readonly continueButtonLabel: Label;
}

@ccclass('DayCompletionOverlayController')
export class DayCompletionOverlayController extends Component {
  private static readonly RUNTIME_ROOT_NAME = 'CampaignDayCompletionOverlayRuntime';
  private static readonly PANEL_BACKGROUND_SPRITEFRAME_PATH =
    'ui/game/campaign/day_complete/ui_day_complete_panel_bg_v1/spriteFrame';
  private static readonly PANEL_BACKGROUND_FALLBACK_SPRITEFRAME_PATH =
    'ui/game/control_room/ui_shift_clock_panel_bg/spriteFrame';
  private static readonly DEFAULT_PANEL_ASPECT_RATIO = 829 / 1448;
  private static readonly PANEL_MAX_WIDTH_RATIO = 0.78;
  private static readonly PANEL_MAX_HEIGHT_RATIO = 0.82;

  private callbacks: DayCompletionOverlayCallbacks = {};
  private runtimeRoot: Node | null = null;
  private completionPanel: Node | null = null;
  private inputBlocker: Node | null = null;
  private continueButton: Button | null = null;
  private panelBackgroundSprite: Sprite | null = null;
  private panelBackgroundLoadAttempted = false;
  private panelBackgroundFallbackLoadAttempted = false;
  private panelBackgroundAspectRatio = DayCompletionOverlayController.DEFAULT_PANEL_ASPECT_RATIO;
  private labels: OverlayLabels | null = null;
  private continueLocked = false;
  private currentMode: DayCompletionOverlayData['mode'] = 'next-day';

  private readonly swallowTouch = (event: EventTouch): void => {
    event.stopPropagation();
    event.stopPropagationImmediate();
  };

  private readonly handleContinueClick = (): void => {
    if (!this.runtimeRoot?.active) {
      return;
    }
    if (this.currentMode !== 'next-day') {
      return;
    }
    if (this.continueLocked) {
      return;
    }
    if (!this.continueButton?.interactable) {
      return;
    }
    this.continueLocked = true;
    this.setContinueInteractable(false);
    this.callbacks.onContinueRequested?.();
  };

  public configure(callbacks: DayCompletionOverlayCallbacks): void {
    this.callbacks = callbacks;
  }

  public show(data: DayCompletionOverlayData): void {
    if (!this.ensureOverlay()) {
      return;
    }
    if (!this.runtimeRoot || !this.labels || !this.continueButton || !this.completionPanel) {
      return;
    }

    this.currentMode = data.mode;
    this.continueLocked = false;
    this.setContinueInteractable(true);

    this.labels.titleLabel.string =
      data.mode === 'implemented-content-complete' ? 'CURRENT BUILD COMPLETE' : 'SHIFT COMPLETE';
    this.labels.dayLabel.string = `DAY ${data.dayIndex}`;
    this.labels.dateLabel.string = data.date;
    this.labels.inspectionCaptionLabel.string = 'SCHEDULED INSPECTIONS';
    this.labels.inspectionCountLabel.string = `${data.completedEncounters} / ${data.totalEncounters}`;
    const mistakesCount =
      this.normalizeNonNegativeCount(data.wrongAllowCount) +
      this.normalizeNonNegativeCount(data.wrongDenyCount);
    this.labels.mistakesCaptionLabel.string = 'MISTAKES';
    this.labels.mistakesCountLabel.string = String(mistakesCount);

    const nextShiftVisible = data.mode === 'next-day';
    this.labels.nextShiftCaptionLabel.node.active = nextShiftVisible;
    this.labels.nextShiftLabel.node.active = nextShiftVisible;
    this.continueButton.node.active = nextShiftVisible;
    this.labels.buildLimitLabel.node.active = !nextShiftVisible;

    if (nextShiftVisible) {
      const nextDayText = data.nextDayIndex ? `DAY ${data.nextDayIndex}` : 'DAY ?';
      const nextDateText = data.nextDate ?? '---- -- --';
      this.labels.nextShiftCaptionLabel.string = 'NEXT SHIFT';
      this.labels.nextShiftLabel.string = `${nextDayText} - ${nextDateText}`;
      this.labels.buildLimitLabel.string = '';
    } else {
      this.labels.nextShiftCaptionLabel.string = '';
      this.labels.nextShiftLabel.string = '';
      this.labels.buildLimitLabel.string = 'DAYS 4–7 ARE NOT IMPLEMENTED IN THIS BUILD';
      this.setContinueInteractable(false);
    }

    this.applyPanelLayout();
    this.runtimeRoot.active = true;
  }

  public hide(): void {
    if (!this.runtimeRoot || !isValid(this.runtimeRoot, true)) {
      return;
    }
    this.runtimeRoot.active = false;
    this.continueLocked = false;
    this.setContinueInteractable(false);
  }

  public setContinueInteractable(enabled: boolean): void {
    if (!this.continueButton || !isValid(this.continueButton, true)) {
      return;
    }
    const allow = enabled && !this.continueLocked && this.currentMode === 'next-day';
    this.continueButton.interactable = allow;
    this.syncContinueButtonVisualState(allow);
    if (this.labels?.continueButtonLabel && isValid(this.labels.continueButtonLabel, true)) {
      this.labels.continueButtonLabel.color = allow ? new Color(224, 214, 202, 255) : new Color(126, 118, 112, 255);
    }
  }

  public isVisible(): boolean {
    return Boolean(this.runtimeRoot?.active);
  }

  public destroyOverlay(): void {
    if (this.continueButton?.node && isValid(this.continueButton.node, true)) {
      this.continueButton.node.off(Button.EventType.CLICK, this.handleContinueClick, this);
    }
    if (this.inputBlocker && isValid(this.inputBlocker, true)) {
      this.inputBlocker.off(Node.EventType.TOUCH_START, this.swallowTouch, this);
      this.inputBlocker.off(Node.EventType.TOUCH_END, this.swallowTouch, this);
      this.inputBlocker.off(Node.EventType.TOUCH_MOVE, this.swallowTouch, this);
      this.inputBlocker.off(Node.EventType.TOUCH_CANCEL, this.swallowTouch, this);
    }
    if (this.runtimeRoot && isValid(this.runtimeRoot, true)) {
      this.runtimeRoot.destroy();
    }
    this.runtimeRoot = null;
    this.completionPanel = null;
    this.inputBlocker = null;
    this.continueButton = null;
    this.panelBackgroundSprite = null;
    this.panelBackgroundLoadAttempted = false;
    this.panelBackgroundFallbackLoadAttempted = false;
    this.panelBackgroundAspectRatio = DayCompletionOverlayController.DEFAULT_PANEL_ASPECT_RATIO;
    this.labels = null;
    this.continueLocked = false;
  }

  onDestroy(): void {
    this.callbacks = {};
    this.destroyOverlay();
  }

  private ensureOverlay(): boolean {
    if (this.runtimeRoot && isValid(this.runtimeRoot, true)) {
      return true;
    }

    const root = this.node.getChildByName(DayCompletionOverlayController.RUNTIME_ROOT_NAME) ?? new Node(
      DayCompletionOverlayController.RUNTIME_ROOT_NAME,
    );
    if (!root.parent) {
      this.node.addChild(root);
    }
    root.setSiblingIndex(this.node.children.length - 1);
    root.setPosition(0, 0, 0);
    root.active = false;

    const rootTransform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
    rootTransform.setAnchorPoint(0.5, 0.5);
    rootTransform.setContentSize(720, 1280);
    const rootWidget = root.getComponent(Widget) ?? root.addComponent(Widget);
    rootWidget.isAlignTop = true;
    rootWidget.isAlignBottom = true;
    rootWidget.isAlignLeft = true;
    rootWidget.isAlignRight = true;
    rootWidget.top = 0;
    rootWidget.bottom = 0;
    rootWidget.left = 0;
    rootWidget.right = 0;

    const dimmer = this.ensureBoxNode(root, 'Dimmer', new Color(0, 0, 0, 195));
    dimmer.setSiblingIndex(0);

    const inputBlocker = this.ensureTouchBlocker(root, 'InputBlocker');
    inputBlocker.setSiblingIndex(1);

    const panel = this.ensurePanelNode(root);
    panel.setSiblingIndex(2);
    const labels = this.ensureLabels(panel);
    const continueButton = this.ensureContinueButton(panel, labels.continueButtonLabel.node);

    this.runtimeRoot = root;
    this.completionPanel = panel;
    this.inputBlocker = inputBlocker;
    this.continueButton = continueButton;
    this.labels = labels;
    return true;
  }

  private ensureBoxNode(parent: Node, name: string, color: Color): Node {
    const node = parent.getChildByName(name) ?? new Node(name);
    if (!node.parent) {
      parent.addChild(node);
    }
    node.setPosition(0, 0, 0);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(720, 1280);
    const widget = node.getComponent(Widget) ?? node.addComponent(Widget);
    widget.isAlignTop = true;
    widget.isAlignBottom = true;
    widget.isAlignLeft = true;
    widget.isAlignRight = true;
    widget.top = 0;
    widget.bottom = 0;
    widget.left = 0;
    widget.right = 0;
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = color;
    graphics.rect(-360, -640, 720, 1280);
    graphics.fill();
    return node;
  }

  private ensureTouchBlocker(parent: Node, name: string): Node {
    const node = this.ensureBoxNode(parent, name, new Color(0, 0, 0, 0));
    node.on(Node.EventType.TOUCH_START, this.swallowTouch, this);
    node.on(Node.EventType.TOUCH_END, this.swallowTouch, this);
    node.on(Node.EventType.TOUCH_MOVE, this.swallowTouch, this);
    node.on(Node.EventType.TOUCH_CANCEL, this.swallowTouch, this);
    return node;
  }

  private ensurePanelNode(parent: Node): Node {
    const panel = parent.getChildByName('CompletionPanel') ?? new Node('CompletionPanel');
    if (!panel.parent) {
      parent.addChild(panel);
    }
    panel.setPosition(0, 0, 0);
    const transform = panel.getComponent(UITransform) ?? panel.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(520, 908);
    this.panelBackgroundSprite = this.ensurePanelBackgroundVisual(panel);
    this.tryLoadPanelBackgroundSprite();
    this.disableLegacyPanelVisuals(panel);
    return panel;
  }

  private ensureLabels(panel: Node): OverlayLabels {
    this.removeLegacyWrongDecisionNodes(panel);
    const titleLabel = this.ensureLabelNode(panel, {
      nodeName: 'TitleLabel',
      position: new Vec3(0, 360, 0),
      size: [420, 58],
      fontSize: 38,
      color: new Color(181, 66, 58, 255),
    });
    this.ensureLabelOutline(titleLabel, new Color(40, 12, 12, 190), 2);
    const dayLabel = this.ensureLabelNode(panel, {
      nodeName: 'DayLabel',
      position: new Vec3(0, 245, 0),
      size: [420, 50],
      fontSize: 34,
      color: new Color(229, 219, 206, 255),
    });
    const dateLabel = this.ensureLabelNode(panel, {
      nodeName: 'DateLabel',
      position: new Vec3(0, 195, 0),
      size: [420, 34],
      fontSize: 23,
      color: new Color(196, 188, 176, 255),
    });
    const inspectionCaptionLabel = this.ensureLabelNode(panel, {
      nodeName: 'InspectionCaptionLabel',
      position: new Vec3(0, 108, 0),
      size: [420, 32],
      fontSize: 20,
      color: new Color(168, 158, 148, 255),
    });
    const inspectionCountLabel = this.ensureLabelNode(panel, {
      nodeName: 'InspectionCountLabel',
      position: new Vec3(0, 50, 0),
      size: [420, 52],
      fontSize: 40,
      color: new Color(235, 223, 205, 255),
    });
    this.ensureLabelOutline(inspectionCountLabel, new Color(58, 22, 14, 170), 2);
    const mistakesCaptionLabel = this.ensureLabelNode(panel, {
      nodeName: 'MistakesCaptionLabel',
      position: new Vec3(0, -30, 0),
      size: [420, 30],
      fontSize: 20,
      color: new Color(168, 158, 148, 255),
    });
    const mistakesCountLabel = this.ensureLabelNode(panel, {
      nodeName: 'MistakesCountLabel',
      position: new Vec3(0, -74, 0),
      size: [420, 42],
      fontSize: 34,
      color: new Color(235, 223, 205, 255),
    });
    this.ensureLabelOutline(mistakesCountLabel, new Color(58, 22, 14, 170), 2);
    const nextShiftCaptionLabel = this.ensureLabelNode(panel, {
      nodeName: 'NextShiftCaptionLabel',
      position: new Vec3(0, -48, 0),
      size: [420, 30],
      fontSize: 20,
      color: new Color(168, 158, 148, 255),
    });
    const nextShiftLabel = this.ensureLabelNode(panel, {
      nodeName: 'NextShiftLabel',
      position: new Vec3(0, -94, 0),
      size: [420, 38],
      fontSize: 28,
      color: new Color(225, 216, 203, 255),
    });
    const buildLimitLabel = this.ensureLabelNode(panel, {
      nodeName: 'BuildLimitLabel',
      position: new Vec3(0, -118, 0),
      size: [420, 92],
      fontSize: 23,
      color: new Color(198, 189, 178, 255),
    });
    buildLimitLabel.node.active = false;

    const continueButtonLabel = this.ensureLabelNode(panel, {
      nodeName: 'ContinueButtonLabel',
      position: new Vec3(0, -340, 0),
      size: [360, 40],
      fontSize: 24,
      color: new Color(224, 214, 202, 255),
    });
    continueButtonLabel.string = 'CONTINUE TO NEXT SHIFT';
    this.ensureLabelOutline(continueButtonLabel, new Color(34, 20, 20, 180), 1);
    continueButtonLabel.enableWrapText = false;
    continueButtonLabel.overflow = Label.Overflow.SHRINK;

    return {
      titleLabel,
      dayLabel,
      dateLabel,
      inspectionCaptionLabel,
      inspectionCountLabel,
      mistakesCaptionLabel,
      mistakesCountLabel,
      nextShiftCaptionLabel,
      nextShiftLabel,
      buildLimitLabel,
      continueButtonLabel,
    };
  }

  private ensureContinueButton(panel: Node, labelNode: Node): Button {
    const buttonNode = panel.getChildByName('ContinueButton') ?? new Node('ContinueButton');
    if (!buttonNode.parent) {
      panel.addChild(buttonNode);
    }
    buttonNode.setPosition(0, -340, 0);
    const transform = buttonNode.getComponent(UITransform) ?? buttonNode.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(360, 72);
    const legacyBackgroundNode = buttonNode.getChildByName('ContinueButtonBackgroundVisual');
    if (legacyBackgroundNode) {
      legacyBackgroundNode.active = false;
    }
    const legacyGraphics = buttonNode.getComponent(Graphics);
    legacyGraphics?.clear();

    if (labelNode.parent !== buttonNode) {
      labelNode.removeFromParent();
      buttonNode.addChild(labelNode);
    }
    labelNode.setPosition(0, 0, 0);

    const button = buttonNode.getComponent(Button) ?? buttonNode.addComponent(Button);
    buttonNode.off(Button.EventType.CLICK, this.handleContinueClick, this);
    buttonNode.on(Button.EventType.CLICK, this.handleContinueClick, this);
    return button;
  }

  private ensureLabelNode(
    parent: Node,
    config: {
      readonly nodeName: string;
      readonly position: Vec3;
      readonly size: [number, number];
      readonly fontSize: number;
      readonly color: Color;
    },
  ): Label {
    const node = parent.getChildByName(config.nodeName) ?? new Node(config.nodeName);
    if (!node.parent) {
      parent.addChild(node);
    }
    node.setPosition(config.position);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(config.size[0], config.size[1]);
    const label = node.getComponent(Label) ?? node.addComponent(Label);
    label.useSystemFont = true;
    label.color = config.color;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.fontSize = config.fontSize;
    label.lineHeight = Math.round(config.fontSize * 1.2);
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = true;
    return label;
  }

  private ensurePanelBackgroundVisual(panel: Node): Sprite {
    const node = panel.getChildByName('PanelBackgroundVisual') ?? new Node('PanelBackgroundVisual');
    if (!node.parent) {
      panel.addChild(node);
    }
    node.setPosition(0, 0, 0);
    const panelTransform = panel.getComponent(UITransform);
    const width = panelTransform?.contentSize.width ?? 520;
    const height = panelTransform?.contentSize.height ?? 908;
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(width, height);
    const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.color = new Color(255, 255, 255, 255);
    node.setSiblingIndex(0);
    return sprite;
  }

  private disableLegacyPanelVisuals(panel: Node): void {
    const frameNode = panel.getChildByName('PanelFrameVisual');
    if (frameNode) {
      frameNode.active = false;
      frameNode.getComponent(Graphics)?.clear();
    }
    const titleBandNode = panel.getChildByName('PanelTitleBandVisual');
    if (titleBandNode) {
      titleBandNode.active = false;
      titleBandNode.getComponent(Graphics)?.clear();
    }
  }

  private tryLoadPanelBackgroundSprite(): void {
    const sprite = this.panelBackgroundSprite;
    if (!sprite || !isValid(sprite, true)) {
      return;
    }
    const cachedSpriteFrame = resources.get(
      DayCompletionOverlayController.PANEL_BACKGROUND_SPRITEFRAME_PATH,
      SpriteFrame,
    );
    if (cachedSpriteFrame) {
      this.applyPanelSpriteFrame(cachedSpriteFrame, false);
      return;
    }
    if (this.panelBackgroundLoadAttempted) {
      return;
    }
    this.panelBackgroundLoadAttempted = true;
    resources.load(
      DayCompletionOverlayController.PANEL_BACKGROUND_SPRITEFRAME_PATH,
      SpriteFrame,
      (error, spriteFrame) => {
        if (error) {
          console.warn(
            '[DayCompletionOverlay] failed to load new day completion panel background; trying fallback.',
            error,
          );
          this.tryLoadPanelBackgroundFallbackSprite();
          return;
        }
        if (!spriteFrame) {
          this.tryLoadPanelBackgroundFallbackSprite();
          return;
        }
        this.applyPanelSpriteFrame(spriteFrame, false);
      },
    );
  }

  private syncContinueButtonVisualState(enabled: boolean): void {
    if (!this.continueButton || !isValid(this.continueButton, true)) {
      return;
    }
    this.continueButton.node.opacity = enabled ? 255 : 190;
  }

  private tryLoadPanelBackgroundFallbackSprite(): void {
    if (this.panelBackgroundFallbackLoadAttempted) {
      return;
    }
    this.panelBackgroundFallbackLoadAttempted = true;
    resources.load(
      DayCompletionOverlayController.PANEL_BACKGROUND_FALLBACK_SPRITEFRAME_PATH,
      SpriteFrame,
      (error, spriteFrame) => {
        if (error) {
          console.warn('[DayCompletionOverlay] fallback panel background unavailable.', error);
          return;
        }
        if (!spriteFrame) {
          return;
        }
        this.applyPanelSpriteFrame(spriteFrame, true);
      },
    );
  }

  private applyPanelSpriteFrame(spriteFrame: SpriteFrame, isFallback: boolean): void {
    if (!this.panelBackgroundSprite || !isValid(this.panelBackgroundSprite, true)) {
      return;
    }
    this.panelBackgroundSprite.spriteFrame = spriteFrame;
    const originalSize = spriteFrame.originalSize;
    if (originalSize.height > 0) {
      this.panelBackgroundAspectRatio = originalSize.width / originalSize.height;
    }
    if (isFallback) {
      console.warn('[DayCompletionOverlay] using fallback panel background sprite.');
    }
    this.applyPanelLayout();
  }

  private applyPanelLayout(): void {
    if (!this.runtimeRoot || !this.completionPanel || !this.labels || !this.continueButton) {
      return;
    }
    if (!isValid(this.runtimeRoot, true) || !isValid(this.completionPanel, true)) {
      return;
    }
    const runtimeTransform = this.runtimeRoot.getComponent(UITransform);
    const panelTransform = this.completionPanel.getComponent(UITransform);
    if (!runtimeTransform || !panelTransform) {
      return;
    }

    const canvasWidth = runtimeTransform.contentSize.width || 720;
    const canvasHeight = runtimeTransform.contentSize.height || 1280;
    const maxWidth = canvasWidth * DayCompletionOverlayController.PANEL_MAX_WIDTH_RATIO;
    const maxHeight = canvasHeight * DayCompletionOverlayController.PANEL_MAX_HEIGHT_RATIO;
    const aspect = Math.max(0.2, this.panelBackgroundAspectRatio || DayCompletionOverlayController.DEFAULT_PANEL_ASPECT_RATIO);
    let panelWidth = Math.min(maxWidth, maxHeight * aspect);
    let panelHeight = panelWidth / aspect;
    if (panelHeight > maxHeight) {
      panelHeight = maxHeight;
      panelWidth = panelHeight * aspect;
    }
    panelTransform.setContentSize(panelWidth, panelHeight);
    this.syncPanelBackgroundVisualSize(panelWidth, panelHeight);
    this.disableLegacyPanelVisuals(this.completionPanel);
    this.applyPanelLayoutForMode(panelWidth, panelHeight, this.currentMode === 'implemented-content-complete');
  }

  private applyPanelLayoutForMode(panelWidth: number, panelHeight: number, isBuildComplete: boolean): void {
    if (!this.labels || !this.continueButton) {
      return;
    }
    this.layoutLabel(this.labels.titleLabel, {
      y: this.panelYFromTop(panelHeight, 0.205),
      width: panelWidth * 0.8,
      fontSize: this.clamp(Math.round(panelWidth * 0.084), 45, 54),
      lineHeightRatio: 1.08,
      wrap: false,
    });
    this.layoutLabel(this.labels.dayLabel, {
      y: this.panelYFromTop(panelHeight, 0.285),
      width: panelWidth * 0.7,
      fontSize: this.clamp(Math.round(panelWidth * 0.078), 42, 48),
      lineHeightRatio: 1.08,
      wrap: false,
    });
    this.layoutLabel(this.labels.dateLabel, {
      y: this.panelYFromTop(panelHeight, 0.332),
      width: panelWidth * 0.7,
      fontSize: this.clamp(Math.round(panelWidth * 0.05), 27, 31),
      lineHeightRatio: 1.1,
      wrap: false,
    });
    this.layoutLabel(this.labels.inspectionCaptionLabel, {
      y: this.panelYFromTop(panelHeight, isBuildComplete ? 0.425 : 0.418),
      width: panelWidth * 0.78,
      fontSize: this.clamp(Math.round(panelWidth * 0.051), 27, 31),
      lineHeightRatio: 1.1,
      wrap: false,
    });
    this.layoutLabel(this.labels.inspectionCountLabel, {
      y: this.panelYFromTop(panelHeight, isBuildComplete ? 0.478 : 0.468),
      width: panelWidth * 0.7,
      fontSize: this.clamp(Math.round(panelWidth * 0.098), 52, 58),
      lineHeightRatio: 1.05,
      wrap: false,
    });
    this.layoutLabel(this.labels.mistakesCaptionLabel, {
      y: this.panelYFromTop(panelHeight, isBuildComplete ? 0.575 : 0.565),
      width: panelWidth * 0.78,
      fontSize: this.clamp(Math.round(panelWidth * 0.05), 26, 30),
      lineHeightRatio: 1.1,
      wrap: false,
    });
    this.layoutLabel(this.labels.mistakesCountLabel, {
      y: this.panelYFromTop(panelHeight, isBuildComplete ? 0.63 : 0.618),
      width: panelWidth * 0.7,
      fontSize: this.clamp(Math.round(panelWidth * 0.088), 46, 52),
      lineHeightRatio: 1.06,
      wrap: false,
    });
    this.layoutLabel(this.labels.nextShiftCaptionLabel, {
      y: this.panelYFromTop(panelHeight, 0.715),
      width: panelWidth * 0.78,
      fontSize: this.clamp(Math.round(panelWidth * 0.05), 26, 30),
      lineHeightRatio: 1.1,
      wrap: false,
    });
    this.layoutLabel(this.labels.nextShiftLabel, {
      y: this.panelYFromTop(panelHeight, 0.762),
      width: panelWidth * 0.82,
      fontSize: this.clamp(Math.round(panelWidth * 0.067), 35, 40),
      lineHeightRatio: 1.08,
      wrap: false,
    });
    this.layoutLabel(this.labels.buildLimitLabel, {
      y: this.panelYFromTop(panelHeight, 0.742),
      width: panelWidth * 0.76,
      fontSize: this.clamp(Math.round(panelWidth * 0.045), 24, 28),
      lineHeightRatio: 1.1,
      wrap: true,
    });

    this.continueButton.node.setPosition(0, this.panelYFromTop(panelHeight, 0.885), 0);
    const buttonTransform = this.continueButton.node.getComponent(UITransform);
    const buttonWidth = Math.round(panelWidth * 0.75);
    const buttonHeight = Math.round(panelHeight * 0.062);
    buttonTransform?.setContentSize(buttonWidth, buttonHeight);

    this.labels.continueButtonLabel.node.setPosition(0, 0, 0);
    const continueLabelTransform = this.labels.continueButtonLabel.node.getComponent(UITransform);
    continueLabelTransform?.setContentSize(Math.round(buttonWidth * 0.92), buttonHeight);
    this.labels.continueButtonLabel.fontSize = this.clamp(Math.round(panelWidth * 0.052), 26, 31);
    this.labels.continueButtonLabel.lineHeight = Math.round(this.labels.continueButtonLabel.fontSize * 1.05);
    this.labels.continueButtonLabel.enableWrapText = false;
    this.labels.continueButtonLabel.overflow = Label.Overflow.SHRINK;
  }

  private syncPanelBackgroundVisualSize(width: number, height: number): void {
    if (!this.completionPanel) {
      return;
    }
    const backgroundNode = this.completionPanel.getChildByName('PanelBackgroundVisual');
    const backgroundTransform = backgroundNode?.getComponent(UITransform);
    backgroundTransform?.setContentSize(width, height);
  }

  private layoutLabel(
    label: Label,
    options: {
      readonly y: number;
      readonly width: number;
      readonly fontSize: number;
      readonly lineHeightRatio: number;
      readonly wrap: boolean;
    },
  ): void {
    label.node.setPosition(0, options.y, 0);
    const transform = label.node.getComponent(UITransform);
    const lineHeight = Math.round(options.fontSize * options.lineHeightRatio);
    const minHeight = Math.ceil(lineHeight * 1.15);
    transform?.setContentSize(Math.round(options.width), minHeight);
    label.fontSize = options.fontSize;
    label.lineHeight = lineHeight;
    label.enableWrapText = options.wrap;
    label.overflow = Label.Overflow.SHRINK;
  }

  private panelYFromTop(panelHeight: number, normalizedYFromTop: number): number {
    return panelHeight * (0.5 - normalizedYFromTop);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private normalizeNonNegativeCount(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.floor(value));
  }

  private removeLegacyWrongDecisionNodes(panel: Node): void {
    const legacyNames = [
      'WrongAllowCaptionLabel',
      'WrongAllowCountLabel',
      'WrongDenyCaptionLabel',
      'WrongDenyCountLabel',
    ] as const;
    for (const nodeName of legacyNames) {
      const legacyNode = panel.getChildByName(nodeName);
      if (!legacyNode) {
        continue;
      }
      legacyNode.removeFromParent();
      legacyNode.destroy();
    }
  }

  private ensureLabelOutline(label: Label, color: Color, width: number): void {
    const outline = label.node.getComponent(LabelOutline) ?? label.node.addComponent(LabelOutline);
    outline.color = color;
    outline.width = Math.max(1, width);
  }
}
