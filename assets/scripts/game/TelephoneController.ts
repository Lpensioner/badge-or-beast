import { _decorator, Button, Color, Component, Graphics, Label, Node, Sprite, Tween, Vec3, tween } from 'cc';

const { ccclass } = _decorator;

@ccclass('TelephoneController')
export class TelephoneController extends Component {
  private readonly phoneKeyNodeNames = [
    'PhoneKey1',
    'PhoneKey2',
    'PhoneKey3',
    'PhoneKey4',
    'PhoneKey5',
    'PhoneKey6',
    'PhoneKey7',
    'PhoneKey8',
    'PhoneKey9',
    'PhoneKeyStar',
    'PhoneKey0',
    'PhoneKeyHash',
  ] as const;
  private phonePanelOpen = false;
  private emergencyMode = false;
  private emergencyStatusVisible = false;

  private phonePanelRuntime: Node | null = null;
  private phonePanelScrim: Node | null = null;
  private phonePanelBody: Node | null = null;
  private phonePanelCloseButton: Node | null = null;

  private telephoneHitButton: Button | null = null;
  private phonePanelCloseHitButton: Button | null = null;
  private phoneCallButton: Button | null = null;
  private phoneHashBackspaceButton: Button | null = null;
  private phoneNumberLabel: Label | null = null;
  private phoneNumber = '';
  private readonly defaultPhoneNumberLength = 15;
  private activePhoneNumberLength = 15;
  private readonly keypadNodeCharacterMap = [
    ['PhoneKey1', '1'],
    ['PhoneKey2', '2'],
    ['PhoneKey3', '3'],
    ['PhoneKey4', '4'],
    ['PhoneKey5', '5'],
    ['PhoneKey6', '6'],
    ['PhoneKey7', '7'],
    ['PhoneKey8', '8'],
    ['PhoneKey9', '9'],
    ['PhoneKey0', '0'],
  ] as const;
  private keypadButtonBindings: Array<{ button: Button; callback: () => void }> = [];
  private phonePanelScrimGraphics: Graphics | null = null;
  private phonePanelCloseGraphics: Graphics | null = null;
  private readonly emergencyPhoneOpenedListeners = new Set<() => void>();
  private readonly callSubmittedListeners = new Set<(phoneNumber: string) => void>();
  private telephoneEntryEnabled = false;

  private managedButtons: Button[] = [];
  private phoneKeyVisualStates = new Map<Node, {
    node: Node;
    sprite: Sprite;
    normalSprite: Button['normalSprite'];
    pressedSprite: Button['pressedSprite'];
    basePosition: Vec3;
    baseScale: Vec3;
    releaseRequested: boolean;
    pressCompleted: boolean;
  }>();

  onLoad(): void {
    const deskEvidenceRuntime = this.node.parent;
    const canvas = deskEvidenceRuntime?.parent ?? null;
    const consoleControls = canvas?.getChildByName('ConsoleControls') ?? null;

    this.phonePanelRuntime = canvas?.getChildByName('PhonePanelRuntime') ?? null;
    this.phonePanelScrim = this.phonePanelRuntime?.getChildByName('PhonePanelScrim') ?? null;
    this.phonePanelBody = this.phonePanelRuntime?.getChildByName('PhonePanelBody') ?? null;
    this.phonePanelCloseButton = this.phonePanelRuntime?.getChildByName('PhonePanelCloseButton') ?? null;
    const phoneNumberDisplay = this.phonePanelRuntime?.getChildByName('PhoneNumberDisplay') ?? null;
    const phoneKeypadRuntime = this.phonePanelRuntime?.getChildByName('PhoneKeypadRuntime') ?? null;
    const phoneBackspaceButtonNode = this.phonePanelRuntime?.getChildByName('PhoneBackspaceButton') ?? null;
    const phoneKeyStarNode = phoneKeypadRuntime?.getChildByName('PhoneKeyStar') ?? null;
    const phoneKeyHashNode = phoneKeypadRuntime?.getChildByName('PhoneKeyHash') ?? null;

    this.telephoneHitButton = this.node.getComponent(Button);
    this.phonePanelCloseHitButton = this.phonePanelCloseButton?.getComponent(Button) ?? null;
    this.phoneCallButton = phoneKeyStarNode?.getComponent(Button) ?? null;
    this.phoneHashBackspaceButton = phoneKeyHashNode?.getComponent(Button) ?? null;
    this.phoneNumberLabel = phoneNumberDisplay?.getComponent(Label) ?? null;
    this.phonePanelScrimGraphics = this.phonePanelScrim?.getComponent(Graphics) ?? null;
    this.phonePanelCloseGraphics = this.phonePanelCloseButton?.getComponent(Graphics) ?? null;
    this.keypadButtonBindings = [];
    this.phoneKeyVisualStates.clear();
    const phoneKeyVisualMissing: string[] = [];
    for (const nodeName of this.phoneKeyNodeNames) {
      const keyNode = phoneKeypadRuntime?.getChildByName(nodeName) ?? null;
      if (!keyNode) {
        phoneKeyVisualMissing.push(`PhoneKeypadRuntime/${nodeName}`);
        continue;
      }
      const keyButton = keyNode.getComponent(Button);
      const keySprite = keyNode.getComponent(Sprite);
      if (!keyButton) {
        phoneKeyVisualMissing.push(`PhoneKeypadRuntime/${nodeName}(Button)`);
        continue;
      }
      if (!keySprite) {
        phoneKeyVisualMissing.push(`PhoneKeypadRuntime/${nodeName}(Sprite)`);
        continue;
      }
      if (!keyButton.normalSprite) {
        phoneKeyVisualMissing.push(`PhoneKeypadRuntime/${nodeName}(Button.normalSprite)`);
      }
      if (!keyButton.pressedSprite) {
        phoneKeyVisualMissing.push(`PhoneKeypadRuntime/${nodeName}(Button.pressedSprite)`);
      }
      if (keyButton.target !== keyNode) {
        phoneKeyVisualMissing.push(`PhoneKeypadRuntime/${nodeName}(Button.target)`);
      }
      this.phoneKeyVisualStates.set(keyNode, {
        node: keyNode,
        sprite: keySprite,
        normalSprite: keyButton.normalSprite,
        pressedSprite: keyButton.pressedSprite,
        basePosition: keyNode.position.clone(),
        baseScale: keyNode.scale.clone(),
        releaseRequested: false,
        pressCompleted: false,
      });
    }
    for (const [nodeName, character] of this.keypadNodeCharacterMap) {
      const keyNode = phoneKeypadRuntime?.getChildByName(nodeName) ?? null;
      const keyButton = keyNode?.getComponent(Button) ?? null;
      if (!keyButton) {
        continue;
      }
      const callback = () => this.appendPhoneCharacter(character);
      this.keypadButtonBindings.push({ button: keyButton, callback });
    }

    const employeeCardHit = deskEvidenceRuntime?.getChildByName('EmployeeCardHit') ?? null;
    const applicationFormHit = deskEvidenceRuntime?.getChildByName('ApplicationFormHit') ?? null;
    const screeningChecklistHit = deskEvidenceRuntime?.getChildByName('ScreeningChecklistHit') ?? null;
    const btnShutterHit = consoleControls?.getChildByName('BtnShutterHit') ?? null;
    const btnAllowHit = consoleControls?.getChildByName('BtnAllowHit') ?? null;
    const btnDenyHit = consoleControls?.getChildByName('BtnDenyHit') ?? null;

    this.managedButtons = [
      employeeCardHit?.getComponent(Button) ?? null,
      applicationFormHit?.getComponent(Button) ?? null,
      screeningChecklistHit?.getComponent(Button) ?? null,
      this.telephoneHitButton,
      btnShutterHit?.getComponent(Button) ?? null,
      btnAllowHit?.getComponent(Button) ?? null,
      btnDenyHit?.getComponent(Button) ?? null,
    ].filter((button): button is Button => !!button);

    const missing: string[] = [];
    if (!deskEvidenceRuntime || deskEvidenceRuntime.name !== 'DeskEvidenceRuntime') {
      missing.push('DeskEvidenceRuntime');
    }
    if (!canvas || canvas.name !== 'Canvas') {
      missing.push('Canvas');
    }
    if (!consoleControls) {
      missing.push('ConsoleControls');
    }
    if (!this.phonePanelRuntime) {
      missing.push('PhonePanelRuntime');
    }
    if (!this.phonePanelScrim) {
      missing.push('PhonePanelScrim');
    }
    if (!this.phonePanelBody) {
      missing.push('PhonePanelBody');
    }
    if (!this.phonePanelCloseButton) {
      missing.push('PhonePanelCloseButton');
    }
    if (!phoneNumberDisplay) {
      missing.push('PhoneNumberDisplay');
    }
    if (!phoneKeypadRuntime) {
      missing.push('PhoneKeypadRuntime');
    }
    if (!phoneBackspaceButtonNode) {
      missing.push('PhoneBackspaceButton');
    }
    if (!phoneKeyStarNode) {
      missing.push('PhoneKeypadRuntime/PhoneKeyStar');
    }
    if (!phoneKeyHashNode) {
      missing.push('PhoneKeypadRuntime/PhoneKeyHash');
    }
    if (!this.telephoneHitButton) {
      missing.push('TelephoneHit(Button)');
    }
    if (!this.phonePanelCloseHitButton) {
      missing.push('PhonePanelCloseButton(Button)');
    }
    if (!this.phoneCallButton) {
      missing.push('PhoneKeypadRuntime/PhoneKeyStar(Button)');
    }
    if (!this.phoneHashBackspaceButton) {
      missing.push('PhoneKeypadRuntime/PhoneKeyHash(Button)');
    }
    if (!this.phoneNumberLabel) {
      missing.push('PhoneNumberDisplay(Label)');
    }
    for (const [nodeName] of this.keypadNodeCharacterMap) {
      const keyNode = phoneKeypadRuntime?.getChildByName(nodeName) ?? null;
      const keyButton = keyNode?.getComponent(Button) ?? null;
      if (!keyButton) {
        missing.push(`PhoneKeypadRuntime/${nodeName}(Button)`);
      }
    }
    if (!this.phonePanelScrimGraphics) {
      missing.push('PhonePanelScrim(Graphics)');
    }
    if (!this.phonePanelCloseGraphics) {
      missing.push('PhonePanelCloseButton(Graphics)');
    }
    missing.push(...phoneKeyVisualMissing);

    if (missing.length > 0) {
      console.error(`[TelephoneController] Missing required nodes/components: ${missing.join(', ')}`);
      this.enabled = false;
      return;
    }

    this.phonePanelRuntime.active = false;
    this.phonePanelOpen = false;
    this.telephoneEntryEnabled = true;
    if (this.telephoneHitButton) {
      this.telephoneHitButton.interactable = true;
    }
    this.clearPhoneNumber();
    this.drawPhonePanelScrim();
    this.drawPhonePanelCloseButton();
  }

  onEnable(): void {
    this.telephoneHitButton?.node.on(Button.EventType.CLICK, this.handleTelephoneHitClick, this);
    this.phonePanelCloseHitButton?.node.on(Button.EventType.CLICK, this.closePhonePanel, this);
    this.phoneCallButton?.node.on(Button.EventType.CLICK, this.submitPhoneNumber, this);
    this.phoneHashBackspaceButton?.node.on(Button.EventType.CLICK, this.removeLastPhoneCharacter, this);
    for (const binding of this.keypadButtonBindings) {
      binding.button.node.on(Button.EventType.CLICK, binding.callback, this);
    }
    if (!this.phoneKeyVisualStates) {
      return;
    }
    for (const state of this.phoneKeyVisualStates.values()) {
      state.node.on(Node.EventType.TOUCH_START, this.onPhoneKeyTouchStart, this);
      state.node.on(Node.EventType.TOUCH_END, this.onPhoneKeyTouchEnd, this);
      state.node.on(Node.EventType.TOUCH_CANCEL, this.onPhoneKeyTouchCancel, this);
    }
  }

  onDisable(): void {
    if (this.phoneKeyVisualStates) {
      for (const state of this.phoneKeyVisualStates.values()) {
        state.node.off(Node.EventType.TOUCH_START, this.onPhoneKeyTouchStart, this);
        state.node.off(Node.EventType.TOUCH_END, this.onPhoneKeyTouchEnd, this);
        state.node.off(Node.EventType.TOUCH_CANCEL, this.onPhoneKeyTouchCancel, this);
      }
    }
    this.restoreAllPhoneKeyVisualStates();
    this.telephoneHitButton?.node.off(Button.EventType.CLICK, this.handleTelephoneHitClick, this);
    this.phonePanelCloseHitButton?.node.off(Button.EventType.CLICK, this.closePhonePanel, this);
    this.phoneCallButton?.node.off(Button.EventType.CLICK, this.submitPhoneNumber, this);
    this.phoneHashBackspaceButton?.node.off(Button.EventType.CLICK, this.removeLastPhoneCharacter, this);
    for (const binding of this.keypadButtonBindings) {
      binding.button.node.off(Button.EventType.CLICK, binding.callback, this);
    }
  }

  onDestroy(): void {
    this.emergencyPhoneOpenedListeners.clear();
    this.callSubmittedListeners.clear();
    this.emergencyMode = false;
    this.emergencyStatusVisible = false;
  }

  private drawPhonePanelScrim(): void {
    if (!this.phonePanelScrimGraphics) {
      return;
    }
    this.phonePanelScrimGraphics.clear();
    this.phonePanelScrimGraphics.fillColor = new Color(0, 0, 0, 165);
    this.phonePanelScrimGraphics.rect(-360, -640, 720, 1280);
    this.phonePanelScrimGraphics.fill();
  }

  private drawPhonePanelCloseButton(): void {
    if (!this.phonePanelCloseGraphics) {
      return;
    }
    this.phonePanelCloseGraphics.clear();
    this.phonePanelCloseGraphics.fillColor = new Color(25, 23, 20, 255);
    this.phonePanelCloseGraphics.rect(-37, -37, 74, 74);
    this.phonePanelCloseGraphics.fill();
    this.phonePanelCloseGraphics.lineWidth = 3;
    this.phonePanelCloseGraphics.strokeColor = new Color(230, 220, 195, 255);
    this.phonePanelCloseGraphics.rect(-37, -37, 74, 74);
    this.phonePanelCloseGraphics.stroke();
  }

  public armEmergencyMode(): boolean {
    if (!this.phonePanelRuntime) {
      return false;
    }
    this.emergencyMode = true;
    this.emergencyStatusVisible = false;
    this.activePhoneNumberLength = 4;
    this.clearPhoneNumber();
    return true;
  }

  public openForEmergency(): boolean {
    if (!this.phonePanelRuntime || !this.emergencyMode) {
      return false;
    }
    if (this.phonePanelOpen) {
      return false;
    }
    this.emergencyStatusVisible = false;
    this.clearPhoneNumber();
    this.phonePanelRuntime.active = true;
    this.phonePanelOpen = true;
    this.setManagedButtonsInteractable(false);
    this.setEmergencyInputEnabled(true);
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = false;
    }
    this.notifyEmergencyPhoneOpened();
    return true;
  }

  public closeEmergencyPhone(): void {
    // Scene unload may call this after the component fields were already cleared.
    if (!this.isValid) {
      return;
    }
    if (this.phonePanelRuntime?.isValid) {
      this.phonePanelRuntime.active = false;
    }
    this.phonePanelOpen = false;
    this.emergencyMode = false;
    this.emergencyStatusVisible = false;
    this.activePhoneNumberLength = this.defaultPhoneNumberLength;
    this.restoreAllPhoneKeyVisualStates();
    this.clearPhoneNumber();
    if (this.phonePanelCloseHitButton?.isValid) {
      this.phonePanelCloseHitButton.interactable = true;
    }
    this.setManagedButtonsInteractable(true);
  }

  public resetDialInput(): void {
    this.emergencyStatusVisible = false;
    this.clearPhoneNumber();
  }

  public showEmergencyStatus(text: string): void {
    if (!this.phoneNumberLabel) {
      return;
    }
    this.phoneNumber = text;
    this.phoneNumberLabel.string = text;
    this.emergencyStatusVisible = true;
  }

  public setEmergencyInputEnabled(enabled: boolean): void {
    for (const binding of this.keypadButtonBindings) {
      binding.button.interactable = enabled;
    }
    if (this.phoneHashBackspaceButton) {
      this.phoneHashBackspaceButton.interactable = enabled;
    }
    if (this.phoneCallButton) {
      this.phoneCallButton.interactable = enabled;
    }
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = this.emergencyMode ? false : enabled;
    }
  }

  public setTelephoneEntryEnabled(enabled: boolean): void {
    this.telephoneEntryEnabled = enabled;
    if (this.telephoneHitButton) {
      this.telephoneHitButton.interactable = enabled;
    }
  }

  public addEmergencyPhoneOpenedListener(listener: () => void): void {
    this.emergencyPhoneOpenedListeners.add(listener);
  }

  public removeEmergencyPhoneOpenedListener(listener: () => void): void {
    this.emergencyPhoneOpenedListeners.delete(listener);
  }

  public addCallSubmittedListener(listener: (phoneNumber: string) => void): void {
    this.callSubmittedListeners.add(listener);
  }

  public removeCallSubmittedListener(listener: (phoneNumber: string) => void): void {
    this.callSubmittedListeners.delete(listener);
  }

  private handleTelephoneHitClick(): void {
    if (!this.telephoneEntryEnabled) {
      return;
    }
    if (this.emergencyMode) {
      console.info('[CarterEmergency] telephone entry accepted');
      this.openForEmergency();
      return;
    }
    this.openPhonePanel();
  }

  private openPhonePanel(): void {
    if (!this.phonePanelRuntime || this.phonePanelOpen) {
      return;
    }
    this.activePhoneNumberLength = this.defaultPhoneNumberLength;
    this.emergencyStatusVisible = false;
    this.clearPhoneNumber();
    this.phonePanelRuntime.active = true;
    this.phonePanelOpen = true;
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = true;
    }
    this.setManagedButtonsInteractable(false);
  }

  private closePhonePanel(): void {
    if (!this.phonePanelRuntime) {
      return;
    }
    this.emergencyStatusVisible = false;
    this.activePhoneNumberLength = this.defaultPhoneNumberLength;
    this.restoreAllPhoneKeyVisualStates();
    this.clearPhoneNumber();
    this.phonePanelRuntime.active = false;
    this.phonePanelOpen = false;
    this.setManagedButtonsInteractable(true);
  }

  private onPhoneKeyTouchStart(event: { currentTarget: Node | null }): void {
    const keyNode = event.currentTarget;
    if (!keyNode) {
      return;
    }
    const state = this.phoneKeyVisualStates.get(keyNode);
    if (!state) {
      return;
    }
    this.playPhoneKeyPress(state);
  }

  private onPhoneKeyTouchEnd(event: { currentTarget: Node | null }): void {
    const keyNode = event.currentTarget;
    if (!keyNode) {
      return;
    }
    const state = this.phoneKeyVisualStates.get(keyNode);
    if (!state) {
      return;
    }
    state.releaseRequested = true;
    if (state.pressCompleted) {
      this.playPhoneKeyRelease(state);
    }
  }

  private onPhoneKeyTouchCancel(event: { currentTarget: Node | null }): void {
    this.onPhoneKeyTouchEnd(event);
  }

  private playPhoneKeyPress(state: {
    node: Node;
    sprite: Sprite;
    normalSprite: Button['normalSprite'];
    pressedSprite: Button['pressedSprite'];
    basePosition: Vec3;
    baseScale: Vec3;
    releaseRequested: boolean;
    pressCompleted: boolean;
  }): void {
    Tween.stopAllByTarget(state.node);
    state.node.setPosition(state.basePosition);
    state.node.setScale(state.baseScale);
    state.sprite.spriteFrame = state.normalSprite;
    state.releaseRequested = false;
    state.pressCompleted = false;

    const firstPosition = new Vec3(state.basePosition.x, state.basePosition.y - 3, state.basePosition.z);
    const secondPosition = new Vec3(state.basePosition.x, state.basePosition.y - 6, state.basePosition.z);
    const firstScale = new Vec3(state.baseScale.x * 0.985, state.baseScale.y * 0.985, state.baseScale.z);
    const secondScale = new Vec3(state.baseScale.x * 0.96, state.baseScale.y * 0.96, state.baseScale.z);

    tween(state.node)
      .to(0.055, { position: firstPosition, scale: firstScale }, { easing: 'quadOut' })
      .call(() => {
        state.sprite.spriteFrame = state.pressedSprite;
      })
      .to(0.03, { position: secondPosition, scale: secondScale }, { easing: 'quadIn' })
      .call(() => {
        state.pressCompleted = true;
        if (state.releaseRequested) {
          this.playPhoneKeyRelease(state);
        }
      })
      .start();
  }

  private playPhoneKeyRelease(state: {
    node: Node;
    sprite: Sprite;
    normalSprite: Button['normalSprite'];
    pressedSprite: Button['pressedSprite'];
    basePosition: Vec3;
    baseScale: Vec3;
    releaseRequested: boolean;
    pressCompleted: boolean;
  }): void {
    Tween.stopAllByTarget(state.node);
    const reboundPosition = new Vec3(state.basePosition.x, state.basePosition.y - 3, state.basePosition.z);
    const reboundScale = new Vec3(state.baseScale.x * 0.985, state.baseScale.y * 0.985, state.baseScale.z);

    tween(state.node)
      .to(0.025, { position: reboundPosition, scale: reboundScale }, { easing: 'quadOut' })
      .call(() => {
        state.sprite.spriteFrame = state.normalSprite;
      })
      .to(0.04, { position: state.basePosition, scale: state.baseScale }, { easing: 'quadOut' })
      .call(() => {
        state.releaseRequested = false;
        state.pressCompleted = false;
      })
      .start();
  }

  private restoreAllPhoneKeyVisualStates(): void {
    if (!this.phoneKeyVisualStates) {
      return;
    }
    for (const state of this.phoneKeyVisualStates.values()) {
      if (!state?.node?.isValid) {
        continue;
      }
      Tween.stopAllByTarget(state.node);
      state.node.setPosition(state.basePosition);
      state.node.setScale(state.baseScale);
      if (state.sprite?.isValid) {
        state.sprite.spriteFrame = state.normalSprite;
      }
      state.releaseRequested = false;
      state.pressCompleted = false;
    }
  }

  private appendPhoneCharacter(character: string): void {
    if (this.emergencyMode && this.emergencyStatusVisible) {
      this.resetDialInput();
    }
    if (this.phoneNumber.length >= this.activePhoneNumberLength) {
      return;
    }
    this.phoneNumber += character;
    this.refreshPhoneNumberDisplay();
  }

  private removeLastPhoneCharacter(): void {
    if (this.emergencyMode && this.emergencyStatusVisible) {
      this.resetDialInput();
      return;
    }
    if (this.phoneNumber.length === 0) {
      return;
    }
    this.phoneNumber = this.phoneNumber.slice(0, -1);
    this.refreshPhoneNumberDisplay();
  }

  private submitPhoneNumber(): void {
    if (this.emergencyMode) {
      const submittedNumber = this.emergencyStatusVisible ? '' : this.phoneNumber;
      for (const listener of this.callSubmittedListeners) {
        listener(submittedNumber);
      }
      return;
    }
    if (!this.isPhoneNumberValidForCurrentPhase()) {
      this.closePhonePanel();
      return;
    }
    this.closePhonePanel();
  }

  private isPhoneNumberValidForCurrentPhase(): boolean {
    return false;
  }

  private clearPhoneNumber(): void {
    this.phoneNumber = '';
    this.refreshPhoneNumberDisplay();
  }

  private refreshPhoneNumberDisplay(): void {
    if (!this.phoneNumberLabel) {
      return;
    }
    this.phoneNumberLabel.string = this.phoneNumber;
  }

  private setManagedButtonsInteractable(interactable: boolean): void {
    for (const button of this.managedButtons) {
      button.interactable = interactable;
    }
  }

  private notifyEmergencyPhoneOpened(): void {
    console.info('[CarterEmergency] emergency phone opened');
    for (const listener of this.emergencyPhoneOpenedListeners) {
      listener();
    }
  }
}
