import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Button,
    Canvas,
    Color,
    Component,
    EventTouch,
    Graphics,
    HorizontalTextAlignment,
    Label,
    LabelShadow,
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
    Layers,
    director,
    resources,
    sys,
    tween,
} from 'cc';
import {
    HIGHEST_IMPLEMENTED_CAMPAIGN_DAY,
    getDayLevelConfig,
    isCampaignDayIndex,
    isImplementedCampaignDay,
} from '../game/campaign/DayCatalog';
import type { CampaignDayIndex } from '../game/campaign/DayLevelConfig';
import { getCampaignProgressStorageKey, getHighestUnlockedDay } from '../game/campaign/CampaignProgressStore';
import { setRequestedStartDay } from '../game/campaign/CampaignLaunchRequest';
import { setDay0EndingTestLaunchRequested } from '../game/campaign/Day0EndingTestLaunchRequest';
import { AudioManager } from '../audio/AudioManager';

const { ccclass, property } = _decorator;
const ENABLE_DAY0_ENDING_TEST = false;

@ccclass('HomeSceneController')
export class HomeSceneController extends Component {
    private static readonly DAY_SELECTION_ROOT_NAME = 'HomeDaySelectionOverlayRuntime';
    private static readonly DAY_SELECTION_BACKGROUND_UUID = '98f04450-ba06-434f-a4a4-962ce5819572@f9941';
    private static readonly DAY_SELECTION_MAX_WIDTH = 580;
    private static readonly DAY_SELECTION_MAX_HEIGHT = 1020;
    private static readonly DAY_SELECTION_MIN_BUTTON_WIDTH = 320;
    private static readonly DAY_SELECTION_MAX_BUTTON_WIDTH = 372;
    private static readonly DAY_SELECTION_BUTTON_HEIGHT = 62;
    private static readonly DAY_SELECTION_BUTTON_GAP = 16;
    private static readonly DAY_SELECTION_CLOSE_HIT_SIZE = 88;
    private static readonly LOADING_OVERLAY_ROOT_NAME = 'PersistentLoadingOverlayRuntime';
    private static readonly LOADING_OVERLAY_CONTAINER_NAME = 'LoadingOverlay';
    private static readonly LOADING_OVERLAY_FALLBACK_NAME = 'BackgroundFallback';
    private static readonly LOADING_OVERLAY_BACKGROUND_NAME = 'Background';
    private static readonly LOADING_OVERLAY_SPINNER_NAME = 'Spinner';
    private static readonly LOADING_OVERLAY_ICON_NAME = 'IdentityShieldIcon';
    private static readonly LOADING_OVERLAY_TEXT_TOP_NAME = 'LoadingTextTop';
    private static readonly LOADING_OVERLAY_TEXT_BOTTOM_NAME = 'LoadingTextBottom';
    private static readonly LOADING_OVERLAY_BACKGROUND_PATH = 'ui/loading/loading_background/spriteFrame';
    private static readonly LOADING_OVERLAY_SPINNER_PATH = 'ui/loading/loading_spinner/spriteFrame';
    private static readonly LOADING_OVERLAY_ICON_PATH = 'ui/loading/loading_identity_shield/spriteFrame';
    private static readonly LOADING_OVERLAY_SIZE = Object.freeze({ width: 720, height: 1280 });
    private static readonly LOADING_SPINNER_SIZE = 180;
    private static readonly LOADING_ICON_DISPLAY_WIDTH = 246;
    private static readonly LOADING_ICON_DISPLAY_HEIGHT = 165;
    private static readonly LOADING_ICON_POSITION_Y = 232;
    private static persistentLoadingOverlayRoot: Node | null = null;
    private static persistentLoadingOverlaySpinner: Node | null = null;
    private static loadingBackgroundFrame: SpriteFrame | null = null;
    private static loadingSpinnerFrame: SpriteFrame | null = null;
    private static loadingIconFrame: SpriteFrame | null = null;
    private static loadingBackgroundFrameTask: Promise<SpriteFrame | null> | null = null;
    private static loadingSpinnerFrameTask: Promise<SpriteFrame | null> | null = null;
    private static loadingIconFrameTask: Promise<SpriteFrame | null> | null = null;

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
    private _daySelectionBackgroundLoadTask: Promise<boolean> | null = null;
    private _daySelectionBackgroundLoadTaskGeneration = 0;
    private _daySelectionButtons: Button[] = [];

    private readonly _swallowTouch = (event: EventTouch): void => {
        event.stopPropagation();
        event.stopPropagationImmediate();
    };

    onLoad(): void {
        this.captureOriginalScaleIfNeeded();
        this.ensureBackgroundMusicOnEnter();
        void HomeSceneController.preloadPersistentLoadingAssets();
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
        const campaignProgressStorageKey = getCampaignProgressStorageKey();
        const campaignProgressRaw = sys.localStorage?.getItem(campaignProgressStorageKey) ?? null;
        const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
        console.log(
            '[DEBUG DaySelect] highestUnlockedDay =',
            highestUnlockedDay,
            'localStorage value =',
            campaignProgressRaw,
            'origin =',
            runtimeOrigin,
        );
        const highestVisibleDay = Math.min(highestUnlockedDay, HIGHEST_IMPLEMENTED_CAMPAIGN_DAY);
        console.log(
            '[DEBUG DaySelect] highestVisibleDay =',
            highestVisibleDay,
            'HIGHEST_IMPLEMENTED_CAMPAIGN_DAY =',
            HIGHEST_IMPLEMENTED_CAMPAIGN_DAY,
        );
        const shouldShowDaySelection = highestVisibleDay >= 2;
        console.log('[DEBUG DaySelect] shouldShowDaySelection =', shouldShowDaySelection);

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
                    setDay0EndingTestLaunchRequested(false);
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
        this.tryShowLoadingOverlay();

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
        HomeSceneController.hidePersistentLoadingOverlay();
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
        this._daySelectionLaunchInProgress = true;
        const generation = this._daySelectionVisualGeneration;
        void this.showDaySelectionOverlayAfterBackgroundReady(highestVisibleDay, generation);
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

    private loadDaySelectionPanelBackground(generation: number): Promise<boolean> {
        if (!this._daySelectionPanelSprite?.isValid) {
            this._daySelectionBackgroundLoadTask = Promise.resolve(false);
            this._daySelectionBackgroundLoadTaskGeneration = generation;
            return this._daySelectionBackgroundLoadTask;
        }
        const cached = assetManager.assets.get(HomeSceneController.DAY_SELECTION_BACKGROUND_UUID) as SpriteFrame | null;
        if (cached) {
            this._daySelectionPanelSprite.spriteFrame = cached;
            this.layoutDaySelectionPanel();
            this._daySelectionBackgroundLoadTask = Promise.resolve(true);
            this._daySelectionBackgroundLoadTaskGeneration = generation;
            return this._daySelectionBackgroundLoadTask;
        }
        this._daySelectionBackgroundLoadGeneration += 1;
        const loadGen = this._daySelectionBackgroundLoadGeneration;
        const task = new Promise<boolean>((resolve) => {
            assetManager.loadAny(HomeSceneController.DAY_SELECTION_BACKGROUND_UUID, (error, asset) => {
                if (error) {
                    console.warn('[HomeSceneController] Failed to load day selection background sprite frame.', error);
                    resolve(false);
                    return;
                }
                if (loadGen !== this._daySelectionBackgroundLoadGeneration) {
                    resolve(false);
                    return;
                }
                if (generation !== this._daySelectionVisualGeneration) {
                    resolve(false);
                    return;
                }
                const spriteFrame = asset as SpriteFrame | null;
                if (!spriteFrame || !this._daySelectionPanelSprite?.isValid) {
                    resolve(false);
                    return;
                }
                this._daySelectionPanelSprite.spriteFrame = spriteFrame;
                this.layoutDaySelectionPanel();
                resolve(true);
            });
        });
        this._daySelectionBackgroundLoadTask = task;
        this._daySelectionBackgroundLoadTaskGeneration = generation;
        return task;
    }

    private async waitForDaySelectionPanelBackground(generation: number): Promise<boolean> {
        if (generation !== this._daySelectionVisualGeneration) {
            return false;
        }
        if (this._daySelectionPanelSprite?.spriteFrame) {
            return true;
        }
        if (
            this._daySelectionBackgroundLoadTask &&
            this._daySelectionBackgroundLoadTaskGeneration === generation
        ) {
            return this._daySelectionBackgroundLoadTask;
        }
        return this.loadDaySelectionPanelBackground(generation);
    }

    private async showDaySelectionOverlayAfterBackgroundReady(
        highestVisibleDay: number,
        generation: number,
    ): Promise<void> {
        const backgroundReady = await this.waitForDaySelectionPanelBackground(generation);
        if (!backgroundReady) {
            this._daySelectionLaunchInProgress = false;
            this._isSwitchingScene = false;
            this.resetButtonState();
            return;
        }
        if (
            generation !== this._daySelectionVisualGeneration ||
            !this._daySelectionPanelSprite?.isValid ||
            !this._daySelectionPanelSprite.spriteFrame
        ) {
            this._daySelectionLaunchInProgress = false;
            this._isSwitchingScene = false;
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
        const includeDay0EndingTest = ENABLE_DAY0_ENDING_TEST;
        const count = days.length + (includeDay0EndingTest ? 1 : 0);
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
            let order = 1;
            let row = 0;
            if (includeDay0EndingTest) {
                this.createDay0EndingTestSelectionButton(order, buttonWidth, startY - step * row);
                order += 1;
                row += 1;
            }
            for (let i = 0; i < days.length; i += 1) {
                const y = startY - step * row;
                this.createDaySelectionButton(days[i], order, buttonWidth, y);
                order += 1;
                row += 1;
            }
            return;
        }
        let order = 1;
        let row = 0;
        if (includeDay0EndingTest) {
            this.createDay0EndingTestSelectionButton(order, buttonWidth, startY);
            order += 1;
            row += 1;
        }
        for (let i = 0; i < days.length; i += 1) {
            const y = startY - row * (HomeSceneController.DAY_SELECTION_BUTTON_HEIGHT + HomeSceneController.DAY_SELECTION_BUTTON_GAP);
            this.createDaySelectionButton(days[i], order, buttonWidth, y);
            order += 1;
            row += 1;
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

    private createDay0EndingTestSelectionButton(order: number, width: number, y: number): void {
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
        label.string = 'DAY 0 · ENDING';

        buttonNode.on(Button.EventType.CLICK, () => {
            void this.handleDay0EndingTestSelected(button);
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
        setDay0EndingTestLaunchRequested(false);
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

    private async handleDay0EndingTestSelected(clickedButton: Button): Promise<void> {
        if (!ENABLE_DAY0_ENDING_TEST) {
            return;
        }
        if (!this._daySelectionOverlayActive || this._daySelectionLaunchInProgress || this._isSwitchingScene) {
            return;
        }
        this._daySelectionLaunchInProgress = true;
        this._isSwitchingScene = true;
        this.setDaySelectionInteractable(false);
        this.setStartButtonInteractable(false);
        setRequestedStartDay(1);
        setDay0EndingTestLaunchRequested(true);
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
        this.tryShowLoadingOverlay();
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
        HomeSceneController.hidePersistentLoadingOverlay();
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

    private tryShowLoadingOverlay(): void {
        try {
            HomeSceneController.showPersistentLoadingOverlay();
        } catch (error) {
            console.error('[HomeSceneController] Failed to show loading overlay.', error);
        }
    }

    public static showPersistentLoadingOverlay(): void {
        const root = HomeSceneController.ensurePersistentLoadingOverlayRoot();
        if (!root?.isValid) {
            return;
        }
        HomeSceneController.configureOverlayCanvas(root);
        HomeSceneController.attachPersistentLoadingOverlayToActiveScene(root);
        HomeSceneController.ensurePersistentLoadingOverlayStructure(root);
        root.active = true;
        HomeSceneController.startLoadingSpinnerRotation();
        void HomeSceneController.applyPersistentLoadingFrames();
    }

    public static hidePersistentLoadingOverlay(): void {
        const root = HomeSceneController.persistentLoadingOverlayRoot;
        if (!root?.isValid) {
            HomeSceneController.persistentLoadingOverlayRoot = null;
            HomeSceneController.persistentLoadingOverlaySpinner = null;
            return;
        }
        const spinner = HomeSceneController.persistentLoadingOverlaySpinner;
        if (spinner?.isValid) {
            Tween.stopAllByTarget(spinner);
            spinner.angle = 0;
        }
        root.active = false;
    }

    private static ensurePersistentLoadingOverlayRoot(): Node | null {
        const existing = HomeSceneController.persistentLoadingOverlayRoot;
        if (existing?.isValid) {
            HomeSceneController.ensurePersistentLoadingOverlayStructure(existing);
            return existing;
        }
        const scene = director.getScene();
        if (!scene?.isValid) {
            return null;
        }
        const root = new Node(HomeSceneController.LOADING_OVERLAY_ROOT_NAME);
        scene.addChild(root);
        director.addPersistRootNode(root);
        HomeSceneController.configureOverlayCanvas(root);
        root.active = false;
        const rootTransform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
        rootTransform.setAnchorPoint(0.5, 0.5);
        rootTransform.setContentSize(
            HomeSceneController.LOADING_OVERLAY_SIZE.width,
            HomeSceneController.LOADING_OVERLAY_SIZE.height,
        );
        const rootWidget = root.getComponent(Widget) ?? root.addComponent(Widget);
        rootWidget.isAlignTop = true;
        rootWidget.isAlignBottom = true;
        rootWidget.isAlignLeft = true;
        rootWidget.isAlignRight = true;
        rootWidget.top = 0;
        rootWidget.bottom = 0;
        rootWidget.left = 0;
        rootWidget.right = 0;
        const blocker = root.getComponent(BlockInputEvents) ?? root.addComponent(BlockInputEvents);
        blocker.enabled = true;
        HomeSceneController.ensurePersistentLoadingOverlayStructure(root);
        HomeSceneController.persistentLoadingOverlayRoot = root;
        return root;
    }

    private static attachPersistentLoadingOverlayToActiveScene(root: Node): void {
        const scene = director.getScene();
        if (!scene?.isValid || !root.isValid) {
            return;
        }
        if (root.parent !== scene) {
            scene.addChild(root);
        }
        root.setSiblingIndex(scene.children.length - 1);
    }

    private static ensurePersistentLoadingOverlayStructure(root: Node): void {
        const overlaySize = HomeSceneController.LOADING_OVERLAY_SIZE;
        const rootTransform = root.getComponent(UITransform) ?? root.addComponent(UITransform);
        rootTransform.setAnchorPoint(0.5, 0.5);
        rootTransform.setContentSize(overlaySize.width, overlaySize.height);

        let overlay = root.getChildByName(HomeSceneController.LOADING_OVERLAY_CONTAINER_NAME);
        if (!overlay || !overlay.isValid) {
            overlay = new Node(HomeSceneController.LOADING_OVERLAY_CONTAINER_NAME);
            overlay.parent = root;
        }
        HomeSceneController.resetOverlayNodeTransform(overlay);
        overlay.setSiblingIndex(root.children.length - 1);
        const overlayTransform = overlay.getComponent(UITransform) ?? overlay.addComponent(UITransform);
        overlayTransform.setAnchorPoint(0.5, 0.5);
        overlayTransform.setContentSize(overlaySize.width, overlaySize.height);
        HomeSceneController.applyFullStretchWidget(overlay);

        let fallback = overlay.getChildByName(HomeSceneController.LOADING_OVERLAY_FALLBACK_NAME);
        if (!fallback || !fallback.isValid) {
            fallback = new Node(HomeSceneController.LOADING_OVERLAY_FALLBACK_NAME);
            fallback.parent = overlay;
        }
        HomeSceneController.resetOverlayNodeTransform(fallback);
        fallback.setSiblingIndex(0);
        const fallbackTransform = fallback.getComponent(UITransform) ?? fallback.addComponent(UITransform);
        fallbackTransform.setAnchorPoint(0.5, 0.5);
        fallbackTransform.setContentSize(overlaySize.width, overlaySize.height);
        const fallbackGraphics = fallback.getComponent(Graphics) ?? fallback.addComponent(Graphics);
        fallbackGraphics.clear();
        fallbackGraphics.fillColor = new Color(10, 10, 10, 255);
        fallbackGraphics.rect(
            -overlaySize.width * 0.5,
            -overlaySize.height * 0.5,
            overlaySize.width,
            overlaySize.height,
        );
        fallbackGraphics.fill();
        fallback.active = true;

        let background = overlay.getChildByName(HomeSceneController.LOADING_OVERLAY_BACKGROUND_NAME);
        if (!background || !background.isValid) {
            background = new Node(HomeSceneController.LOADING_OVERLAY_BACKGROUND_NAME);
            background.parent = overlay;
        }
        HomeSceneController.resetOverlayNodeTransform(background);
        background.setSiblingIndex(1);
        const backgroundTransform = background.getComponent(UITransform) ?? background.addComponent(UITransform);
        backgroundTransform.setAnchorPoint(0.5, 0.5);
        backgroundTransform.setContentSize(overlaySize.width, overlaySize.height);
        const backgroundSprite = background.getComponent(Sprite) ?? background.addComponent(Sprite);
        backgroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        backgroundSprite.color = new Color(255, 255, 255, 255);

        let spinner = overlay.getChildByName(HomeSceneController.LOADING_OVERLAY_SPINNER_NAME);
        if (!spinner || !spinner.isValid) {
            spinner = new Node(HomeSceneController.LOADING_OVERLAY_SPINNER_NAME);
            spinner.parent = overlay;
        }
        HomeSceneController.resetOverlayNodeTransform(spinner);
        spinner.setSiblingIndex(2);
        const spinnerTransform = spinner.getComponent(UITransform) ?? spinner.addComponent(UITransform);
        spinnerTransform.setAnchorPoint(0.5, 0.5);
        spinnerTransform.setContentSize(
            HomeSceneController.LOADING_SPINNER_SIZE,
            HomeSceneController.LOADING_SPINNER_SIZE,
        );
        const spinnerSprite = spinner.getComponent(Sprite) ?? spinner.addComponent(Sprite);
        spinnerSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        spinnerSprite.color = new Color(255, 255, 255, 255);
        HomeSceneController.persistentLoadingOverlaySpinner = spinner;

        let icon = overlay.getChildByName(HomeSceneController.LOADING_OVERLAY_ICON_NAME);
        if (!icon || !icon.isValid) {
            icon = new Node(HomeSceneController.LOADING_OVERLAY_ICON_NAME);
            icon.parent = overlay;
        }
        HomeSceneController.resetOverlayNodeTransform(icon);
        icon.setSiblingIndex(3);
        const iconTransform = icon.getComponent(UITransform) ?? icon.addComponent(UITransform);
        iconTransform.setAnchorPoint(0.5, 0.5);
        iconTransform.setContentSize(
            HomeSceneController.LOADING_ICON_DISPLAY_WIDTH,
            HomeSceneController.LOADING_ICON_DISPLAY_HEIGHT,
        );
        icon.setPosition(0, HomeSceneController.LOADING_ICON_POSITION_Y, 0);
        const iconSprite = icon.getComponent(Sprite) ?? icon.addComponent(Sprite);
        iconSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        iconSprite.color = new Color(255, 255, 255, 255);

        const legacyHeader = overlay.getChildByName('LoadingTerminalHeader');
        if (legacyHeader?.isValid) {
            legacyHeader.destroy();
        }
        const legacyFooter = overlay.getChildByName('LoadingTerminalFooter');
        if (legacyFooter?.isValid) {
            legacyFooter.destroy();
        }

        let loadingTextTop = overlay.getChildByName(HomeSceneController.LOADING_OVERLAY_TEXT_TOP_NAME);
        if (!loadingTextTop || !loadingTextTop.isValid) {
            loadingTextTop = new Node(HomeSceneController.LOADING_OVERLAY_TEXT_TOP_NAME);
            loadingTextTop.parent = overlay;
        }
        HomeSceneController.resetOverlayNodeTransform(loadingTextTop);
        loadingTextTop.setSiblingIndex(4);
        const loadingTextTopTransform = loadingTextTop.getComponent(UITransform) ?? loadingTextTop.addComponent(UITransform);
        loadingTextTopTransform.setAnchorPoint(0.5, 0.5);
        loadingTextTopTransform.setContentSize(620, 70);
        loadingTextTop.setPosition(0, 124, 0);
        const loadingTextTopLabel = loadingTextTop.getComponent(Label) ?? loadingTextTop.addComponent(Label);
        loadingTextTopLabel.useSystemFont = true;
        loadingTextTopLabel.string = 'VERIFYING IDENTITY...';
        loadingTextTopLabel.fontSize = 34;
        loadingTextTopLabel.lineHeight = 40;
        loadingTextTopLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        loadingTextTopLabel.verticalAlign = VerticalTextAlignment.CENTER;
        loadingTextTopLabel.enableWrapText = false;
        loadingTextTopLabel.color = new Color(232, 232, 232, 255);
        loadingTextTop.getComponent(LabelShadow)?.destroy();

        let loadingTextBottom = overlay.getChildByName(HomeSceneController.LOADING_OVERLAY_TEXT_BOTTOM_NAME);
        if (!loadingTextBottom || !loadingTextBottom.isValid) {
            loadingTextBottom = new Node(HomeSceneController.LOADING_OVERLAY_TEXT_BOTTOM_NAME);
            loadingTextBottom.parent = overlay;
        }
        HomeSceneController.resetOverlayNodeTransform(loadingTextBottom);
        loadingTextBottom.setSiblingIndex(5);
        const loadingTextBottomTransform = loadingTextBottom.getComponent(UITransform) ?? loadingTextBottom.addComponent(UITransform);
        loadingTextBottomTransform.setAnchorPoint(0.5, 0.5);
        loadingTextBottomTransform.setContentSize(420, 40);
        loadingTextBottom.setPosition(0, -96, 0);
        const loadingTextBottomLabel = loadingTextBottom.getComponent(Label) ?? loadingTextBottom.addComponent(Label);
        loadingTextBottomLabel.useSystemFont = true;
        loadingTextBottomLabel.string = 'PLEASE WAIT';
        loadingTextBottomLabel.fontSize = 19;
        loadingTextBottomLabel.lineHeight = 24;
        loadingTextBottomLabel.horizontalAlign = HorizontalTextAlignment.CENTER;
        loadingTextBottomLabel.verticalAlign = VerticalTextAlignment.CENTER;
        loadingTextBottomLabel.enableWrapText = false;
        loadingTextBottomLabel.color = new Color(204, 204, 204, 255);
        loadingTextBottom.getComponent(LabelShadow)?.destroy();
    }

    private static startLoadingSpinnerRotation(): void {
        const spinner = HomeSceneController.persistentLoadingOverlaySpinner;
        if (!spinner?.isValid) {
            return;
        }
        Tween.stopAllByTarget(spinner);
        spinner.angle = 0;
        tween(spinner)
            .by(0.9, { angle: -360 }, { easing: 'linear' })
            .repeatForever()
            .start();
    }

    private static async applyPersistentLoadingFrames(): Promise<void> {
        const root = HomeSceneController.persistentLoadingOverlayRoot;
        if (!root?.isValid) {
            return;
        }
        if (!HomeSceneController.loadingBackgroundFrame) {
            if (!HomeSceneController.loadingBackgroundFrameTask) {
                HomeSceneController.loadingBackgroundFrameTask = HomeSceneController.loadSpriteFrameFromResources(
                    HomeSceneController.LOADING_OVERLAY_BACKGROUND_PATH,
                );
            }
            HomeSceneController.loadingBackgroundFrame = await HomeSceneController.loadingBackgroundFrameTask;
            HomeSceneController.loadingBackgroundFrameTask = null;
        }
        if (!HomeSceneController.loadingSpinnerFrame) {
            if (!HomeSceneController.loadingSpinnerFrameTask) {
                HomeSceneController.loadingSpinnerFrameTask = HomeSceneController.loadSpriteFrameFromResources(
                    HomeSceneController.LOADING_OVERLAY_SPINNER_PATH,
                );
            }
            HomeSceneController.loadingSpinnerFrame = await HomeSceneController.loadingSpinnerFrameTask;
            HomeSceneController.loadingSpinnerFrameTask = null;
        }
        if (!HomeSceneController.loadingIconFrame) {
            if (!HomeSceneController.loadingIconFrameTask) {
                HomeSceneController.loadingIconFrameTask = HomeSceneController.loadSpriteFrameFromResources(
                    HomeSceneController.LOADING_OVERLAY_ICON_PATH,
                );
            }
            HomeSceneController.loadingIconFrame = await HomeSceneController.loadingIconFrameTask;
            HomeSceneController.loadingIconFrameTask = null;
        }
        if (!root.isValid) {
            return;
        }
        const overlay = root.getChildByName(HomeSceneController.LOADING_OVERLAY_CONTAINER_NAME);
        const backgroundSprite = overlay
            ?.getChildByName(HomeSceneController.LOADING_OVERLAY_BACKGROUND_NAME)
            ?.getComponent(Sprite);
        const backgroundFallback = overlay?.getChildByName(HomeSceneController.LOADING_OVERLAY_FALLBACK_NAME);
        if (backgroundSprite?.isValid && HomeSceneController.loadingBackgroundFrame?.isValid) {
            backgroundSprite.spriteFrame = HomeSceneController.loadingBackgroundFrame;
            if (backgroundFallback?.isValid) {
                backgroundFallback.active = false;
            }
        } else if (backgroundFallback?.isValid) {
            backgroundFallback.active = true;
        }
        const spinnerSprite = overlay
            ?.getChildByName(HomeSceneController.LOADING_OVERLAY_SPINNER_NAME)
            ?.getComponent(Sprite);
        if (spinnerSprite?.isValid && HomeSceneController.loadingSpinnerFrame?.isValid) {
            spinnerSprite.spriteFrame = HomeSceneController.loadingSpinnerFrame;
        }
        const iconSprite = overlay
            ?.getChildByName(HomeSceneController.LOADING_OVERLAY_ICON_NAME)
            ?.getComponent(Sprite);
        if (iconSprite?.isValid && HomeSceneController.loadingIconFrame?.isValid) {
            iconSprite.spriteFrame = HomeSceneController.loadingIconFrame;
        }
    }

    private static async preloadPersistentLoadingAssets(): Promise<void> {
        if (!HomeSceneController.loadingBackgroundFrame && !HomeSceneController.loadingBackgroundFrameTask) {
            HomeSceneController.loadingBackgroundFrameTask = HomeSceneController.loadSpriteFrameFromResources(
                HomeSceneController.LOADING_OVERLAY_BACKGROUND_PATH,
            );
        }
        if (!HomeSceneController.loadingSpinnerFrame && !HomeSceneController.loadingSpinnerFrameTask) {
            HomeSceneController.loadingSpinnerFrameTask = HomeSceneController.loadSpriteFrameFromResources(
                HomeSceneController.LOADING_OVERLAY_SPINNER_PATH,
            );
        }
        if (!HomeSceneController.loadingIconFrame && !HomeSceneController.loadingIconFrameTask) {
            HomeSceneController.loadingIconFrameTask = HomeSceneController.loadSpriteFrameFromResources(
                HomeSceneController.LOADING_OVERLAY_ICON_PATH,
            );
        }
        if (!HomeSceneController.loadingBackgroundFrame && HomeSceneController.loadingBackgroundFrameTask) {
            HomeSceneController.loadingBackgroundFrame = await HomeSceneController.loadingBackgroundFrameTask;
            HomeSceneController.loadingBackgroundFrameTask = null;
        }
        if (!HomeSceneController.loadingSpinnerFrame && HomeSceneController.loadingSpinnerFrameTask) {
            HomeSceneController.loadingSpinnerFrame = await HomeSceneController.loadingSpinnerFrameTask;
            HomeSceneController.loadingSpinnerFrameTask = null;
        }
        if (!HomeSceneController.loadingIconFrame && HomeSceneController.loadingIconFrameTask) {
            HomeSceneController.loadingIconFrame = await HomeSceneController.loadingIconFrameTask;
            HomeSceneController.loadingIconFrameTask = null;
        }
    }

    private static loadSpriteFrameFromResources(path: string): Promise<SpriteFrame | null> {
        return new Promise((resolve) => {
            resources.load(path, SpriteFrame, (error, spriteFrame) => {
                if (error || !spriteFrame) {
                    console.error(`[HomeSceneController] Failed to load loading overlay sprite frame: ${path}`, error);
                    resolve(null);
                    return;
                }
                resolve(spriteFrame);
            });
        });
    }

    private static resetOverlayNodeTransform(node: Node): void {
        if (!node?.isValid) {
            return;
        }
        node.setPosition(0, 0, 0);
        node.setScale(1, 1, 1);
        node.setRotationFromEuler(0, 0, 0);
    }

    private static applyOverlayLayer(root: Node): void {
        if (!root?.isValid) {
            return;
        }
        root.layer = Layers.Enum.UI_2D;
        const stack: Node[] = [root];
        while (stack.length > 0) {
            const node = stack.pop();
            if (!node?.isValid) {
                continue;
            }
            node.layer = Layers.Enum.UI_2D;
            for (const child of node.children) {
                stack.push(child);
            }
        }
    }

    private static configureOverlayCanvas(root: Node): void {
        const canvas = root.getComponent(Canvas) ?? root.addComponent(Canvas);
        canvas.alignCanvasWithScreen = true;
        HomeSceneController.applyOverlayLayer(root);
    }

    private static applyFullStretchWidget(node: Node): void {
        const widget = node.getComponent(Widget) ?? node.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = 0;
        widget.bottom = 0;
        widget.left = 0;
        widget.right = 0;
    }
}
