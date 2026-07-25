import {
    _decorator,
    Button,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    Tween,
    tween,
    UITransform,
    Vec3,
} from 'cc';

const { ccclass, property } = _decorator;

@ccclass('ShutterToggleController')
export class ShutterToggleController extends Component {
    @property(Node)
    windowRuntime: Node | null = null;

    private shutterVisual: Node | null = null;
    private shutterVisualSprite: Sprite | null = null;
    private shutterVisualTransform: UITransform | null = null;
    private shutterDamagedSource: Node | null = null;
    private shutterButton: Button | null = null;
    private closedPosition = new Vec3();
    private openPosition = new Vec3();
    private isClosedState = false;
    private isAnimating = false;
    private interactionEnabled = false;
    private ready = false;
    private isDestroying = false;
    private damagedVisualActive = false;
    private pendingDamagedVisual = false;
    private animationTargetClosed: boolean | null = null;
    private normalShutterSpriteFrame: SpriteFrame | null = null;
    private damagedShutterSpriteFrame: SpriteFrame | null = null;
    private normalShutterDisplaySize = { width: 0, height: 0 };
    private normalSpriteType: Sprite.Type = Sprite.Type.SIMPLE;
    private normalSpriteSizeMode: Sprite.SizeMode = Sprite.SizeMode.CUSTOM;
    private readonly userCloseAcceptedListeners = new Set<() => void>();
    private readonly damagedVisualAppliedListeners = new Set<() => void>();

    protected onLoad(): void {
        this.ready = this.resolveNodes();
        if (!this.ready) {
            this.interactionEnabled = false;
            return;
        }

        this.computeShutterPositions();
        this.interactionEnabled = true;
        this.syncButtonInteractable();
    }

    protected onEnable(): void {
        this.node.on(
            Node.EventType.TOUCH_END,
            this.onShutterTouchEnd,
            this,
        );
    }

    protected onDisable(): void {
        this.node.off(
            Node.EventType.TOUCH_END,
            this.onShutterTouchEnd,
            this,
        );
        this.stopShutterTween();
        this.userCloseAcceptedListeners.clear();
        this.damagedVisualAppliedListeners.clear();
        this.pendingDamagedVisual = false;
        this.animationTargetClosed = null;
    }

    protected onDestroy(): void {
        this.isDestroying = true;
        this.stopShutterTween();
        this.isAnimating = false;
        this.userCloseAcceptedListeners.clear();
        this.damagedVisualAppliedListeners.clear();
        this.pendingDamagedVisual = false;
        this.animationTargetClosed = null;
        this.shutterVisual = null;
        this.shutterVisualSprite = null;
        this.shutterVisualTransform = null;
        this.shutterDamagedSource = null;
        this.shutterButton = null;
        this.normalShutterSpriteFrame = null;
        this.damagedShutterSpriteFrame = null;
    }

    public prepareClosedForIntro(): boolean {
        if (!this.ready || !this.shutterVisual) {
            return false;
        }

        Tween.stopAllByTarget(this.shutterVisual);
        this.shutterVisual.setPosition(this.closedPosition);
        this.isClosedState = true;
        this.isAnimating = false;
        this.animationTargetClosed = null;
        this.pendingDamagedVisual = false;
        this.syncButtonInteractable();
        return true;
    }

    public openForIntro(onComplete?: () => void): void {
        if (!this.ready) {
            return;
        }

        this.pendingDamagedVisual = false;
        this.animateTo(false, 0.58, onComplete);
    }

    public setInteractionEnabled(enabled: boolean): void {
        this.interactionEnabled = enabled;
        this.syncButtonInteractable();
    }

    public setDamagedVisual(): boolean {
        return this.requestDamagedVisualAfterClose();
    }

    public requestDamagedVisualAfterClose(): boolean {
        const unavailableReason = this.getDamagedVisualUnavailableReason();
        if (unavailableReason) {
            console.error(`[Shutter] damaged visual unavailable: ${unavailableReason}`);
            return false;
        }

        if (this.isClosedState && !this.isAnimating) {
            if (!this.applyDamagedVisualNow()) {
                const failedReason = this.getDamagedVisualUnavailableReason() ?? 'applyDamagedVisualNow failed';
                console.error(`[Shutter] damaged visual unavailable: ${failedReason}`);
                return false;
            }
            console.info('[Shutter] damaged visual request accepted: immediate');
            this.notifyDamagedVisualApplied();
            return true;
        }

        if (this.isAnimating && this.animationTargetClosed === true) {
            this.pendingDamagedVisual = true;
            console.info('[Shutter] damaged visual request accepted: deferred');
            return true;
        }

        const stateReason = this.isAnimating
            ? 'shutter is animating to open position'
            : 'shutter is not closed and no closing animation is running';
        console.error(`[Shutter] damaged visual unavailable: ${stateReason}`);
        return false;
    }

    public addDamagedVisualAppliedListener(listener: () => void): void {
        this.damagedVisualAppliedListeners.add(listener);
    }

    public removeDamagedVisualAppliedListener(listener: () => void): void {
        this.damagedVisualAppliedListeners.delete(listener);
    }

    public restoreNormalVisual(): boolean {
        if (
            !this.ready ||
            this.isDestroying ||
            !this.shutterVisual ||
            !this.shutterVisual.isValid ||
            !this.shutterVisualSprite ||
            !this.shutterVisualTransform ||
            !this.normalShutterSpriteFrame
        ) {
            return false;
        }
        this.stopShutterTween();
        this.isClosedState = true;
        this.animationTargetClosed = null;
        this.pendingDamagedVisual = false;
        this.shutterVisual.setPosition(this.closedPosition);
        this.shutterVisual.setScale(1, 1, 1);
        this.shutterVisualSprite.type = this.normalSpriteType;
        this.shutterVisualSprite.sizeMode = this.normalSpriteSizeMode;
        this.shutterVisualSprite.spriteFrame = this.normalShutterSpriteFrame;
        if (this.normalShutterDisplaySize.width > 0 && this.normalShutterDisplaySize.height > 0) {
            this.shutterVisualTransform.setContentSize(
                this.normalShutterDisplaySize.width,
                this.normalShutterDisplaySize.height,
            );
        }
        this.damagedVisualActive = false;
        this.syncButtonInteractable();
        return true;
    }

    public isDamagedVisualActive(): boolean {
        return this.damagedVisualActive;
    }

    public isShutterClosed(): boolean {
        return this.isClosedState;
    }

    public addUserCloseAcceptedListener(listener: () => void): void {
        this.userCloseAcceptedListeners.add(listener);
    }

    public removeUserCloseAcceptedListener(listener: () => void): void {
        this.userCloseAcceptedListeners.delete(listener);
    }

    private onShutterTouchEnd(): void {
        if (!this.ready || !this.shutterVisual) {
            return;
        }
        if (!this.interactionEnabled || this.isAnimating) {
            return;
        }

        const targetClosed = !this.isClosedState;
        this.animateTo(targetClosed, 0.34);
        if (targetClosed) {
            this.notifyUserCloseAccepted();
        }
    }

    private notifyUserCloseAccepted(): void {
        const listeners = Array.from(this.userCloseAcceptedListeners);
        for (const listener of listeners) {
            listener();
        }
    }

    private resolveNodes(): boolean {
        const consoleControls = this.node.parent;
        const canvas = consoleControls?.parent ?? null;
        const runtimeFromCanvas = canvas?.getChildByName('WindowRuntime') ?? null;
        this.windowRuntime = runtimeFromCanvas ?? this.windowRuntime;

        const windowViewport = this.windowRuntime?.getChildByName('WindowViewport') ?? null;
        const shutterVisual = windowViewport?.getChildByName('WindowShutterVisual') ?? null;
        const shutterDamagedSource = windowViewport?.getChildByName('WindowShutterDamagedSource') ?? null;
        const shutterButton = this.node.getComponent(Button);
        const viewportUi = windowViewport?.getComponent(UITransform) ?? null;
        const shutterUi = shutterVisual?.getComponent(UITransform) ?? null;
        const shutterSprite = shutterVisual?.getComponent(Sprite) ?? null;
        const damagedSourceSprite = shutterDamagedSource?.getComponent(Sprite) ?? null;

        const missing = [
            !consoleControls && 'ConsoleControls',
            !canvas && 'Canvas',
            !this.windowRuntime && 'WindowRuntime',
            !windowViewport && 'WindowViewport',
            !shutterVisual && 'WindowShutterVisual',
            !shutterDamagedSource && 'WindowShutterDamagedSource',
            !shutterButton && 'BtnShutterHit(Button)',
            !viewportUi && 'WindowViewport(UITransform)',
            !shutterUi && 'WindowShutterVisual(UITransform)',
            !shutterSprite && 'WindowShutterVisual(Sprite)',
            !damagedSourceSprite && 'WindowShutterDamagedSource(Sprite)',
            !damagedSourceSprite?.spriteFrame && 'WindowShutterDamagedSource(SpriteFrame)',
        ].filter(Boolean) as string[];

        if (missing.length > 0) {
            console.error(
                `[ShutterToggleController] Missing required nodes/components: ${missing.join(', ')}`,
            );
            return false;
        }

        this.shutterVisual = shutterVisual;
        this.shutterVisualSprite = shutterSprite;
        this.shutterVisualTransform = shutterUi;
        this.shutterDamagedSource = shutterDamagedSource;
        this.shutterButton = shutterButton;
        this.normalShutterSpriteFrame = shutterSprite?.spriteFrame ?? null;
        this.damagedShutterSpriteFrame = damagedSourceSprite?.spriteFrame ?? null;
        this.normalShutterDisplaySize = {
            width: shutterUi?.contentSize.width ?? 0,
            height: shutterUi?.contentSize.height ?? 0,
        };
        this.normalSpriteType = shutterSprite?.type ?? Sprite.Type.SIMPLE;
        this.normalSpriteSizeMode = shutterSprite?.sizeMode ?? Sprite.SizeMode.CUSTOM;
        this.damagedVisualActive = false;
        return true;
    }

    private computeShutterPositions(): void {
        if (!this.windowRuntime || !this.shutterVisual) {
            return;
        }

        const windowViewport = this.windowRuntime.getChildByName('WindowViewport');
        const viewportUi = windowViewport?.getComponent(UITransform) ?? null;
        const shutterUi = this.shutterVisual.getComponent(UITransform) ?? null;
        if (!viewportUi || !shutterUi) {
            return;
        }

        this.closedPosition = this.shutterVisual.position.clone();
        const openY =
            this.closedPosition.y +
            viewportUi.contentSize.height / 2 +
            shutterUi.contentSize.height / 2 +
            16;
        this.openPosition = new Vec3(this.closedPosition.x, openY, this.closedPosition.z);

        const distToClosed = Vec3.distance(this.shutterVisual.position, this.closedPosition);
        const distToOpen = Vec3.distance(this.shutterVisual.position, this.openPosition);
        this.isClosedState = distToClosed <= distToOpen;
    }

    private animateTo(closed: boolean, duration: number, onComplete?: () => void): void {
        if (!this.shutterVisual || this.damagedVisualActive) {
            return;
        }

        const target = closed ? this.closedPosition : this.openPosition;

        this.stopShutterTween();
        this.animationTargetClosed = closed;
        this.isAnimating = true;
        this.syncButtonInteractable();

        tween(this.shutterVisual)
            .to(duration, { position: target }, { easing: 'cubicInOut' })
            .call(() => {
                this.isAnimating = false;
                this.isClosedState = closed;
                this.animationTargetClosed = null;
                this.syncButtonInteractable();
                if (closed && this.pendingDamagedVisual) {
                    if (this.applyDamagedVisualNow()) {
                        this.notifyDamagedVisualApplied();
                    } else {
                        const reason =
                            this.getDamagedVisualUnavailableReason() ??
                            'applyDamagedVisualNow failed after close animation';
                        this.pendingDamagedVisual = false;
                        console.error(`[Shutter] damaged visual unavailable: ${reason}`);
                    }
                }
                if (onComplete) {
                    onComplete();
                }
            })
            .start();
    }

    private syncButtonInteractable(): void {
        if (!this.shutterButton) {
            return;
        }
        this.shutterButton.interactable = this.interactionEnabled && !this.isAnimating;
    }

    private stopShutterTween(): void {
        if (this.shutterVisual?.isValid) {
            Tween.stopAllByTarget(this.shutterVisual);
        }
        this.isAnimating = false;
        this.animationTargetClosed = null;
    }

    private notifyDamagedVisualApplied(): void {
        if (this.isDestroying) {
            return;
        }
        const listeners = Array.from(this.damagedVisualAppliedListeners);
        for (const listener of listeners) {
            listener();
        }
    }

    private applyDamagedVisualNow(): boolean {
        if (
            !this.shutterVisual ||
            !this.shutterVisual.isValid ||
            !this.shutterVisualSprite ||
            !this.shutterVisualTransform ||
            !this.damagedShutterSpriteFrame
        ) {
            return false;
        }
        const sourceWidth = this.damagedShutterSpriteFrame.originalSize.width;
        const sourceHeight = this.damagedShutterSpriteFrame.originalSize.height;
        if (sourceWidth <= 0 || sourceHeight <= 0) {
            return false;
        }
        const maxWidth = this.normalShutterDisplaySize.width;
        const maxHeight = this.normalShutterDisplaySize.height;
        if (maxWidth <= 0 || maxHeight <= 0) {
            return false;
        }
        const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
        if (!(scale > 0)) {
            return false;
        }
        this.stopShutterTween();
        this.shutterVisual.setPosition(this.closedPosition);
        this.shutterVisual.setScale(1, 1, 1);
        this.shutterVisualSprite.type = Sprite.Type.SIMPLE;
        this.shutterVisualSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.shutterVisualSprite.spriteFrame = this.damagedShutterSpriteFrame;
        this.shutterVisualTransform.setContentSize(sourceWidth * scale, sourceHeight * scale);
        this.interactionEnabled = false;
        this.damagedVisualActive = true;
        this.pendingDamagedVisual = false;
        this.syncButtonInteractable();
        console.info('[Shutter] damaged visual applied');
        return true;
    }

    private getDamagedVisualUnavailableReason(): string | null {
        if (!this.ready) {
            return 'controller is not ready';
        }
        if (this.isDestroying) {
            return 'controller is destroying';
        }
        if (!this.shutterVisual) {
            return 'WindowShutterVisual node is missing';
        }
        if (!this.shutterVisual.isValid) {
            return 'WindowShutterVisual node is invalid';
        }
        if (!this.shutterVisualSprite) {
            return 'WindowShutterVisual sprite is missing';
        }
        if (!this.shutterVisualTransform) {
            return 'WindowShutterVisual UITransform is missing';
        }
        if (!this.damagedShutterSpriteFrame) {
            return 'damaged sprite frame is missing';
        }
        if (this.normalShutterDisplaySize.width <= 0 || this.normalShutterDisplaySize.height <= 0) {
            return 'normal display size is invalid';
        }
        const sourceWidth = this.damagedShutterSpriteFrame.originalSize.width;
        const sourceHeight = this.damagedShutterSpriteFrame.originalSize.height;
        if (sourceWidth <= 0 || sourceHeight <= 0) {
            return `damaged source size is invalid (${sourceWidth}x${sourceHeight})`;
        }
        return null;
    }
}
