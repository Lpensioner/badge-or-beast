import {
  _decorator,
  Button,
  Color,
  Component,
  Graphics,
  HorizontalTextAlignment,
  Label,
  Node,
  Sprite,
  Tween,
  UITransform,
  Vec3,
  VerticalTextAlignment,
  tween,
} from 'cc';
import { getAppointmentDepartmentLabel } from './appointments/AppointmentDepartmentCatalog';
import { getAppointmentPurposeLabel } from './appointments/AppointmentPurposeCatalog';
import type { AppointmentDepartmentKey, AppointmentRosterDay, AppointmentRosterEntry } from './appointments/AppointmentTypes';
import { resolveDepartmentPhoneLookup } from './phone/DepartmentPhoneDirectory';
import { getVisitorProfile } from './visitors/VisitorProfileCatalog';
import type { VisitorKey } from './visitors/VisitorTypes';
import {
  hideInteractivePanel,
  hideInteractivePanelImmediate,
  showInteractivePanel,
} from './InteractivePanelTransition';
import { AudioManager } from '../audio/AudioManager';

const { ccclass } = _decorator;

type DepartmentPhoneUiState = 'dialing' | 'question-menu' | 'question-answer' | 'terminal-result';
type DepartmentPhoneQuestionKey = 'expected-today' | 'expected-name' | 'visit-purpose';

export interface DepartmentPhoneLookupContext {
  readonly rosterDay: AppointmentRosterDay | null;
  readonly activeVisitorKey: VisitorKey | null;
}

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
  private phoneKeypadRuntime: Node | null = null;
  private phoneBackspaceButtonNode: Node | null = null;

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
  private departmentPhoneLookupEnabled = false;
  private departmentPhoneContextProvider: (() => DepartmentPhoneLookupContext) | null = null;
  private departmentPhoneUiState: DepartmentPhoneUiState = 'dialing';
  private departmentPhoneInquiryRuntime: Node | null = null;
  private departmentResponsePanel: Node | null = null;
  private departmentResponseLabel: Label | null = null;
  private departmentQuestionMenuRoot: Node | null = null;
  private departmentContinueButtonNode: Node | null = null;
  private departmentContinueButton: Button | null = null;
  private departmentNeverMindButtonNode: Node | null = null;
  private departmentNeverMindButton: Button | null = null;
  private readonly departmentQuestionButtonNodes = new Map<DepartmentPhoneQuestionKey, Node>();
  private readonly departmentQuestionButtons = new Map<DepartmentPhoneQuestionKey, Button>();
  private readonly departmentInquiryBindings: Array<{ button: Button; callback: () => void }> = [];
  private activeConnectedAppointment: AppointmentRosterEntry | null = null;
  private activeConnectedDepartmentKey: AppointmentDepartmentKey | null = null;
  private telephoneEntryEnabled = false;
  private telephoneEntryRequestedEnabled = false;
  private campaignRegularAccessEnabled = false;
  private emergencyAccessOverride = false;
  private telephoneVisualNode: Node | null = null;
  private telephoneHitNode: Node | null = null;

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
  private readonly departmentQuestionPrompts: Readonly<Record<DepartmentPhoneQuestionKey, string>> = Object.freeze({
    'expected-today': 'IS ANYONE EXPECTED TODAY?',
    'expected-name': 'WHO ARE YOU EXPECTING?',
    'visit-purpose': 'WHAT IS THE PURPOSE OF THE VISIT?',
  });

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

    this.telephoneHitNode = this.node;
    this.telephoneVisualNode = this.node.parent?.getChildByName('TelephoneVisual') ?? null;
    this.telephoneHitButton = this.node.getComponent(Button);
    this.phonePanelCloseHitButton = this.phonePanelCloseButton?.getComponent(Button) ?? null;
    this.phoneCallButton = phoneKeyStarNode?.getComponent(Button) ?? null;
    this.phoneHashBackspaceButton = phoneKeyHashNode?.getComponent(Button) ?? null;
    this.phoneNumberLabel = phoneNumberDisplay?.getComponent(Label) ?? null;
    this.phoneKeypadRuntime = phoneKeypadRuntime;
    this.phoneBackspaceButtonNode = phoneBackspaceButtonNode;
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
    if (!this.telephoneVisualNode) {
      missing.push('TelephoneVisual');
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
    this.telephoneEntryRequestedEnabled = true;
    this.refreshTelephoneAvailability();
    this.resetDepartmentPhoneUiSession();
    this.drawPhonePanelScrim();
    this.drawPhonePanelCloseButton();
    this.ensureDepartmentPhoneInquiryRuntime();
  }

  onEnable(): void {
    this.telephoneHitButton?.node.on(Button.EventType.CLICK, this.handleTelephoneHitClick, this);
    this.phonePanelCloseHitButton?.node.on(Button.EventType.CLICK, this.onPhonePanelCloseClick, this);
    this.phoneCallButton?.node.on(Button.EventType.CLICK, this.submitPhoneNumber, this);
    this.phoneHashBackspaceButton?.node.on(Button.EventType.CLICK, this.removeLastPhoneCharacter, this);
    for (const binding of this.keypadButtonBindings) {
      binding.button.node.on(Button.EventType.CLICK, binding.callback, this);
    }
    for (const binding of this.departmentInquiryBindings) {
      binding.button.node.on(Button.EventType.CLICK, binding.callback, this);
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
    this.phonePanelCloseHitButton?.node.off(Button.EventType.CLICK, this.onPhonePanelCloseClick, this);
    this.phoneCallButton?.node.off(Button.EventType.CLICK, this.submitPhoneNumber, this);
    this.phoneHashBackspaceButton?.node.off(Button.EventType.CLICK, this.removeLastPhoneCharacter, this);
    for (const binding of this.keypadButtonBindings) {
      binding.button.node.off(Button.EventType.CLICK, binding.callback, this);
    }
    for (const binding of this.departmentInquiryBindings) {
      binding.button.node.off(Button.EventType.CLICK, binding.callback, this);
    }
  }

  onDestroy(): void {
    if (this.phonePanelRuntime?.isValid) {
      hideInteractivePanelImmediate(this.phonePanelRuntime, {
        setInteractable: (interactable) => this.setPhonePanelInteractable(interactable),
      });
    }
    this.emergencyPhoneOpenedListeners.clear();
    this.callSubmittedListeners.clear();
    this.departmentInquiryBindings.length = 0;
    this.departmentQuestionButtonNodes.clear();
    this.departmentQuestionButtons.clear();
    this.departmentPhoneContextProvider = null;
    this.activeConnectedAppointment = null;
    this.activeConnectedDepartmentKey = null;
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

  private setPhonePanelInteractable(interactable: boolean): void {
    for (const binding of this.keypadButtonBindings) {
      binding.button.interactable = interactable;
    }
    if (this.phoneHashBackspaceButton) {
      this.phoneHashBackspaceButton.interactable = interactable;
    }
    if (this.phoneCallButton) {
      this.phoneCallButton.interactable = interactable;
    }
    for (const binding of this.departmentInquiryBindings) {
      binding.button.interactable = interactable;
    }
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = this.emergencyMode ? false : interactable;
    }
  }

  public armEmergencyMode(): boolean {
    if (!this.phonePanelRuntime) {
      return false;
    }
    this.emergencyMode = true;
    this.emergencyAccessOverride = true;
    this.emergencyStatusVisible = false;
    this.activePhoneNumberLength = 4;
    this.clearPhoneNumber();
    this.refreshTelephoneAvailability();
    return true;
  }

  public openForEmergency(): boolean {
    if (!this.phonePanelRuntime || !this.emergencyMode) {
      return false;
    }
    if (this.phonePanelOpen) {
      return false;
    }
    this.resetDepartmentPhoneUiSession();
    this.setDepartmentPhoneUiState('dialing');
    this.emergencyStatusVisible = false;
    this.clearPhoneNumber();
    showInteractivePanel(this.phonePanelRuntime, {
      setInteractable: (interactable) => this.setPhonePanelInteractable(interactable),
    });
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
    if (this.phonePanelRuntime) {
      hideInteractivePanelImmediate(this.phonePanelRuntime, {
        setInteractable: (interactable) => this.setPhonePanelInteractable(interactable),
      });
    }
    this.phonePanelOpen = false;
    this.emergencyMode = false;
    this.emergencyAccessOverride = false;
    this.emergencyStatusVisible = false;
    this.activePhoneNumberLength = this.defaultPhoneNumberLength;
    this.restoreAllPhoneKeyVisualStates();
    this.resetDepartmentPhoneUiSession();
    this.setDepartmentPhoneUiState('dialing');
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = true;
    }
    this.setManagedButtonsInteractable(true);
    this.refreshTelephoneAvailability();
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
    this.telephoneEntryRequestedEnabled = enabled;
    this.refreshTelephoneAvailability();
  }

  public setCampaignRegularAccessEnabled(enabled: boolean): void {
    this.campaignRegularAccessEnabled = enabled;
    this.refreshTelephoneAvailability();
  }

  public setEmergencyAccessOverride(enabled: boolean): void {
    this.emergencyAccessOverride = enabled;
    this.refreshTelephoneAvailability();
  }

  public setDepartmentPhoneLookupEnabled(enabled: boolean): void {
    this.departmentPhoneLookupEnabled = enabled;
    if (!enabled && !this.emergencyMode) {
      this.resetDepartmentPhoneUiSession();
      this.setDepartmentPhoneUiState('dialing');
    }
    this.refreshPhoneNumberDisplay();
  }

  public setDepartmentPhoneContextProvider(
    provider: (() => DepartmentPhoneLookupContext) | null,
  ): void {
    this.departmentPhoneContextProvider = provider;
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
    if (!this.isInteractionAccessAllowed()) {
      return;
    }
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
    this.resetDepartmentPhoneUiSession();
    this.setDepartmentPhoneUiState('dialing');
    showInteractivePanel(this.phonePanelRuntime, {
      setInteractable: (interactable) => this.setPhonePanelInteractable(interactable),
    });
    this.phonePanelOpen = true;
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = true;
    }
    this.setManagedButtonsInteractable(false);
  }

  /** Player-clicked X on phone panel; play UI click then close. */
  private onPhonePanelCloseClick(): void {
    AudioManager.getInstance()?.playCachedSettingsClick();
    this.closePhonePanel();
  }

  private closePhonePanel(): void {
    if (!this.phonePanelRuntime) {
      return;
    }
    this.emergencyStatusVisible = false;
    this.activePhoneNumberLength = this.defaultPhoneNumberLength;
    this.restoreAllPhoneKeyVisualStates();
    this.resetDepartmentPhoneUiSession();
    this.setDepartmentPhoneUiState('dialing');
    hideInteractivePanel(
      this.phonePanelRuntime,
      () => {
        this.phonePanelOpen = false;
        this.setManagedButtonsInteractable(true);
        this.refreshTelephoneAvailability();
      },
      {
        setInteractable: (interactable) => this.setPhonePanelInteractable(interactable),
      },
    );
  }

  private closePhonePanelImmediate(): void {
    if (!this.phonePanelRuntime) {
      return;
    }
    hideInteractivePanelImmediate(this.phonePanelRuntime, {
      setInteractable: (interactable) => this.setPhonePanelInteractable(interactable),
    });
    this.phonePanelOpen = false;
    this.setManagedButtonsInteractable(true);
    this.refreshTelephoneAvailability();
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
    AudioManager.getInstance()?.playCachedPhoneDial();
    this.phoneNumber += character;
    this.refreshPhoneNumberDisplay();
  }

  private removeLastPhoneCharacter(): void {
    // Backspace is not a digit key; no dial SFX.
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
    if (this.departmentPhoneLookupEnabled) {
      this.handleDepartmentPhoneLookupSubmit();
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
    if (this.emergencyStatusVisible) {
      this.phoneNumberLabel.string = this.phoneNumber;
      return;
    }
    if (this.emergencyMode) {
      this.phoneNumberLabel.string = this.phoneNumber;
      return;
    }
    if (this.departmentPhoneUiState === 'question-menu' || this.departmentPhoneUiState === 'question-answer') {
      this.phoneNumberLabel.string = 'CONNECTED';
      return;
    }
    if (this.phoneNumber.length === 0) {
      this.phoneNumberLabel.string = this.departmentPhoneLookupEnabled ? 'ENTER NUMBER' : '';
      return;
    }
    this.phoneNumberLabel.string = this.phoneNumber;
  }

  private handleDepartmentPhoneLookupSubmit(): void {
    if (this.departmentPhoneUiState === 'terminal-result') {
      this.handleDepartmentContinuePressed();
      return;
    }
    if (this.departmentPhoneUiState === 'question-menu' || this.departmentPhoneUiState === 'question-answer') {
      return;
    }

    const contextProvider = this.departmentPhoneContextProvider;
    if (!contextProvider) {
      this.showTerminalResult('APPOINTMENT RECORDS UNAVAILABLE.');
      console.warn('[DepartmentPhoneLookup] context provider missing', {
        dialedNumber: this.phoneNumber,
        campaignDay: null,
      });
      return;
    }

    const context = contextProvider();
    const result = resolveDepartmentPhoneLookup(
      this.phoneNumber,
      context.rosterDay,
      context.activeVisitorKey,
    );

    if (result.kind === 'appointment-confirmed') {
      this.activeConnectedAppointment = result.appointment;
      this.activeConnectedDepartmentKey = result.departmentKey;
      const departmentLabel = getAppointmentDepartmentLabel(result.departmentKey) ?? 'DEPARTMENT';
      this.setDepartmentResponseText(`${departmentLabel} SPEAKING.`);
      this.setDepartmentPhoneUiState('question-menu');
      return;
    }

    if (result.kind === 'unknown-number') {
      this.showTerminalResult('NUMBER NOT IN SERVICE.');
      return;
    }

    if (result.kind === 'no-answer') {
      this.showTerminalResult('NO ANSWER.');
      return;
    }

    if (result.kind === 'records-unavailable') {
      this.showTerminalResult('APPOINTMENT RECORDS UNAVAILABLE.');
      console.warn('[DepartmentPhoneLookup] records unavailable', {
        reason: result.reason,
        dialedNumber: result.dialedNumber,
        departmentKey: result.departmentKey,
        campaignDay: context.rosterDay?.dayIndex ?? null,
      });
      return;
    }

    this.showTerminalResult('MULTIPLE APPOINTMENTS FOUND.\nPLEASE CHECK THE OFFICIAL ROSTER.');
    console.error('[DepartmentPhoneLookup] multiple appointments found', {
      dialedNumber: result.dialedNumber,
      activeVisitorKey: result.activeVisitorKey,
      appointmentCount: result.appointments.length,
    });
  }

  private showTerminalResult(message: string): void {
    this.activeConnectedAppointment = null;
    this.activeConnectedDepartmentKey = null;
    this.setDepartmentResponseText(message);
    this.setDepartmentPhoneUiState('terminal-result');
  }

  private setDepartmentPhoneUiState(state: DepartmentPhoneUiState): void {
    this.departmentPhoneUiState = state;
    this.ensureDepartmentPhoneInquiryRuntime();

    const isDialing = state === 'dialing';
    const isQuestionMenu = state === 'question-menu';
    const isQuestionAnswer = state === 'question-answer';
    const isTerminalResult = state === 'terminal-result';
    const isInquiryVisible = isQuestionMenu || isQuestionAnswer || isTerminalResult;

    if (this.departmentPhoneInquiryRuntime?.isValid) {
      this.departmentPhoneInquiryRuntime.active = isInquiryVisible;
    }
    if (this.departmentQuestionMenuRoot?.isValid) {
      this.departmentQuestionMenuRoot.active = isQuestionMenu;
    }
    if (this.departmentContinueButtonNode?.isValid) {
      this.departmentContinueButtonNode.active = isQuestionAnswer || isTerminalResult;
    }

    this.setDialInputVisible(isDialing);
    this.refreshPhoneNumberDisplay();
  }

  private setDialInputVisible(visible: boolean): void {
    if (this.phoneKeypadRuntime?.isValid) {
      this.phoneKeypadRuntime.active = visible;
    }
    if (this.phoneBackspaceButtonNode?.isValid) {
      // Keep legacy duplicate icon node hidden; active backspace lives on PhoneKeyHash.
      this.phoneBackspaceButtonNode.active = false;
    }
  }

  private resetDepartmentPhoneUiSession(): void {
    this.activeConnectedAppointment = null;
    this.activeConnectedDepartmentKey = null;
    this.phoneNumber = '';
    this.clearDepartmentResponseText();
    this.setDepartmentPhoneUiState('dialing');
  }

  private clearDepartmentResponseText(): void {
    if (this.departmentResponseLabel) {
      this.departmentResponseLabel.string = '';
    }
  }

  private setDepartmentResponseText(text: string): void {
    if (!this.departmentResponseLabel) {
      return;
    }
    this.departmentResponseLabel.string = text;
  }

  private handleDepartmentQuestionSelected(questionKey: DepartmentPhoneQuestionKey): void {
    const appointment = this.activeConnectedAppointment;
    const departmentKey = this.activeConnectedDepartmentKey;
    if (!appointment || !departmentKey) {
      this.showTerminalResult('APPOINTMENT RECORDS UNAVAILABLE.');
      return;
    }

    if (questionKey === 'expected-today') {
      this.setDepartmentResponseText('YES. WE ARE EXPECTING A VISITOR TODAY.');
      this.setDepartmentPhoneUiState('question-answer');
      return;
    }

    if (questionKey === 'expected-name') {
      const visitorProfile = getVisitorProfile(appointment.visitorKey);
      const displayName = visitorProfile?.displayName?.trim().toUpperCase() ?? 'THE SCHEDULED VISITOR';
      this.setDepartmentResponseText(`WE ARE EXPECTING ${displayName} TODAY.`);
      this.setDepartmentPhoneUiState('question-answer');
      return;
    }

    const purposeLabel = getAppointmentPurposeLabel(appointment.purposeKey) ?? 'OFFICIAL BUSINESS';
    this.setDepartmentResponseText(`THE VISIT IS FOR ${purposeLabel}.`);
    this.setDepartmentPhoneUiState('question-answer');
  }

  private handleDepartmentContinuePressed(): void {
    if (this.departmentPhoneUiState === 'question-answer') {
      const departmentKey = this.activeConnectedDepartmentKey;
      const departmentLabel = departmentKey ? getAppointmentDepartmentLabel(departmentKey) : null;
      this.setDepartmentResponseText(`${departmentLabel ?? 'DEPARTMENT'} SPEAKING.`);
      this.setDepartmentPhoneUiState('question-menu');
      return;
    }
    if (this.departmentPhoneUiState === 'terminal-result') {
      this.resetDepartmentPhoneUiSession();
    }
  }

  private handleDepartmentNeverMindPressed(): void {
    this.resetDepartmentPhoneUiSession();
  }

  private ensureDepartmentPhoneInquiryRuntime(): void {
    if (!this.phonePanelRuntime) {
      return;
    }

    const existingRuntime =
      this.phonePanelRuntime.getChildByName('DepartmentPhoneInquiryRuntime') ?? new Node('DepartmentPhoneInquiryRuntime');
    if (!existingRuntime.parent) {
      this.phonePanelRuntime.addChild(existingRuntime);
    }
    this.departmentPhoneInquiryRuntime = existingRuntime;
    this.departmentPhoneInquiryRuntime.setPosition(0, 0, 0);
    const runtimeTransform =
      this.departmentPhoneInquiryRuntime.getComponent(UITransform) ?? this.departmentPhoneInquiryRuntime.addComponent(UITransform);
    runtimeTransform.setContentSize(700, 1280);

    this.departmentResponsePanel = this.ensureResponsePanel(this.departmentPhoneInquiryRuntime);
    this.departmentQuestionMenuRoot = this.ensureQuestionMenuRoot(this.departmentPhoneInquiryRuntime);
    this.departmentContinueButtonNode = this.ensureContinueButtonNode(this.departmentPhoneInquiryRuntime);
    this.departmentPhoneInquiryRuntime.active = false;
    this.bindDepartmentInquiryButtonsOnce();
  }

  private ensureResponsePanel(runtimeRoot: Node): Node {
    const panel = runtimeRoot.getChildByName('DepartmentResponsePanel') ?? new Node('DepartmentResponsePanel');
    if (!panel.parent) {
      runtimeRoot.addChild(panel);
    }
    panel.setPosition(0, -365, 0);
    const panelTransform = panel.getComponent(UITransform) ?? panel.addComponent(UITransform);
    panelTransform.setContentSize(680, 128);
    const panelGraphics = panel.getComponent(Graphics) ?? panel.addComponent(Graphics);
    panelGraphics.clear();
    panelGraphics.fillColor = new Color(20, 18, 16, 230);
    panelGraphics.rect(-340, -64, 680, 128);
    panelGraphics.fill();
    panelGraphics.lineWidth = 2;
    panelGraphics.strokeColor = new Color(214, 206, 186, 255);
    panelGraphics.rect(-340, -64, 680, 128);
    panelGraphics.stroke();

    const responseLabelNode = panel.getChildByName('DepartmentResponseLabel') ?? new Node('DepartmentResponseLabel');
    if (!responseLabelNode.parent) {
      panel.addChild(responseLabelNode);
    }
    responseLabelNode.setPosition(0, 0, 0);
    const labelTransform = responseLabelNode.getComponent(UITransform) ?? responseLabelNode.addComponent(UITransform);
    labelTransform.setContentSize(620, 96);
    const label = responseLabelNode.getComponent(Label) ?? responseLabelNode.addComponent(Label);
    label.string = '';
    label.fontSize = 24;
    label.lineHeight = 30;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = true;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.color = new Color(235, 227, 208, 255);
    this.departmentResponseLabel = label;
    return panel;
  }

  private ensureQuestionMenuRoot(runtimeRoot: Node): Node {
    const menuRoot =
      runtimeRoot.getChildByName('DepartmentQuestionMenuRoot') ?? new Node('DepartmentQuestionMenuRoot');
    if (!menuRoot.parent) {
      runtimeRoot.addChild(menuRoot);
    }
    menuRoot.setPosition(0, -35, 0);
    const menuTransform = menuRoot.getComponent(UITransform) ?? menuRoot.addComponent(UITransform);
    menuTransform.setContentSize(560, 500);

    this.ensureQuestionButton(menuRoot, 'ExpectedTodayButton', this.departmentQuestionPrompts['expected-today'], 138, 'expected-today');
    this.ensureQuestionButton(menuRoot, 'ExpectedNameButton', this.departmentQuestionPrompts['expected-name'], 46, 'expected-name');
    this.ensureQuestionButton(menuRoot, 'VisitPurposeButton', this.departmentQuestionPrompts['visit-purpose'], -46, 'visit-purpose');
    this.departmentNeverMindButtonNode = this.ensureMenuButtonNode(menuRoot, 'NeverMindButton', 'NEVER MIND.', -138);
    this.departmentNeverMindButton = this.departmentNeverMindButtonNode.getComponent(Button) ?? null;
    return menuRoot;
  }

  private ensureContinueButtonNode(runtimeRoot: Node): Node {
    const node = runtimeRoot.getChildByName('DepartmentContinueButton') ?? new Node('DepartmentContinueButton');
    if (!node.parent) {
      runtimeRoot.addChild(node);
    }
    node.setPosition(0, -95, 0);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(260, 76);
    this.drawDepartmentButtonGraphics(node, 260, 76);
    const button = node.getComponent(Button) ?? node.addComponent(Button);
    button.target = node;
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.96;
    button.duration = 0.08;
    this.ensureButtonLabel(node, 'CONTINUE', 24);
    this.departmentContinueButton = button;
    return node;
  }

  private ensureQuestionButton(
    root: Node,
    nodeName: string,
    labelText: string,
    y: number,
    questionKey: DepartmentPhoneQuestionKey,
  ): void {
    const node = this.ensureMenuButtonNode(root, nodeName, labelText, y);
    const button = node.getComponent(Button) ?? null;
    if (!button) {
      return;
    }
    this.departmentQuestionButtonNodes.set(questionKey, node);
    this.departmentQuestionButtons.set(questionKey, button);
  }

  private ensureMenuButtonNode(root: Node, nodeName: string, labelText: string, y: number): Node {
    const node = root.getChildByName(nodeName) ?? new Node(nodeName);
    if (!node.parent) {
      root.addChild(node);
    }
    node.setPosition(0, y, 0);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(520, 76);
    this.drawDepartmentButtonGraphics(node, 520, 76);
    const button = node.getComponent(Button) ?? node.addComponent(Button);
    button.target = node;
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.97;
    button.duration = 0.08;
    this.ensureButtonLabel(node, labelText, 22);
    return node;
  }

  private drawDepartmentButtonGraphics(node: Node, width: number, height: number): void {
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    graphics.clear();
    graphics.fillColor = new Color(26, 24, 22, 242);
    graphics.rect(-halfWidth, -halfHeight, width, height);
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(221, 214, 198, 255);
    graphics.rect(-halfWidth, -halfHeight, width, height);
    graphics.stroke();
  }

  private ensureButtonLabel(buttonNode: Node, text: string, fontSize: number): void {
    const labelNode = buttonNode.getChildByName('Label') ?? new Node('Label');
    if (!labelNode.parent) {
      buttonNode.addChild(labelNode);
    }
    labelNode.setPosition(0, 0, 0);
    const transform = labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
    const parentTransform = buttonNode.getComponent(UITransform);
    transform.setContentSize((parentTransform?.contentSize.width ?? 520) - 24, 62);
    const label = labelNode.getComponent(Label) ?? labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = 28;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = true;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.color = new Color(239, 232, 216, 255);
  }

  private bindDepartmentInquiryButtonsOnce(): void {
    if (this.departmentInquiryBindings.length > 0) {
      return;
    }

    const expectedTodayButton = this.departmentQuestionButtons.get('expected-today');
    const expectedNameButton = this.departmentQuestionButtons.get('expected-name');
    const visitPurposeButton = this.departmentQuestionButtons.get('visit-purpose');

    if (expectedTodayButton) {
      this.departmentInquiryBindings.push({
        button: expectedTodayButton,
        callback: () => this.handleDepartmentQuestionSelected('expected-today'),
      });
    }
    if (expectedNameButton) {
      this.departmentInquiryBindings.push({
        button: expectedNameButton,
        callback: () => this.handleDepartmentQuestionSelected('expected-name'),
      });
    }
    if (visitPurposeButton) {
      this.departmentInquiryBindings.push({
        button: visitPurposeButton,
        callback: () => this.handleDepartmentQuestionSelected('visit-purpose'),
      });
    }
    if (this.departmentNeverMindButton) {
      this.departmentInquiryBindings.push({
        button: this.departmentNeverMindButton,
        callback: () => this.handleDepartmentNeverMindPressed(),
      });
    }
    if (this.departmentContinueButton) {
      this.departmentInquiryBindings.push({
        button: this.departmentContinueButton,
        callback: () => this.handleDepartmentContinuePressed(),
      });
    }
  }

  private setManagedButtonsInteractable(interactable: boolean): void {
    for (const button of this.managedButtons) {
      button.interactable = interactable;
    }
  }

  private isInteractionAccessAllowed(): boolean {
    return this.campaignRegularAccessEnabled || this.emergencyAccessOverride;
  }

  private refreshTelephoneAvailability(): void {
    const interactionAllowed = this.isInteractionAccessAllowed();
    const panelAvailability = interactionAllowed && this.telephoneEntryRequestedEnabled;
    this.telephoneEntryEnabled = panelAvailability;
    if (this.telephoneVisualNode?.isValid) {
      this.telephoneVisualNode.active = true;
    }
    if (this.telephoneHitNode?.isValid) {
      this.telephoneHitNode.active = interactionAllowed;
    }
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = interactionAllowed;
    }
    if (!panelAvailability && !this.emergencyMode && this.phonePanelOpen) {
      this.closePhonePanelImmediate();
    }
  }

  private notifyEmergencyPhoneOpened(): void {
    console.info('[CarterEmergency] emergency phone opened');
    for (const listener of this.emergencyPhoneOpenedListeners) {
      listener();
    }
  }
}
