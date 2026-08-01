import { isValid, Node, tween, Tween, UIOpacity, Vec3 } from 'cc';

export type InteractivePanelVisibilityState = 'hidden' | 'opening' | 'visible' | 'closing';

export interface InteractivePanelTransitionOptions {
  readonly openStartScale?: number;
  readonly openOvershootScale?: number;
  readonly openExpandDuration?: number;
  readonly openSettleDuration?: number;
  readonly closeEndScale?: number;
  readonly closeDuration?: number;
  readonly openExpandEasing?: string;
  readonly openSettleEasing?: string;
  readonly closeEasing?: string;
  readonly setInteractable?: (interactable: boolean) => void;
}

interface InteractivePanelRuntimeState {
  baseScale: Vec3;
  baseOpacity: number;
  opacity: UIOpacity;
  phase: InteractivePanelVisibilityState;
  token: number;
}

const DEFAULT_OPTIONS: Required<
  Omit<InteractivePanelTransitionOptions, 'setInteractable'>
> = {
  openStartScale: 0.72,
  openOvershootScale: 1.035,
  openExpandDuration: 0.14,
  openSettleDuration: 0.06,
  closeEndScale: 0.72,
  closeDuration: 0.14,
  openExpandEasing: 'backOut',
  openSettleEasing: 'sineOut',
  closeEasing: 'quadIn',
};

const PANEL_STATES = new WeakMap<Node, InteractivePanelRuntimeState>();

function multiplyScale(baseScale: Vec3, multiplier: number): Vec3 {
  return new Vec3(baseScale.x * multiplier, baseScale.y * multiplier, baseScale.z * multiplier);
}

function resolveOptions(options: InteractivePanelTransitionOptions | undefined): Required<Omit<InteractivePanelTransitionOptions, 'setInteractable'>> {
  return {
    openStartScale: options?.openStartScale ?? DEFAULT_OPTIONS.openStartScale,
    openOvershootScale: options?.openOvershootScale ?? DEFAULT_OPTIONS.openOvershootScale,
    openExpandDuration: options?.openExpandDuration ?? DEFAULT_OPTIONS.openExpandDuration,
    openSettleDuration: options?.openSettleDuration ?? DEFAULT_OPTIONS.openSettleDuration,
    closeEndScale: options?.closeEndScale ?? DEFAULT_OPTIONS.closeEndScale,
    closeDuration: options?.closeDuration ?? DEFAULT_OPTIONS.closeDuration,
    openExpandEasing: options?.openExpandEasing ?? DEFAULT_OPTIONS.openExpandEasing,
    openSettleEasing: options?.openSettleEasing ?? DEFAULT_OPTIONS.openSettleEasing,
    closeEasing: options?.closeEasing ?? DEFAULT_OPTIONS.closeEasing,
  };
}

function ensureRuntimeState(panelNode: Node): InteractivePanelRuntimeState | null {
  if (!isValid(panelNode, true)) {
    return null;
  }

  const cached = PANEL_STATES.get(panelNode);
  if (cached) {
    return cached;
  }

  const opacity = panelNode.getComponent(UIOpacity) ?? panelNode.addComponent(UIOpacity);
  const state: InteractivePanelRuntimeState = {
    baseScale: panelNode.scale.clone(),
    baseOpacity: opacity.opacity,
    opacity,
    phase: panelNode.active ? 'visible' : 'hidden',
    token: 0,
  };

  PANEL_STATES.set(panelNode, state);
  return state;
}

function stopPanelTweens(panelNode: Node, state: InteractivePanelRuntimeState): void {
  Tween.stopAllByTarget(panelNode);
  Tween.stopAllByTarget(state.opacity);
}

export function getInteractivePanelState(panelNode: Node): InteractivePanelVisibilityState {
  const state = ensureRuntimeState(panelNode);
  if (!state) {
    return 'hidden';
  }
  return state.phase;
}

export function showInteractivePanel(
  panelNode: Node,
  options?: InteractivePanelTransitionOptions,
): void {
  const state = ensureRuntimeState(panelNode);
  if (!state || !isValid(panelNode, true)) {
    return;
  }

  const config = resolveOptions(options);
  options?.setInteractable?.(false);

  if (state.phase === 'visible' || state.phase === 'opening') {
    options?.setInteractable?.(true);
    return;
  }

  state.token += 1;
  const token = state.token;
  stopPanelTweens(panelNode, state);

  panelNode.active = true;
  panelNode.setScale(multiplyScale(state.baseScale, config.openStartScale));
  state.opacity.opacity = 0;
  state.phase = 'opening';

  tween(panelNode)
    .to(
      config.openExpandDuration,
      { scale: multiplyScale(state.baseScale, config.openOvershootScale) },
      { easing: config.openExpandEasing },
    )
    .to(
      config.openSettleDuration,
      { scale: state.baseScale.clone() },
      { easing: config.openSettleEasing },
    )
    .call(() => {
      if (!isValid(panelNode, true)) {
        return;
      }
      const latest = PANEL_STATES.get(panelNode);
      if (!latest || latest.token !== token) {
        return;
      }
      panelNode.setScale(latest.baseScale);
      latest.opacity.opacity = 255;
      latest.phase = 'visible';
      options?.setInteractable?.(true);
    })
    .start();

  tween(state.opacity)
    .to(config.openExpandDuration, { opacity: 255 }, { easing: 'linear' })
    .start();
}

export function hideInteractivePanel(
  panelNode: Node,
  onComplete?: () => void,
  options?: InteractivePanelTransitionOptions,
): void {
  const state = ensureRuntimeState(panelNode);
  if (!state || !isValid(panelNode, true)) {
    onComplete?.();
    return;
  }

  if (state.phase === 'hidden') {
    onComplete?.();
    return;
  }

  if (state.phase === 'closing') {
    return;
  }

  const config = resolveOptions(options);
  options?.setInteractable?.(false);
  state.token += 1;
  const token = state.token;
  state.phase = 'closing';
  stopPanelTweens(panelNode, state);

  tween(panelNode)
    .to(
      config.closeDuration,
      { scale: multiplyScale(state.baseScale, config.closeEndScale) },
      { easing: config.closeEasing },
    )
    .call(() => {
      if (!isValid(panelNode, true)) {
        return;
      }
      const latest = PANEL_STATES.get(panelNode);
      if (!latest || latest.token !== token) {
        return;
      }
      panelNode.active = false;
      panelNode.setScale(latest.baseScale);
      latest.opacity.opacity = latest.baseOpacity;
      latest.phase = 'hidden';
      options?.setInteractable?.(true);
      onComplete?.();
    })
    .start();

  tween(state.opacity)
    .to(config.closeDuration, { opacity: 0 }, { easing: 'linear' })
    .start();
}

export function hideInteractivePanelImmediate(
  panelNode: Node,
  options?: InteractivePanelTransitionOptions,
): void {
  const state = ensureRuntimeState(panelNode);
  if (!state || !isValid(panelNode, true)) {
    return;
  }
  state.token += 1;
  stopPanelTweens(panelNode, state);
  panelNode.active = false;
  panelNode.setScale(state.baseScale);
  state.opacity.opacity = state.baseOpacity;
  state.phase = 'hidden';
  options?.setInteractable?.(true);
}
