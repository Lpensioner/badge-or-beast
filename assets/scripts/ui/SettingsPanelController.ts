import {
  _decorator,
  BlockInputEvents,
  Button,
  Color,
  Component,
  Graphics,
  Label,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  director,
  resources,
} from 'cc';
import { AudioManager } from '../audio/AudioManager';

const { ccclass } = _decorator;

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 1280;
const SETTINGS_BUTTON_NAME = 'SettingsButton';
const SETTINGS_OVERLAY_NAME = 'SettingsOverlay';
const SETTINGS_PANEL_NAME = 'SettingsPanel';
const HOME_SCENE_NAME = 'HomeScene';
const GAME_SCENE_NAME = 'GameScene';

type ToggleKind = 'sound' | 'music' | 'voice';

@ccclass('SettingsPanelController')
export class SettingsPanelController extends Component {
  private canvas: Node | null = null;
  private settingsButton: Node | null = null;
  private settingsOverlay: Node | null = null;
  private settingsPanel: Node | null = null;
  private returnHomeButton: Node | null = null;

  private settingsButtonComp: Button | null = null;
  private closeButtonComp: Button | null = null;
  private returnHomeButtonComp: Button | null = null;
  private soundButtonComp: Button | null = null;
  private musicButtonComp: Button | null = null;
  private voiceButtonComp: Button | null = null;

  private soundIconGraphics: Graphics | null = null;
  private musicIconGraphics: Graphics | null = null;
  private voiceIconGraphics: Graphics | null = null;

  private panelOpen = false;
  private uiReady = false;
  private sceneSwitching = false;
  private buildingUi = false;

  onLoad(): void {
    this.canvas = this.resolveCanvas();
    if (!this.canvas) {
      console.error('[SettingsPanelController] Canvas not found.');
      this.enabled = false;
      return;
    }

    AudioManager.ensureInstance();
    this.ensureUi();
  }

  onEnable(): void {
    this.bindEvents();
  }

  onDisable(): void {
    this.unbindEvents();
  }

  onDestroy(): void {
    this.unbindEvents();
  }

  public openSettings(): void {
    if (!this.uiReady || this.panelOpen || !this.settingsOverlay || !this.canvas) {
      return;
    }
    this.settingsOverlay.setSiblingIndex(this.canvas.children.length - 1);
    this.settingsOverlay.active = true;
    this.panelOpen = true;
    this.redrawToggleIcons();
    this.refreshReturnHomeVisibility();
  }

  public closeSettings(): void {
    if (!this.settingsOverlay || !this.panelOpen) {
      return;
    }
    this.settingsOverlay.active = false;
    this.panelOpen = false;
  }

  private resolveCanvas(): Node | null {
    let current: Node | null = this.node;
    while (current) {
      if (current.name === 'Canvas') {
        return current;
      }
      current = current.parent;
    }
    return this.node.scene?.getChildByName('Canvas') ?? null;
  }

  private ensureUi(): void {
    if (!this.canvas || this.buildingUi) {
      return;
    }
    this.buildingUi = true;

    this.settingsButton = this.canvas.getChildByName(SETTINGS_BUTTON_NAME);
    if (!this.settingsButton) {
      this.settingsButton = this.createSettingsButton(this.canvas);
    }

    this.settingsOverlay = this.canvas.getChildByName(SETTINGS_OVERLAY_NAME);
    if (!this.settingsOverlay) {
      this.settingsOverlay = this.createSettingsOverlay(this.canvas);
    }

    this.settingsPanel = this.settingsOverlay.getChildByName(SETTINGS_PANEL_NAME);
    this.returnHomeButton = this.settingsPanel?.getChildByName('ReturnHomeButton') ?? null;
    this.sanitizeCloseButtonHotspot();

    this.settingsButtonComp = this.settingsButton.getComponent(Button);
    this.closeButtonComp = this.settingsPanel?.getChildByName('CloseButton')?.getComponent(Button) ?? null;
    this.returnHomeButtonComp = this.returnHomeButton?.getComponent(Button) ?? null;
    this.soundButtonComp = this.settingsPanel?.getChildByName('SoundRow')?.getComponent(Button) ?? null;
    this.musicButtonComp = this.settingsPanel?.getChildByName('MusicRow')?.getComponent(Button) ?? null;
    this.voiceButtonComp = this.settingsPanel?.getChildByName('VoiceRow')?.getComponent(Button) ?? null;

    this.soundIconGraphics =
      this.settingsPanel?.getChildByName('SoundRow')?.getChildByName('Icon')?.getComponent(Graphics) ?? null;
    this.musicIconGraphics =
      this.settingsPanel?.getChildByName('MusicRow')?.getChildByName('Icon')?.getComponent(Graphics) ?? null;
    this.voiceIconGraphics =
      this.settingsPanel?.getChildByName('VoiceRow')?.getChildByName('Icon')?.getComponent(Graphics) ?? null;

    this.settingsOverlay.active = false;
    this.panelOpen = false;
    this.layoutPanelContent();
    this.refreshReturnHomeVisibility();
    this.redrawToggleIcons();
    if (this.settingsButton) {
      this.settingsButton.setSiblingIndex(this.canvas.children.length - 1);
    }
    this.uiReady = true;
    this.buildingUi = false;

    this.loadSprites();
  }

  private createSettingsButton(parent: Node): Node {
    const buttonNode = new Node(SETTINGS_BUTTON_NAME);
    parent.addChild(buttonNode);
    buttonNode.layer = parent.layer;
    buttonNode.setPosition(-300, 585, 0);

    const transform = buttonNode.addComponent(UITransform);
    transform.setContentSize(96, 96);
    transform.setAnchorPoint(0.5, 0.5);

    const visual = new Node('SettingsButtonVisual');
    buttonNode.addChild(visual);
    visual.layer = parent.layer;
    visual.addComponent(UITransform).setContentSize(96, 96);
    visual.addComponent(Sprite);

    const button = buttonNode.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.94;
    button.duration = 0.08;
    button.target = visual;

    return buttonNode;
  }

  private createSettingsOverlay(parent: Node): Node {
    const overlay = new Node(SETTINGS_OVERLAY_NAME);
    parent.addChild(overlay);
    overlay.layer = parent.layer;
    overlay.setPosition(0, 0, 0);
    overlay.addComponent(UITransform).setContentSize(CANVAS_WIDTH, CANVAS_HEIGHT);
    overlay.addComponent(BlockInputEvents);

    const scrim = new Node('SettingsScrim');
    overlay.addChild(scrim);
    scrim.layer = parent.layer;
    scrim.addComponent(UITransform).setContentSize(CANVAS_WIDTH, CANVAS_HEIGHT);
    const scrimGraphics = scrim.addComponent(Graphics);
    scrimGraphics.clear();
    scrimGraphics.fillColor = new Color(0, 0, 0, 165);
    scrimGraphics.rect(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2, CANVAS_WIDTH, CANVAS_HEIGHT);
    scrimGraphics.fill();
    scrim.addComponent(BlockInputEvents);

    const panel = new Node(SETTINGS_PANEL_NAME);
    overlay.addChild(panel);
    panel.layer = parent.layer;
    panel.setPosition(0, 10, 0);
    panel.addComponent(UITransform).setContentSize(560, 840);

    const panelBg = new Node('SettingsPanelBackground');
    panel.addChild(panelBg);
    panelBg.layer = parent.layer;
    panelBg.addComponent(UITransform).setContentSize(560, 840);
    panelBg.addComponent(Sprite);

    this.createCloseButton(panel);
    this.createMenuRow(panel, 'SoundRow', 'Sound Effects');
    this.createMenuRow(panel, 'MusicRow', 'Music');
    this.createMenuRow(panel, 'VoiceRow', 'Voice Acting');
    this.createReturnHomeButton(panel);

    return overlay;
  }

  private createCloseButton(panel: Node): void {
    // Transparent hotspot over the X baked into the panel background art.
    const closeButton = new Node('CloseButton');
    panel.addChild(closeButton);
    closeButton.layer = panel.layer;
    closeButton.addComponent(UITransform).setContentSize(72, 72);

    const button = closeButton.addComponent(Button);
    button.transition = Button.Transition.NONE;
    button.target = closeButton;
  }

  /** Strip any leftover CloseButton visuals so only the bg X is shown. */
  private sanitizeCloseButtonHotspot(): void {
    const closeButton = this.settingsPanel?.getChildByName('CloseButton');
    if (!closeButton?.isValid) {
      return;
    }

    const visual = closeButton.getChildByName('CloseVisual');
    if (visual?.isValid) {
      visual.destroy();
    }
    const label = closeButton.getChildByName('CloseLabel');
    if (label?.isValid) {
      label.destroy();
    }

    const transform = closeButton.getComponent(UITransform);
    if (transform) {
      transform.setContentSize(72, 72);
    }

    const button = closeButton.getComponent(Button);
    if (button) {
      button.transition = Button.Transition.NONE;
      button.target = closeButton;
    }
  }

  private createMenuRow(panel: Node, name: string, text: string): void {
    const row = new Node(name);
    panel.addChild(row);
    row.layer = panel.layer;
    const rowTransform = row.addComponent(UITransform);
    rowTransform.setContentSize(400, 96);
    rowTransform.setAnchorPoint(0.5, 0.5);

    const icon = new Node('Icon');
    row.addChild(icon);
    icon.layer = panel.layer;
    icon.setPosition(-130, 0, 0);
    const iconTransform = icon.addComponent(UITransform);
    iconTransform.setContentSize(84, 84);
    iconTransform.setAnchorPoint(0.5, 0.5);
    icon.addComponent(Graphics);

    const labelNode = new Node('Label');
    row.addChild(labelNode);
    labelNode.layer = panel.layer;
    labelNode.setPosition(36, -2, 0);
    const labelTransform = labelNode.addComponent(UITransform);
    labelTransform.setContentSize(260, 60);
    labelTransform.setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = 34;
    label.lineHeight = 40;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = new Color(35, 30, 26, 255);
    label.useSystemFont = true;
    label.fontFamily = 'Arial';
    label.isBold = true;
    label.overflow = Label.Overflow.SHRINK;

    const button = row.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.97;
    button.duration = 0.08;
    button.target = row;
  }

  private createReturnHomeButton(panel: Node): void {
    const buttonNode = new Node('ReturnHomeButton');
    panel.addChild(buttonNode);
    buttonNode.layer = panel.layer;
    const buttonTransform = buttonNode.addComponent(UITransform);
    buttonTransform.setContentSize(360, 64);
    buttonTransform.setAnchorPoint(0.5, 0.5);

    const labelNode = new Node('ReturnHomeLabel');
    buttonNode.addChild(labelNode);
    labelNode.layer = panel.layer;
    labelNode.setPosition(0, 0, 0);
    const labelTransform = labelNode.addComponent(UITransform);
    labelTransform.setContentSize(360, 64);
    labelTransform.setAnchorPoint(0.5, 0.5);
    const label = labelNode.addComponent(Label);
    label.string = 'Return Home';
    label.fontSize = 34;
    label.lineHeight = 40;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.color = new Color(35, 30, 26, 255);
    label.useSystemFont = true;
    label.fontFamily = 'Arial';
    label.isBold = true;
    label.overflow = Label.Overflow.SHRINK;

    const button = buttonNode.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.96;
    button.duration = 0.08;
    button.target = buttonNode;

    this.returnHomeButton = buttonNode;
  }

  private layoutPanelContent(): void {
    if (!this.settingsPanel?.isValid) {
      return;
    }

    const panelTransform = this.settingsPanel.getComponent(UITransform);
    const panelHeight = panelTransform?.contentSize.height || 840;
    const panelWidth = panelTransform?.contentSize.width || 560;

    // Content area sits on the paper region inside the clipboard frame.
    const paperTop = panelHeight * 0.28;
    const paperBottom = -panelHeight * 0.34;
    const paperCenterY = (paperTop + paperBottom) * 0.5;

    // Align transparent hotspot with the X on the clipboard frame (top-right).
    const closeButton = this.settingsPanel.getChildByName('CloseButton');
    if (closeButton) {
      closeButton.setPosition(panelWidth * 0.404, panelHeight * 0.309, 0);
    }

    const rowNames = ['SoundRow', 'MusicRow', 'VoiceRow'];
    const rowGap = 118;
    const rowsTop = paperCenterY + rowGap;
    for (let i = 0; i < rowNames.length; i++) {
      const row = this.settingsPanel.getChildByName(rowNames[i]);
      if (row) {
        row.setPosition(0, rowsTop - i * rowGap, 0);
      }
    }

    const returnHome = this.settingsPanel.getChildByName('ReturnHomeButton');
    if (returnHome) {
      // Keep clear of the clipboard bottom border.
      returnHome.setPosition(0, paperBottom + 36, 0);
    }
  }

  private loadSprites(): void {
    resources.load('ui/game/settings/ui_settings_button/spriteFrame', SpriteFrame, (error, frame) => {
      if (error || !frame || !this.settingsButton?.isValid) {
        if (error) {
          console.warn('[SettingsPanelController] Failed to load settings button sprite.', error);
        }
        return;
      }
      const visual = this.settingsButton.getChildByName('SettingsButtonVisual');
      const sprite = visual?.getComponent(Sprite) ?? null;
      if (!sprite || !visual) {
        return;
      }
      sprite.spriteFrame = frame;
      this.applyContainSize(visual, frame, 96, 96);
    });

    resources.load('ui/game/settings/ui_settings_panel_bg/spriteFrame', SpriteFrame, (error, frame) => {
      if (error || !frame || !this.settingsPanel?.isValid) {
        if (error) {
          console.warn('[SettingsPanelController] Failed to load settings panel sprite.', error);
        }
        return;
      }
      const bg = this.settingsPanel.getChildByName('SettingsPanelBackground');
      const sprite = bg?.getComponent(Sprite) ?? null;
      if (!sprite || !bg) {
        return;
      }
      sprite.spriteFrame = frame;
      this.applyContainSize(bg, frame, 580, 920);
      const panelTransform = this.settingsPanel.getComponent(UITransform);
      const bgTransform = bg.getComponent(UITransform);
      if (panelTransform && bgTransform) {
        panelTransform.setContentSize(bgTransform.contentSize);
      }
      this.layoutPanelContent();
    });
  }

  private applyContainSize(node: Node, frame: SpriteFrame, maxWidth: number, maxHeight: number): void {
    const transform = node.getComponent(UITransform);
    if (!transform) {
      return;
    }
    const sourceWidth = frame.originalSize.width || frame.rect.width;
    const sourceHeight = frame.originalSize.height || frame.rect.height;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return;
    }
    const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    transform.setContentSize(sourceWidth * scale, sourceHeight * scale);
  }

  private bindEvents(): void {
    this.settingsButtonComp?.node.on(Button.EventType.CLICK, this.onSettingsButtonClick, this);
    this.closeButtonComp?.node.on(Button.EventType.CLICK, this.onCloseClick, this);
    this.returnHomeButtonComp?.node.on(Button.EventType.CLICK, this.onReturnHomeClick, this);
    this.soundButtonComp?.node.on(Button.EventType.CLICK, this.onSoundClick, this);
    this.musicButtonComp?.node.on(Button.EventType.CLICK, this.onMusicClick, this);
    this.voiceButtonComp?.node.on(Button.EventType.CLICK, this.onVoiceClick, this);
  }

  private unbindEvents(): void {
    this.settingsButtonComp?.node.off(Button.EventType.CLICK, this.onSettingsButtonClick, this);
    this.closeButtonComp?.node.off(Button.EventType.CLICK, this.onCloseClick, this);
    this.returnHomeButtonComp?.node.off(Button.EventType.CLICK, this.onReturnHomeClick, this);
    this.soundButtonComp?.node.off(Button.EventType.CLICK, this.onSoundClick, this);
    this.musicButtonComp?.node.off(Button.EventType.CLICK, this.onMusicClick, this);
    this.voiceButtonComp?.node.off(Button.EventType.CLICK, this.onVoiceClick, this);
  }

  private onSettingsButtonClick = (): void => {
    if (!this.uiReady || this.panelOpen) {
      return;
    }
    const audio = this.getAudioManager();
    // Click feedback first, then UI / gesture side effects.
    audio.playCachedSettingsClick();
    audio.handleUserGesture();
    this.openSettings();
  };

  private onCloseClick = (): void => {
    if (!this.panelOpen) {
      return;
    }
    const audio = this.getAudioManager();
    audio.playCachedSettingsClick();
    audio.handleUserGesture();
    this.closeSettings();
  };

  private onSoundClick = (): void => {
    const audio = this.getAudioManager();
    const currentlyEnabled = audio.getSoundEnabled();
    if (currentlyEnabled) {
      // ON -> OFF: play feedback while sound is still enabled, then disable.
      audio.playCachedSettingsClick();
      audio.setSoundEnabled(false);
    } else {
      // OFF -> ON: enable first so the feedback click can be heard.
      audio.setSoundEnabled(true);
      audio.playCachedSettingsClick();
    }
    audio.handleUserGesture();
    this.redrawToggleIcon('sound');
  };

  private onMusicClick = (): void => {
    const audio = this.getAudioManager();
    audio.playCachedSettingsClick();
    audio.handleUserGesture();
    audio.setMusicEnabled(!audio.getMusicEnabled());
    this.redrawToggleIcon('music');
  };

  private onVoiceClick = (): void => {
    const audio = this.getAudioManager();
    audio.playCachedSettingsClick();
    audio.handleUserGesture();
    audio.setVoiceEnabled(!audio.getVoiceEnabled());
    this.redrawToggleIcon('voice');
  };

  private onReturnHomeClick = (): void => {
    if (this.sceneSwitching) {
      return;
    }
    if (!this.isGameScene()) {
      return;
    }

    const audio = this.getAudioManager();
    audio.playCachedSettingsClick();
    audio.handleUserGesture();

    this.sceneSwitching = true;
    this.closeSettings();
    this.destroyOverlayIfNeeded();

    director.loadScene(HOME_SCENE_NAME, (error) => {
      if (!error) {
        return;
      }
      this.sceneSwitching = false;
      console.error('[SettingsPanelController] Failed to load HomeScene.', error);
      this.unbindEvents();
      this.uiReady = false;
      this.ensureUi();
      this.bindEvents();
    });
  };

  private getAudioManager(): AudioManager {
    return AudioManager.ensureInstance();
  }

  private refreshReturnHomeVisibility(): void {
    if (!this.returnHomeButton?.isValid) {
      return;
    }
    const showReturnHome = this.isGameScene();
    this.returnHomeButton.active = showReturnHome;
    if (this.returnHomeButtonComp) {
      this.returnHomeButtonComp.interactable = showReturnHome;
    }
  }

  private isGameScene(): boolean {
    return director.getScene()?.name === GAME_SCENE_NAME;
  }

  private destroyOverlayIfNeeded(): void {
    if (this.settingsOverlay?.isValid) {
      this.settingsOverlay.destroy();
    }
    this.settingsOverlay = null;
    this.settingsPanel = null;
    this.returnHomeButton = null;
    this.closeButtonComp = null;
    this.returnHomeButtonComp = null;
    this.soundButtonComp = null;
    this.musicButtonComp = null;
    this.voiceButtonComp = null;
    this.soundIconGraphics = null;
    this.musicIconGraphics = null;
    this.voiceIconGraphics = null;
    this.panelOpen = false;
  }

  private redrawToggleIcons(): void {
    this.redrawToggleIcon('sound');
    this.redrawToggleIcon('music');
    this.redrawToggleIcon('voice');
  }

  private redrawToggleIcon(kind: ToggleKind): void {
    let graphics: Graphics | null = null;
    let enabled = false;
    const audio = AudioManager.getInstance() ?? AudioManager.ensureInstance();
    if (kind === 'sound') {
      graphics = this.soundIconGraphics;
      enabled = audio.getSoundEnabled();
    } else if (kind === 'music') {
      graphics = this.musicIconGraphics;
      enabled = audio.getMusicEnabled();
    } else {
      graphics = this.voiceIconGraphics;
      enabled = audio.getVoiceEnabled();
    }
    if (!graphics) {
      return;
    }

    graphics.clear();
    const ringColor = enabled ? new Color(70, 120, 70, 255) : new Color(190, 45, 40, 255);
    graphics.lineWidth = 6;
    graphics.strokeColor = ringColor;
    graphics.circle(0, 0, 34);
    graphics.stroke();

    graphics.fillColor = new Color(30, 26, 22, 255);
    if (kind === 'sound') {
      graphics.rect(-14, -10, 12, 20);
      graphics.fill();
      graphics.moveTo(-2, -10);
      graphics.lineTo(14, -22);
      graphics.lineTo(14, 22);
      graphics.lineTo(-2, 10);
      graphics.close();
      graphics.fill();
    } else if (kind === 'music') {
      graphics.circle(-8, -12, 8);
      graphics.fill();
      graphics.rect(0, -12, 5, 30);
      graphics.fill();
      graphics.moveTo(5, 18);
      graphics.lineTo(18, 12);
      graphics.lineTo(18, 4);
      graphics.lineTo(5, 10);
      graphics.close();
      graphics.fill();
    } else {
      graphics.rect(-6, -8, 12, 20);
      graphics.fill();
      graphics.circle(0, 14, 8);
      graphics.fill();
      graphics.rect(-2, -20, 4, 10);
      graphics.fill();
      graphics.rect(-12, -22, 24, 4);
      graphics.fill();
    }

    if (!enabled) {
      graphics.lineWidth = 7;
      graphics.strokeColor = ringColor;
      graphics.moveTo(-22, -22);
      graphics.lineTo(22, 22);
      graphics.stroke();
    }
  }
}
