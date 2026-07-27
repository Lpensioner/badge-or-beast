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
import { AudioManager } from '../audio/AudioManager';

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
    private readonly shutterClosedSettledListeners = new Set<() => void>();
    private readonly damagedVisualAppliedListeners = new Set<() => void>();
    private shutterImpactLoopRunning = false;
    private shutterImpactLoopTickScheduled = false;
    private readonly shutterImpactNormalHoldSeconds = 0.08;
    private readonly shutterImpactDamageScaleUpSeconds = 0.08;
    private readonly shutterImpactReboundSeconds = 0.08;
    private readonly shutterImpactRecoverSeconds = 0.1;
    private readonly shutterImpactIdleSeconds = 0;
    private readonly shutterImpactScaleUp = 1.035;
    private readonly shutterImpactScaleDown = 0.985;
    private readonly shutterImpactYOffset = 1.5;

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
        this.stopShutterImpactLoop();
        this.userCloseAcceptedListeners.clear();
        this.shutterClosedSettledListeners.clear();
        this.damagedVisualAppliedListeners.clear();
        this.pendingDamagedVisual = false;
        this.animationTargetClosed = null;
    }

    protected onDestroy(): void {
        this.isDestroying = true;
        this.stopShutterImpactLoop();
        this.isAnimating = false;
        this.userCloseAcceptedListeners.clear();
        this.shutterClosedSettledListeners.clear();
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

        this.stopShutterImpactLoop();
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

        this.stopShutterImpactLoop();
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
        this.stopShutterImpactLoop();
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

    public startShutterImpactLoop(): boolean {
        const unavailableReason = this.getShutterImpactLoopUnavailableReason();
        if (unavailableReason) {
            console.error(`[Shutter] impact loop unavailable: ${unavailableReason}`);
            return false;
        }
        if (this.shutterImpactLoopRunning) {
            return true;
        }
        this.shutterImpactLoopRunning = true;
        this.pendingDamagedVisual = false;
        this.isClosedState = true;
        this.scheduleNextShutterImpactTick(0);
        console.info('[Shutter] impact loop started');
        return true;
    }

    public stopShutterImpactLoop(): void {
        this.unschedule(this.handleShutterImpactLoopTick);
        this.shutterImpactLoopTickScheduled = false;
        this.shutterImpactLoopRunning = false;
        this.stopShutterTween();
        if (this.shutterVisual?.isValid) {
            this.shutterVisual.setScale(1, 1, 1);
            this.shutterVisual.setPosition(this.closedPosition);
        }
    }

    public isShutterImpactLoopRunning(): boolean {
        return this.shutterImpactLoopRunning;
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

    public addShutterClosedSettledListener(listener: () => void): void {
        this.shutterClosedSettledListeners.add(listener);
    }

    public removeShutterClosedSettledListener(listener: () => void): void {
        this.shutterClosedSettledListeners.delete(listener);
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

        // Lifecycle-driven shutter SFX: play once when a new open/close animation starts.
        // Skip while already animating to avoid duplicate playback on re-entrant calls.
        if (!this.isAnimating) {
            AudioManager.getInstance()?.playCachedShutterMove();
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
                if (closed) {
                    this.shutterVisual?.setPosition(this.closedPosition);
                    AudioManager.getInstance()?.startAlarmLoop();
                    this.notifyShutterClosedSettled();
                } else {
                    AudioManager.getInstance()?.stopAlarmLoop();
                }
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

    private readonly handleShutterImpactLoopTick = (): void => {
        this.shutterImpactLoopTickScheduled = false;
        if (!this.shutterImpactLoopRunning) {
            return;
        }
        const unavailableReason = this.getShutterImpactLoopUnavailableReason();
        if (unavailableReason) {
            console.error(`[Shutter] impact loop aborted: ${unavailableReason}`);
            this.stopShutterImpactLoop();
            return;
        }
        if (!this.applyNormalClosedVisualForImpactLoop()) {
            console.error('[Shutter] impact loop aborted: failed to apply normal visual');
            this.stopShutterImpactLoop();
            return;
        }
        const shutterVisual = this.shutterVisual;
        if (!shutterVisual?.isValid) {
            console.error('[Shutter] impact loop aborted: WindowShutterVisual is invalid');
            this.stopShutterImpactLoop();
            return;
        }
        const closed = this.closedPosition;
        const hitUpPosition = new Vec3(closed.x, closed.y + this.shutterImpactYOffset, closed.z);
        const reboundPosition = new Vec3(closed.x, closed.y - this.shutterImpactYOffset * 0.5, closed.z);

        this.stopShutterTween();
        tween(shutterVisual)
            .delay(this.shutterImpactNormalHoldSeconds)
            .call(() => {
                if (!this.shutterImpactLoopRunning) {
                    return;
                }
                if (!this.applyDamagedClosedVisualForImpactLoop()) {
                    console.error('[Shutter] impact loop aborted: failed to apply damaged visual');
                    this.stopShutterImpactLoop();
                }
            })
            .to(
                this.shutterImpactDamageScaleUpSeconds,
                {
                    scale: new Vec3(this.shutterImpactScaleUp, this.shutterImpactScaleUp, 1),
                    position: hitUpPosition,
                },
                { easing: 'quadOut' },
            )
            .to(
                this.shutterImpactReboundSeconds,
                {
                    scale: new Vec3(this.shutterImpactScaleDown, this.shutterImpactScaleDown, 1),
                    position: reboundPosition,
                },
                { easing: 'quadInOut' },
            )
            .call(() => {
                if (!this.shutterImpactLoopRunning) {
                    return;
                }
                if (!this.applyNormalClosedVisualForImpactLoop()) {
                    console.error('[Shutter] impact loop aborted: failed to restore normal visual');
                    this.stopShutterImpactLoop();
                }
            })
            .to(
                this.shutterImpactRecoverSeconds,
                {
                    scale: new Vec3(1, 1, 1),
                    position: new Vec3(closed.x, closed.y, closed.z),
                },
                { easing: 'quadOut' },
            )
            .call(() => {
                this.scheduleNextShutterImpactTick(this.shutterImpactIdleSeconds);
            })
            .start();
    };

    private scheduleNextShutterImpactTick(delaySeconds: number): void {
        if (!this.shutterImpactLoopRunning) {
            return;
        }
        this.unschedule(this.handleShutterImpactLoopTick);
        this.shutterImpactLoopTickScheduled = true;
        this.scheduleOnce(this.handleShutterImpactLoopTick, Math.max(0, delaySeconds));
    }

    private applyNormalClosedVisualForImpactLoop(): boolean {
        if (
            !this.shutterVisual ||
            !this.shutterVisual.isValid ||
            !this.shutterVisualSprite ||
            !this.shutterVisualTransform ||
            !this.normalShutterSpriteFrame
        ) {
            return false;
        }
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
        this.isClosedState = true;
        return true;
    }

    private applyDamagedClosedVisualForImpactLoop(): boolean {
        if (
            !this.shutterVisual ||
            !this.shutterVisual.isValid ||
            !this.shutterVisualSprite ||
            !this.shutterVisualTransform ||
            !this.damagedShutterSpriteFrame
        ) {
            return false;
        }
        const sourceSize = this.resolveSpriteFrameSourceSize(this.damagedShutterSpriteFrame);
        if (!sourceSize) {
            return false;
        }
        const targetWidth = this.normalShutterDisplaySize.width;
        const targetHeight = this.normalShutterDisplaySize.height;
        if (targetWidth <= 0 || targetHeight <= 0) {
            return false;
        }
        const widthScale = targetWidth / sourceSize.width;
        const heightScale = targetHeight / sourceSize.height;
        const scale = Math.max(widthScale, heightScale);
        if (!(scale > 0)) {
            return false;
        }
        this.shutterVisual.setPosition(this.closedPosition);
        this.shutterVisual.setScale(1, 1, 1);
        this.shutterVisualSprite.type = Sprite.Type.SIMPLE;
        this.shutterVisualSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.shutterVisualSprite.spriteFrame = this.damagedShutterSpriteFrame;
        this.shutterVisualTransform.setContentSize(sourceSize.width * scale, sourceSize.height * scale);
        this.damagedVisualActive = true;
        this.isClosedState = true;
        return true;
    }

    private getShutterImpactLoopUnavailableReason(): string | null {
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
        if (!this.normalShutterSpriteFrame) {
            return 'normal shutter sprite frame is missing';
        }
        if (!this.damagedShutterSpriteFrame) {
            return 'damaged shutter sprite frame is missing';
        }
        if (this.normalShutterDisplaySize.width <= 0 || this.normalShutterDisplaySize.height <= 0) {
            return 'normal shutter display size is invalid';
        }
        if (this.isAnimating || this.animationTargetClosed !== null || !this.isClosedState) {
            return 'shutter is not closed and settled';
        }
        return null;
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

    private notifyShutterClosedSettled(): void {
        if (this.isDestroying || this.isAnimating || !this.isClosedState || this.animationTargetClosed !== null) {
            return;
        }
        const listeners = Array.from(this.shutterClosedSettledListeners);
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
        const sourceSize = this.resolveSpriteFrameSourceSize(this.damagedShutterSpriteFrame);
        if (!sourceSize) {
            return false;
        }
        this.refreshNormalShutterDisplaySizeFromCurrentVisual();
        const targetWidth = this.normalShutterDisplaySize.width;
        const targetHeight = this.normalShutterDisplaySize.height;
        if (targetWidth <= 0 || targetHeight <= 0) {
            return false;
        }
        const widthScale = targetWidth / sourceSize.width;
        const heightScale = targetHeight / sourceSize.height;
        const scale = Math.max(widthScale, heightScale);
        if (!(scale > 0)) {
            return false;
        }
        this.stopShutterTween();
        this.shutterVisual.setPosition(this.closedPosition);
        this.shutterVisual.setScale(1, 1, 1);
        this.shutterVisualSprite.type = Sprite.Type.SIMPLE;
        this.shutterVisualSprite.sizeMode = Sprite.SizeMode.CUSTOM;
        this.shutterVisualSprite.spriteFrame = this.damagedShutterSpriteFrame;
        this.shutterVisualTransform.setContentSize(sourceSize.width * scale, sourceSize.height * scale);
        this.interactionEnabled = false;
        this.damagedVisualActive = true;
        this.pendingDamagedVisual = false;
        this.syncButtonInteractable();
        console.info('[Shutter] damaged visual applied');
        return true;
    }

    private refreshNormalShutterDisplaySizeFromCurrentVisual(): void {
        if (
            !this.shutterVisualTransform ||
            !this.shutterVisualSprite ||
            !this.normalShutterSpriteFrame
        ) {
            return;
        }
        if (this.shutterVisualSprite.spriteFrame !== this.normalShutterSpriteFrame) {
            return;
        }
        const width = this.shutterVisualTransform.contentSize.width;
        const height = this.shutterVisualTransform.contentSize.height;
        if (width <= 0 || height <= 0) {
            return;
        }
        this.normalShutterDisplaySize = { width, height };
    }

    private resolveSpriteFrameSourceSize(spriteFrame: SpriteFrame): { width: number; height: number } | null {
        let sourceWidth = spriteFrame.originalSize.width;
        let sourceHeight = spriteFrame.originalSize.height;
        const textureWidth = spriteFrame.texture?.width ?? 0;
        const textureHeight = spriteFrame.texture?.height ?? 0;
        if (textureWidth > 0 && textureHeight > 0) {
            const originalRatio = sourceWidth > 0 && sourceHeight > 0 ? sourceWidth / sourceHeight : 0;
            const textureRatio = textureWidth / textureHeight;
            const ratioDelta = originalRatio > 0 ? Math.abs(textureRatio - originalRatio) / originalRatio : 1;
            if (sourceWidth <= 0 || sourceHeight <= 0 || ratioDelta > 0.03) {
                sourceWidth = textureWidth;
                sourceHeight = textureHeight;
            }
        }
        if (sourceWidth <= 0 || sourceHeight <= 0) {
            return null;
        }
        return { width: sourceWidth, height: sourceHeight };
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
        const sourceSize = this.resolveSpriteFrameSourceSize(this.damagedShutterSpriteFrame);
        if (!sourceSize) {
            return 'damaged source size is invalid';
        }
        return null;
    }
}
