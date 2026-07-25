import { _decorator, Button, Component, Node, SceneAsset, Tween, UIOpacity, Vec3, director, tween } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('HomeSceneController')
export class HomeSceneController extends Component {
    @property(Node)
    startButton: Node | null = null;

    @property(SceneAsset)
    gameScene: SceneAsset | null = null;

    private _isSwitchingScene = false;
    private _originalButtonScale = new Vec3(1, 1, 1);
    private _hasCapturedOriginalScale = false;

    onLoad(): void {
        this.captureOriginalScaleIfNeeded();
    }

    onEnable(): void {
        if (!this.startButton) {
            console.error('[HomeSceneController] startButton is not assigned.');
            return;
        }

        this.captureOriginalScaleIfNeeded();
        this.resetButtonState();

        this.startButton.off(Node.EventType.TOUCH_END, this.onStartButtonClick, this);
        this.startButton.on(Node.EventType.TOUCH_END, this.onStartButtonClick, this);
    }

    onDisable(): void {
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

        this.captureOriginalScaleIfNeeded();

        const startButtonNode = this.startButton;
        const opacity = this.getOrCreateButtonOpacity(startButtonNode);
        const currentScale = startButtonNode.scale.clone();
        const pressedScale = new Vec3(currentScale.x * 0.94, currentScale.y * 0.94, currentScale.z);

        this._isSwitchingScene = true;
        button.interactable = false;
        Tween.stopAllByTarget(startButtonNode);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;

        try {
            tween(startButtonNode)
                .to(0.08, { scale: pressedScale }, { easing: 'quadOut' })
                .to(0.10, { scale: currentScale }, { easing: 'backOut' })
                .call(() => {
                    tween(opacity)
                        .to(0.35, { opacity: 0 }, { easing: 'quadInOut' })
                        .call(() => {
                            this.runGameSceneWithRecovery(button, opacity);
                        })
                        .start();
                })
                .start();
        } catch (err) {
            this.handleTransitionError(err, button, opacity);
        }
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
}
