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
import { getAppointmentPurposeLabel } from './appointments/AppointmentPurposeCatalog';
import type { AppointmentDepartmentKey, AppointmentRosterDay, AppointmentRosterEntry } from './appointments/AppointmentTypes';
import { resolveDepartmentPhoneLookup } from './phone/DepartmentPhoneDirectory';
import { setDay4VisitorPhoneVerificationResult } from './visitors/Day4VisitorSessionGenerator';
import type { PhoneVerificationResult } from './visitors/VisitorRoundTypes';
import type { VisitorKey } from './visitors/VisitorTypes';
import { EmployeeFilesController } from './EmployeeFilesController';
import {
  hideInteractivePanel,
  hideInteractivePanelImmediate,
  showInteractivePanel,
} from './InteractivePanelTransition';
import { AudioManager } from '../audio/AudioManager';
import { GameAudioCatalog, VoiceId } from '../audio/GameAudioCatalog';

const { ccclass } = _decorator;

type DepartmentPhoneUiState =
  | 'dialing'
  | 'connecting'
  | 'connected'
  | 'question-menu'
  | 'question-answer'
  | 'terminal-result';
type DepartmentPhoneQuestionKey = 'ask-appointment-arrived' | 'nothing-happened';

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
  private departmentResponsePanelButton: Button | null = null;
  private departmentResponseContinueHintNode: Node | null = null;
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
  private managedButtonsShapeWarningLogged = false;
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
    'ask-appointment-arrived': 'ASK IF THE APPOINTMENT PERSON HAS ARRIVED.',
    'nothing-happened': 'NOTHING HAPPENED.',
  });
  private latestDepartmentResponseText = '';
  private readonly departmentResponseTypingIntervalSec = 0.03;
  private departmentResponseTyping = false;
  private departmentResponseTypingFullText = '';
  private departmentResponseTypingLength = 0;
  private departmentCallSequenceSerial = 0;
  private pendingDepartmentConnectSequenceSerial = -1;
  private pendingDepartmentReplySequenceSerial = -1;
  private readonly departmentConnectDelayFallbackSec = 2.4;
  private readonly departmentReplyDurationFallbackSec = 2.0;
  private readonly standardPhoneDialDelayFallbackSec = 0.8;
  private readonly standardPhoneConnectedDelayFallbackSec = 0.8;
  private readonly standardPhoneNoAnswerNumbers = new Set(['9527', '6842', '7716']);
  private departmentReplyAutoAdvanceDelaySec = 2.0;
  private standardPhoneCallSequenceSerial = 0;
  private pendingStandardPhoneResultSequenceSerial = -1;
  private pendingStandardPhoneDialedNumber = '';
  private connectedGreetingLines: string[] = [];
  private connectedGreetingLineIndex = -1;
  private day0EndingUnknownCallActive = false;
  private day0EndingUnknownCallLines: string[] = [];
  private day0EndingUnknownCallLineIndex = -1;
  private day0EndingUnknownCallArmed = false;
  private day0EndingUnknownCallArmedLines: string[] = [];
  private day0EndingUnknownCallOnComplete: (() => void) | null = null;
  private day0EndingUnknownCallOnStart: (() => void) | null = null;
  private readonly day0EndingUnknownCallInitialDelaySec = 0.9;
  private readonly day0EndingUnknownCallLineDelaySec = 1.8;
  private readonly day0EndingUnknownCallFinalCloseDelaySec = 1.5;
  private day0EndingTelephoneStoryLock = false;

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
    this.configurePhoneNumberLabelLayout();
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
    this.stopDepartmentResponseTyping(false);
    this.cancelPendingDepartmentSequenceTimers();
    this.cancelPendingStandardPhoneResultTimer();
    this.stopDepartmentVoiceIfNeeded();
    this.clearDay0EndingUnknownNumberCallArmed();
    this.stopDay0EndingUnknownNumberCall(false);
    this.day0EndingTelephoneStoryLock = false;
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
    this.stopDepartmentResponseTyping(false);
    this.cancelPendingDepartmentSequenceTimers();
    this.cancelPendingStandardPhoneResultTimer();
    this.stopDepartmentVoiceIfNeeded();
    this.clearDay0EndingUnknownNumberCallArmed();
    this.stopDay0EndingUnknownNumberCall(false);
    this.activeConnectedAppointment = null;
    this.activeConnectedDepartmentKey = null;
    this.emergencyMode = false;
    this.emergencyStatusVisible = false;
    this.day0EndingTelephoneStoryLock = false;
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
      this.phonePanelCloseHitButton.interactable = interactable;
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
    this.setEmergencyInputEnabled(true);
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = true;
    }
    this.notifyEmergencyPhoneOpened();
    return true;
  }

  public closeEmergencyPhone(): void {
    if (this.handleBlockedDay0EndingStoryCloseAttempt('close-emergency-phone')) {
      return;
    }
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
      this.phonePanelCloseHitButton.interactable = enabled;
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

  public startDay0EndingUnknownNumberCall(
    lines: readonly string[],
    onComplete?: () => void,
  ): boolean {
    if (!this.phonePanelRuntime) {
      return false;
    }
    const normalizedLines = lines.map((line) => line.replace(/\r/g, ''));
    if (normalizedLines.length === 0) {
      return false;
    }
    if (!this.phonePanelOpen) {
      this.openPhonePanel();
    }
    this.stopDay0EndingUnknownNumberCall(false);
    this.day0EndingUnknownCallActive = true;
    this.day0EndingUnknownCallLines = [...normalizedLines];
    this.day0EndingUnknownCallLineIndex = -1;
    this.day0EndingUnknownCallOnComplete = onComplete ?? null;
    this.departmentCallSequenceSerial += 1;
    this.cancelPendingDepartmentSequenceTimers();
    this.stopDepartmentResponseTyping(true);
    this.activeConnectedAppointment = null;
    this.activeConnectedDepartmentKey = null;
    this.phoneNumber = '';
    this.setDepartmentResponseText('');
    this.setDepartmentPhoneUiState('terminal-result');
    this.setDay0EndingDialControlsInteractable(false);
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = false;
    }
    this.refreshPhoneNumberDisplay();
    this.scheduleOnce(
      this.advanceDay0EndingUnknownNumberLineAuto,
      this.day0EndingUnknownCallInitialDelaySec,
    );
    return true;
  }

  public armDay0EndingUnknownNumberCall(
    lines: readonly string[],
    onComplete?: () => void,
    onStart?: () => void,
  ): boolean {
    const normalizedLines = lines.map((line) => line.replace(/\r/g, ''));
    if (normalizedLines.length === 0) {
      return false;
    }
    this.day0EndingUnknownCallArmed = true;
    this.day0EndingUnknownCallArmedLines = [...normalizedLines];
    this.day0EndingUnknownCallOnComplete = onComplete ?? null;
    this.day0EndingUnknownCallOnStart = onStart ?? null;
    return true;
  }

  public clearDay0EndingUnknownNumberCallArmed(): void {
    this.day0EndingUnknownCallArmed = false;
    this.day0EndingUnknownCallArmedLines = [];
    this.day0EndingUnknownCallOnStart = null;
  }

  public stopDay0EndingUnknownNumberCall(invokeComplete: boolean = false): void {
    const completion = this.day0EndingUnknownCallOnComplete;
    this.unschedule(this.advanceDay0EndingUnknownNumberLineAuto);
    this.unschedule(this.closeDay0EndingUnknownNumberCallAfterDelay);
    this.day0EndingUnknownCallActive = false;
    this.day0EndingUnknownCallLines = [];
    this.day0EndingUnknownCallLineIndex = -1;
    this.day0EndingUnknownCallOnComplete = null;
    this.day0EndingUnknownCallOnStart = null;
    this.setDay0EndingDialControlsInteractable(true);
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = !this.day0EndingTelephoneStoryLock;
    }
    if (invokeComplete) {
      completion?.();
    }
  }

  public setDay0EndingTelephoneStoryLock(locked: boolean): void {
    this.day0EndingTelephoneStoryLock = locked;
    if (locked) {
      this.recoverDay0EndingTelephoneStoryState('lock-enabled');
      return;
    }
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = true;
    }
  }

  private handleTelephoneHitClick(): void {
    const employeeFilesController = this.getEmployeeFilesController();
    if (employeeFilesController?.closeOpenDrawerForExternalInteraction(() => this.handleTelephoneHitClick())) {
      return;
    }
    if (this.emergencyMode) {
      console.info('[CarterEmergency] telephone entry accepted');
      this.openForEmergency();
      return;
    }
    if (this.day0EndingUnknownCallArmed) {
      const onStart = this.day0EndingUnknownCallOnStart;
      const started = this.startDay0EndingUnknownNumberCall(
        this.day0EndingUnknownCallArmedLines,
        this.day0EndingUnknownCallOnComplete ?? undefined,
      );
      if (started) {
        this.day0EndingUnknownCallArmed = false;
        this.day0EndingUnknownCallArmedLines = [];
        this.day0EndingUnknownCallOnStart = null;
        onStart?.();
      }
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
    if (this.handleBlockedDay0EndingStoryCloseAttempt('panel-close-button')) {
      return;
    }
    AudioManager.getInstance()?.playCachedSettingsClick();
    this.closePhonePanel();
  }

  private closePhonePanel(): void {
    if (this.handleBlockedDay0EndingStoryCloseAttempt('close-phone-panel')) {
      return;
    }
    if (!this.phonePanelRuntime) {
      return;
    }
    this.stopDay0EndingUnknownNumberCall(false);
    this.cancelPendingStandardPhoneResultTimer();
    this.emergencyStatusVisible = false;
    this.activePhoneNumberLength = this.defaultPhoneNumberLength;
    this.restoreAllPhoneKeyVisualStates();
    this.resetDepartmentPhoneUiSession();
    this.setDepartmentPhoneUiState('dialing');
    hideInteractivePanel(
      this.phonePanelRuntime,
      () => {
        this.phonePanelOpen = false;
        if (!this.emergencyMode) {
          this.setManagedButtonsInteractable(true);
        }
        this.refreshTelephoneAvailability();
      },
      {
        setInteractable: (interactable) => this.setPhonePanelInteractable(interactable),
      },
    );
  }

  private closePhonePanelImmediate(): void {
    if (this.handleBlockedDay0EndingStoryCloseAttempt('close-phone-panel-immediate')) {
      return;
    }
    if (!this.phonePanelRuntime) {
      return;
    }
    this.stopDay0EndingUnknownNumberCall(false);
    this.cancelPendingStandardPhoneResultTimer();
    this.emergencyStatusVisible = false;
    this.activePhoneNumberLength = this.defaultPhoneNumberLength;
    this.restoreAllPhoneKeyVisualStates();
    this.resetDepartmentPhoneUiSession();
    hideInteractivePanelImmediate(this.phonePanelRuntime, {
      setInteractable: (interactable) => this.setPhonePanelInteractable(interactable),
    });
    this.phonePanelOpen = false;
    if (!this.emergencyMode) {
      this.setManagedButtonsInteractable(true);
    }
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
    if (this.day0EndingUnknownCallActive) {
      return;
    }
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
      this.handleStandardPhoneCallSubmit();
      return;
    }
    this.handleStandardPhoneCallSubmit();
  }

  private isPhoneNumberValidForCurrentPhase(): boolean {
    return false;
  }

  private handleStandardPhoneCallSubmit(): void {
    const dialedNumber = this.phoneNumber;
    const audioManager = AudioManager.getInstance();
    this.cancelPendingStandardPhoneResultTimer();
    const sequenceSerial = ++this.standardPhoneCallSequenceSerial;
    this.pendingStandardPhoneResultSequenceSerial = sequenceSerial;
    this.pendingStandardPhoneDialedNumber = dialedNumber;
    audioManager?.playCachedPhoneDial();
    const dialDelaySec = Math.max(
      0.2,
      audioManager?.getCachedClipDurationSeconds(GameAudioCatalog.PhoneDialId) ??
        this.standardPhoneDialDelayFallbackSec,
    );
    this.scheduleOnce(this.onStandardPhoneDialDelayElapsed, dialDelaySec);
  }

  private resolveStandardPhoneResult(dialedNumber: string): string {
    if (this.standardPhoneNoAnswerNumbers.has(dialedNumber)) {
      return 'NO ANSWER.';
    }
    return 'NUMBER NOT IN SERVICE.';
  }

  private cancelPendingStandardPhoneResultTimer(): void {
    this.unschedule(this.onStandardPhoneDialDelayElapsed);
    this.unschedule(this.onStandardPhoneConnectedDelayElapsed);
    this.pendingStandardPhoneResultSequenceSerial = -1;
    this.pendingStandardPhoneDialedNumber = '';
  }

  private readonly onStandardPhoneDialDelayElapsed = (): void => {
    const sequenceSerial = this.pendingStandardPhoneResultSequenceSerial;
    if (
      sequenceSerial < 0 ||
      sequenceSerial !== this.standardPhoneCallSequenceSerial ||
      !this.phonePanelOpen ||
      !this.phoneNumberLabel
    ) {
      return;
    }
    const audioManager = AudioManager.getInstance();
    audioManager?.playCachedPhoneConnected();
    const connectedDelaySec = Math.max(
      0.2,
      audioManager?.getCachedClipDurationSeconds(GameAudioCatalog.PhoneConnectedId) ??
        this.standardPhoneConnectedDelayFallbackSec,
    );
    this.unschedule(this.onStandardPhoneConnectedDelayElapsed);
    this.scheduleOnce(this.onStandardPhoneConnectedDelayElapsed, connectedDelaySec);
  }

  private readonly onStandardPhoneConnectedDelayElapsed = (): void => {
    const sequenceSerial = this.pendingStandardPhoneResultSequenceSerial;
    const dialedNumber = this.pendingStandardPhoneDialedNumber;
    this.pendingStandardPhoneResultSequenceSerial = -1;
    this.pendingStandardPhoneDialedNumber = '';
    if (
      sequenceSerial < 0 ||
      sequenceSerial !== this.standardPhoneCallSequenceSerial ||
      !this.phonePanelOpen ||
      !this.phoneNumberLabel
    ) {
      return;
    }
    const resultText = this.resolveStandardPhoneResult(dialedNumber);
    this.phoneNumber = '';
    this.phoneNumberLabel.string = resultText;
  };

  private clearPhoneNumber(): void {
    this.phoneNumber = '';
    this.refreshPhoneNumberDisplay();
  }

  private refreshPhoneNumberDisplay(): void {
    if (!this.phoneNumberLabel) {
      return;
    }
    if (this.day0EndingUnknownCallActive) {
      this.phoneNumberLabel.string = 'UNKNOWN NUMBER';
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
    if (this.departmentPhoneUiState === 'connecting') {
      this.phoneNumberLabel.string = 'CONNECTING...';
      return;
    }
    if (
      this.departmentPhoneUiState === 'connected' ||
      this.departmentPhoneUiState === 'question-menu' ||
      this.departmentPhoneUiState === 'question-answer'
    ) {
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
    if (
      this.departmentPhoneUiState === 'connecting' ||
      this.departmentPhoneUiState === 'connected' ||
      this.departmentPhoneUiState === 'question-menu' ||
      this.departmentPhoneUiState === 'question-answer'
    ) {
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
      this.persistDay4PhoneVerificationResult(context, {
        checked: true,
        calledNumber: result.dialedNumber,
        departmentMatched: true,
        appointmentFound: true,
        visitorArrived: null,
      });
      this.activeConnectedAppointment = result.appointment;
      this.activeConnectedDepartmentKey = result.departmentKey;
      this.startDepartmentConnectSequence();
      return;
    }

    if (result.kind === 'unknown-number') {
      this.persistDay4PhoneVerificationResult(context, {
        checked: true,
        calledNumber: result.dialedNumber,
        departmentMatched: null,
        appointmentFound: null,
        visitorArrived: null,
      });
      this.showTerminalResult('NUMBER NOT IN SERVICE.');
      return;
    }

    if (result.kind === 'no-answer') {
      this.persistDay4PhoneVerificationResult(context, {
        checked: true,
        calledNumber: result.dialedNumber,
        departmentMatched: false,
        appointmentFound: false,
        visitorArrived: null,
      });
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

  private persistDay4PhoneVerificationResult(
    context: DepartmentPhoneLookupContext,
    result: PhoneVerificationResult,
  ): void {
    setDay4VisitorPhoneVerificationResult(context.rosterDay, context.activeVisitorKey, result);
  }

  private startDepartmentConnectSequence(): void {
    const audioManager = AudioManager.getInstance();
    const sequenceSerial = ++this.departmentCallSequenceSerial;
    const connectedDelaySec = Math.max(
      0.8,
      audioManager?.getCachedClipDurationSeconds(GameAudioCatalog.PhoneConnectedId) ??
        this.departmentConnectDelayFallbackSec,
    );
    const lineSpeakDurationSec = Math.max(
      1.2,
      audioManager?.getCachedClipDurationSeconds(GameAudioCatalog.AlienVoiceId) ??
        this.departmentReplyDurationFallbackSec,
    );
    this.departmentReplyAutoAdvanceDelaySec = lineSpeakDurationSec;
    this.clearDepartmentResponseText();
    this.cancelPendingDepartmentSequenceTimers();
    this.setDepartmentPhoneUiState('connecting');
    audioManager?.playCachedPhoneConnected();
    this.pendingDepartmentConnectSequenceSerial = sequenceSerial;
    this.scheduleOnce(this.onDepartmentConnectDelayElapsed, connectedDelaySec);
  }

  private showTerminalResult(message: string): void {
    this.departmentCallSequenceSerial += 1;
    this.cancelPendingDepartmentSequenceTimers();
    this.activeConnectedAppointment = null;
    this.activeConnectedDepartmentKey = null;
    this.setDepartmentResponseText(message);
    this.setDepartmentPhoneUiState('terminal-result');
  }

  private setDepartmentPhoneUiState(state: DepartmentPhoneUiState): void {
    this.departmentPhoneUiState = state;
    this.ensureDepartmentPhoneInquiryRuntime();

    const isConnecting = state === 'connecting';
    const isConnected = state === 'connected';
    const isQuestionMenu = state === 'question-menu';
    const isQuestionAnswer = state === 'question-answer';
    const isTerminalResult = state === 'terminal-result';
    const shouldShowResponseContinueHint =
      !this.day0EndingUnknownCallActive && (isConnected || isQuestionAnswer || isTerminalResult);
    const shouldShowResponsePanel =
      (isConnected && !this.day0EndingUnknownCallActive) ||
      (isConnecting && this.latestDepartmentResponseText.trim().length > 0) ||
      isQuestionAnswer ||
      (isTerminalResult &&
        (!this.day0EndingUnknownCallActive || this.latestDepartmentResponseText.trim().length > 0));
    const isInquiryVisible =
      isConnecting || isConnected || isQuestionMenu || isQuestionAnswer || isTerminalResult;

    if (this.departmentPhoneInquiryRuntime?.isValid) {
      this.departmentPhoneInquiryRuntime.active = isInquiryVisible;
    }
    if (this.departmentQuestionMenuRoot?.isValid) {
      this.departmentQuestionMenuRoot.active = isQuestionMenu;
    }
    if (this.departmentResponsePanel?.isValid) {
      this.departmentResponsePanel.active = shouldShowResponsePanel;
    }
    if (this.departmentContinueButtonNode?.isValid) {
      this.departmentContinueButtonNode.active = false;
    }
    if (this.departmentResponsePanelButton) {
      this.departmentResponsePanelButton.interactable =
        shouldShowResponseContinueHint && !this.day0EndingUnknownCallActive;
    }
    if (this.departmentResponseContinueHintNode?.isValid) {
      this.departmentResponseContinueHintNode.active = shouldShowResponseContinueHint;
    }
    if (
      shouldShowResponseContinueHint &&
      this.departmentResponseLabel &&
      !this.departmentResponseTyping &&
      !this.day0EndingUnknownCallActive
    ) {
      const trimmed = this.departmentResponseLabel.string.trim();
      if (trimmed.length === 0) {
        this.departmentResponseLabel.string = this.latestDepartmentResponseText || 'Please continue.';
      }
    }

    // Keep keypad visible in Day0 unknown call; only lock its interaction.
    this.setDialInputVisible(true);
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
    this.departmentCallSequenceSerial += 1;
    this.cancelPendingDepartmentSequenceTimers();
    this.stopDepartmentVoiceIfNeeded();
    this.stopDepartmentResponseTyping(true);
    this.activeConnectedAppointment = null;
    this.activeConnectedDepartmentKey = null;
    this.connectedGreetingLines = [];
    this.connectedGreetingLineIndex = -1;
    this.phoneNumber = '';
    this.clearDepartmentResponseText();
    this.setDepartmentPhoneUiState('dialing');
  }

  private clearDepartmentResponseText(): void {
    this.stopDepartmentResponseTyping(false);
    this.latestDepartmentResponseText = '';
    if (this.departmentResponseLabel) {
      this.departmentResponseLabel.string = '';
    }
  }

  private setDepartmentResponseText(text: string): void {
    this.stopDepartmentResponseTyping(false);
    this.latestDepartmentResponseText = text;
    if (!this.departmentResponseLabel) {
      return;
    }
    this.departmentResponseLabel.string = text;
  }

  private startDepartmentResponseTyping(text: string): void {
    this.unschedule(this.stepDepartmentResponseTyping);
    this.latestDepartmentResponseText = text;
    this.departmentResponseTyping = true;
    this.departmentResponseTypingFullText = text;
    this.departmentResponseTypingLength = 0;
    if (this.departmentResponseLabel) {
      this.departmentResponseLabel.string = '';
    }
    if (text.length === 0) {
      this.finishDepartmentResponseTyping();
      return;
    }
    this.schedule(this.stepDepartmentResponseTyping, this.departmentResponseTypingIntervalSec);
  }

  private readonly stepDepartmentResponseTyping = (): void => {
    if (!this.departmentResponseLabel) {
      this.finishDepartmentResponseTyping();
      return;
    }
    this.departmentResponseTypingLength += 1;
    this.departmentResponseLabel.string = this.departmentResponseTypingFullText.slice(
      0,
      this.departmentResponseTypingLength,
    );
    if (this.departmentResponseTypingLength >= this.departmentResponseTypingFullText.length) {
      this.finishDepartmentResponseTyping();
    }
  };

  private finishDepartmentResponseTyping(): void {
    this.unschedule(this.stepDepartmentResponseTyping);
    this.departmentResponseTyping = false;
    this.departmentResponseTypingLength = this.departmentResponseTypingFullText.length;
    if (this.departmentResponseLabel) {
      this.departmentResponseLabel.string = this.departmentResponseTypingFullText;
    }
  }

  private stopDepartmentResponseTyping(clearText: boolean): void {
    this.unschedule(this.stepDepartmentResponseTyping);
    this.departmentResponseTyping = false;
    this.departmentResponseTypingFullText = '';
    this.departmentResponseTypingLength = 0;
    if (clearText && this.departmentResponseLabel) {
      this.departmentResponseLabel.string = '';
    }
  }

  private readonly onDepartmentConnectDelayElapsed = (): void => {
    const sequenceSerial = this.pendingDepartmentConnectSequenceSerial;
    this.pendingDepartmentConnectSequenceSerial = -1;
    if (
      sequenceSerial < 0 ||
      sequenceSerial !== this.departmentCallSequenceSerial ||
      !this.phonePanelOpen ||
      !this.activeConnectedDepartmentKey
    ) {
      return;
    }
    this.connectedGreetingLines = [...this.buildDepartmentGreetingLines(this.activeConnectedDepartmentKey)];
    this.connectedGreetingLineIndex = -1;
    this.setDepartmentPhoneUiState('connected');
    this.advanceConnectedGreetingLine(sequenceSerial);
  };

  private readonly onDepartmentReplyDelayElapsed = (): void => {
    const sequenceSerial = this.pendingDepartmentReplySequenceSerial;
    this.pendingDepartmentReplySequenceSerial = -1;
    if (
      sequenceSerial < 0 ||
      sequenceSerial !== this.departmentCallSequenceSerial ||
      !this.phonePanelOpen ||
      this.departmentPhoneUiState !== 'connected'
    ) {
      return;
    }
    if (this.departmentResponseTyping) {
      this.finishDepartmentResponseTyping();
    }
    if (this.advanceConnectedGreetingLine(sequenceSerial)) {
      return;
    }
    this.connectedGreetingLines = [];
    this.connectedGreetingLineIndex = -1;
    this.setDepartmentPhoneUiState('question-menu');
  };

  private advanceConnectedGreetingLine(sequenceSerial: number): boolean {
    const nextLineIndex = this.connectedGreetingLineIndex + 1;
    if (nextLineIndex < 0 || nextLineIndex >= this.connectedGreetingLines.length) {
      return false;
    }
    const nextLine = this.connectedGreetingLines[nextLineIndex]?.trim() ?? '';
    if (nextLine.length === 0) {
      this.connectedGreetingLineIndex = nextLineIndex;
      return this.advanceConnectedGreetingLine(sequenceSerial);
    }
    this.connectedGreetingLineIndex = nextLineIndex;
    this.startDepartmentResponseTyping(nextLine);
    AudioManager.getInstance()?.playCachedAlienVoice();
    this.pendingDepartmentReplySequenceSerial = sequenceSerial;
    this.unschedule(this.onDepartmentReplyDelayElapsed);
    this.scheduleOnce(this.onDepartmentReplyDelayElapsed, this.departmentReplyAutoAdvanceDelaySec);
    return true;
  }

  private handleDepartmentQuestionSelected(questionKey: DepartmentPhoneQuestionKey): void {
    if (questionKey === 'nothing-happened') {
      this.resetDepartmentPhoneUiSession();
      return;
    }

    const appointment = this.activeConnectedAppointment;
    const departmentKey = this.activeConnectedDepartmentKey;
    if (!appointment || !departmentKey) {
      this.showTerminalResult('Sorry, the line is unstable. Please call again.');
      return;
    }

    const context = this.departmentPhoneContextProvider?.() ?? null;
    const visitorArrived = this.resolveAppointmentArrivalStatus(appointment);
    if (context) {
      this.persistDay4PhoneVerificationResult(context, {
        checked: true,
        calledNumber: this.phoneNumber,
        departmentMatched: true,
        appointmentFound: true,
        visitorArrived,
      });
    }

    if (visitorArrived === true) {
      this.startDepartmentResponseTyping('YES. THE APPOINTMENT PERSON HAS ALREADY ARRIVED.');
      AudioManager.getInstance()?.playCachedAlienVoice();
      this.setDepartmentPhoneUiState('question-answer');
      return;
    }

    if (visitorArrived === false) {
      this.startDepartmentResponseTyping('NO. THE APPOINTMENT PERSON HAS NOT ARRIVED YET.');
      AudioManager.getInstance()?.playCachedAlienVoice();
      this.setDepartmentPhoneUiState('question-answer');
      return;
    }

    const purposeLabel = getAppointmentPurposeLabel(appointment.purposeKey)?.toUpperCase() ?? 'OFFICIAL BUSINESS';
    this.startDepartmentResponseTyping(
      `WE CANNOT CONFIRM ARRIVAL RIGHT NOW.\nTHE APPOINTMENT IS FOR ${purposeLabel}.`,
    );
    AudioManager.getInstance()?.playCachedAlienVoice();
    this.setDepartmentPhoneUiState('question-answer');
  }

  private handleDepartmentContinuePressed(): void {
    if (this.day0EndingUnknownCallActive) {
      return;
    }
    if (this.departmentPhoneUiState === 'connecting') {
      return;
    }
    if (this.departmentPhoneUiState === 'connected') {
      const sequenceSerial = this.departmentCallSequenceSerial;
      this.unschedule(this.onDepartmentReplyDelayElapsed);
      this.pendingDepartmentReplySequenceSerial = -1;
      if (this.departmentResponseTyping) {
        this.finishDepartmentResponseTyping();
        return;
      }
      if (this.advanceConnectedGreetingLine(sequenceSerial)) {
        return;
      }
      this.connectedGreetingLines = [];
      this.connectedGreetingLineIndex = -1;
      this.setDepartmentPhoneUiState('question-menu');
      return;
    }
    if (this.departmentPhoneUiState === 'question-answer') {
      if (this.departmentResponseTyping) {
        this.finishDepartmentResponseTyping();
        return;
      }
      this.resetDepartmentPhoneUiSession();
      return;
    }
    if (this.departmentPhoneUiState === 'terminal-result') {
      this.resetDepartmentPhoneUiSession();
    }
  }

  private resolveAppointmentArrivalStatus(appointment: AppointmentRosterEntry): boolean | null {
    if (appointment.arrivalStatus === 'arrived') {
      return true;
    }
    if (appointment.arrivalStatus === 'not_arrived') {
      return false;
    }
    return null;
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
    panel.setPosition(0, -470, 0);
    const panelTransform = panel.getComponent(UITransform) ?? panel.addComponent(UITransform);
    panelTransform.setContentSize(680, 110);
    const panelGraphics = panel.getComponent(Graphics) ?? panel.addComponent(Graphics);
    panelGraphics.clear();
    panelGraphics.fillColor = Color.WHITE;
    panelGraphics.rect(-340, -55, 680, 110);
    panelGraphics.fill();
    panelGraphics.lineWidth = 4;
    panelGraphics.strokeColor = Color.BLACK;
    panelGraphics.rect(-340, -55, 680, 110);
    panelGraphics.stroke();
    const panelButton = panel.getComponent(Button) ?? panel.addComponent(Button);
    panelButton.target = panel;
    panelButton.transition = Button.Transition.SCALE;
    panelButton.zoomScale = 0.99;
    panelButton.duration = 0.06;
    this.departmentResponsePanelButton = panelButton;

    const existingResponseLabelNode = panel.getChildByName('DepartmentResponseLabel');
    const responseLabelNode = existingResponseLabelNode ?? new Node('DepartmentResponseLabel');
    if (!responseLabelNode.parent) {
      panel.addChild(responseLabelNode);
    }
    responseLabelNode.setPosition(-8, 4, 0);
    const labelTransform = responseLabelNode.getComponent(UITransform) ?? responseLabelNode.addComponent(UITransform);
    labelTransform.setContentSize(620, 72);
    const label = responseLabelNode.getComponent(Label) ?? responseLabelNode.addComponent(Label);
    if (!this.departmentResponseTyping) {
      label.string = this.latestDepartmentResponseText;
    }
    label.fontSize = 28;
    label.lineHeight = 34;
    label.overflow = Label.Overflow.SHRINK;
    label.enableWrapText = true;
    label.horizontalAlign = HorizontalTextAlignment.LEFT;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.color = Color.BLACK;
    this.departmentResponseLabel = label;

    const hintNode = panel.getChildByName('DepartmentResponseContinueHint') ?? new Node('DepartmentResponseContinueHint');
    if (!hintNode.parent) {
      panel.addChild(hintNode);
    }
    hintNode.setPosition(228, -34, 0);
    const hintTransform = hintNode.getComponent(UITransform) ?? hintNode.addComponent(UITransform);
    hintTransform.setContentSize(220, 24);
    const hintLabel = hintNode.getComponent(Label) ?? hintNode.addComponent(Label);
    hintLabel.string = 'CLICK TO CONTINUE';
    hintLabel.fontSize = 18;
    hintLabel.lineHeight = 20;
    hintLabel.overflow = Label.Overflow.SHRINK;
    hintLabel.enableWrapText = false;
    hintLabel.horizontalAlign = HorizontalTextAlignment.RIGHT;
    hintLabel.verticalAlign = VerticalTextAlignment.CENTER;
    hintLabel.color = new Color(96, 96, 96, 255);
    hintNode.active = false;
    this.departmentResponseContinueHintNode = hintNode;
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

    this.ensureQuestionButton(
      menuRoot,
      'AskAppointmentArrivedButton',
      this.departmentQuestionPrompts['ask-appointment-arrived'],
      100,
      'ask-appointment-arrived',
    );
    this.ensureQuestionButton(
      menuRoot,
      'NothingHappenedButton',
      this.departmentQuestionPrompts['nothing-happened'],
      8,
      'nothing-happened',
    );
    this.departmentNeverMindButtonNode = this.ensureMenuButtonNode(menuRoot, 'NeverMindButton', 'NEVER MIND.', -138);
    this.departmentNeverMindButtonNode.active = false;
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
    const node = this.ensureQuestionOptionNode(root, nodeName, labelText, y);
    const button = node.getComponent(Button) ?? null;
    if (!button) {
      return;
    }
    this.departmentQuestionButtonNodes.set(questionKey, node);
    this.departmentQuestionButtons.set(questionKey, button);
  }

  private ensureQuestionOptionNode(root: Node, nodeName: string, labelText: string, y: number): Node {
    const node = root.getChildByName(nodeName) ?? new Node(nodeName);
    if (!node.parent) {
      root.addChild(node);
    }
    node.setPosition(0, y, 0);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setContentSize(670, 64);
    this.drawDepartmentQuestionOptionGraphics(node, 670, 64);

    const button = node.getComponent(Button) ?? node.addComponent(Button);
    button.target = node;
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.97;
    button.duration = 0.08;
    this.ensureQuestionOptionLabel(node, labelText, 24);
    return node;
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

  private drawDepartmentQuestionOptionGraphics(node: Node, width: number, height: number): void {
    const graphics = node.getComponent(Graphics) ?? node.addComponent(Graphics);
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    graphics.clear();
    graphics.fillColor = new Color(247, 245, 239, 255);
    graphics.rect(-halfWidth, -halfHeight, width, height);
    graphics.fill();
    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(25, 23, 20, 255);
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

  private ensureQuestionOptionLabel(buttonNode: Node, text: string, fontSize: number): void {
    const labelNode = buttonNode.getChildByName('Label') ?? new Node('Label');
    if (!labelNode.parent) {
      buttonNode.addChild(labelNode);
    }
    labelNode.setPosition(0, 0, 0);
    const transform = labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
    transform.setContentSize(620, 56);
    const label = labelNode.getComponent(Label) ?? labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = 28;
    label.overflow = Label.Overflow.CLAMP;
    label.enableWrapText = true;
    label.horizontalAlign = HorizontalTextAlignment.CENTER;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.color = new Color(25, 23, 20, 255);
  }

  private buildDepartmentGreetingLines(departmentKey: AppointmentDepartmentKey): readonly [string, string] {
    if (departmentKey === 'research') {
      return ['Hello, this is the Research Department.', 'How can I help you?'];
    }
    if (departmentKey === 'production') {
      return ['Hello, this is the Production Department.', 'How can I help you?'];
    }
    return ['Hello, this is the Sales Department.', 'How can I help you?'];
  }

  private cancelPendingDepartmentSequenceTimers(): void {
    this.unschedule(this.onDepartmentConnectDelayElapsed);
    this.unschedule(this.onDepartmentReplyDelayElapsed);
    this.pendingDepartmentConnectSequenceSerial = -1;
    this.pendingDepartmentReplySequenceSerial = -1;
    this.connectedGreetingLines = [];
    this.connectedGreetingLineIndex = -1;
  }

  private stopDepartmentVoiceIfNeeded(): void {
    if (
      this.departmentPhoneUiState === 'connecting' ||
      this.departmentPhoneUiState === 'connected' ||
      this.departmentPhoneUiState === 'question-menu' ||
      this.departmentPhoneUiState === 'question-answer'
    ) {
      AudioManager.getInstance()?.stopVoice();
    }
  }

  private bindDepartmentInquiryButtonsOnce(): void {
    if (this.departmentInquiryBindings.length > 0) {
      return;
    }

    const askArrivedButton = this.departmentQuestionButtons.get('ask-appointment-arrived');
    const nothingHappenedButton = this.departmentQuestionButtons.get('nothing-happened');

    if (askArrivedButton) {
      this.departmentInquiryBindings.push({
        button: askArrivedButton,
        callback: () => this.handleDepartmentQuestionSelected('ask-appointment-arrived'),
      });
    }
    if (nothingHappenedButton) {
      this.departmentInquiryBindings.push({
        button: nothingHappenedButton,
        callback: () => this.handleDepartmentQuestionSelected('nothing-happened'),
      });
    }
    if (this.departmentResponsePanelButton) {
      this.departmentInquiryBindings.push({
        button: this.departmentResponsePanelButton,
        callback: () => this.handleDepartmentContinuePressed(),
      });
    }
  }

  private setManagedButtonsInteractable(interactable: boolean): void {
    for (const button of this.getManagedButtonsSafe()) {
      button.interactable = interactable;
    }
  }

  private getManagedButtonsSafe(): Button[] {
    if (Array.isArray(this.managedButtons)) {
      return this.managedButtons;
    }
    if (!this.managedButtonsShapeWarningLogged) {
      this.managedButtonsShapeWarningLogged = true;
      console.warn('[TelephoneController] managedButtons has unexpected runtime shape.', {
        runtimeType: typeof this.managedButtons,
      });
    }
    return [];
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
      this.telephoneHitNode.active = true;
    }
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = true;
    }
  }

  private notifyEmergencyPhoneOpened(): void {
    console.info('[CarterEmergency] emergency phone opened');
    for (const listener of this.emergencyPhoneOpenedListeners) {
      listener();
    }
  }

  private getEmployeeFilesController(): EmployeeFilesController | null {
    const deskEvidenceRuntime = this.node.parent;
    const employeeDrawersClosedRuntime = deskEvidenceRuntime?.getChildByName('EmployeeDrawersClosedRuntime') ?? null;
    return employeeDrawersClosedRuntime?.getComponent(EmployeeFilesController) ?? null;
  }

  private finishDay0EndingUnknownNumberCall(): void {
    // Final line should hold briefly, then auto-close the phone panel.
    this.unschedule(this.closeDay0EndingUnknownNumberCallAfterDelay);
    this.scheduleOnce(
      this.closeDay0EndingUnknownNumberCallAfterDelay,
      this.day0EndingUnknownCallFinalCloseDelaySec,
    );
  }

  private readonly advanceDay0EndingUnknownNumberLineAuto = (): void => {
    if (!this.day0EndingUnknownCallActive) {
      return;
    }
    const nextIndex = this.day0EndingUnknownCallLineIndex + 1;
    if (nextIndex >= this.day0EndingUnknownCallLines.length) {
      this.finishDay0EndingUnknownNumberCall();
      return;
    }
    this.day0EndingUnknownCallLineIndex = nextIndex;
    const text = this.day0EndingUnknownCallLines[nextIndex] ?? '';
    this.setDepartmentResponseText(text);
    this.setDepartmentPhoneUiState('terminal-result');
    this.refreshPhoneNumberDisplay();
    const lastIndex = this.day0EndingUnknownCallLines.length - 1;
    if (text.trim().length > 0 && (nextIndex === 0 || nextIndex === 2)) {
      AudioManager.getInstance()?.playVoice(VoiceId.AlienSpeech01);
    }
    if (nextIndex >= lastIndex) {
      this.finishDay0EndingUnknownNumberCall();
      return;
    }
    this.unschedule(this.advanceDay0EndingUnknownNumberLineAuto);
    this.scheduleOnce(this.advanceDay0EndingUnknownNumberLineAuto, this.day0EndingUnknownCallLineDelaySec);
  };

  private readonly closeDay0EndingUnknownNumberCallAfterDelay = (): void => {
    if (!this.day0EndingUnknownCallActive) {
      return;
    }
    this.stopDay0EndingUnknownNumberCall(true);
    this.closePhonePanel();
  };

  private handleBlockedDay0EndingStoryCloseAttempt(source: string): boolean {
    if (!this.day0EndingTelephoneStoryLock) {
      return false;
    }
    this.recoverDay0EndingTelephoneStoryState(source);
    return true;
  }

  private recoverDay0EndingTelephoneStoryState(source: string): void {
    if (!this.day0EndingTelephoneStoryLock || !this.phonePanelRuntime) {
      return;
    }
    if (!this.phonePanelOpen) {
      this.openPhonePanel();
    }
    if (!this.day0EndingUnknownCallActive) {
      return;
    }
    const currentLine = this.day0EndingUnknownCallLines[this.day0EndingUnknownCallLineIndex] ?? '';
    this.setDepartmentResponseText(currentLine);
    this.setDepartmentPhoneUiState('terminal-result');
    this.setDay0EndingDialControlsInteractable(false);
    if (this.phonePanelCloseHitButton) {
      this.phonePanelCloseHitButton.interactable = false;
    }
    this.refreshPhoneNumberDisplay();
    console.info('[TelephoneController] Day0 ending story close blocked.', {
      source,
      lineIndex: this.day0EndingUnknownCallLineIndex,
    });
  }

  private configurePhoneNumberLabelLayout(): void {
    if (!this.phoneNumberLabel) {
      return;
    }
    this.phoneNumberLabel.overflow = Label.Overflow.SHRINK;
    this.phoneNumberLabel.enableWrapText = false;
    this.phoneNumberLabel.horizontalAlign = HorizontalTextAlignment.RIGHT;
    this.phoneNumberLabel.verticalAlign = VerticalTextAlignment.CENTER;
    if (this.phoneNumberLabel.fontSize > 32) {
      this.phoneNumberLabel.fontSize = 32;
    }
    this.phoneNumberLabel.lineHeight = this.phoneNumberLabel.fontSize + 2;
  }

  private setDay0EndingDialControlsInteractable(interactable: boolean): void {
    for (const binding of this.keypadButtonBindings) {
      binding.button.interactable = interactable;
    }
    if (this.phoneHashBackspaceButton) {
      this.phoneHashBackspaceButton.interactable = interactable;
    }
    if (this.phoneCallButton) {
      this.phoneCallButton.interactable = interactable;
    }
  }
}
