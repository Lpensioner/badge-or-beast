import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Button,
    Color,
    Component,
    EventTouch,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Node,
    SceneAsset,
    Sprite,
    SpriteFrame,
    Tween,
    UIOpacity,
    UITransform,
    Vec3,
    VerticalTextAlignment,
    Widget,
    director,
    tween,
} from 'cc';
import {
    HIGHEST_IMPLEMENTED_CAMPAIGN_DAY,
    getDayLevelConfig,
    isCampaignDayIndex,
    isImplementedCampaignDay,
} from '../game/campaign/DayCatalog';
import type { CampaignDayIndex } from '../game/campaign/DayLevelConfig';
import { getHighestUnlockedDay } from '../game/campaign/CampaignProgressStore';
import { setRequestedStartDay } from '../game/campaign/CampaignLaunchRequest';
import { AudioManager } from '../audio/AudioManager';

const { ccclass, property } = _decorator;

@ccclass('HomeSceneController')
export class HomeSceneController extends Component {
    private static readonly DAY_SELECTION_ROOT_NAME = 'HomeDaySelectionOverlayRuntime';
    private static readonly DAY_SELECTION_BACKGROUND_UUID = '138c8e18-384a-4ef4-aeca-89f1e1d14ec3@f9941';
    private static readonly DAY_SELECTION_MAX_WIDTH = 580;
    private static readonly DAY_SELECTION_MAX_HEIGHT = 1020;
    private static readonly DAY_SELECTION_MIN_BUTTON_WIDTH = 320;
    private static readonly DAY_SELECTION_MAX_BUTTON_WIDTH = 372;
    private static readonly DAY_SELECTION_BUTTON_HEIGHT = 62;
    private static readonly DAY_SELECTION_BUTTON_GAP = 16;
    private static readonly DAY_SELECTION_CLOSE_HIT_SIZE = 88;

    @property(Node)
    startButton: Node | null = null;

    @property(SceneAsset)
    gameScene: SceneAsset | null = null;

    private _isSwitchingScene = false;
    private _originalButtonScale = new Vec3(1, 1, 1);
    private _hasCapturedOriginalScale = false;
    private _daySelectionOverlayRoot: Node | null = null;
    private _daySelectionDimmer: Node | null = null;
    private _daySelectionPanel: Node | null = null;
    private _daySelectionPanelSprite: Sprite | null = null;
    private _daySelectionTitleLabel: Label | null = null;
    private _daySelectionListRoot: Node | null = null;
    private _daySelectionCloseHit: Node | null = null;
    private _daySelectionCloseButton: Button | null = null;
    private _daySelectionOverlayActive = false;
    private _daySelectionLaunchInProgress = false;
    private _daySelectionVisualGeneration = 0;
    private _daySelectionBackgroundLoadGeneration = 0;
    private _daySelectionButtons: Button[] = [];

    private readonly _swallowTouch = (event: EventTouch): void => {
        event.stopPropagation();
        event.stopPropagationImmediate();
    };

    onLoad(): void {
        this.captureOriginalScaleIfNeeded();
        this.ensureBackgroundMusicOnEnter();
    }

    start(): void {
        // Scene is fully ready — request HomeScene BGM again in case early load raced resources.
        this.ensureBackgroundMusicOnEnter();
    }

    onEnable(): void {
        if (!this.startButton) {
            console.error('[HomeSceneController] startButton is not assigned.');
            return;
        }

        this.captureOriginalScaleIfNeeded();
        this.resetButtonState();
        this.ensureBackgroundMusicOnEnter();

        this.startButton.off(Node.EventType.TOUCH_END, this.onStartButtonClick, this);
        this.startButton.on(Node.EventType.TOUCH_END, this.onStartButtonClick, this);
    }

    onDisable(): void {
        this.closeDaySelectionOverlay(false);
        this.destroyDaySelectionOverlayRuntime();
        if (this.startButton) {
            this.startButton.off(Node.EventType.TOUCH_END, this.onStartButtonClick, this);
            Tween.stopAllByTarget(this.startButton);

            const opacity = this.startButton.getComponent(UIOpacity);
            if (opacity) {
                Tween.stopAllByTarget(opacity);
            }
        }
    }

    private onStartButtonClick(): void {
        this.tryStartGame();
    }

    private tryStartGame(): void {
        if (this._isSwitchingScene) {
            return;
        }
        if (this._daySelectionOverlayActive || this._daySelectionLaunchInProgress) {
            return;
        }
        if (!this.startButton) {
            console.error('[HomeSceneController] startButton is not assigned.');
            return;
        }
        if (!this.gameScene) {
            console.error('[HomeSceneController] gameScene is not assigned.');
            return;
        }

        const button = this.startButton.getComponent(Button);
        if (!button || !button.interactable) {
            return;
        }

        this.notifyAudioUserGesture();
        AudioManager.getInstance()?.playCachedSettingsClick();
        this.captureOriginalScaleIfNeeded();

        const startButtonNode = this.startButton;
        const opacity = this.getOrCreateButtonOpacity(startButtonNode);
        const currentScale = startButtonNode.scale.clone();
        const pressedScale = new Vec3(currentScale.x * 0.94, currentScale.y * 0.94, currentScale.z);

        button.interactable = false;
        Tween.stopAllByTarget(startButtonNode);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;

        const highestUnlockedDay = getHighestUnlockedDay();
        const highestVisibleDay = Math.min(highestUnlockedDay, HIGHEST_IMPLEMENTED_CAMPAIGN_DAY);
        const shouldShowDaySelection = highestVisibleDay >= 2;

        if (shouldShowDaySelection) {
            this.playStartButtonPressAnimation(startButtonNode, currentScale, pressedScale, () => {
                this.openDaySelectionOverlay();
            }, () => {
                this.handleTransitionError(new Error('Failed to open day selection overlay.'), button, opacity);
            });
            return;
        }

        this._isSwitchingScene = true;
        this.playStartButtonPressAnimation(startButtonNode, currentScale, pressedScale, () => {
            tween(opacity)
                .to(0.35, { opacity: 0 }, { easing: 'quadInOut' })
                .call(() => {
                    setRequestedStartDay(1);
                    this.runGameSceneWithRecovery(button, opacity);
                })
                .start();
        }, (err) => {
            this.handleTransitionError(err, button, opacity);
        });
    }

    private runGameSceneWithRecovery(button: Button, opacity: UIOpacity): void {
        if (!this.gameScene) {
            this.handleTransitionError(new Error('gameScene is not assigned.'), button, opacity);
            return;
        }

        try {
            director.runScene(
                this.gameScene,
                undefined,
                (err) => {
                    if (err) {
                        this.handleTransitionError(err, button, opacity);
                    }
                }
            );
        } catch (err) {
            this.handleTransitionError(err, button, opacity);
        }
    }

    private handleTransitionError(err: unknown, button: Button, opacity: UIOpacity): void {
        if (this.startButton) {
            Tween.stopAllByTarget(this.startButton);
        }
        Tween.stopAllByTarget(opacity);
        this.resetButtonState();
        button.interactable = true;
        this._isSwitchingScene = false;
        this._daySelectionLaunchInProgress = false;
        if (this._daySelectionOverlayActive) {
            this.setDaySelectionInteractable(true);
        }
        console.error('[HomeSceneController] scene transition failed:', err);
    }

    private getOrCreateButtonOpacity(buttonNode: Node): UIOpacity {
        let opacity = buttonNode.getComponent(UIOpacity);
        if (!opacity) {
            opacity = buttonNode.addComponent(UIOpacity);
        }
        return opacity;
    }

    private resetButtonState(): void {
        if (!this.startButton) {
            this._isSwitchingScene = false;
            return;
        }

        Tween.stopAllByTarget(this.startButton);
        this.startButton.setScale(this._originalButtonScale);

        const opacity = this.getOrCreateButtonOpacity(this.startButton);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;

        const button = this.startButton.getComponent(Button);
        if (button) {
            button.interactable = true;
        }

        this._isSwitchingScene = false;
    }

    private captureOriginalScaleIfNeeded(): void {
        if (this._hasCapturedOriginalScale || !this.startButton) {
            return;
        }

        this._originalButtonScale.set(this.startButton.scale);
        this._hasCapturedOriginalScale = true;
    }

    private playStartButtonPressAnimation(
        startButtonNode: Node,
        currentScale: Vec3,
        pressedScale: Vec3,
        onComplete: () => void,
        onError: (error: unknown) => void,
    ): void {
        try {
            tween(startButtonNode)
                .to(0.08, { scale: pressedScale }, { easing: 'quadOut' })
                .to(0.10, { scale: currentScale }, { easing: 'backOut' })
                .call(onComplete)
                .start();
        } catch (error) {
            onError(error);
        }
    }

    private openDaySelectionOverlay(): void {
        if (!this.startButton) {
            return;
        }
        if (this._daySelectionOverlayActive || this._daySelectionLaunchInProgress || this._isSwitchingScene) {
            return;
        }
        const highestUnlockedDay = getHighestUnlockedDay();
        const highestVisibleDay = Math.min(highestUnlockedDay, HIGHEST_IMPLEMENTED_CAMPAIGN_DAY);
        if (highestVisibleDay < 2) {
            this.resetButtonState();
            return;
        }
        if (!this.ensureDaySelectionOverlayRuntime()) {
            this.resetButtonState();
            return;
        }
        this.rebuildDaySelectionButtons(highestVisibleDay);
        this._daySelectionOverlayActive = true;
        this._daySelectionLaunchInProgress = false;
        this._isSwitchingScene = false;
        this.setStartButtonInteractable(false);
        if (this._daySelectionOverlayRoot) {
            this._daySelectionOverlayRoot.active = true;
        }
        this.setDaySelectionInteractable(true);
    }

    private ensureDaySelectionOverlayRuntime(): boolean {
        const canvasNode = this.node;
        if (!canvasNode?.isValid) {
            return false;
        }

        let root = this._daySelectionOverlayRoot;
        if (!root || !root.isValid) {
            root = canvasNode.getChildByName(HomeSceneController.DAY_SELECTION_ROOT_NAME) ?? new Node(HomeSceneController.DAY_SELECTION_ROOT_NAME);
            if (!root.parent) {
                canvasNode.addChild(root);
            }
            root.setPosition(0, 0, 0);
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
            root.active = false;
            root.setSiblingIndex(canvasNode.children.length - 1);
            this._daySelectionOverlayRoot = root;
        }

        this._daySelectionVisualGeneration += 1;
        const generation = this._daySelectionVisualGeneration;
        this.ensureDaySelectionDimmer(root);
        this.ensureDaySelectionPanel(root);
        this.ensureDaySelectionCloseHit(root);
        this.ensureDaySelectionListAndTitle();
        this.layoutDaySelectionPanel();
        this.loadDaySelectionPanelBackground(generation);
        return true;
    }

    private ensureDaySelectionDimmer(root: Node): void {
        let dimmer = root.getChildByName('HomeDaySelectionDimmer');
        if (!dimmer || !dimmer.isValid) {
            dimmer = new Node('HomeDaySelectionDimmer');
            dimmer.parent = root;
        }
        dimmer.setPosition(0, 0, 0);
        dimmer.setSiblingIndex(0);
        const transform = dimmer.getComponent(UITransform) ?? dimmer.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(720, 1280);
        const widget = dimmer.getComponent(Widget) ?? dimmer.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
        const graphics = dimmer.getComponent(Graphics) ?? dimmer.addComponent(Graphics);
        graphics.clear();
        graphics.fillColor = new Color(0, 0, 0, 176);
        graphics.rect(-360, -640, 720, 1280);
        graphics.fill();
        const blocker = dimmer.getComponent(BlockInputEvents) ?? dimmer.addComponent(BlockInputEvents);
        blocker.enabled = true;
        dimmer.off(Node.EventType.TOUCH_START, this._swallowTouch, this);
        dimmer.off(Node.EventType.TOUCH_END, this._swallowTouch, this);
        dimmer.off(Node.EventType.TOUCH_MOVE, this._swallowTouch, this);
        dimmer.off(Node.EventType.TOUCH_CANCEL, this._swallowTouch, this);
        dimmer.on(Node.EventType.TOUCH_START, this._swallowTouch, this);
        dimmer.on(Node.EventType.TOUCH_END, this._swallowTouch, this);
        dimmer.on(Node.EventType.TOUCH_MOVE, this._swallowTouch, this);
        dimmer.on(Node.EventType.TOUCH_CANCEL, this._swallowTouch, this);
        this._daySelectionDimmer = dimmer;
    }

    private ensureDaySelectionPanel(root: Node): void {
        let panel = root.getChildByName('HomeDaySelectionPanel');
        if (!panel || !panel.isValid) {
            panel = new Node('HomeDaySelectionPanel');
            panel.parent = root;
        }
        panel.setPosition(0, 0, 0);
        panel.setSiblingIndex(1);
        const transform = panel.getComponent(UITransform) ?? panel.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(560, 1000);
        const sprite = panel.getComponent(Sprite) ?? panel.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.color = new Color(255, 255, 255, 255);
        const blocker = panel.getComponent(BlockInputEvents) ?? panel.addComponent(BlockInputEvents);
        blocker.enabled = true;
        this._daySelectionPanel = panel;
        this._daySelectionPanelSprite = sprite;
    }

    private ensureDaySelectionCloseHit(root: Node): void {
        let closeHit = root.getChildByName('HomeDaySelectionCloseHit');
        if (!closeHit || !closeHit.isValid) {
            closeHit = new Node('HomeDaySelectionCloseHit');
            closeHit.parent = root;
        }
        closeHit.setSiblingIndex(2);
        const transform = closeHit.getComponent(UITransform) ?? closeHit.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(
            HomeSceneController.DAY_SELECTION_CLOSE_HIT_SIZE,
            HomeSceneController.DAY_SELECTION_CLOSE_HIT_SIZE,
        );
        const button = closeHit.getComponent(Button) ?? closeHit.addComponent(Button);
        button.transition = Button.Transition.NONE;
        closeHit.off(Button.EventType.CLICK, this.handleDaySelectionCloseClicked, this);
        closeHit.on(Button.EventType.CLICK, this.handleDaySelectionCloseClicked, this);
        this._daySelectionCloseHit = closeHit;
        this._daySelectionCloseButton = button;
    }

    private ensureDaySelectionListAndTitle(): void {
        const panel = this._daySelectionPanel;
        if (!panel?.isValid) {
            return;
        }
        let titleNode = panel.getChildByName('HomeDaySelectionTitleLabel');
        if (!titleNode || !titleNode.isValid) {
            titleNode = new Node('HomeDaySelectionTitleLabel');
            titleNode.parent = panel;
        }
        const titleTransform = titleNode.getComponent(UITransform) ?? titleNode.addComponent(UITransform);
        titleTransform.setAnchorPoint(0.5, 0.5);
        titleTransform.setContentSize(420, 62);
        const titleLabel = titleNode.getComponent(Label) ?? titleNode.addComponent(Label);
        titleLabel.useSystemFont = true;
        titleLabel.string = 'SELECT DAY';
        titleLabel.fontSize = 42;
        titleLabel.lineHeight = 46;
        titleLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        titleLabel.verticalAlign = VerticalTextAlignment.CENTER;
        titleLabel.color = new Color(46, 35, 24, 255);
        titleLabel.enableWrapText = false;
        this._daySelectionTitleLabel = titleLabel;

        let listRoot = panel.getChildByName('HomeDaySelectionListRoot');
        if (!listRoot || !listRoot.isValid) {
            listRoot = new Node('HomeDaySelectionListRoot');
            listRoot.parent = panel;
        }
        const listTransform = listRoot.getComponent(UITransform) ?? listRoot.addComponent(UITransform);
        listTransform.setAnchorPoint(0.5, 0.5);
        listTransform.setContentSize(420, 640);
        const blocker = listRoot.getComponent(BlockInputEvents) ?? listRoot.addComponent(BlockInputEvents);
        blocker.enabled = true;
        this._daySelectionListRoot = listRoot;
    }

    private loadDaySelectionPanelBackground(generation: number): void {
        if (!this._daySelectionPanelSprite?.isValid) {
            return;
        }
        const cached = assetManager.assets.get(HomeSceneController.DAY_SELECTION_BACKGROUND_UUID) as SpriteFrame | null;
        if (cached) {
            this._daySelectionPanelSprite.spriteFrame = cached;
            this.layoutDaySelectionPanel();
            return;
        }
        this._daySelectionBackgroundLoadGeneration += 1;
        const loadGen = this._daySelectionBackgroundLoadGeneration;
        assetManager.loadAny(HomeSceneController.DAY_SELECTION_BACKGROUND_UUID, (error, asset) => {
            if (error) {
                console.warn('[HomeSceneController] Failed to load day selection background sprite frame.', error);
                return;
            }
            if (loadGen !== this._daySelectionBackgroundLoadGeneration) {
                return;
            }
            if (generation !== this._daySelectionVisualGeneration) {
                return;
            }
            const spriteFrame = asset as SpriteFrame | null;
            if (!spriteFrame || !this._daySelectionPanelSprite?.isValid) {
                return;
            }
            this._daySelectionPanelSprite.spriteFrame = spriteFrame;
            this.layoutDaySelectionPanel();
        });
    }

    private layoutDaySelectionPanel(): void {
        if (!this._daySelectionPanel?.isValid) {
            return;
        }
        const panelTransform = this._daySelectionPanel.getComponent(UITransform);
        const rootTransform = this._daySelectionOverlayRoot?.getComponent(UITransform);
        if (!panelTransform || !rootTransform) {
            return;
        }
        const frame = this._daySelectionPanelSprite?.spriteFrame ?? null;
        const sourceWidth = frame?.originalSize.width ?? 941;
        const sourceHeight = frame?.originalSize.height ?? 1672;
        const canvasWidth = rootTransform.contentSize.width || 720;
        const canvasHeight = rootTransform.contentSize.height || 1280;
        const maxWidth = Math.min(HomeSceneController.DAY_SELECTION_MAX_WIDTH, canvasWidth * 0.82);
        const maxHeight = Math.min(HomeSceneController.DAY_SELECTION_MAX_HEIGHT, canvasHeight * 0.9);
        const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
        const panelWidth = Math.max(420, sourceWidth * scale);
        const panelHeight = Math.max(780, sourceHeight * scale);
        panelTransform.setContentSize(panelWidth, panelHeight);
        this._daySelectionPanel.setPosition(0, 0, 0);

        if (this._daySelectionTitleLabel?.node?.isValid) {
            this._daySelectionTitleLabel.node.setPosition(0, panelHeight * 0.34, 0);
        }
        if (this._daySelectionListRoot?.isValid) {
            const listTransform = this._daySelectionListRoot.getComponent(UITransform);
            listTransform?.setContentSize(panelWidth * 0.78, panelHeight * 0.58);
            this._daySelectionListRoot.setPosition(0, -panelHeight * 0.02, 0);
        }
        if (this._daySelectionCloseHit?.isValid) {
            this._daySelectionCloseHit.setPosition(
                panelWidth * 0.385,
                panelHeight * 0.435,
                0,
            );
        }
    }

    private rebuildDaySelectionButtons(highestVisibleDay: number): void {
        if (!this._daySelectionListRoot?.isValid) {
            return;
        }
        for (const button of this._daySelectionButtons) {
            if (button.node?.isValid) {
                button.node.off(Button.EventType.CLICK);
                button.node.destroy();
            }
        }
        this._daySelectionButtons.length = 0;
        this._daySelectionListRoot.removeAllChildren();

        const listTransform = this._daySelectionListRoot.getComponent(UITransform);
        const listWidth = listTransform?.contentSize.width ?? 420;
        const listHeight = listTransform?.contentSize.height ?? 640;
        const days: CampaignDayIndex[] = [];
        for (let day = highestVisibleDay; day >= 1; day -= 1) {
            if (!isImplementedCampaignDay(day) || !isCampaignDayIndex(day)) {
                continue;
            }
            days.push(day);
        }
        const buttonWidth = Math.max(
            HomeSceneController.DAY_SELECTION_MIN_BUTTON_WIDTH,
            Math.min(HomeSceneController.DAY_SELECTION_MAX_BUTTON_WIDTH, listWidth * 0.88),
        );
        const count = days.length;
        const totalHeight =
            count * HomeSceneController.DAY_SELECTION_BUTTON_HEIGHT +
            Math.max(0, count - 1) * HomeSceneController.DAY_SELECTION_BUTTON_GAP;
        let startY = totalHeight * 0.5 - HomeSceneController.DAY_SELECTION_BUTTON_HEIGHT * 0.5;
        if (count >= 5) {
            const safeTop = listHeight * 0.42;
            const safeBottom = -listHeight * 0.42;
            const available = safeTop - safeBottom;
            const step = count > 1 ? available / (count - 1) : 0;
            startY = safeTop;
            for (let i = 0; i < count; i += 1) {
                const y = startY - step * i;
                this.createDaySelectionButton(days[i], i + 1, buttonWidth, y);
            }
            return;
        }
        for (let i = 0; i < count; i += 1) {
            const y = startY - i * (HomeSceneController.DAY_SELECTION_BUTTON_HEIGHT + HomeSceneController.DAY_SELECTION_BUTTON_GAP);
            this.createDaySelectionButton(days[i], i + 1, buttonWidth, y);
        }
    }

    private createDaySelectionButton(dayIndex: CampaignDayIndex, order: number, width: number, y: number): void {
        if (!this._daySelectionListRoot?.isValid) {
            return;
        }
        const buttonNode = new Node(`DaySelectionButton${String(order).padStart(2, '0')}`);
        buttonNode.parent = this._daySelectionListRoot;
        buttonNode.setPosition(0, y, 0);
        const transform = buttonNode.getComponent(UITransform) ?? buttonNode.addComponent(UITransform);
        transform.setAnchorPoint(0.5, 0.5);
        transform.setContentSize(width, HomeSceneController.DAY_SELECTION_BUTTON_HEIGHT);
        const graphics = buttonNode.getComponent(Graphics) ?? buttonNode.addComponent(Graphics);
        this.drawDaySelectionButton(graphics, width, HomeSceneController.DAY_SELECTION_BUTTON_HEIGHT);
        const button = buttonNode.getComponent(Button) ?? buttonNode.addComponent(Button);
        button.transition = Button.Transition.NONE;

        const labelNode = new Node('DaySelectionButtonLabel');
        labelNode.parent = buttonNode;
        labelNode.setPosition(0, 0, 0);
        const labelTransform = labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
        labelTransform.setAnchorPoint(0.5, 0.5);
        labelTransform.setContentSize(width - 30, HomeSceneController.DAY_SELECTION_BUTTON_HEIGHT - 10);
        const label = labelNode.getComponent(Label) ?? labelNode.addComponent(Label);
        label.useSystemFont = true;
        label.fontSize = 30;
        label.lineHeight = 34;
        label.horizontalAlign = HorizontalTextAlignment.CENTER;
        label.verticalAlign = VerticalTextAlignment.CENTER;
        label.color = new Color(55, 43, 30, 255);
        label.enableWrapText = false;
        label.string = `DAY ${dayIndex} · ${getDayLevelConfig(dayIndex).date}`;

        buttonNode.on(Button.EventType.CLICK, () => {
            void this.handleDaySelected(dayIndex, button);
        });
        this._daySelectionButtons.push(button);
    }

    private drawDaySelectionButton(graphics: Graphics, width: number, height: number): void {
        graphics.clear();
        const x = -width * 0.5;
        const y = -height * 0.5;
        graphics.fillColor = new Color(237, 224, 196, 220);
        graphics.roundRect(x, y, width, height, 7);
        graphics.fill();
        graphics.lineWidth = 2;
        graphics.strokeColor = new Color(70, 54, 38, 215);
        graphics.roundRect(x, y, width, height, 7);
        graphics.stroke();
    }

    private async handleDaySelected(dayIndex: CampaignDayIndex, clickedButton: Button): Promise<void> {
        if (!this._daySelectionOverlayActive || this._daySelectionLaunchInProgress || this._isSwitchingScene) {
            return;
        }
        if (!isImplementedCampaignDay(dayIndex)) {
            return;
        }
        const highestUnlockedDay = getHighestUnlockedDay();
        const highestVisibleDay = Math.min(highestUnlockedDay, HIGHEST_IMPLEMENTED_CAMPAIGN_DAY);
        if (dayIndex > highestVisibleDay) {
            return;
        }
        this._daySelectionLaunchInProgress = true;
        this._isSwitchingScene = true;
        this.setDaySelectionInteractable(false);
        this.setStartButtonInteractable(false);
        setRequestedStartDay(dayIndex);

        try {
            const node = clickedButton.node;
            const currentScale = node.scale.clone();
            const pressedScale = new Vec3(currentScale.x * 0.96, currentScale.y * 0.96, currentScale.z);
            await new Promise<void>((resolve) => {
                tween(node)
                    .to(0.08, { scale: pressedScale }, { easing: 'quadOut' })
                    .to(0.10, { scale: currentScale }, { easing: 'quadOut' })
                    .call(resolve)
                    .start();
            });
            this.runGameSceneFromDaySelection();
        } catch (error) {
            this.handleDaySelectionLaunchError(error);
        }
    }

    private runGameSceneFromDaySelection(): void {
        if (!this.gameScene) {
            this.handleDaySelectionLaunchError(new Error('gameScene is not assigned.'));
            return;
        }
        try {
            director.runScene(this.gameScene, undefined, (error) => {
                if (!error) {
                    return;
                }
                this.handleDaySelectionLaunchError(error);
            });
        } catch (error) {
            this.handleDaySelectionLaunchError(error);
        }
    }

    private handleDaySelectionLaunchError(error: unknown): void {
        console.error('[HomeSceneController] Failed to launch selected day.', error);
        this._isSwitchingScene = false;
        this._daySelectionLaunchInProgress = false;
        this.setDaySelectionInteractable(true);
        this.setStartButtonInteractable(false);
        if (this._daySelectionOverlayRoot?.isValid) {
            this._daySelectionOverlayRoot.active = true;
        }
    }

    private handleDaySelectionCloseClicked = (): void => {
        if (!this._daySelectionOverlayActive || this._daySelectionLaunchInProgress) {
            return;
        }
        this.closeDaySelectionOverlay(true);
    };

    private closeDaySelectionOverlay(enableStartButton: boolean): void {
        this._daySelectionOverlayActive = false;
        this._daySelectionLaunchInProgress = false;
        if (this._daySelectionOverlayRoot?.isValid) {
            this._daySelectionOverlayRoot.active = false;
        }
        for (const button of this._daySelectionButtons) {
            if (button.node?.isValid) {
                button.node.destroy();
            }
        }
        this._daySelectionButtons.length = 0;
        if (this._daySelectionListRoot?.isValid) {
            this._daySelectionListRoot.removeAllChildren();
        }
        if (enableStartButton) {
            this.resetButtonState();
        } else {
            this.setStartButtonInteractable(false);
        }
    }

    private setDaySelectionInteractable(interactable: boolean): void {
        for (const button of this._daySelectionButtons) {
            if (button.node?.isValid) {
                button.interactable = interactable;
            }
        }
        if (this._daySelectionCloseButton?.node?.isValid) {
            this._daySelectionCloseButton.interactable = interactable;
            this._daySelectionCloseHit!.active = interactable;
        }
    }

    private setStartButtonInteractable(interactable: boolean): void {
        const button = this.startButton?.getComponent(Button);
        if (button) {
            button.interactable = interactable;
        }
    }

    private destroyDaySelectionOverlayRuntime(): void {
        if (this._daySelectionCloseHit?.isValid) {
            this._daySelectionCloseHit.off(Button.EventType.CLICK, this.handleDaySelectionCloseClicked, this);
        }
        if (this._daySelectionDimmer?.isValid) {
            this._daySelectionDimmer.off(Node.EventType.TOUCH_START, this._swallowTouch, this);
            this._daySelectionDimmer.off(Node.EventType.TOUCH_END, this._swallowTouch, this);
            this._daySelectionDimmer.off(Node.EventType.TOUCH_MOVE, this._swallowTouch, this);
            this._daySelectionDimmer.off(Node.EventType.TOUCH_CANCEL, this._swallowTouch, this);
        }
        if (this._daySelectionOverlayRoot?.isValid) {
            this._daySelectionOverlayRoot.destroy();
        }
        this._daySelectionOverlayRoot = null;
        this._daySelectionDimmer = null;
        this._daySelectionPanel = null;
        this._daySelectionPanelSprite = null;
        this._daySelectionTitleLabel = null;
        this._daySelectionListRoot = null;
        this._daySelectionCloseHit = null;
        this._daySelectionCloseButton = null;
        this._daySelectionOverlayActive = false;
        this._daySelectionLaunchInProgress = false;
        this._daySelectionButtons.length = 0;
    }
    private ensureBackgroundMusicOnEnter(): void {
        try {
            const audio = AudioManager.ensureInstance();
            audio.startHomeBackgroundMusic();
        } catch (error: unknown) {
            console.warn('[HomeSceneController] Failed to start background music on enter.', error);
        }
    }

    private notifyAudioUserGesture(): void {
        try {
            const audio = AudioManager.ensureInstance();
            audio.handleUserGesture();
        } catch (error: unknown) {
            console.warn('[HomeSceneController] AudioManager user gesture handling failed.', error);
        }
    }
}
