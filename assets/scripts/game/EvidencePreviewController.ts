import {
  _decorator,
  BlockInputEvents,
  Button,
  Color,
  Component,
  director,
  Graphics,
  Label,
  Node,
  Overflow,
  Sprite,
  SpriteFrame,
  UITransform,
  resources,
} from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { ShutterToggleController } from './ShutterToggleController';
import { TelephoneController } from './TelephoneController';
import { VisitorIntroSequenceController } from './VisitorIntroSequenceController';
import { EmployeeFilesController } from './EmployeeFilesController';

const { ccclass } = _decorator;

type ChecklistChoice = 'unset' | 'pass' | 'fail';
type ChecklistQuestion = 'appearance' | 'id_card' | 'application' | null;
type ChecklistReplyContext = 'normal' | 'nervous' | 'threat';
type InspectionSubjectId = 'carter' | 'ethan';
type InspectionEntityKind = 'human' | 'monster';
type InspectionRecordSource = 'employee-file' | 'appointment-roster' | 'none';
type ChecklistActionMode = 'none' | 'pass' | 'question' | 'reject';
type CarterRejectFlowSource = 'checklist-reject' | 'console-deny';
type InspectionDecisionAction = 'allow' | 'reject';
type InspectionDecisionOutcome =
  | 'valid-human-allowed'
  | 'valid-human-wrongly-rejected'
  | 'invalid-human-correctly-rejected'
  | 'invalid-human-wrongly-rejected'
  | 'invalid-human-wrongly-allowed'
  | 'monster-wrongly-allowed'
  | 'monster-correctly-rejected'
  | 'monster-wrongly-rejected';
type AdministrativeGameOverReason =
  | 'multiple-formal-complaints'
  | 'repeated-procedural-violations'
  | 'internal-contamination';
type CarterBreakthroughFailureReason =
  | 'shutter-timeout'
  | 'damaged-visual-unavailable'
  | 'phone-pickup-timeout'
  | 'dial-timeout'
  | 'incorrect-allow';
const NORMAL_CHECKLIST_REPLIES: Record<Exclude<ChecklistQuestion, null>, string> = {
  appearance: "I don't think there is a problem. Please compare it again.",
  id_card: 'My employee ID has never changed. Please check it again.',
  application: 'I filled out everything exactly as required. Please check it again.',
};

interface InspectionTruthDefinition {
  readonly employeeCardPass: boolean;
  readonly applicationPass: boolean;
  readonly appearancePass: boolean;
}

interface EmployeeCardDocumentPresentation {
  readonly employeeId: string;
  readonly displayName: string;
  readonly position: string;
  readonly validUntilTitle: string;
  readonly validUntil: string;
}

interface ApplicationFormDocumentPresentation {
  readonly idNumber: string;
  readonly displayName: string;
  readonly position: string;
  readonly department: string;
  readonly validUntil: string;
  readonly reasonForEntry: string;
}

interface InspectionDocumentPresentation {
  readonly employeeCard: EmployeeCardDocumentPresentation;
  readonly applicationForm: ApplicationFormDocumentPresentation;
}

interface InspectionSubjectDefinition {
  readonly id: InspectionSubjectId;
  readonly entityKind: InspectionEntityKind;
  readonly displayName: string;
  readonly employeeNumber: string;
  readonly recordSource: InspectionRecordSource;
  readonly characterDisguisedFrame: SpriteFrame;
  readonly employeeFilePortraitFrame: SpriteFrame;
  readonly monsterPortraitFrame: SpriteFrame;
  readonly monsterFullbodyFrame: SpriteFrame;
  readonly employeeCardFrame: SpriteFrame;
  readonly applicationFormFrame: SpriteFrame;
  readonly truth: InspectionTruthDefinition;
  readonly documentPresentation?: InspectionDocumentPresentation;
}

@ccclass('EvidencePreviewController')
export class EvidencePreviewController extends Component {
  private readonly inspectionSequence: readonly InspectionSubjectId[] = ['carter', 'ethan'];
  private currentInspectionSubjectIndex = 0;
  private activeInspectionSubjectId: InspectionSubjectId = 'carter';
  private readonly emergencyCountdownSeconds = 3;
  private readonly phonePickupWindowSeconds = 3;
  private readonly phoneDialWindowSeconds = 5;
  private readonly damagedShutterHoldSeconds = 1.0;
  private readonly cleanupSuccessDisplaySeconds = 1.0;
  private cleanupTransitionScheduled = false;
  private readonly carterAppearanceNervousReplies: readonly string[] = [
    'I understand... I may look a little different from the employee record.',
    'I... I changed my appearance recently. The file may not have been updated.',
    'You are right to question it. I can explain why I look different.',
    'Please do not misunderstand. I may have changed since that photograph was taken.',
    'I did not think the difference would matter. The record may be outdated.',
  ];
  private readonly carterThreatReplies: readonly string[] = [
    'You should have let me through.',
    'You noticed far more than you should have.',
    'Close the shutter. It will not save you.',
    'Three seconds. Then I am coming through.',
    'You made the wrong decision, inspector.',
  ];
  private readonly ethanApplicationReplies: readonly string[] = [
    'That is the application form I was given.',
    'I completed the paperwork before arriving.',
    'The office should already have the original record.',
    'I was told this copy would be accepted.',
    'I do not know why the details look different.',
  ];
  private readonly validEmployeeAllowDialoguePool: readonly string[] = [
    "Thank you. I'll head in now.",
    'Thanks for the clearance.',
    'Much appreciated. Have a good shift.',
    'All right. Thank you for your time.',
    'Everything looks good? Great. Thank you.',
    "Thank you. I'll get back to work.",
  ];
  private readonly validEmployeeWrongRejectDialoguePool: readonly string[] = [
    "My documents are valid. I'm filing a formal complaint.",
    "This rejection is unjustified. I want your supervisor's name.",
    "You denied authorized staff without cause. I'll report this.",
    'Check the file again. Personnel will hear about this.',
    'There is nothing wrong with my record. This is unacceptable.',
    'I expect this decision to be formally reviewed.',
  ];
  private readonly invalidDocumentEmployeeCorrectRejectDialoguePool: readonly string[] = [
    "Understood. I'll correct the paperwork and return.",
    'I see the discrepancy. I\'ll contact my department.',
    "All right. I'll have the form replaced.",
    "Fine. I'll come back with valid documents.",
    "That must be a filing error. I'll get it corrected.",
    "Understood. I'll resolve this with Personnel.",
  ];
  private readonly employeeWrongRejectReasonDialoguePool: readonly string[] = [
    "That's not what's wrong with my file. I'm reporting this.",
    'You rejected me for the wrong reason. I want this reviewed.',
    'Check your records again. This is going to your supervisor.',
    "Your conclusion is incorrect. I'm filing a complaint.",
    'That accusation has nothing to do with my documents.',
    'You clearly did not review my file properly.',
  ];
  private readonly monsterWrongAllowDialoguePool: readonly string[] = [
    "Thank you. I'll head in now.",
    'Much appreciated. I know where to go.',
    'Thank you for letting me through.',
    'You made the right decision.',
    'All clear? Excellent. Thank you.',
    "I won't take up any more of your time.",
  ];
  private readonly monsterExposedDialoguePool: readonly string[] = [
    'You looked too closely.',
    'You should have let me through.',
    'So... you noticed.',
    'That was your last mistake.',
    "You weren't supposed to see that.",
  ];
  private readonly monsterThreatDialoguePool: readonly string[] = [
    'Open the shutter. Now.',
    "That glass won't save you.",
    "Then I'll come through another way.",
    'You cannot keep me out.',
    "I'll tear this place open.",
  ];
  private readonly monsterWrongRejectReasonDialoguePool: readonly string[] = [
    "Your accusation makes no sense. I'm filing a complaint.",
    'You checked the wrong item. I want a supervisor.',
    'This is harassment. Personnel will hear about it.',
    "You're rejecting me without evidence. I'll report you.",
    'Your inspection is clearly incompetent.',
    "I'll make sure your supervisor hears about this.",
  ];

  private previewOpen = false;
  private checklistInteractionReady = false;

  private idCardChoice: ChecklistChoice = 'unset';
  private applicationChoice: ChecklistChoice = 'unset';
  private appearanceChoice: ChecklistChoice = 'unset';
  private selectedChecklistQuestion: ChecklistQuestion = null;
  private checklistQuestionPanelOpen = false;
  private checklistQuestionUiReady = false;
  private checklistReplyUiReady = false;
  private checklistReplyPanelOpen = false;

  private employeeCardHit: Node | null = null;
  private applicationFormHit: Node | null = null;
  private evidencePreviewRuntime: Node | null = null;
  private previewScrim: Node | null = null;
  private employeeCardDetailVisual: Node | null = null;
  private applicationFormDetailVisual: Node | null = null;
  private employeeCardCloseHit: Node | null = null;
  private applicationFormCloseHit: Node | null = null;
  private screeningChecklistHit: Node | null = null;
  private screeningChecklistDetailVisual: Node | null = null;
  private screeningChecklistCloseHit: Node | null = null;
  private idCardPassCell: Node | null = null;
  private idCardFailCell: Node | null = null;
  private applicationPassCell: Node | null = null;
  private applicationFailCell: Node | null = null;
  private appearancePassCell: Node | null = null;
  private appearanceFailCell: Node | null = null;
  private checklistActionTextNode: Node | null = null;
  private checklistActionHit: Node | null = null;
  private checklistQuestionPanelRuntime: Node | null = null;
  private checklistQuestionScrim: Node | null = null;
  private questionAppearanceOption: Node | null = null;
  private questionIdCardOption: Node | null = null;
  private questionApplicationOption: Node | null = null;
  private questionNoIssueOption: Node | null = null;
  private checklistReplyPanelRuntime: Node | null = null;
  private checklistReplyScrim: Node | null = null;
  private checklistReplyBox: Node | null = null;
  private checklistReplyTextNode: Node | null = null;
  private checklistReplyContinueHintNode: Node | null = null;
  private checklistReplyContinueHit: Node | null = null;
  private checklistActionButton: Button | null = null;
  private applicationFormCloseButton: Button | null = null;
  private screeningChecklistHitButton: Button | null = null;
  private screeningChecklistCloseButton: Button | null = null;
  private previewScrimGraphics: Graphics | null = null;
  private checklistQuestionScrimGraphics: Graphics | null = null;
  private checklistReplyScrimGraphics: Graphics | null = null;
  private checklistReplyBoxGraphics: Graphics | null = null;
  private checklistReplyScrimBlockInput: BlockInputEvents | null = null;
  private idCardPassLabel: Label | null = null;
  private idCardFailLabel: Label | null = null;
  private applicationPassLabel: Label | null = null;
  private applicationFailLabel: Label | null = null;
  private appearancePassLabel: Label | null = null;
  private appearanceFailLabel: Label | null = null;
  private checklistActionLabel: Label | null = null;
  private checklistReplyLabel: Label | null = null;
  private checklistReplyContinueButton: Button | null = null;
  private readonly checklistReplyTypingInterval = 0.035;
  private checklistReplyFullText = '';
  private checklistReplyTypedLength = 0;
  private checklistReplyTyping = false;
  private checklistReplyCanClose = false;
  private checklistReplyContext: ChecklistReplyContext = 'normal';
  private checklistActionMode: ChecklistActionMode = 'none';

  private employeeCardHitButton: Button | null = null;
  private applicationFormHitButton: Button | null = null;
  private shutterHitButton: Button | null = null;
  private allowHitButton: Button | null = null;
  private denyHitButton: Button | null = null;
  private managedButtons: Button[] = [];
  private allEncounterButtons: Button[] = [];
  private readonly encounterButtonStateCache = new Map<Button, boolean>();
  private shutterController: ShutterToggleController | null = null;
  private telephoneController: TelephoneController | null = null;
  private visitorIntroController: VisitorIntroSequenceController | null = null;
  private visitorGreetingRuntime: Node | null = null;
  private employeeFilesController: EmployeeFilesController | null = null;
  private telephoneHitButton: Button | null = null;
  private carterCharacter: Node | null = null;
  private carterCharacterSprite: Sprite | null = null;
  private carterCharacterUi: UITransform | null = null;
  private initialCarterSpriteFrame: SpriteFrame | null = null;
  private carterCharacterBaseWidth = 0;
  private carterCharacterBaseHeight = 0;

  private carterMonsterAttackRuntime: Node | null = null;
  private carterMonsterAttackScrim: Node | null = null;
  private carterMonsterPortraitSource: Node | null = null;
  private carterMonsterFullbodyVisual: Node | null = null;
  private carterGameOverPanelRuntime: Node | null = null;
  private carterGameOverTitleLabel: Node | null = null;
  private carterGameOverMessageLabel: Node | null = null;
  private carterGameOverPanelVisual: Node | null = null;
  private carterGameOverTitleVisual: Node | null = null;
  private carterGameOverRetryVisual: Node | null = null;
  private carterGameOverRetryHit: Node | null = null;
  private carterGameOverReviveVisual: Node | null = null;
  private carterGameOverReviveHit: Node | null = null;
  private carterGameOverPanelSprite: Sprite | null = null;
  private carterGameOverTitleSprite: Sprite | null = null;
  private carterGameOverRetrySprite: Sprite | null = null;
  private carterGameOverReviveSprite: Sprite | null = null;
  private carterGameOverRetryButton: Button | null = null;
  private carterGameOverReviveButton: Button | null = null;
  private carterGameOverUiReady = false;
  private retryLoadInProgress = false;
  private carterMonsterPortraitSprite: Sprite | null = null;
  private carterMonsterFullbodySprite: Sprite | null = null;
  private carterMonsterPortraitFrame: SpriteFrame | null = null;
  private carterMonsterFullbodyFrame: SpriteFrame | null = null;
  private carterEmployeeCardFrame: SpriteFrame | null = null;
  private carterApplicationFormFrame: SpriteFrame | null = null;
  private defaultDeskEmployeeCardFrame: SpriteFrame | null = null;
  private defaultDeskApplicationFormFrame: SpriteFrame | null = null;
  private activeSubjectEmployeeCardDetailFrame: SpriteFrame | null = null;
  private activeSubjectApplicationDetailFrame: SpriteFrame | null = null;
  private carterEmployeeCardDynamicLayer: Node | null = null;
  private employeeCardEmployeeIdValueLabel: Label | null = null;
  private employeeCardNameValueLabel: Label | null = null;
  private employeeCardPositionValueLabel: Label | null = null;
  private employeeCardValidUntilTitleLabel: Label | null = null;
  private employeeCardValidUntilValueLabel: Label | null = null;
  private employeeCardSecurityLogoSprite: Sprite | null = null;
  private carterApplicationDynamicLayer: Node | null = null;
  private applicationIdNumberValueLabel: Label | null = null;
  private applicationNameValueLabel: Label | null = null;
  private applicationPositionValueLabel: Label | null = null;
  private applicationDepartmentValueLabel: Label | null = null;
  private applicationValidUntilValueLabel: Label | null = null;
  private applicationReasonForEntryValueLabel: Label | null = null;
  private applicationSecurityLogoSprite: Sprite | null = null;
  private carterDocumentBindingErrorLogged = false;
  private deskEmployeeCardSprite: Sprite | null = null;
  private deskApplicationFormSprite: Sprite | null = null;
  private carterEmployeeFilePortraitFrame: SpriteFrame | null = null;
  private ethanDisguisedFrame: SpriteFrame | null = null;
  private ethanPortraitFrame: SpriteFrame | null = null;
  private ethanMonsterPortraitFrame: SpriteFrame | null = null;
  private ethanMonsterFullbodyFrame: SpriteFrame | null = null;
  private ethanEmployeeCardFrame: SpriteFrame | null = null;
  private ethanApplicationFakeFrame: SpriteFrame | null = null;
  private carterAttackScrimGraphics: Graphics | null = null;
  private carterGameOverPanelGraphics: Graphics | null = null;
  private carterEmergencyCloseListenerRegistered = false;

  private lastNervousReplyIndex = -1;
  private lastThreatReplyIndex = -1;
  private lastEthanApplicationReplyIndex = -1;
  private anxiousReplyShown = false;
  private carterAppearanceQuestionAsked = false;
  private rejectFlowRequested = false;
  private carterEncounterResolved = false;
  private threatSequenceActive = false;
  private emergencyWindowOpen = false;
  private emergencyShutterSucceeded = false;
  private carterAttackTriggered = false;
  private emergencyDeadlineMs = 0;
  private phoneResponseWindowOpen = false;
  private phoneResponseDeadlineMs = 0;
  private phoneDialWindowOpen = false;
  private phoneDialDeadlineMs = 0;
  private cleanupProgramActivated = false;
  private phoneEmergencyResolved = false;
  private emergencyPhoneOpenedListenerRegistered = false;
  private emergencyCallSubmittedListenerRegistered = false;
  private emergencyShutterClosedSettledListenerRegistered = false;
  private damagedShutterAppliedListenerRegistered = false;
  private delayedDamagedShutterSwitchScheduled = false;
  private inspectionDecisionResolutionInProgress = false;
  private isDestroying = false;
  private complaintCount = 0;
  private procedureViolationCount = 0;
  private infectedEntryCount = 0;
  private decisionResolutionToken = 0;
  private administrativeGameOverActive = false;

  private readonly handleCarterEmergencyCloseAccepted = (): void => {
    if (!this.isCurrentVisitorCarter()) {
      return;
    }
    if (!this.threatSequenceActive || !this.emergencyWindowOpen) {
      return;
    }
    if (this.carterAttackTriggered || this.emergencyShutterSucceeded) {
      return;
    }
    if (Date.now() > this.emergencyDeadlineMs) {
      this.handleEmergencyTimeout();
      return;
    }

    this.emergencyShutterSucceeded = true;
    this.emergencyWindowOpen = false;
    this.threatSequenceActive = false;
    this.unschedule(this.handleEmergencyTimeout);
    this.unbindEmergencyCloseListener();
    this.hideCarterThreatReplyCompletely();
    this.shutterController?.setInteractionEnabled(false);
    this.bindEmergencyShutterClosedSettledListener();
  };

  private readonly handleEmergencyShutterClosedSettled = (): void => {
    if (!this.isCurrentVisitorCarter()) {
      this.unbindEmergencyShutterClosedSettledListener();
      return;
    }
    if (
      this.carterEncounterResolved ||
      this.carterAttackTriggered ||
      this.cleanupProgramActivated ||
      this.phoneEmergencyResolved
    ) {
      this.unbindEmergencyShutterClosedSettledListener();
      return;
    }
    if (!this.emergencyShutterSucceeded) {
      return;
    }
    this.unbindEmergencyShutterClosedSettledListener();
    console.info('[CarterEmergency] normal shutter closed');
    this.scheduleDamagedShutterAfterClosedHold();
  };

  private readonly handleDelayedDamagedShutterSwitch = (): void => {
    this.delayedDamagedShutterSwitchScheduled = false;
    if (!this.node?.isValid || this.isDestroying) {
      return;
    }
    if (!this.isCurrentVisitorCarter()) {
      this.unbindDamagedShutterAppliedListener();
      return;
    }
    if (
      !this.emergencyShutterSucceeded ||
      this.carterEncounterResolved ||
      this.carterAttackTriggered ||
      this.cleanupProgramActivated ||
      this.phoneEmergencyResolved
    ) {
      this.unbindDamagedShutterAppliedListener();
      return;
    }
    if (!this.shutterController || !this.shutterController.isShutterClosed()) {
      this.unbindDamagedShutterAppliedListener();
      this.triggerCarterBreakthroughFailure('damaged-visual-unavailable');
      return;
    }
    console.info('[CarterEmergency] normal shutter hold complete');
    const impactLoopStarted = this.shutterController.startShutterImpactLoop();
    if (!impactLoopStarted) {
      console.error('[EvidencePreviewController] Failed to start shutter impact loop.');
      this.triggerCarterBreakthroughFailure('damaged-visual-unavailable');
      return;
    }
    console.info('[CarterEmergency] shutter impact loop started');
    this.beginPhoneResponseWindow();
  };

  private readonly handleDamagedShutterApplied = (): void => {
    this.unbindDamagedShutterAppliedListener();
  };

  private readonly handleEmergencyPhoneOpened = (): void => {
    if (!this.isCurrentVisitorCarter()) {
      return;
    }
    if (!this.phoneResponseWindowOpen || this.cleanupProgramActivated || this.phoneEmergencyResolved) {
      return;
    }
    if (this.carterEncounterResolved || this.carterAttackTriggered) {
      return;
    }
    if (Date.now() > this.phoneResponseDeadlineMs) {
      this.handlePhonePickupTimeout();
      return;
    }
    this.phoneResponseWindowOpen = false;
    this.phoneResponseDeadlineMs = 0;
    this.unschedule(this.handlePhonePickupTimeout);
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = false;
    }
    this.beginPhoneDialWindow();
  };

  private readonly handlePhonePickupTimeout = (): void => {
    if (!this.phoneResponseWindowOpen) {
      return;
    }
    if (this.cleanupProgramActivated || this.phoneEmergencyResolved || this.carterAttackTriggered) {
      return;
    }
    this.triggerCarterBreakthroughFailure('phone-pickup-timeout');
  };

  private readonly handleEmergencyCallSubmitted = (phoneNumber: string): void => {
    if (!this.isCurrentVisitorCarter()) {
      return;
    }
    if (!this.phoneDialWindowOpen || this.cleanupProgramActivated || this.phoneEmergencyResolved) {
      return;
    }
    if (this.carterEncounterResolved || this.carterAttackTriggered) {
      return;
    }
    if (Date.now() > this.phoneDialDeadlineMs) {
      this.handleDial1414Timeout();
      return;
    }
    if (phoneNumber === '1414') {
      this.activateCleanupProgram();
      return;
    }
    this.telephoneController?.showEmergencyStatus('INVALID CODE');
  };

  private readonly handleDial1414Timeout = (): void => {
    if (!this.phoneDialWindowOpen) {
      return;
    }
    if (this.cleanupProgramActivated || this.phoneEmergencyResolved || this.carterAttackTriggered) {
      return;
    }
    this.triggerCarterBreakthroughFailure('dial-timeout');
  };

  private readonly handleShowCarterGameOver = (): void => {
    if (!this.isCurrentVisitorCarter() || !this.carterAttackTriggered) {
      return;
    }
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = true;
    }
  };

  private readonly handleCleanupTransitionComplete = (): void => {
    this.cleanupTransitionScheduled = false;
    this.unschedule(this.handleCleanupTransitionComplete);
    this.telephoneController?.closeEmergencyPhone();
    this.telephoneController?.setTelephoneEntryEnabled(false);
    this.shutterController?.stopShutterImpactLoop();
    this.shutterController?.restoreNormalVisual();
    this.shutterController?.prepareClosedForIntro();
    this.shutterController?.setInteractionEnabled(false);
    this.hideCarterThreatReplyCompletely();
    this.stopChecklistReplyTyping(true);
    this.configureChecklistReplyOverlay(true, true);
    this.closePreview();
    this.resetChecklistState();
    this.resetCarterMonsterFlow(false);
    this.resetInspectionRoundForNextSubject();
    const advanced = this.advanceToNextInspectionSubject();
    if (!advanced) {
      console.info('INSPECTION_SEQUENCE_COMPLETE');
      return;
    }
    if (!this.loadInspectionSubject(this.activeInspectionSubjectId)) {
      console.error('[EvidencePreviewController] Failed to load next inspection subject.');
      return;
    }
    if (!this.playIntroForActiveSubject()) {
      console.error('[EvidencePreviewController] Failed to play intro for next inspection subject.');
    }
  };

  onLoad(): void {
    const canvas = this.node.parent;
    if (!canvas) {
      console.error('[EvidencePreviewController] Canvas not found from DeskEvidenceRuntime parent.');
      this.enabled = false;
      return;
    }

    this.employeeCardHit = this.node.getChildByName('EmployeeCardHit');
    this.applicationFormHit = this.node.getChildByName('ApplicationFormHit');
    this.screeningChecklistHit = this.node.getChildByName('ScreeningChecklistHit');

    this.evidencePreviewRuntime = canvas.getChildByName('EvidencePreviewRuntime');
    const consoleControls = canvas.getChildByName('ConsoleControls');

    this.previewScrim = this.evidencePreviewRuntime?.getChildByName('PreviewScrim') ?? null;
    this.employeeCardDetailVisual =
      this.evidencePreviewRuntime?.getChildByName('EmployeeCardDetailVisual') ?? null;
    this.applicationFormDetailVisual =
      this.evidencePreviewRuntime?.getChildByName('ApplicationFormDetailVisual') ?? null;
    this.screeningChecklistDetailVisual =
      this.evidencePreviewRuntime?.getChildByName('ScreeningChecklistDetailVisual') ?? null;

    this.employeeCardCloseHit =
      this.employeeCardDetailVisual?.getChildByName('EmployeeCardCloseHit') ?? null;
    this.applicationFormCloseHit =
      this.applicationFormDetailVisual?.getChildByName('ApplicationFormCloseHit') ?? null;
    this.carterEmployeeCardDynamicLayer =
      this.employeeCardDetailVisual?.getChildByName('CarterEmployeeCardDynamicLayer') ?? null;
    this.carterApplicationDynamicLayer =
      this.applicationFormDetailVisual?.getChildByName('CarterApplicationDynamicLayer') ?? null;
    this.employeeCardEmployeeIdValueLabel =
      this.carterEmployeeCardDynamicLayer
        ?.getChildByName('EmployeeIdValueLabel')
        ?.getComponent(Label) ?? null;
    this.employeeCardNameValueLabel =
      this.carterEmployeeCardDynamicLayer?.getChildByName('NameValueLabel')?.getComponent(Label) ?? null;
    this.employeeCardPositionValueLabel =
      this.carterEmployeeCardDynamicLayer
        ?.getChildByName('PositionValueLabel')
        ?.getComponent(Label) ?? null;
    this.employeeCardValidUntilTitleLabel =
      this.carterEmployeeCardDynamicLayer
        ?.getChildByName('ValidUntilTitleLabel')
        ?.getComponent(Label) ?? null;
    this.employeeCardValidUntilValueLabel =
      this.carterEmployeeCardDynamicLayer
        ?.getChildByName('ValidUntilValueLabel')
        ?.getComponent(Label) ?? null;
    this.employeeCardSecurityLogoSprite =
      this.carterEmployeeCardDynamicLayer?.getChildByName('SecurityLogo')?.getComponent(Sprite) ?? null;
    this.applicationIdNumberValueLabel =
      this.carterApplicationDynamicLayer
        ?.getChildByName('IdNumberValueLabel')
        ?.getComponent(Label) ?? null;
    this.applicationNameValueLabel =
      this.carterApplicationDynamicLayer?.getChildByName('NameValueLabel')?.getComponent(Label) ?? null;
    this.applicationPositionValueLabel =
      this.carterApplicationDynamicLayer
        ?.getChildByName('PositionValueLabel')
        ?.getComponent(Label) ?? null;
    this.applicationDepartmentValueLabel =
      this.carterApplicationDynamicLayer
        ?.getChildByName('DepartmentValueLabel')
        ?.getComponent(Label) ?? null;
    this.applicationValidUntilValueLabel =
      this.carterApplicationDynamicLayer
        ?.getChildByName('ValidUntilValueLabel')
        ?.getComponent(Label) ?? null;
    this.applicationReasonForEntryValueLabel =
      this.carterApplicationDynamicLayer
        ?.getChildByName('ReasonForEntryValueLabel')
        ?.getComponent(Label) ?? null;
    this.applicationSecurityLogoSprite =
      this.carterApplicationDynamicLayer?.getChildByName('SecurityLogo')?.getComponent(Sprite) ?? null;
    this.screeningChecklistCloseHit =
      this.screeningChecklistDetailVisual?.getChildByName('ScreeningChecklistCloseHit') ?? null;
    this.applicationFormCloseButton =
      this.applicationFormCloseHit?.getComponent(Button) ?? null;
    this.screeningChecklistHitButton = this.screeningChecklistHit?.getComponent(Button) ?? null;
    this.screeningChecklistCloseButton =
      this.screeningChecklistCloseHit?.getComponent(Button) ?? null;

    const checklistInteractionRuntime =
      this.screeningChecklistDetailVisual?.getChildByName('ChecklistInteractionRuntime') ?? null;
    this.idCardPassCell = checklistInteractionRuntime?.getChildByName('IdCardPassCell') ?? null;
    this.idCardFailCell = checklistInteractionRuntime?.getChildByName('IdCardFailCell') ?? null;
    this.applicationPassCell =
      checklistInteractionRuntime?.getChildByName('ApplicationPassCell') ?? null;
    this.applicationFailCell =
      checklistInteractionRuntime?.getChildByName('ApplicationFailCell') ?? null;
    this.appearancePassCell = checklistInteractionRuntime?.getChildByName('AppearancePassCell') ?? null;
    this.appearanceFailCell = checklistInteractionRuntime?.getChildByName('AppearanceFailCell') ?? null;
    this.checklistActionTextNode =
      checklistInteractionRuntime?.getChildByName('ChecklistActionText') ?? null;

    this.idCardPassLabel = this.idCardPassCell?.getComponent(Label) ?? null;
    this.idCardFailLabel = this.idCardFailCell?.getComponent(Label) ?? null;
    this.applicationPassLabel = this.applicationPassCell?.getComponent(Label) ?? null;
    this.applicationFailLabel = this.applicationFailCell?.getComponent(Label) ?? null;
    this.appearancePassLabel = this.appearancePassCell?.getComponent(Label) ?? null;
    this.appearanceFailLabel = this.appearanceFailCell?.getComponent(Label) ?? null;
    this.checklistActionLabel = this.checklistActionTextNode?.getComponent(Label) ?? null;
    this.checklistActionHit = checklistInteractionRuntime?.getChildByName('ChecklistActionHit') ?? null;
    this.checklistQuestionPanelRuntime =
      this.evidencePreviewRuntime?.getChildByName('ChecklistQuestionPanelRuntime') ?? null;
    this.checklistQuestionScrim =
      this.checklistQuestionPanelRuntime?.getChildByName('ChecklistQuestionScrim') ?? null;
    this.questionAppearanceOption =
      this.checklistQuestionPanelRuntime?.getChildByName('QuestionAppearanceOption') ?? null;
    this.questionIdCardOption =
      this.checklistQuestionPanelRuntime?.getChildByName('QuestionIdCardOption') ?? null;
    this.questionApplicationOption =
      this.checklistQuestionPanelRuntime?.getChildByName('QuestionApplicationOption') ?? null;
    this.questionNoIssueOption =
      this.checklistQuestionPanelRuntime?.getChildByName('QuestionNoIssueOption') ?? null;
    this.checklistReplyPanelRuntime = canvas.getChildByName('ChecklistReplyPanelRuntime');
    this.checklistReplyScrim = this.checklistReplyPanelRuntime?.getChildByName('ChecklistReplyScrim') ?? null;
    this.checklistReplyBox = this.checklistReplyPanelRuntime?.getChildByName('ChecklistReplyBox') ?? null;
    this.checklistReplyContinueHintNode =
      this.checklistReplyBox?.getChildByName('ChecklistReplyContinueHint') ?? null;
    this.checklistReplyContinueHit =
      this.checklistReplyPanelRuntime?.getChildByName('ChecklistReplyContinueHit') ?? null;
    this.checklistReplyTextNode = this.checklistReplyBox?.getChildByName('ChecklistReplyText') ?? null;

    const checklistActionHitButton = this.checklistActionHit?.getComponent(Button) ?? null;
    const questionAppearanceButton = this.questionAppearanceOption?.getComponent(Button) ?? null;
    const questionIdCardButton = this.questionIdCardOption?.getComponent(Button) ?? null;
    const questionApplicationButton = this.questionApplicationOption?.getComponent(Button) ?? null;
    const questionNoIssueButton = this.questionNoIssueOption?.getComponent(Button) ?? null;
    this.checklistQuestionScrimGraphics = this.checklistQuestionScrim?.getComponent(Graphics) ?? null;
    this.checklistReplyScrimGraphics = this.checklistReplyScrim?.getComponent(Graphics) ?? null;
    this.checklistReplyBoxGraphics = this.checklistReplyBox?.getComponent(Graphics) ?? null;
    this.checklistReplyScrimBlockInput = this.checklistReplyScrim?.getComponent(BlockInputEvents) ?? null;
    this.checklistReplyLabel = this.checklistReplyTextNode?.getComponent(Label) ?? null;
    this.checklistReplyContinueButton = this.checklistReplyContinueHit?.getComponent(Button) ?? null;
    this.checklistActionButton = checklistActionHitButton;

    if (!this.applicationFormCloseButton) {
      console.error('[EvidencePreviewController] ApplicationFormCloseHit Button is missing.');
      this.enabled = false;
      return;
    }

    const btnShutterHit = consoleControls?.getChildByName('BtnShutterHit') ?? null;
    const btnAllowHit = consoleControls?.getChildByName('BtnAllowHit') ?? null;
    const btnDenyHit = consoleControls?.getChildByName('BtnDenyHit') ?? null;
    const telephoneHit = this.node.getChildByName('TelephoneHit');
    const windowRuntime = canvas.getChildByName('WindowRuntime');
    const windowViewport = windowRuntime?.getChildByName('WindowViewport') ?? null;
    this.carterCharacter = windowViewport?.getChildByName('CarterCharacter') ?? null;
    this.carterCharacterSprite = this.carterCharacter?.getComponent(Sprite) ?? null;
    this.carterCharacterUi = this.carterCharacter?.getComponent(UITransform) ?? null;
    this.initialCarterSpriteFrame = this.carterCharacterSprite?.spriteFrame ?? null;
    this.shutterController = btnShutterHit?.getComponent(ShutterToggleController) ?? null;
    this.telephoneController = telephoneHit?.getComponent(TelephoneController) ?? null;

    this.carterMonsterAttackRuntime = canvas.getChildByName('CarterMonsterAttackRuntime');
    this.carterMonsterAttackScrim =
      this.carterMonsterAttackRuntime?.getChildByName('CarterMonsterAttackScrim') ?? null;
    this.carterMonsterPortraitSource =
      this.carterMonsterAttackRuntime?.getChildByName('CarterMonsterPortraitSource') ?? null;
    this.carterMonsterFullbodyVisual =
      this.carterMonsterAttackRuntime?.getChildByName('CarterMonsterFullbodyVisual') ?? null;
    this.carterGameOverPanelRuntime =
      this.carterMonsterAttackRuntime?.getChildByName('CarterGameOverPanelRuntime') ?? null;
    this.carterGameOverTitleLabel =
      this.carterGameOverPanelRuntime?.getChildByName('CarterGameOverTitleLabel') ?? null;
    this.carterGameOverMessageLabel =
      this.carterGameOverPanelRuntime?.getChildByName('CarterGameOverMessageLabel') ?? null;
    this.carterMonsterPortraitSprite = this.carterMonsterPortraitSource?.getComponent(Sprite) ?? null;
    this.carterMonsterFullbodySprite = this.carterMonsterFullbodyVisual?.getComponent(Sprite) ?? null;
    this.carterMonsterPortraitFrame = this.carterMonsterPortraitSprite?.spriteFrame ?? null;
    this.carterMonsterFullbodyFrame = this.carterMonsterFullbodySprite?.spriteFrame ?? null;
    this.carterEmployeeCardFrame = this.employeeCardDetailVisual?.getComponent(Sprite)?.spriteFrame ?? null;
    this.carterApplicationFormFrame = this.applicationFormDetailVisual?.getComponent(Sprite)?.spriteFrame ?? null;
    this.deskEmployeeCardSprite =
      this.node.getChildByName('EmployeeCardVisual')?.getComponent(Sprite) ?? null;
    this.deskApplicationFormSprite =
      this.node.getChildByName('ApplicationFormVisual')?.getComponent(Sprite) ?? null;
    this.defaultDeskEmployeeCardFrame = this.deskEmployeeCardSprite?.spriteFrame ?? null;
    this.defaultDeskApplicationFormFrame = this.deskApplicationFormSprite?.spriteFrame ?? null;
    const employeeFileDetailPanel = canvas.getChildByName('EmployeeFileDetailPanelRuntime');
    const employeeFileDetailContent =
      employeeFileDetailPanel?.getChildByName('EmployeeFileDetailContentRuntime') ?? null;
    this.carterEmployeeFilePortraitFrame =
      employeeFileDetailContent?.getChildByName('FilePortraitSprite')?.getComponent(Sprite)?.spriteFrame ?? null;
    this.visitorIntroController = canvas.getComponent(VisitorIntroSequenceController);
    this.visitorGreetingRuntime = canvas.getChildByName('VisitorGreetingRuntime');
    const employeeDrawersClosedRuntime = this.node.getChildByName('EmployeeDrawersClosedRuntime');
    this.employeeFilesController = employeeDrawersClosedRuntime?.getComponent(EmployeeFilesController) ?? null;
    this.resolveEthanAssetSources(canvas);
    this.carterAttackScrimGraphics = this.carterMonsterAttackScrim?.getComponent(Graphics) ?? null;
    this.carterGameOverPanelGraphics =
      this.carterGameOverPanelRuntime?.getComponent(Graphics) ?? null;

    this.employeeCardHitButton = this.employeeCardHit?.getComponent(Button) ?? null;
    this.applicationFormHitButton = this.applicationFormHit?.getComponent(Button) ?? null;
    this.shutterHitButton = btnShutterHit?.getComponent(Button) ?? null;
    this.telephoneHitButton = telephoneHit?.getComponent(Button) ?? null;
    this.allowHitButton = btnAllowHit?.getComponent(Button) ?? null;
    this.denyHitButton = btnDenyHit?.getComponent(Button) ?? null;

    const scrimGraphics = this.previewScrim?.getComponent(Graphics) ?? null;

    const missing = [
      !this.employeeCardHit && 'EmployeeCardHit',
      !this.applicationFormHit && 'ApplicationFormHit',
      !this.screeningChecklistHit && 'ScreeningChecklistHit',
      !this.evidencePreviewRuntime && 'EvidencePreviewRuntime',
      !consoleControls && 'ConsoleControls',
      !this.previewScrim && 'PreviewScrim',
      !this.employeeCardDetailVisual && 'EmployeeCardDetailVisual',
      !this.applicationFormDetailVisual && 'ApplicationFormDetailVisual',
      !this.screeningChecklistDetailVisual && 'ScreeningChecklistDetailVisual',
      !this.employeeCardCloseHit && 'EmployeeCardCloseHit',
      !this.applicationFormCloseHit && 'ApplicationFormCloseHit',
      !this.screeningChecklistCloseHit && 'ScreeningChecklistCloseHit',
      !btnShutterHit && 'BtnShutterHit',
      !telephoneHit && 'TelephoneHit',
      !btnAllowHit && 'BtnAllowHit',
      !btnDenyHit && 'BtnDenyHit',
      !this.employeeCardHitButton && 'EmployeeCardHit(Button)',
      !this.applicationFormHitButton && 'ApplicationFormHit(Button)',
      !this.screeningChecklistHitButton && 'ScreeningChecklistHit(Button)',
      !this.screeningChecklistCloseButton && 'ScreeningChecklistCloseHit(Button)',
      !this.shutterHitButton && 'BtnShutterHit(Button)',
      !this.telephoneHitButton && 'TelephoneHit(Button)',
      !this.allowHitButton && 'BtnAllowHit(Button)',
      !this.denyHitButton && 'BtnDenyHit(Button)',
      !scrimGraphics && 'PreviewScrim(Graphics)',
      !this.checklistReplyScrimBlockInput && 'ChecklistReplyScrim(BlockInputEvents)',
      !this.shutterController && 'BtnShutterHit(ShutterToggleController)',
      !this.telephoneController && 'TelephoneHit(TelephoneController)',
      !this.carterCharacter && 'WindowRuntime/WindowViewport/CarterCharacter',
      !this.carterCharacterSprite && 'CarterCharacter(Sprite)',
      !this.carterCharacterUi && 'CarterCharacter(UITransform)',
      !this.carterMonsterAttackRuntime && 'CarterMonsterAttackRuntime',
      !this.carterMonsterAttackScrim && 'CarterMonsterAttackScrim',
      !this.carterMonsterPortraitSource && 'CarterMonsterPortraitSource',
      !this.carterMonsterFullbodyVisual && 'CarterMonsterFullbodyVisual',
      !this.carterGameOverPanelRuntime && 'CarterGameOverPanelRuntime',
      !this.carterGameOverTitleLabel && 'CarterGameOverTitleLabel',
      !this.carterGameOverMessageLabel && 'CarterGameOverMessageLabel',
      !this.carterMonsterPortraitSprite && 'CarterMonsterPortraitSource(Sprite)',
      !this.carterMonsterFullbodySprite && 'CarterMonsterFullbodyVisual(Sprite)',
      !this.carterMonsterPortraitFrame && 'char_carter_monster_portrait(SpriteFrame)',
      !this.carterMonsterFullbodyFrame && 'char_carter_monster_fullbody(SpriteFrame)',
      !this.carterEmployeeCardFrame && 'EmployeeCardDetailVisual(SpriteFrame)',
      !this.carterApplicationFormFrame && 'ApplicationFormDetailVisual(SpriteFrame)',
      !this.defaultDeskEmployeeCardFrame && 'DeskEvidenceRuntime/EmployeeCardVisual(SpriteFrame)',
      !this.defaultDeskApplicationFormFrame && 'DeskEvidenceRuntime/ApplicationFormVisual(SpriteFrame)',
      !this.carterEmployeeFilePortraitFrame && 'EmployeeFileDetailContentRuntime/FilePortraitSprite(SpriteFrame)',
      !this.visitorIntroController && 'Canvas(VisitorIntroSequenceController)',
      !this.employeeFilesController && 'EmployeeDrawersClosedRuntime(EmployeeFilesController)',
      !this.ethanDisguisedFrame && 'InspectionSubjectAssetSources/EthanDisguisedSource(SpriteFrame)',
      !this.ethanPortraitFrame && 'InspectionSubjectAssetSources/EthanPortraitSource(SpriteFrame)',
      !this.ethanMonsterPortraitFrame &&
        'InspectionSubjectAssetSources/EthanMonsterPortraitSource(SpriteFrame)',
      !this.ethanMonsterFullbodyFrame &&
        'InspectionSubjectAssetSources/EthanMonsterFullbodySource(SpriteFrame)',
      !this.ethanEmployeeCardFrame && 'InspectionSubjectAssetSources/EthanEmployeeCardSource(SpriteFrame)',
      !this.ethanApplicationFakeFrame &&
        'InspectionSubjectAssetSources/EthanApplicationFormFakeSource(SpriteFrame)',
      !this.carterAttackScrimGraphics && 'CarterMonsterAttackScrim(Graphics)',
      !this.carterGameOverPanelGraphics && 'CarterGameOverPanelRuntime(Graphics)',
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      console.error(`[EvidencePreviewController] Missing required nodes/components: ${missing.join(', ')}`);
      this.enabled = false;
      return;
    }

    this.managedButtons = [
      this.employeeCardHitButton,
      this.applicationFormHitButton,
      this.screeningChecklistHitButton,
      this.shutterHitButton,
      this.allowHitButton,
      this.denyHitButton,
    ].filter((btn): btn is Button => !!btn);

    this.previewScrimGraphics = scrimGraphics;
    this.previewOpen = false;
    this.evidencePreviewRuntime!.active = false;
    this.employeeCardDetailVisual!.active = false;
    this.applicationFormDetailVisual!.active = false;
    this.screeningChecklistDetailVisual!.active = false;
    this.carterMonsterAttackRuntime!.active = false;
    this.carterGameOverPanelRuntime!.active = false;
    this.drawCarterAttackUi();
    this.drawCarterGameOverPanelUi();
    this.captureCarterCharacterBaseSize();
    this.ensureCarterGameOverFormalNodes();
    this.prepareCarterGameOverFormalUi();
    this.loadCarterGameOverFormalSprites();
    this.applyFullbodyContainSizing();
    this.drawScrim(170);

    const checklistInteractionNodesComplete =
      !!checklistInteractionRuntime &&
      !!this.idCardPassCell &&
      !!this.idCardFailCell &&
      !!this.applicationPassCell &&
      !!this.applicationFailCell &&
      !!this.appearancePassCell &&
      !!this.appearanceFailCell &&
      !!this.checklistActionTextNode &&
      !!this.idCardPassLabel &&
      !!this.idCardFailLabel &&
      !!this.applicationPassLabel &&
      !!this.applicationFailLabel &&
      !!this.appearancePassLabel &&
      !!this.appearanceFailLabel &&
      !!this.checklistActionLabel;

    if (checklistInteractionNodesComplete) {
      this.checklistInteractionReady = this.stabilizeChecklistCells();
      if (this.checklistInteractionReady) {
        this.refreshChecklistVisuals();
      } else {
        console.error(
          '[EvidencePreviewController] Checklist cell hit areas could not be stabilized.',
        );
      }
    } else {
      console.error('[EvidencePreviewController] Checklist interaction nodes are incomplete.');
      this.checklistInteractionReady = false;
    }

    const checklistQuestionUiComplete =
      !!this.checklistActionHit &&
      !!this.checklistQuestionPanelRuntime &&
      !!this.checklistQuestionScrim &&
      !!this.questionAppearanceOption &&
      !!this.questionIdCardOption &&
      !!this.questionApplicationOption &&
      !!this.questionNoIssueOption &&
      !!checklistActionHitButton &&
      !!questionAppearanceButton &&
      !!questionIdCardButton &&
      !!questionApplicationButton &&
      !!questionNoIssueButton &&
      !!this.checklistQuestionScrimGraphics;

    if (checklistQuestionUiComplete) {
      this.checklistQuestionUiReady = true;
      this.checklistQuestionPanelRuntime!.active = false;
      this.checklistQuestionPanelOpen = false;
      this.drawChecklistQuestionUi();
    } else {
      console.error('[EvidencePreviewController] Checklist question UI is incomplete.');
      this.checklistQuestionUiReady = false;
      if (this.checklistActionHit) {
        this.checklistActionHit.active = false;
      }
      if (this.checklistQuestionPanelRuntime) {
        this.checklistQuestionPanelRuntime.active = false;
      }
      this.checklistQuestionPanelOpen = false;
    }

    const checklistReplyUiComplete =
      !!this.checklistReplyPanelRuntime &&
      !!this.checklistReplyScrim &&
      !!this.checklistReplyBox &&
      !!this.checklistReplyTextNode &&
      !!this.checklistReplyContinueHit &&
      !!this.checklistReplyScrimGraphics &&
      !!this.checklistReplyBoxGraphics &&
      !!this.checklistReplyLabel &&
      !!this.checklistReplyContinueButton;

    if (checklistReplyUiComplete) {
      this.checklistReplyUiReady = true;
      this.checklistReplyPanelRuntime!.active = false;
      this.checklistReplyPanelOpen = false;
      this.stopChecklistReplyTyping(true);
      this.configureChecklistReplyOverlay(true, true);
      this.drawChecklistReplyUi();
    } else {
      console.error('[EvidencePreviewController] Checklist reply UI is incomplete.');
      this.checklistReplyUiReady = false;
      if (this.checklistReplyPanelRuntime) {
        this.checklistReplyPanelRuntime.active = false;
      }
      this.checklistReplyPanelOpen = false;
    }

    this.captureEncounterButtons(canvas);
    this.activeInspectionSubjectId = this.inspectionSequence[0] ?? 'carter';
    this.currentInspectionSubjectIndex = 0;
    this.employeeFilesController?.setActiveInspectionSubject(this.activeInspectionSubjectId);
    this.loadInspectionSubject(this.activeInspectionSubjectId);
    this.syncActiveDocumentPresentation();
  }

  onEnable(): void {
    this.employeeCardHit?.on(Node.EventType.TOUCH_END, this.openEmployeeCard, this);
    this.applicationFormHit?.on(Node.EventType.TOUCH_END, this.openApplicationForm, this);
    this.screeningChecklistHit?.on(Node.EventType.TOUCH_END, this.openScreeningChecklist, this);
    this.employeeCardCloseHit?.on(Node.EventType.TOUCH_END, this.onClosePreviewClick, this);
    this.applicationFormCloseHit?.on(Button.EventType.CLICK, this.onClosePreviewClick, this);
    this.screeningChecklistCloseHit?.on(Button.EventType.CLICK, this.onClosePreviewClick, this);
    if (this.checklistInteractionReady) {
      this.idCardPassCell?.on(Button.EventType.CLICK, this.selectIdCardPass, this);
      this.idCardFailCell?.on(Button.EventType.CLICK, this.selectIdCardFail, this);
      this.applicationPassCell?.on(Button.EventType.CLICK, this.selectApplicationPass, this);
      this.applicationFailCell?.on(Button.EventType.CLICK, this.selectApplicationFail, this);
      this.appearancePassCell?.on(Button.EventType.CLICK, this.selectAppearancePass, this);
      this.appearanceFailCell?.on(Button.EventType.CLICK, this.selectAppearanceFail, this);
    }
    if (this.checklistQuestionUiReady) {
      this.checklistActionHit?.on(Button.EventType.CLICK, this.handleChecklistActionTriggered, this);
      this.questionAppearanceOption?.on(Button.EventType.CLICK, this.selectAppearanceQuestion, this);
      this.questionIdCardOption?.on(Button.EventType.CLICK, this.selectIdCardQuestion, this);
      this.questionApplicationOption?.on(Button.EventType.CLICK, this.selectApplicationQuestion, this);
      this.questionNoIssueOption?.on(Button.EventType.CLICK, this.selectNoIssueQuestion, this);
    }
    if (this.checklistReplyUiReady) {
      this.checklistReplyContinueHit?.on(Button.EventType.CLICK, this.closeChecklistReply, this);
    }
    this.denyHitButton?.node.on(Button.EventType.CLICK, this.handleConsoleDenyClick, this);
    this.allowHitButton?.node.on(Button.EventType.CLICK, this.handleAllowDecisionClick, this);
    this.carterGameOverRetryHit?.on(Button.EventType.CLICK, this.handleCarterGameOverRetryClick, this);
    this.carterGameOverReviveHit?.on(Button.EventType.CLICK, this.handleCarterGameOverReviveClick, this);
  }

  onDisable(): void {
    this.employeeCardHit?.off(Node.EventType.TOUCH_END, this.openEmployeeCard, this);
    this.applicationFormHit?.off(Node.EventType.TOUCH_END, this.openApplicationForm, this);
    this.screeningChecklistHit?.off(Node.EventType.TOUCH_END, this.openScreeningChecklist, this);
    this.employeeCardCloseHit?.off(Node.EventType.TOUCH_END, this.onClosePreviewClick, this);
    this.applicationFormCloseHit?.off(Button.EventType.CLICK, this.onClosePreviewClick, this);
    this.screeningChecklistCloseHit?.off(Button.EventType.CLICK, this.onClosePreviewClick, this);
    if (this.checklistInteractionReady) {
      this.idCardPassCell?.off(Button.EventType.CLICK, this.selectIdCardPass, this);
      this.idCardFailCell?.off(Button.EventType.CLICK, this.selectIdCardFail, this);
      this.applicationPassCell?.off(Button.EventType.CLICK, this.selectApplicationPass, this);
      this.applicationFailCell?.off(Button.EventType.CLICK, this.selectApplicationFail, this);
      this.appearancePassCell?.off(Button.EventType.CLICK, this.selectAppearancePass, this);
      this.appearanceFailCell?.off(Button.EventType.CLICK, this.selectAppearanceFail, this);
    }
    if (this.checklistQuestionUiReady) {
      this.checklistActionHit?.off(Button.EventType.CLICK, this.handleChecklistActionTriggered, this);
      this.questionAppearanceOption?.off(Button.EventType.CLICK, this.selectAppearanceQuestion, this);
      this.questionIdCardOption?.off(Button.EventType.CLICK, this.selectIdCardQuestion, this);
      this.questionApplicationOption?.off(Button.EventType.CLICK, this.selectApplicationQuestion, this);
      this.questionNoIssueOption?.off(Button.EventType.CLICK, this.selectNoIssueQuestion, this);
    }
    if (this.checklistReplyUiReady) {
      this.checklistReplyContinueHit?.off(Button.EventType.CLICK, this.closeChecklistReply, this);
    }
    this.denyHitButton?.node.off(Button.EventType.CLICK, this.handleConsoleDenyClick, this);
    this.allowHitButton?.node.off(Button.EventType.CLICK, this.handleAllowDecisionClick, this);
    this.carterGameOverRetryHit?.off(Button.EventType.CLICK, this.handleCarterGameOverRetryClick, this);
    this.carterGameOverReviveHit?.off(Button.EventType.CLICK, this.handleCarterGameOverReviveClick, this);
    this.unschedule(this.handleCleanupTransitionComplete);
    this.cleanupTransitionScheduled = false;
    this.inspectionDecisionResolutionInProgress = false;
    this.administrativeGameOverActive = false;
    this.resetCarterMonsterFlow(true);
  }

  onDestroy(): void {
    this.isDestroying = true;
    this.unschedule(this.handleCleanupTransitionComplete);
    this.cleanupTransitionScheduled = false;
    this.inspectionDecisionResolutionInProgress = false;
    this.administrativeGameOverActive = false;
    this.resetCarterMonsterFlow(true);
  }

  private playDocumentFlipSound(): void {
    AudioManager.getInstance()?.playCachedDocumentFlip();
  }

  private playDecisionMarkSound(): void {
    AudioManager.getInstance()?.playCachedDecisionMark();
  }

  private openEmployeeCard(): void {
    if (
      this.previewOpen ||
      !this.evidencePreviewRuntime ||
      !this.employeeCardDetailVisual ||
      !this.applicationFormDetailVisual ||
      !this.screeningChecklistDetailVisual
    ) {
      return;
    }

    this.playDocumentFlipSound();
    this.drawScrim(0);
    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    if (this.checklistReplyPanelRuntime) {
      this.checklistReplyPanelRuntime.active = false;
    }
    this.checklistReplyPanelOpen = false;
    this.stopChecklistReplyTyping(true);
    this.syncActiveDocumentPresentation();
    this.evidencePreviewRuntime.active = true;
    this.employeeCardDetailVisual.active = true;
    this.applicationFormDetailVisual.active = false;
    this.screeningChecklistDetailVisual.active = false;
    this.setManagedButtonsInteractable(false);
    this.previewOpen = true;
  }

  private openApplicationForm(): void {
    if (
      this.previewOpen ||
      !this.evidencePreviewRuntime ||
      !this.employeeCardDetailVisual ||
      !this.applicationFormDetailVisual ||
      !this.screeningChecklistDetailVisual
    ) {
      return;
    }

    this.playDocumentFlipSound();
    this.drawScrim(170);
    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    if (this.checklistReplyPanelRuntime) {
      this.checklistReplyPanelRuntime.active = false;
    }
    this.checklistReplyPanelOpen = false;
    this.stopChecklistReplyTyping(true);
    this.syncActiveDocumentPresentation();
    this.evidencePreviewRuntime.active = true;
    this.employeeCardDetailVisual.active = false;
    this.applicationFormDetailVisual.active = true;
    this.screeningChecklistDetailVisual.active = false;
    this.setManagedButtonsInteractable(false);
    this.previewOpen = true;
  }

  private openScreeningChecklist(): void {
    if (
      this.previewOpen ||
      !this.evidencePreviewRuntime ||
      !this.employeeCardDetailVisual ||
      !this.applicationFormDetailVisual ||
      !this.screeningChecklistDetailVisual
    ) {
      return;
    }

    this.playDocumentFlipSound();
    this.drawScrim(170);
    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    if (this.checklistReplyPanelRuntime) {
      this.checklistReplyPanelRuntime.active = false;
    }
    this.checklistReplyPanelOpen = false;
    this.stopChecklistReplyTyping(true);
    this.evidencePreviewRuntime.active = true;
    this.employeeCardDetailVisual.active = false;
    this.applicationFormDetailVisual.active = false;
    this.screeningChecklistDetailVisual.active = true;
    if (this.checklistInteractionReady) {
      this.checklistInteractionReady = this.stabilizeChecklistCells();
      if (this.checklistInteractionReady) {
        this.refreshChecklistVisuals();
      }
    }
    this.setManagedButtonsInteractable(false);
    this.previewOpen = true;
  }

  /** Player-clicked X on document preview; play UI click then close. */
  private onClosePreviewClick(): void {
    AudioManager.getInstance()?.playCachedSettingsClick();
    this.closePreview();
  }

  private closePreview(): void {
    if (
      !this.evidencePreviewRuntime ||
      !this.employeeCardDetailVisual ||
      !this.applicationFormDetailVisual ||
      !this.screeningChecklistDetailVisual
    ) {
      return;
    }

    this.drawScrim(170);
    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    if (this.checklistReplyPanelRuntime) {
      this.checklistReplyPanelRuntime.active = false;
    }
    this.checklistReplyPanelOpen = false;
    this.stopChecklistReplyTyping(true);
    if (this.checklistActionHit) {
      this.checklistActionHit.active = false;
    }
    this.employeeCardDetailVisual.active = false;
    this.applicationFormDetailVisual.active = false;
    this.screeningChecklistDetailVisual.active = false;
    this.evidencePreviewRuntime.active = false;
    this.setManagedButtonsInteractable(true);
    this.previewOpen = false;
  }

  private selectIdCardPass(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.playDecisionMarkSound();
    this.idCardChoice = this.idCardChoice === 'pass' ? 'unset' : 'pass';
    this.refreshChecklistVisuals();
  }

  private selectIdCardFail(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.playDecisionMarkSound();
    this.idCardChoice = this.idCardChoice === 'fail' ? 'unset' : 'fail';
    this.refreshChecklistVisuals();
  }

  private selectApplicationPass(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.playDecisionMarkSound();
    this.applicationChoice = this.applicationChoice === 'pass' ? 'unset' : 'pass';
    this.refreshChecklistVisuals();
  }

  private selectApplicationFail(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.playDecisionMarkSound();
    this.applicationChoice = this.applicationChoice === 'fail' ? 'unset' : 'fail';
    this.refreshChecklistVisuals();
  }

  private selectAppearancePass(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.playDecisionMarkSound();
    this.appearanceChoice = this.appearanceChoice === 'pass' ? 'unset' : 'pass';
    this.refreshChecklistVisuals();
  }

  private selectAppearanceFail(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.playDecisionMarkSound();
    this.appearanceChoice = this.appearanceChoice === 'fail' ? 'unset' : 'fail';
    this.refreshChecklistVisuals();
  }

  private refreshChecklistVisuals(): void {
    if (!this.checklistInteractionReady) {
      return;
    }

    if (this.idCardPassLabel && this.idCardFailLabel) {
      if (this.idCardChoice === 'pass') {
        this.idCardPassLabel.string = '✓';
        this.idCardFailLabel.string = '';
      } else if (this.idCardChoice === 'fail') {
        this.idCardPassLabel.string = '';
        this.idCardFailLabel.string = '×';
      } else {
        this.idCardPassLabel.string = '';
        this.idCardFailLabel.string = '';
      }
    }

    if (this.applicationPassLabel && this.applicationFailLabel) {
      if (this.applicationChoice === 'pass') {
        this.applicationPassLabel.string = '✓';
        this.applicationFailLabel.string = '';
      } else if (this.applicationChoice === 'fail') {
        this.applicationPassLabel.string = '';
        this.applicationFailLabel.string = '×';
      } else {
        this.applicationPassLabel.string = '';
        this.applicationFailLabel.string = '';
      }
    }

    if (this.appearancePassLabel && this.appearanceFailLabel) {
      if (this.appearanceChoice === 'pass') {
        this.appearancePassLabel.string = '✓';
        this.appearanceFailLabel.string = '';
      } else if (this.appearanceChoice === 'fail') {
        this.appearancePassLabel.string = '';
        this.appearanceFailLabel.string = '×';
      } else {
        this.appearancePassLabel.string = '';
        this.appearanceFailLabel.string = '';
      }
    }

    this.syncCarterQuestionProgressByChecklistState();
    this.refreshChecklistActionState();
  }

  private refreshChecklistActionState(): void {
    if (!this.checklistInteractionReady || !this.checklistActionTextNode || !this.checklistActionLabel) {
      return;
    }

    const hasFail =
      this.idCardChoice === 'fail' ||
      this.applicationChoice === 'fail' ||
      this.appearanceChoice === 'fail';
    const allPass =
      this.idCardChoice === 'pass' &&
      this.applicationChoice === 'pass' &&
      this.appearanceChoice === 'pass';
    let actionMode: ChecklistActionMode = 'question';
    if (hasFail) {
      actionMode = 'reject';
    } else if (allPass) {
      actionMode = 'pass';
    }
    this.checklistActionMode = actionMode;
    this.checklistActionTextNode.active = true;
    if (actionMode === 'pass') {
      if (this.checklistActionHit) {
        this.checklistActionHit.active =
          !this.checklistQuestionPanelOpen &&
          !this.checklistReplyPanelOpen &&
          !this.threatSequenceActive &&
          !this.carterEncounterResolved &&
          !this.inspectionDecisionResolutionInProgress;
      }
      if (this.checklistActionButton) {
        this.checklistActionButton.interactable = true;
      }
      this.checklistActionLabel.string = 'PASS';
      this.checklistActionLabel.color = new Color(42, 190, 77, 255);
      return;
    }

    if (actionMode === 'question') {
      if (this.checklistActionHit) {
        this.checklistActionHit.active =
          this.checklistQuestionUiReady && !this.checklistQuestionPanelOpen && !this.checklistReplyPanelOpen;
      }
      if (this.checklistActionButton) {
        this.checklistActionButton.interactable = true;
      }
      this.checklistActionLabel.string = 'QUESTION';
      this.checklistActionLabel.color = new Color(245, 240, 224, 255);
      return;
    }

    if (actionMode === 'reject') {
      if (this.checklistActionHit) {
        this.checklistActionHit.active =
          !this.checklistQuestionPanelOpen &&
          !this.checklistReplyPanelOpen &&
          !this.threatSequenceActive &&
          !this.carterEncounterResolved &&
          !this.rejectFlowRequested;
      }
      if (this.checklistActionButton) {
        this.checklistActionButton.interactable = true;
      }
      this.checklistActionLabel.string = 'REJECT';
      this.checklistActionLabel.color = new Color(218, 49, 45, 255);
      return;
    }

    if (this.checklistActionHit) {
      this.checklistActionHit.active = false;
    }
    if (this.checklistActionButton) {
      this.checklistActionButton.interactable = false;
    }
    this.checklistActionLabel.string = '';
  }

  private handleChecklistActionTriggered(): void {
    if (this.checklistActionMode === 'question') {
      this.openChecklistQuestionPanel();
      return;
    }
    if (this.checklistActionMode === 'reject') {
      this.requestRejectDecision('checklist-reject');
      return;
    }
    if (this.checklistActionMode === 'pass') {
      this.requestAllowDecision('checklist-pass');
    }
  }

  private drawChecklistQuestionUi(): void {
    if (!this.checklistQuestionScrimGraphics) {
      return;
    }

    this.checklistQuestionScrimGraphics.clear();
    this.checklistQuestionScrimGraphics.fillColor = new Color(0, 0, 0, 145);
    this.checklistQuestionScrimGraphics.rect(-360, -640, 720, 1280);
    this.checklistQuestionScrimGraphics.fill();

    const optionNodes = [
      this.questionAppearanceOption,
      this.questionIdCardOption,
      this.questionApplicationOption,
      this.questionNoIssueOption,
    ];

    for (const optionNode of optionNodes) {
      const graphics = optionNode?.getComponent(Graphics) ?? null;
      if (!graphics) {
        continue;
      }
      graphics.clear();
      graphics.fillColor = new Color(247, 245, 239, 255);
      graphics.rect(-335, -32, 670, 64);
      graphics.fill();
      graphics.lineWidth = 2;
      graphics.strokeColor = new Color(25, 23, 20, 255);
      graphics.rect(-335, -32, 670, 64);
      graphics.stroke();
    }
  }

  private drawChecklistReplyUi(): void {
    if (!this.checklistReplyScrimGraphics || !this.checklistReplyBoxGraphics) {
      return;
    }

    const baselineY = -470;
    const boxWidth = 680;
    const boxHeight = 110;
    const textWidth = 620;
    const textHeight = 72;
    const hintX = 228;
    const hintY = -34;

    if (this.checklistReplyBox?.isValid) {
      const boxPos = this.checklistReplyBox.position;
      this.checklistReplyBox.setPosition(boxPos.x, baselineY, boxPos.z);
      const boxTransform = this.checklistReplyBox.getComponent(UITransform);
      boxTransform?.setContentSize(boxWidth, boxHeight);
    }
    if (this.checklistReplyContinueHit?.isValid) {
      const continuePos = this.checklistReplyContinueHit.position;
      this.checklistReplyContinueHit.setPosition(continuePos.x, baselineY, continuePos.z);
      const continueTransform = this.checklistReplyContinueHit.getComponent(UITransform);
      continueTransform?.setContentSize(boxWidth, boxHeight);
    }
    if (this.checklistReplyTextNode?.isValid) {
      const textPos = this.checklistReplyTextNode.position;
      this.checklistReplyTextNode.setPosition(textPos.x, 0, textPos.z);
      const textTransform = this.checklistReplyTextNode.getComponent(UITransform);
      textTransform?.setContentSize(textWidth, textHeight);
    }

    this.checklistReplyScrimGraphics.clear();
    this.checklistReplyScrimGraphics.fillColor = new Color(0, 0, 0, 0);
    this.checklistReplyScrimGraphics.rect(-360, -640, 720, 1280);
    this.checklistReplyScrimGraphics.fill();

    this.checklistReplyBoxGraphics.clear();
    this.checklistReplyBoxGraphics.fillColor = Color.WHITE;
    this.checklistReplyBoxGraphics.strokeColor = Color.BLACK;
    this.checklistReplyBoxGraphics.lineWidth = 4;
    this.checklistReplyBoxGraphics.rect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
    this.checklistReplyBoxGraphics.fill();
    this.checklistReplyBoxGraphics.stroke();

    if (this.checklistReplyContinueHintNode) {
      const hintPos = this.checklistReplyContinueHintNode.position;
      this.checklistReplyContinueHintNode.setPosition(hintX, hintY, hintPos.z);
    }
  }

  private isChecklistQuestionState(): boolean {
    const hasFail =
      this.idCardChoice === 'fail' ||
      this.applicationChoice === 'fail' ||
      this.appearanceChoice === 'fail';
    const allPass =
      this.idCardChoice === 'pass' &&
      this.applicationChoice === 'pass' &&
      this.appearanceChoice === 'pass';

    return !hasFail && !allPass;
  }

  private openChecklistQuestionPanel(): void {
    if (!this.checklistQuestionUiReady) {
      return;
    }
    if (this.checklistQuestionPanelOpen) {
      return;
    }
    if (!this.isChecklistQuestionState() || !this.checklistQuestionPanelRuntime) {
      return;
    }

    this.checklistQuestionPanelRuntime.active = true;
    this.checklistQuestionPanelOpen = true;
    if (this.checklistActionHit) {
      this.checklistActionHit.active = false;
    }
  }

  private closeChecklistQuestionPanel(): void {
    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    this.refreshChecklistActionState();
  }

  private selectAppearanceQuestion(): void {
    if (!this.checklistQuestionUiReady || !this.checklistReplyUiReady) {
      return;
    }
    if (this.shouldUseCarterNervousReplyForAppearanceQuestion()) {
      this.showCarterNervousReplyForAppearanceQuestion();
      return;
    }
    this.showChecklistReply('appearance');
  }

  private shouldUseCarterNervousReplyForAppearanceQuestion(): boolean {
    return (
      !!this.node?.isValid &&
      !this.isDestroying &&
      this.isCurrentVisitorCarter() &&
      !this.carterEncounterResolved &&
      !this.threatSequenceActive &&
      !this.carterAttackTriggered &&
      !this.rejectFlowRequested
    );
  }

  private showCarterNervousReplyForAppearanceQuestion(): void {
    this.selectedChecklistQuestion = 'appearance';
    this.anxiousReplyShown = true;
    this.showChecklistReplyWithContext(this.pickNervousReply(), 'nervous', true, true, true);
  }

  private selectIdCardQuestion(): void {
    if (!this.checklistQuestionUiReady || !this.checklistReplyUiReady) {
      return;
    }
    this.showChecklistReply('id_card');
  }

  private selectApplicationQuestion(): void {
    if (!this.checklistQuestionUiReady || !this.checklistReplyUiReady) {
      return;
    }
    this.showChecklistReply('application');
  }

  private selectNoIssueQuestion(): void {
    if (!this.checklistQuestionUiReady) {
      return;
    }

    this.selectedChecklistQuestion = null;
    this.closeChecklistQuestionPanel();
  }

  private getNormalChecklistReply(question: Exclude<ChecklistQuestion, null>): string {
    if (question === 'application' && this.activeInspectionSubjectId === 'ethan') {
      return this.pickEthanApplicationReply();
    }
    return NORMAL_CHECKLIST_REPLIES[question];
  }

  private showChecklistReply(question: Exclude<ChecklistQuestion, null>): void {
    if (
      !this.checklistReplyUiReady ||
      !this.checklistReplyPanelRuntime ||
      !this.checklistReplyLabel ||
      !this.evidencePreviewRuntime ||
      !this.screeningChecklistDetailVisual
    ) {
      return;
    }

    this.selectedChecklistQuestion = question;
    this.checklistReplyContext = 'normal';
    this.configureChecklistReplyOverlay(true, true);

    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }

    this.checklistQuestionPanelOpen = false;
    this.screeningChecklistDetailVisual.active = false;
    this.evidencePreviewRuntime.active = false;
    this.checklistReplyPanelRuntime.active = true;
    this.checklistReplyPanelOpen = true;
    this.previewOpen = true;
    this.setManagedButtonsInteractable(false);
    this.startChecklistReplyTyping(this.getNormalChecklistReply(question));
  }

  private closeChecklistReply(): void {
    if (!this.checklistReplyPanelOpen) {
      return;
    }
    if (this.checklistReplyTyping) {
      this.finishChecklistReplyTyping();
      return;
    }
    if (!this.checklistReplyCanClose) {
      return;
    }

    const closedContext = this.checklistReplyContext;

    if (this.checklistReplyPanelRuntime) {
      this.checklistReplyPanelRuntime.active = false;
    }

    this.checklistReplyPanelOpen = false;
    this.stopChecklistReplyTyping(true);
    this.configureChecklistReplyOverlay(true, true);
    this.checklistReplyContext = 'normal';
    this.selectedChecklistQuestion = null;

    this.checklistQuestionPanelOpen = false;
    if (
      closedContext === 'nervous' &&
      this.isCurrentVisitorCarter() &&
      !this.carterEncounterResolved
    ) {
      this.carterAppearanceQuestionAsked = true;
      this.rejectFlowRequested = false;
      this.restoreChecklistInspectionState();
      this.refreshChecklistActionState();
      return;
    }

    if (this.evidencePreviewRuntime) {
      this.evidencePreviewRuntime.active = false;
    }
    if (this.screeningChecklistDetailVisual) {
      this.screeningChecklistDetailVisual.active = false;
    }
    this.setManagedButtonsInteractable(true);
    this.previewOpen = false;
  }

  private restoreChecklistInspectionState(): void {
    if (
      !this.evidencePreviewRuntime ||
      !this.screeningChecklistDetailVisual ||
      !this.employeeCardDetailVisual ||
      !this.applicationFormDetailVisual
    ) {
      return;
    }
    this.drawScrim(170);
    this.evidencePreviewRuntime.active = true;
    this.employeeCardDetailVisual.active = false;
    this.applicationFormDetailVisual.active = false;
    this.screeningChecklistDetailVisual.active = true;
    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    this.setManagedButtonsInteractable(false);
    this.previewOpen = true;
  }

  private startChecklistReplyTyping(fullText: string): void {
    this.unschedule(this.stepChecklistReplyTyping);
    this.checklistReplyFullText = fullText;
    this.checklistReplyTypedLength = 0;
    this.checklistReplyTyping = true;
    this.checklistReplyCanClose = false;
    if (this.checklistReplyLabel) {
      this.checklistReplyLabel.string = '';
    }
    if (this.checklistReplyContinueHintNode) {
      this.checklistReplyContinueHintNode.active = false;
    }
    if (this.checklistReplyFullText.length === 0) {
      this.finishChecklistReplyTyping();
      return;
    }
    this.schedule(this.stepChecklistReplyTyping, this.checklistReplyTypingInterval);
  }

  private stepChecklistReplyTyping = (): void => {
    if (!this.checklistReplyLabel) {
      this.finishChecklistReplyTyping();
      return;
    }

    this.checklistReplyTypedLength += 1;
    this.checklistReplyLabel.string = this.checklistReplyFullText.slice(0, this.checklistReplyTypedLength);

    if (this.checklistReplyTypedLength >= this.checklistReplyFullText.length) {
      this.finishChecklistReplyTyping();
    }
  };

  private finishChecklistReplyTyping(): void {
    this.unschedule(this.stepChecklistReplyTyping);
    this.checklistReplyTyping = false;
    this.checklistReplyCanClose = true;
    this.checklistReplyTypedLength = this.checklistReplyFullText.length;
    if (this.checklistReplyLabel) {
      this.checklistReplyLabel.string = this.checklistReplyFullText;
    }
    if (this.checklistReplyContinueHintNode) {
      this.checklistReplyContinueHintNode.active = true;
    }
  }

  private stopChecklistReplyTyping(clearText: boolean): void {
    this.unschedule(this.stepChecklistReplyTyping);
    this.checklistReplyTyping = false;
    this.checklistReplyCanClose = false;
    this.checklistReplyFullText = '';
    this.checklistReplyTypedLength = 0;
    if (this.checklistReplyContinueHintNode) {
      this.checklistReplyContinueHintNode.active = false;
    }
    if (clearText && this.checklistReplyLabel) {
      this.checklistReplyLabel.string = '';
    }
  }

  private isActiveSubjectChecklistPatternMatched(): boolean {
    const definition = this.getActiveInspectionSubjectDefinition();
    if (!definition) {
      return false;
    }
    const idCardMatch = definition.truth.employeeCardPass
      ? this.idCardChoice === 'pass'
      : this.idCardChoice === 'fail';
    const applicationMatch = definition.truth.applicationPass
      ? this.applicationChoice === 'pass'
      : this.applicationChoice === 'fail';
    const appearanceMatch = definition.truth.appearancePass
      ? this.appearanceChoice === 'pass'
      : this.appearanceChoice === 'fail';
    return idCardMatch && applicationMatch && appearanceMatch;
  }

  private isChecklistComplete(): boolean {
    return (
      this.idCardChoice !== 'unset' &&
      this.applicationChoice !== 'unset' &&
      this.appearanceChoice !== 'unset'
    );
  }

  private resolveInspectionDecisionOutcome(action: InspectionDecisionAction): InspectionDecisionOutcome {
    const subject = this.getActiveInspectionSubjectDefinition();
    if (!subject) {
      throw new Error('Active inspection subject definition is unavailable.');
    }
    const shouldAllow = this.isActiveSubjectActuallyEligibleForAllow();
    const rejectReasonCorrect = this.isActiveSubjectChecklistPatternMatched();
    const checklistComplete = this.isChecklistComplete();
    if (action === 'allow') {
      if (subject.entityKind === 'monster') {
        return 'monster-wrongly-allowed';
      }
      if (shouldAllow) {
        return 'valid-human-allowed';
      }
      return 'invalid-human-wrongly-allowed';
    }

    console.info(
      `[InspectionDecision] reject context: checklistComplete=${checklistComplete}, rejectReasonCorrect=${rejectReasonCorrect}`,
    );
    if (subject.entityKind === 'monster') {
      return rejectReasonCorrect ? 'monster-correctly-rejected' : 'monster-wrongly-rejected';
    }
    if (shouldAllow) {
      return 'valid-human-wrongly-rejected';
    }
    return rejectReasonCorrect
      ? 'invalid-human-correctly-rejected'
      : 'invalid-human-wrongly-rejected';
  }

  private isCurrentVisitorCarter(): boolean {
    return this.activeInspectionSubjectId === 'carter';
  }

  private syncCarterQuestionProgressByChecklistState(): void {
    if (this.isCurrentVisitorCarter()) {
      return;
    }
    this.carterAppearanceQuestionAsked = false;
    this.rejectFlowRequested = false;
    this.anxiousReplyShown = false;
  }

  private showChecklistReplyWithContext(
    fullText: string,
    context: ChecklistReplyContext,
    useTyping: boolean,
    allowClose: boolean,
    blockInput: boolean,
  ): void {
    if (
      !this.checklistReplyUiReady ||
      !this.checklistReplyPanelRuntime ||
      !this.checklistReplyLabel ||
      !this.evidencePreviewRuntime ||
      !this.screeningChecklistDetailVisual
    ) {
      return;
    }

    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    this.screeningChecklistDetailVisual.active = false;
    this.evidencePreviewRuntime.active = false;
    this.checklistReplyPanelRuntime.active = true;
    this.checklistReplyPanelOpen = true;
    this.previewOpen = true;
    this.checklistReplyContext = context;
    this.configureChecklistReplyOverlay(blockInput, allowClose);

    if (useTyping) {
      this.startChecklistReplyTyping(fullText);
      if (!allowClose) {
        this.checklistReplyCanClose = false;
      }
    } else {
      this.stopChecklistReplyTyping(false);
      this.checklistReplyFullText = fullText;
      this.checklistReplyTypedLength = fullText.length;
      this.checklistReplyTyping = false;
      this.checklistReplyCanClose = allowClose;
      this.checklistReplyLabel.string = fullText;
      if (this.checklistReplyContinueHintNode) {
        this.checklistReplyContinueHintNode.active = allowClose;
      }
    }
  }

  private configureChecklistReplyOverlay(blockInput: boolean, allowClose: boolean): void {
    if (this.checklistReplyScrimBlockInput) {
      this.checklistReplyScrimBlockInput.enabled = blockInput;
    }
    if (this.checklistReplyContinueHit) {
      this.checklistReplyContinueHit.active = allowClose;
    }
    if (this.checklistReplyContinueButton) {
      this.checklistReplyContinueButton.interactable = allowClose;
    }
    if (!allowClose && this.checklistReplyContinueHintNode) {
      this.checklistReplyContinueHintNode.active = false;
    }
  }

  private handleConsoleDenyClick(): void {
    this.requestRejectDecision('console-deny');
  }

  private readonly handleAllowDecisionClick = (): void => {
    this.requestAllowDecision('console-allow');
  };

  private requestAllowDecision(source: 'console-allow' | 'checklist-pass'): void {
    console.info(`[InspectionDecision] allow requested: ${source}`);
    if (!this.canStartAllowDecisionResolution(source)) {
      return;
    }
    console.info(`[InspectionDecision] resolution gate accepted: ${source}`);
    const token = this.beginDecisionResolution();
    if (source === 'checklist-pass') {
      this.hideChecklistPreviewForResolution();
    }
    this.lockAllEncounterInput();
    const outcome = this.resolveInspectionDecisionOutcome('allow');
    void this.handleInspectionDecisionOutcome(outcome, token).catch((error) => {
      console.error('[InspectionDecision] allow outcome handler failed.', error);
      this.abortDecisionResolutionSafely(token);
    });
  }

  private requestRejectDecision(source: CarterRejectFlowSource): void {
    console.info(`[InspectionDecision] reject requested: ${source}`);
    if (!this.canStartRejectDecisionResolution(source)) {
      return;
    }
    const token = this.beginDecisionResolution();
    if (source === 'checklist-reject') {
      this.hideChecklistPreviewForResolution();
    }
    this.lockAllEncounterInput();
    const outcome = this.resolveInspectionDecisionOutcome('reject');
    void this.handleInspectionDecisionOutcome(outcome, token).catch((error) => {
      console.error('[InspectionDecision] reject outcome handler failed.', error);
      this.abortDecisionResolutionSafely(token);
    });
  }

  private canStartAllowDecisionResolution(source: 'console-allow' | 'checklist-pass'): boolean {
    if (!this.node?.isValid || this.isDestroying) {
      return false;
    }
    if (this.inspectionDecisionResolutionInProgress || this.administrativeGameOverActive) {
      return false;
    }
    if (!this.getActiveInspectionSubjectDefinition()) {
      return false;
    }
    if (source === 'console-allow') {
      if (!this.allowHitButton?.node?.isValid || !this.allowHitButton.interactable) {
        return false;
      }
      if (
        this.previewOpen ||
        this.evidencePreviewRuntime?.active ||
        this.employeeCardDetailVisual?.active ||
        this.applicationFormDetailVisual?.active ||
        this.screeningChecklistDetailVisual?.active
      ) {
        return false;
      }
    }
    if (source === 'checklist-pass') {
      if (this.checklistActionMode !== 'pass') {
        return false;
      }
      if (!this.checklistActionButton?.node?.isValid || !this.checklistActionButton.interactable) {
        return false;
      }
      if (!this.checklistActionHit?.isValid || !this.checklistActionHit.active) {
        return false;
      }
      if (
        !this.evidencePreviewRuntime?.isValid ||
        !this.screeningChecklistDetailVisual?.isValid ||
        !this.previewOpen ||
        !this.evidencePreviewRuntime.active ||
        !this.screeningChecklistDetailVisual.active
      ) {
        return false;
      }
      if (this.employeeCardDetailVisual?.active || this.applicationFormDetailVisual?.active) {
        return false;
      }
    }
    if (this.checklistQuestionPanelOpen || this.checklistReplyPanelOpen) {
      return false;
    }
    if (this.checklistReplyContext !== 'normal') {
      return false;
    }
    if (this.visitorGreetingRuntime?.isValid && this.visitorGreetingRuntime.active) {
      return false;
    }
    if (
      this.threatSequenceActive ||
      this.emergencyWindowOpen ||
      this.phoneResponseWindowOpen ||
      this.phoneDialWindowOpen ||
      this.cleanupProgramActivated ||
      this.phoneEmergencyResolved
    ) {
      return false;
    }
    if (this.carterAttackTriggered || this.carterEncounterResolved) {
      return false;
    }
    if (this.retryLoadInProgress) {
      return false;
    }
    if (this.carterMonsterAttackRuntime?.isValid && this.carterMonsterAttackRuntime.active) {
      return false;
    }
    if (this.carterGameOverPanelRuntime?.isValid && this.carterGameOverPanelRuntime.active) {
      return false;
    }
    return true;
  }

  private canStartRejectDecisionResolution(source: CarterRejectFlowSource): boolean {
    if (!this.node?.isValid || this.isDestroying) {
      return false;
    }
    if (this.inspectionDecisionResolutionInProgress || this.administrativeGameOverActive) {
      return false;
    }
    if (!this.getActiveInspectionSubjectDefinition()) {
      return false;
    }
    if (source === 'console-deny') {
      if (!this.denyHitButton?.node?.isValid || !this.denyHitButton.interactable) {
        return false;
      }
      if (
        this.previewOpen ||
        this.evidencePreviewRuntime?.active ||
        this.employeeCardDetailVisual?.active ||
        this.applicationFormDetailVisual?.active ||
        this.screeningChecklistDetailVisual?.active
      ) {
        return false;
      }
    }
    if (source === 'checklist-reject') {
      if (this.checklistActionMode !== 'reject') {
        return false;
      }
      if (!this.checklistActionButton?.node?.isValid || !this.checklistActionButton.interactable) {
        return false;
      }
      if (!this.checklistActionHit?.isValid || !this.checklistActionHit.active) {
        return false;
      }
      if (
        !this.evidencePreviewRuntime?.isValid ||
        !this.screeningChecklistDetailVisual?.isValid ||
        !this.previewOpen ||
        !this.evidencePreviewRuntime.active ||
        !this.screeningChecklistDetailVisual.active
      ) {
        return false;
      }
      if (this.employeeCardDetailVisual?.active || this.applicationFormDetailVisual?.active) {
        return false;
      }
    }
    if (this.checklistQuestionPanelOpen || this.checklistReplyPanelOpen) {
      return false;
    }
    if (this.checklistReplyContext !== 'normal') {
      return false;
    }
    if (this.visitorGreetingRuntime?.isValid && this.visitorGreetingRuntime.active) {
      return false;
    }
    if (
      this.threatSequenceActive ||
      this.emergencyWindowOpen ||
      this.phoneResponseWindowOpen ||
      this.phoneDialWindowOpen ||
      this.cleanupProgramActivated ||
      this.phoneEmergencyResolved ||
      this.carterAttackTriggered ||
      this.carterEncounterResolved ||
      this.retryLoadInProgress
    ) {
      return false;
    }
    if (this.carterMonsterAttackRuntime?.isValid && this.carterMonsterAttackRuntime.active) {
      return false;
    }
    if (this.carterGameOverPanelRuntime?.isValid && this.carterGameOverPanelRuntime.active) {
      return false;
    }
    return true;
  }

  private beginDecisionResolution(): number {
    this.inspectionDecisionResolutionInProgress = true;
    this.decisionResolutionToken += 1;
    return this.decisionResolutionToken;
  }

  private isDecisionResolutionTokenActive(token: number): boolean {
    return this.inspectionDecisionResolutionInProgress && this.decisionResolutionToken === token;
  }

  private abortDecisionResolutionSafely(token: number): void {
    if (!this.isDecisionResolutionTokenActive(token)) {
      return;
    }
    this.inspectionDecisionResolutionInProgress = false;
    this.setManagedButtonsInteractable(true);
    this.telephoneController?.setTelephoneEntryEnabled(true);
    this.shutterController?.setInteractionEnabled(true);
  }

  private async showDecisionDialogue(
    text: string,
    options: {
      autoCloseSeconds: number;
      allowTapDismiss: boolean;
      minimumVisibleSeconds?: number;
      messageKind?: 'dialogue' | 'complaint' | 'system';
    },
  ): Promise<void> {
    if (!this.visitorIntroController) {
      console.error('[InspectionDecision] VisitorIntroSequenceController is unavailable for dialogue.');
      return;
    }
    await this.visitorIntroController.showVisitorDialogue(text, options);
  }

  private pickRandomDialogue(pool: readonly string[]): string {
    if (pool.length === 0) {
      return '...';
    }
    const index = Math.floor(Math.random() * pool.length);
    return pool[index] ?? '...';
  }

  private buildAdministrativeGameOverContent(reason: AdministrativeGameOverReason): {
    title: string;
    message: string;
  } {
    switch (reason) {
      case 'multiple-formal-complaints':
        return {
          title: 'TERMINATED',
          message:
            'MULTIPLE FORMAL COMPLAINTS\n\nMultiple visitors filed formal complaints regarding your conduct.\nYour security clearance has been revoked.',
        };
      case 'repeated-procedural-violations':
        return {
          title: 'TERMINATED',
          message:
            'REPEATED PROCEDURAL VIOLATIONS\n\nYou repeatedly admitted personnel with invalid documentation.\nYour security authorization has been revoked.',
        };
      case 'internal-contamination':
        return {
          title: 'FACILITY COMPROMISED',
          message:
            'INTERNAL CONTAMINATION\n\nThree infected intruders entered under your authorization.\nContainment has failed. The facility is no longer secure.',
        };
      default: {
        const exhaustiveCheck: never = reason;
        return {
          title: 'TERMINATED',
          message: `${exhaustiveCheck}`,
        };
      }
    }
  }

  private showAdministrativeGameOver(reason: AdministrativeGameOverReason): void {
    this.administrativeGameOverActive = true;
    this.lockAllEncounterInput();
    this.hideCarterThreatReplyCompletely();
    this.stopChecklistReplyTyping(true);
    this.closePreview();
    this.telephoneController?.closeEmergencyPhone();
    this.telephoneController?.setTelephoneEntryEnabled(false);
    this.telephoneController?.setEmergencyInputEnabled(false);
    this.shutterController?.setInteractionEnabled(false);
    this.shutterController?.stopShutterImpactLoop();
    this.shutterController?.restoreNormalVisual();

    if (this.carterMonsterAttackRuntime?.isValid) {
      this.carterMonsterAttackRuntime.active = true;
    }
    if (this.carterMonsterFullbodyVisual?.isValid) {
      this.carterMonsterFullbodyVisual.active = false;
    }
    if (this.carterMonsterPortraitSource?.isValid) {
      this.carterMonsterPortraitSource.active = false;
    }
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = true;
    }

    const { title, message } = this.buildAdministrativeGameOverContent(reason);
    const titleLabel = this.carterGameOverTitleLabel?.getComponent(Label) ?? null;
    const messageLabel = this.carterGameOverMessageLabel?.getComponent(Label) ?? null;
    if (this.carterGameOverTitleLabel?.isValid) {
      this.carterGameOverTitleLabel.active = true;
    }
    if (this.carterGameOverMessageLabel?.isValid) {
      this.carterGameOverMessageLabel.active = true;
    }
    if (titleLabel) {
      titleLabel.string = title;
    }
    if (messageLabel) {
      messageLabel.string = message;
    }

    if (this.carterGameOverTitleVisual?.isValid) {
      this.carterGameOverTitleVisual.active = false;
    }
    if (this.carterGameOverReviveVisual?.isValid) {
      this.carterGameOverReviveVisual.active = false;
    }
    if (this.carterGameOverReviveHit?.isValid) {
      this.carterGameOverReviveHit.active = false;
    }
    if (this.carterGameOverReviveButton?.node?.isValid) {
      this.carterGameOverReviveButton.interactable = false;
    }
    if (this.carterGameOverRetryVisual?.isValid) {
      this.carterGameOverRetryVisual.active = true;
    }
    if (this.carterGameOverRetryHit?.isValid) {
      this.carterGameOverRetryHit.active = true;
    }
    if (this.carterGameOverRetryButton?.node?.isValid) {
      this.carterGameOverRetryButton.interactable = true;
    }
  }

  private async showSystemNotice(text: string): Promise<void> {
    // System notifications (FORMAL COMPLAINT FILED / SECURITY BREACH / etc.) must be silent.
    AudioManager.getInstance()?.stopVoice();
    await this.showDecisionDialogue(text, {
      autoCloseSeconds: 1.25,
      allowTapDismiss: false,
      minimumVisibleSeconds: 0,
      messageKind: 'system',
    });
  }

  private async completeNonCombatDecisionAndAdvance(): Promise<void> {
    this.hideCarterThreatReplyCompletely();
    this.stopChecklistReplyTyping(true);
    this.configureChecklistReplyOverlay(false, false);
    if (this.checklistQuestionPanelRuntime?.isValid) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    if (this.checklistReplyPanelRuntime?.isValid) {
      this.checklistReplyPanelRuntime.active = false;
    }
    if (this.evidencePreviewRuntime?.isValid) {
      this.evidencePreviewRuntime.active = false;
    }
    if (this.employeeCardDetailVisual?.isValid) {
      this.employeeCardDetailVisual.active = false;
    }
    if (this.applicationFormDetailVisual?.isValid) {
      this.applicationFormDetailVisual.active = false;
    }
    if (this.screeningChecklistDetailVisual?.isValid) {
      this.screeningChecklistDetailVisual.active = false;
    }
    if (this.visitorGreetingRuntime?.isValid) {
      this.visitorGreetingRuntime.active = false;
    }
    if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = false;
    }
    this.previewOpen = false;
    this.checklistQuestionPanelOpen = false;
    this.checklistReplyPanelOpen = false;
    this.checklistReplyContext = 'normal';
    this.selectedChecklistQuestion = null;
    this.resetChecklistState();
    this.refreshChecklistActionState();
    this.resetInspectionRoundForNextSubject();
    this.inspectionDecisionResolutionInProgress = true;

    const advanced = this.advanceToNextInspectionSubject();
    if (!advanced) {
      console.info('INSPECTION_SEQUENCE_COMPLETE');
      return;
    }
    if (!this.loadInspectionSubject(this.activeInspectionSubjectId)) {
      console.error('[InspectionDecision] transition failed: load next inspection subject failed');
      this.inspectionDecisionResolutionInProgress = false;
      return;
    }
    this.setManagedButtonsInteractable(false);
    const introStarted = this.playIntroForActiveSubject();
    if (!introStarted) {
      console.error('[InspectionDecision] transition failed: next intro start failed');
      this.inspectionDecisionResolutionInProgress = false;
    }
  }

  private async handleInspectionDecisionOutcome(
    outcome: InspectionDecisionOutcome,
    token: number,
  ): Promise<void> {
    const showStandardDialogue = async (pool: readonly string[]): Promise<void> => {
      await this.showDecisionDialogue(this.pickRandomDialogue(pool), {
        autoCloseSeconds: 1.8,
        allowTapDismiss: true,
        minimumVisibleSeconds: 0.35,
      });
    };
    const showComplaintDialogue = async (pool: readonly string[]): Promise<void> => {
      await this.showDecisionDialogue(this.pickRandomDialogue(pool), {
        autoCloseSeconds: 1.8,
        allowTapDismiss: true,
        minimumVisibleSeconds: 0.35,
        messageKind: 'complaint',
      });
    };

    switch (outcome) {
      case 'valid-human-allowed':
        await showStandardDialogue(this.validEmployeeAllowDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'valid-human-wrongly-rejected':
        await showComplaintDialogue(this.validEmployeeWrongRejectDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        this.complaintCount += 1;
        if (this.complaintCount >= 2) {
          this.showAdministrativeGameOver('multiple-formal-complaints');
          return;
        }
        await this.showSystemNotice(`FORMAL COMPLAINT FILED\n${this.complaintCount} / 2`);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'invalid-human-correctly-rejected':
        await showStandardDialogue(this.invalidDocumentEmployeeCorrectRejectDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'invalid-human-wrongly-rejected':
        await showComplaintDialogue(this.employeeWrongRejectReasonDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        this.complaintCount += 1;
        if (this.complaintCount >= 2) {
          this.showAdministrativeGameOver('multiple-formal-complaints');
          return;
        }
        await this.showSystemNotice(`FORMAL COMPLAINT FILED\n${this.complaintCount} / 2`);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'invalid-human-wrongly-allowed':
        await showStandardDialogue(this.validEmployeeAllowDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        this.procedureViolationCount += 1;
        if (this.procedureViolationCount >= 2) {
          this.showAdministrativeGameOver('repeated-procedural-violations');
          return;
        }
        await this.showSystemNotice(`PROTOCOL VIOLATION\n${this.procedureViolationCount} / 2`);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'monster-wrongly-allowed':
        await showStandardDialogue(this.monsterWrongAllowDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        this.infectedEntryCount += 1;
        if (this.infectedEntryCount >= 3) {
          this.showAdministrativeGameOver('internal-contamination');
          return;
        }
        await this.showSystemNotice(`SECURITY BREACH RECORDED\n${this.infectedEntryCount} / 3`);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'monster-correctly-rejected':
        await this.showDecisionDialogue(this.pickRandomDialogue(this.monsterExposedDialoguePool), {
          autoCloseSeconds: 1.05,
          allowTapDismiss: false,
          minimumVisibleSeconds: 0,
        });
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.showDecisionDialogue(this.pickRandomDialogue(this.monsterThreatDialoguePool), {
          autoCloseSeconds: 1.15,
          allowTapDismiss: false,
          minimumVisibleSeconds: 0,
        });
        if (!this.isDecisionResolutionTokenActive(token)) return;
        this.startCarterThreatSequence(false);
        return;
      case 'monster-wrongly-rejected':
        await showComplaintDialogue(this.monsterWrongRejectReasonDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        this.complaintCount += 1;
        if (this.complaintCount >= 2) {
          this.showAdministrativeGameOver('multiple-formal-complaints');
          return;
        }
        await this.showSystemNotice(`FORMAL COMPLAINT FILED\n${this.complaintCount} / 2`);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      default: {
        const exhaustiveCheck: never = outcome;
        throw new Error(`Unhandled inspection decision outcome: ${exhaustiveCheck}`);
      }
    }
  }

  private hideChecklistPreviewForResolution(): void {
    if (this.checklistActionHit?.isValid) {
      this.checklistActionHit.active = false;
    }
    if (this.screeningChecklistDetailVisual?.isValid) {
      this.screeningChecklistDetailVisual.active = false;
    }
    if (this.checklistQuestionPanelRuntime?.isValid) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    if (this.checklistReplyPanelRuntime?.isValid) {
      this.checklistReplyPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    this.checklistReplyPanelOpen = false;
    if (
      this.evidencePreviewRuntime?.isValid &&
      !this.employeeCardDetailVisual?.active &&
      !this.applicationFormDetailVisual?.active &&
      !this.screeningChecklistDetailVisual?.active
    ) {
      this.evidencePreviewRuntime.active = false;
    }
    this.previewOpen = false;
  }

  private isActiveSubjectActuallyEligibleForAllow(): boolean {
    const definition = this.getActiveInspectionSubjectDefinition();
    return Boolean(
      definition &&
      definition.truth.employeeCardPass &&
      definition.truth.applicationPass &&
      definition.truth.appearancePass
    );
  }

  private resolveCorrectAllowDecision(): void {
    this.carterEncounterResolved = true;
    this.threatSequenceActive = false;
    this.emergencyWindowOpen = false;
    this.emergencyShutterSucceeded = false;
    this.phoneResponseWindowOpen = false;
    this.phoneDialWindowOpen = false;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = true;
    this.carterAttackTriggered = false;
    this.emergencyDeadlineMs = 0;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialDeadlineMs = 0;
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDial1414Timeout);
    this.unschedule(this.handleShowCarterGameOver);
    this.unschedule(this.handleCleanupTransitionComplete);
    this.cleanupTransitionScheduled = false;
    this.delayedDamagedShutterSwitchScheduled = false;
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyShutterClosedSettledListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.shutterController?.stopShutterImpactLoop();
    this.shutterController?.restoreNormalVisual();
    this.shutterController?.prepareClosedForIntro();
    this.shutterController?.setInteractionEnabled(false);
    this.telephoneController?.closeEmergencyPhone();
    this.telephoneController?.setEmergencyInputEnabled(false);
    this.telephoneController?.setTelephoneEntryEnabled(false);

    this.hideCarterThreatReplyCompletely();
    this.stopChecklistReplyTyping(true);
    this.configureChecklistReplyOverlay(false, false);
    if (this.checklistQuestionPanelRuntime?.isValid) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    if (this.checklistReplyPanelRuntime?.isValid) {
      this.checklistReplyPanelRuntime.active = false;
    }
    if (this.evidencePreviewRuntime?.isValid) {
      this.evidencePreviewRuntime.active = false;
    }
    if (this.employeeCardDetailVisual?.isValid) {
      this.employeeCardDetailVisual.active = false;
    }
    if (this.applicationFormDetailVisual?.isValid) {
      this.applicationFormDetailVisual.active = false;
    }
    if (this.screeningChecklistDetailVisual?.isValid) {
      this.screeningChecklistDetailVisual.active = false;
    }
    this.previewOpen = false;
    this.checklistQuestionPanelOpen = false;
    this.checklistReplyPanelOpen = false;
    this.checklistReplyContext = 'normal';
    this.selectedChecklistQuestion = null;
    if (this.visitorGreetingRuntime?.isValid) {
      this.visitorGreetingRuntime.active = false;
    }
    if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = false;
    }
    this.resetChecklistState();
    this.refreshChecklistActionState();

    this.resetInspectionRoundForNextSubject();
    this.inspectionDecisionResolutionInProgress = true;

    const advanced = this.advanceToNextInspectionSubject();
    if (!advanced) {
      console.info('INSPECTION_SEQUENCE_COMPLETE');
      return;
    }
    if (!this.loadInspectionSubject(this.activeInspectionSubjectId)) {
      console.error('[InspectionDecision] allow transition failed: load next inspection subject failed');
      this.inspectionDecisionResolutionInProgress = false;
      return;
    }
    this.setManagedButtonsInteractable(false);
    const introStarted = this.playIntroForActiveSubject();
    if (!introStarted) {
      console.error('[InspectionDecision] allow transition failed: next intro start failed');
      this.inspectionDecisionResolutionInProgress = false;
    }
  }

  private triggerIncorrectAllowGameOver(): void {
    console.warn('[InspectionDecision] incorrect allow');
    this.lockAllEncounterInput();
    const monsterFullbody = this.getActiveMonsterFullbodyFrame();
    if (monsterFullbody && this.carterMonsterFullbodySprite) {
      this.carterMonsterFullbodySprite.spriteFrame = monsterFullbody;
      this.applyFullbodyContainSizing();
    }
    console.warn('[InspectionDecision] game over: incorrect-allow');
    this.triggerCarterBreakthroughFailure('incorrect-allow');
  }

  private requestCarterRejectFlow(source: CarterRejectFlowSource): void {
    this.requestRejectDecision(source);
  }

  private beginCarterRejectTransition(source: CarterRejectFlowSource): void {
    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;

    if (this.checklistReplyPanelRuntime) {
      this.checklistReplyPanelRuntime.active = false;
    }
    this.checklistReplyPanelOpen = false;
    this.stopChecklistReplyTyping(true);
    this.checklistReplyContext = 'normal';
    this.selectedChecklistQuestion = null;
    this.configureChecklistReplyOverlay(false, false);
    if (this.checklistReplyScrimBlockInput) {
      this.checklistReplyScrimBlockInput.enabled = false;
    }

    if (this.checklistActionHit) {
      this.checklistActionHit.active = false;
    }
    if (this.evidencePreviewRuntime) {
      this.evidencePreviewRuntime.active = false;
    }
    if (this.screeningChecklistDetailVisual) {
      this.screeningChecklistDetailVisual.active = false;
    }
    this.previewOpen = false;
    this.setManagedButtonsInteractable(true);

    this.startCarterThreatSequence();
    if (!this.threatSequenceActive) {
      this.warnRejectGate(source, 'startCarterThreatSequence returned before activation');
    }
  }

  private startCarterThreatSequence(showThreatDialogue: boolean = true): void {
    if (!this.isCurrentVisitorCarter()) {
      return;
    }
    if (
      !this.carterCharacterSprite ||
      !this.shutterController ||
      !this.getActiveMonsterPortraitFrame() ||
      !this.isActiveSubjectChecklistPatternMatched()
    ) {
      return;
    }
    if (this.carterEncounterResolved || this.threatSequenceActive) {
      return;
    }
    if (this.checklistReplyPanelOpen || this.checklistQuestionPanelOpen) {
      return;
    }
    if (this.checklistReplyContext !== 'normal') {
      return;
    }
    if (this.shutterController.isShutterClosed()) {
      console.warn(
        '[EvidencePreviewController] Carter threat sequence not started because shutter is already closed.',
      );
      return;
    }

    this.threatSequenceActive = true;
    this.emergencyWindowOpen = true;
    this.emergencyShutterSucceeded = false;
    this.carterAttackTriggered = false;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = false;
    this.phoneResponseWindowOpen = false;
    this.phoneDialWindowOpen = false;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialDeadlineMs = 0;
    this.emergencyDeadlineMs = Date.now() + this.emergencyCountdownSeconds * 1000;

    this.captureEncounterButtonStates();
    this.setOnlyShutterInteractable();
    this.shutterController.setInteractionEnabled(true);
    const monsterPortrait = this.getActiveMonsterPortraitFrame();
    if (!monsterPortrait) {
      return;
    }
    this.carterCharacterSprite.spriteFrame = monsterPortrait;
    this.applyCarterPortraitContainSize(monsterPortrait);
    if (showThreatDialogue) {
      this.showChecklistReplyWithContext(this.pickThreatReply(), 'threat', false, false, false);
    }
    this.bindEmergencyCloseListener();
    this.emergencyWindowOpen = true;
    this.unschedule(this.handleEmergencyTimeout);
    this.scheduleOnce(this.handleEmergencyTimeout, this.emergencyCountdownSeconds);
  }

  private warnRejectGate(source: CarterRejectFlowSource, reason: string): void {
    console.warn(`[EvidencePreviewController] requestCarterRejectFlow(${source}) blocked: ${reason}`);
  }

  private bindEmergencyCloseListener(): void {
    if (!this.shutterController || this.carterEmergencyCloseListenerRegistered) {
      return;
    }
    this.shutterController.addUserCloseAcceptedListener(this.handleCarterEmergencyCloseAccepted);
    this.carterEmergencyCloseListenerRegistered = true;
  }

  private unbindEmergencyCloseListener(): void {
    if (!this.shutterController || !this.carterEmergencyCloseListenerRegistered) {
      return;
    }
    this.shutterController.removeUserCloseAcceptedListener(this.handleCarterEmergencyCloseAccepted);
    this.carterEmergencyCloseListenerRegistered = false;
  }

  private bindEmergencyPhoneOpenedListener(): void {
    if (!this.telephoneController || this.emergencyPhoneOpenedListenerRegistered) {
      return;
    }
    this.telephoneController.addEmergencyPhoneOpenedListener(this.handleEmergencyPhoneOpened);
    this.emergencyPhoneOpenedListenerRegistered = true;
  }

  private unbindEmergencyPhoneOpenedListener(): void {
    if (!this.telephoneController || !this.emergencyPhoneOpenedListenerRegistered) {
      return;
    }
    this.telephoneController.removeEmergencyPhoneOpenedListener(this.handleEmergencyPhoneOpened);
    this.emergencyPhoneOpenedListenerRegistered = false;
  }

  private bindEmergencyCallSubmittedListener(): void {
    if (!this.telephoneController || this.emergencyCallSubmittedListenerRegistered) {
      return;
    }
    this.telephoneController.addCallSubmittedListener(this.handleEmergencyCallSubmitted);
    this.emergencyCallSubmittedListenerRegistered = true;
  }

  private unbindEmergencyCallSubmittedListener(): void {
    if (!this.telephoneController || !this.emergencyCallSubmittedListenerRegistered) {
      return;
    }
    this.telephoneController.removeCallSubmittedListener(this.handleEmergencyCallSubmitted);
    this.emergencyCallSubmittedListenerRegistered = false;
  }

  private bindEmergencyShutterClosedSettledListener(): void {
    if (!this.shutterController || this.emergencyShutterClosedSettledListenerRegistered) {
      return;
    }
    this.shutterController.addShutterClosedSettledListener(this.handleEmergencyShutterClosedSettled);
    this.emergencyShutterClosedSettledListenerRegistered = true;
  }

  private unbindEmergencyShutterClosedSettledListener(): void {
    if (!this.shutterController || !this.emergencyShutterClosedSettledListenerRegistered) {
      return;
    }
    this.shutterController.removeShutterClosedSettledListener(this.handleEmergencyShutterClosedSettled);
    this.emergencyShutterClosedSettledListenerRegistered = false;
  }

  private beginPhoneResponseWindow(): void {
    if (!this.telephoneController || !this.isCurrentVisitorCarter()) {
      this.triggerCarterBreakthroughFailure('phone-pickup-timeout');
      return;
    }
    console.info('[CarterEmergency] phone response window started');
    this.phoneResponseWindowOpen = true;
    this.phoneResponseDeadlineMs = Date.now() + this.phonePickupWindowSeconds * 1000;
    this.phoneDialWindowOpen = false;
    this.phoneDialDeadlineMs = 0;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = false;
    this.unbindEmergencyCallSubmittedListener();
    this.bindEmergencyPhoneOpenedListener();
    this.telephoneController.armEmergencyMode();
    this.telephoneController.setTelephoneEntryEnabled(true);
    this.setOnlyTelephoneInteractable();
    this.unschedule(this.handlePhonePickupTimeout);
    this.scheduleOnce(this.handlePhonePickupTimeout, this.phonePickupWindowSeconds);
  }

  private beginPhoneDialWindow(): void {
    if (!this.telephoneController || !this.isCurrentVisitorCarter()) {
      this.triggerCarterBreakthroughFailure('dial-timeout');
      return;
    }
    this.phoneDialWindowOpen = true;
    this.phoneDialDeadlineMs = Date.now() + this.phoneDialWindowSeconds * 1000;
    console.info('[CarterEmergency] dial window started');
    this.bindEmergencyCallSubmittedListener();
    this.telephoneController.setTelephoneEntryEnabled(false);
    this.telephoneController.resetDialInput();
    this.telephoneController.setEmergencyInputEnabled(true);
    this.unschedule(this.handleDial1414Timeout);
    this.scheduleOnce(this.handleDial1414Timeout, this.phoneDialWindowSeconds);
  }

  private activateCleanupProgram(): void {
    if (this.cleanupProgramActivated || this.phoneEmergencyResolved) {
      return;
    }
    AudioManager.getInstance()?.playCachedPhoneConnected();
    this.cleanupProgramActivated = true;
    this.phoneEmergencyResolved = true;
    this.phoneResponseWindowOpen = false;
    this.phoneDialWindowOpen = false;
    this.carterEncounterResolved = true;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialDeadlineMs = 0;
    this.emergencyDeadlineMs = 0;
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDial1414Timeout);
    this.delayedDamagedShutterSwitchScheduled = false;
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyShutterClosedSettledListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.shutterController?.stopShutterImpactLoop();
    const restored = this.shutterController?.restoreNormalVisual() ?? false;
    if (!restored) {
      console.warn('[EvidencePreviewController] Failed to restore normal shutter visual after cleanup.');
    }
    this.telephoneController?.setEmergencyInputEnabled(false);
    this.telephoneController?.setTelephoneEntryEnabled(false);
    this.telephoneController?.showEmergencyStatus('CLEANUP ACTIVE');
    this.shutterController?.setInteractionEnabled(false);
    if (this.telephoneController) {
      this.telephoneController.setEmergencyInputEnabled(false);
    }
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = false;
    }
    if (this.shutterHitButton?.node?.isValid) {
      this.shutterHitButton.interactable = false;
    }
    if (this.allowHitButton?.node?.isValid) {
      this.allowHitButton.interactable = false;
    }
    if (this.denyHitButton?.node?.isValid) {
      this.denyHitButton.interactable = false;
    }
    this.lockAllEncounterInput();
    console.info('CLEANUP PROGRAM ACTIVATED');
    console.info('THREAT ELIMINATED');
    this.completeCurrentInspectionSubjectAfterCleanup();
  }

  private completeCurrentInspectionSubjectAfterCleanup(): void {
    this.lockAllEncounterInput();
    if (this.cleanupTransitionScheduled) {
      return;
    }
    this.cleanupTransitionScheduled = true;
    this.unschedule(this.handleCleanupTransitionComplete);
    this.scheduleOnce(this.handleCleanupTransitionComplete, this.cleanupSuccessDisplaySeconds);
  }

  private triggerCarterBreakthroughFailure(reason: CarterBreakthroughFailureReason): void {
    if (this.carterAttackTriggered || this.cleanupProgramActivated) {
      return;
    }
    this.carterAttackTriggered = true;
    this.carterEncounterResolved = true;
    this.phoneEmergencyResolved = true;
    this.cleanupProgramActivated = false;
    this.threatSequenceActive = false;
    this.emergencyWindowOpen = false;
    this.phoneResponseWindowOpen = false;
    this.phoneDialWindowOpen = false;
    this.emergencyDeadlineMs = 0;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialDeadlineMs = 0;
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDial1414Timeout);
    this.unschedule(this.handleShowCarterGameOver);
    this.unschedule(this.handleCleanupTransitionComplete);
    this.cleanupTransitionScheduled = false;
    this.delayedDamagedShutterSwitchScheduled = false;
    this.inspectionDecisionResolutionInProgress = false;
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyShutterClosedSettledListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.shutterController?.stopShutterImpactLoop();
    this.telephoneController?.closeEmergencyPhone();
    this.telephoneController?.setTelephoneEntryEnabled(false);
    this.shutterController?.setInteractionEnabled(false);
    this.lockAllEncounterInput();
    this.administrativeGameOverActive = false;
    this.hideCarterThreatReplyCompletely();
    if (this.carterMonsterFullbodyVisual?.isValid) {
      this.carterMonsterFullbodyVisual.active = true;
    }
    this.applyFullbodyContainSizing();
    if (this.carterMonsterAttackRuntime?.isValid) {
      this.carterMonsterAttackRuntime.active = true;
    }
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = false;
    }
    if (this.carterGameOverTitleLabel?.isValid) {
      this.carterGameOverTitleLabel.active = false;
    }
    if (this.carterGameOverMessageLabel?.isValid) {
      this.carterGameOverMessageLabel.active = false;
    }
    if (this.carterGameOverTitleVisual?.isValid) {
      this.carterGameOverTitleVisual.active = true;
    }
    if (this.carterGameOverRetryVisual?.isValid) {
      this.carterGameOverRetryVisual.active = true;
    }
    if (this.carterGameOverRetryHit?.isValid) {
      this.carterGameOverRetryHit.active = true;
    }
    if (this.carterGameOverReviveVisual?.isValid) {
      this.carterGameOverReviveVisual.active = true;
    }
    if (this.carterGameOverReviveHit?.isValid) {
      this.carterGameOverReviveHit.active = true;
    }
    if (this.carterGameOverReviveButton?.node?.isValid) {
      this.carterGameOverReviveButton.interactable = true;
    }
    this.scheduleOnce(this.handleShowCarterGameOver, 0.3);
    console.warn(`[EvidencePreviewController] Carter breakthrough failure: ${reason}`);
  }

  private handleEmergencyTimeout = (): void => {
    this.triggerCarterBreakthroughFailure('shutter-timeout');
  };

  private resetCarterMonsterFlow(restoreButtons: boolean): void {
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDial1414Timeout);
    this.unschedule(this.handleShowCarterGameOver);
    this.unschedule(this.handleCleanupTransitionComplete);
    this.cleanupTransitionScheduled = false;
    this.delayedDamagedShutterSwitchScheduled = false;
    this.inspectionDecisionResolutionInProgress = false;
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyShutterClosedSettledListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.emergencyWindowOpen = false;
    this.emergencyShutterSucceeded = false;
    this.threatSequenceActive = false;
    this.carterAttackTriggered = false;
    this.emergencyDeadlineMs = 0;
    this.phoneResponseWindowOpen = false;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialWindowOpen = false;
    this.phoneDialDeadlineMs = 0;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = false;
    this.rejectFlowRequested = false;
    this.carterAppearanceQuestionAsked = false;
    this.carterEncounterResolved = false;
    this.anxiousReplyShown = false;

    this.hideCarterThreatReplyCompletely();
    if (this.telephoneController?.isValid) {
      this.telephoneController.closeEmergencyPhone();
      this.telephoneController.setTelephoneEntryEnabled(false);
    }
    if (this.shutterController?.isValid) {
      this.shutterController.stopShutterImpactLoop();
    }
    if (this.carterMonsterAttackRuntime?.isValid) {
      this.carterMonsterAttackRuntime.active = false;
    }
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = false;
    }
    if (this.carterCharacterSprite?.isValid) {
      this.carterCharacterSprite.spriteFrame = this.initialCarterSpriteFrame;
    }
    if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = true;
    }
    this.restoreCarterCharacterBaseSize();
    if (this.shutterController?.isValid) {
      this.shutterController.restoreNormalVisual();
      this.shutterController.setInteractionEnabled(this.getCachedButtonInteractable('BtnShutterHit'));
    }

    if (restoreButtons) {
      if (this.encounterButtonStateCache.size > 0) {
        this.restoreEncounterButtonStates();
      }
    }
    this.encounterButtonStateCache.clear();
  }

  private scheduleDamagedShutterAfterClosedHold(): void {
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.delayedDamagedShutterSwitchScheduled = true;
    console.info('[CarterEmergency] normal shutter hold started');
    this.scheduleOnce(this.handleDelayedDamagedShutterSwitch, this.damagedShutterHoldSeconds);
  }

  private bindDamagedShutterAppliedListener(): void {
    if (!this.shutterController || this.damagedShutterAppliedListenerRegistered) {
      return;
    }
    this.shutterController.addDamagedVisualAppliedListener(this.handleDamagedShutterApplied);
    this.damagedShutterAppliedListenerRegistered = true;
  }

  private unbindDamagedShutterAppliedListener(): void {
    if (!this.shutterController || !this.damagedShutterAppliedListenerRegistered) {
      return;
    }
    this.shutterController.removeDamagedVisualAppliedListener(this.handleDamagedShutterApplied);
    this.damagedShutterAppliedListenerRegistered = false;
  }

  private captureEncounterButtons(canvas: Node): void {
    this.allEncounterButtons.length = 0;
    const desk = this.node;
    const consoleControls = canvas.getChildByName('ConsoleControls');
    const closedRuntime = desk.getChildByName('EmployeeDrawersClosedRuntime');
    const nodeRefs: Array<Node | null> = [
      desk.getChildByName('EmployeeCardHit'),
      desk.getChildByName('ApplicationFormHit'),
      desk.getChildByName('ScreeningChecklistHit'),
      desk.getChildByName('TelephoneHit'),
      desk.getChildByName('AppointmentRosterHit'),
      closedRuntime?.getChildByName('EmployeeDrawer01Hit') ?? null,
      closedRuntime?.getChildByName('EmployeeDrawer02Hit') ?? null,
      closedRuntime?.getChildByName('EmployeeDrawer03Hit') ?? null,
      consoleControls?.getChildByName('BtnShutterHit') ?? null,
      consoleControls?.getChildByName('BtnAllowHit') ?? null,
      consoleControls?.getChildByName('BtnDenyHit') ?? null,
    ];

    for (const nodeRef of nodeRefs) {
      const button = nodeRef?.getComponent(Button) ?? null;
      if (!button) {
        continue;
      }
      this.allEncounterButtons.push(button);
    }
  }

  private captureEncounterButtonStates(): void {
    this.encounterButtonStateCache.clear();
    for (const button of this.allEncounterButtons) {
      this.encounterButtonStateCache.set(button, button.interactable);
    }
  }

  private restoreEncounterButtonStates(): void {
    for (const [button, interactable] of this.encounterButtonStateCache.entries()) {
      if (!button?.node?.isValid) {
        continue;
      }
      button.interactable = interactable;
    }
  }

  private setAllEncounterButtonsInteractable(interactable: boolean): void {
    for (const button of this.allEncounterButtons) {
      if (!button?.node?.isValid) {
        continue;
      }
      button.interactable = interactable;
    }
  }

  private setOnlyShutterInteractable(): void {
    this.setAllEncounterButtonsInteractable(false);
    if (this.shutterHitButton?.node?.isValid) {
      this.shutterHitButton.interactable = true;
    }
    this.telephoneController?.setTelephoneEntryEnabled(false);
  }

  private setOnlyTelephoneInteractable(): void {
    this.setAllEncounterButtonsInteractable(false);
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = true;
    }
    this.telephoneController?.setTelephoneEntryEnabled(true);
  }

  private lockAllEncounterInput(): void {
    this.setAllEncounterButtonsInteractable(false);
    this.telephoneController?.setTelephoneEntryEnabled(false);
    this.shutterController?.setInteractionEnabled(false);
  }

  private hideThreatReplyPanel(): void {
    if (this.checklistReplyContext !== 'threat') {
      return;
    }
    if (this.checklistReplyPanelRuntime?.isValid) {
      this.checklistReplyPanelRuntime.active = false;
    }
    this.checklistReplyPanelOpen = false;
    this.checklistReplyContext = 'normal';
    this.stopChecklistReplyTyping(true);
    this.configureChecklistReplyOverlay(true, true);
    this.previewOpen = false;
  }

  private hideCarterThreatReplyCompletely(): void {
    const wasVisible =
      this.checklistReplyContext === 'threat' ||
      this.checklistReplyPanelOpen ||
      !!this.checklistReplyPanelRuntime?.active;
    if (this.checklistReplyPanelRuntime?.isValid) {
      this.checklistReplyPanelRuntime.active = false;
    }
    if (this.checklistReplyScrim?.isValid) {
      this.checklistReplyScrim.active = false;
    }
    if (this.checklistReplyBox?.isValid) {
      this.checklistReplyBox.active = false;
    }
    if (this.checklistReplyContinueHit?.isValid) {
      this.checklistReplyContinueHit.active = false;
    }
    if (this.checklistReplyContinueButton) {
      this.checklistReplyContinueButton.interactable = false;
    }
    if (this.checklistReplyScrimBlockInput) {
      this.checklistReplyScrimBlockInput.enabled = false;
    }
    this.checklistReplyPanelOpen = false;
    this.checklistReplyContext = 'normal';
    this.stopChecklistReplyTyping(true);
    this.previewOpen = false;
    if (wasVisible) {
      console.info('[CarterEmergency] threat overlay hidden');
    }
  }

  private drawCarterAttackUi(): void {
    if (!this.carterAttackScrimGraphics) {
      return;
    }
    this.carterAttackScrimGraphics.clear();
    this.carterAttackScrimGraphics.fillColor = new Color(0, 0, 0, 170);
    this.carterAttackScrimGraphics.rect(-360, -640, 720, 1280);
    this.carterAttackScrimGraphics.fill();
  }

  private drawCarterGameOverPanelUi(): void {
    if (!this.carterGameOverPanelGraphics) {
      return;
    }
    this.carterGameOverPanelGraphics.clear();
    this.carterGameOverPanelGraphics.fillColor = new Color(18, 16, 14, 255);
    this.carterGameOverPanelGraphics.rect(-310, -110, 620, 220);
    this.carterGameOverPanelGraphics.fill();
    this.carterGameOverPanelGraphics.lineWidth = 5;
    this.carterGameOverPanelGraphics.strokeColor = new Color(247, 245, 239, 255);
    this.carterGameOverPanelGraphics.rect(-310, -110, 620, 220);
    this.carterGameOverPanelGraphics.stroke();
  }

  private captureCarterCharacterBaseSize(): void {
    if (!this.carterCharacterUi) {
      return;
    }
    this.carterCharacterBaseWidth = this.carterCharacterUi.contentSize.width;
    this.carterCharacterBaseHeight = this.carterCharacterUi.contentSize.height;
  }

  private applyCarterPortraitContainSize(frame: SpriteFrame | null): void {
    if (!this.carterCharacterUi || !frame) {
      return;
    }
    const baseWidth = this.carterCharacterBaseWidth;
    const baseHeight = this.carterCharacterBaseHeight;
    if (baseWidth <= 0 || baseHeight <= 0) {
      return;
    }
    const original = frame.originalSize;
    if (!original || original.width <= 0 || original.height <= 0) {
      return;
    }
    const scale = Math.min(baseWidth / original.width, baseHeight / original.height);
    this.carterCharacterUi.setContentSize(original.width * scale, original.height * scale);
  }

  private restoreCarterCharacterBaseSize(): void {
    // Scene unload may leave a stale UITransform whose _contentSize is already null.
    if (!this.carterCharacterUi?.isValid) {
      return;
    }
    if (this.carterCharacterBaseWidth <= 0 || this.carterCharacterBaseHeight <= 0) {
      return;
    }
    this.carterCharacterUi.setContentSize(this.carterCharacterBaseWidth, this.carterCharacterBaseHeight);
  }

  private ensureCarterGameOverFormalNodes(): void {
    if (!this.carterGameOverPanelRuntime) {
      return;
    }
    this.carterGameOverPanelVisual =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverPanelVisual') ??
      this.createGameOverVisualNode('CarterGameOverPanelVisual', this.carterGameOverPanelRuntime);
    this.carterGameOverTitleVisual =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverTitleVisual') ??
      this.createGameOverVisualNode('CarterGameOverTitleVisual', this.carterGameOverPanelRuntime);
    this.carterGameOverRetryVisual =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverRetryVisual') ??
      this.createGameOverVisualNode('CarterGameOverRetryVisual', this.carterGameOverPanelRuntime);
    this.carterGameOverReviveVisual =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverReviveVisual') ??
      this.createGameOverVisualNode('CarterGameOverReviveVisual', this.carterGameOverPanelRuntime);
    this.carterGameOverRetryHit =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverRetryHit') ??
      this.createGameOverHitNode('CarterGameOverRetryHit', this.carterGameOverPanelRuntime);
    this.carterGameOverReviveHit =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverReviveHit') ??
      this.createGameOverHitNode('CarterGameOverReviveHit', this.carterGameOverPanelRuntime);
    this.carterGameOverPanelSprite = this.carterGameOverPanelVisual?.getComponent(Sprite) ?? null;
    this.carterGameOverTitleSprite = this.carterGameOverTitleVisual?.getComponent(Sprite) ?? null;
    this.carterGameOverRetrySprite = this.carterGameOverRetryVisual?.getComponent(Sprite) ?? null;
    this.carterGameOverReviveSprite = this.carterGameOverReviveVisual?.getComponent(Sprite) ?? null;
    this.carterGameOverRetryButton = this.carterGameOverRetryHit?.getComponent(Button) ?? null;
    this.carterGameOverReviveButton = this.carterGameOverReviveHit?.getComponent(Button) ?? null;
  }

  private createGameOverVisualNode(name: string, parent: Node): Node {
    const node = new Node(name);
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(100, 100);
    node.addComponent(Sprite);
    return node;
  }

  private createGameOverHitNode(name: string, parent: Node): Node {
    const node = new Node(name);
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(300, 130);
    node.addComponent(Button);
    return node;
  }

  private prepareCarterGameOverFormalUi(): void {
    if (!this.carterGameOverPanelRuntime) {
      return;
    }
    this.carterGameOverUiReady =
      !!this.carterGameOverPanelVisual &&
      !!this.carterGameOverTitleVisual &&
      !!this.carterGameOverRetryVisual &&
      !!this.carterGameOverReviveVisual &&
      !!this.carterGameOverRetryHit &&
      !!this.carterGameOverReviveHit;
    if (!this.carterGameOverUiReady) {
      return;
    }
    this.carterGameOverPanelGraphics && (this.carterGameOverPanelGraphics.enabled = false);
    this.carterGameOverTitleLabel && (this.carterGameOverTitleLabel.active = false);
    this.carterGameOverMessageLabel && (this.carterGameOverMessageLabel.active = false);
    const blocker = this.carterGameOverPanelRuntime.getComponent(BlockInputEvents);
    if (!blocker) {
      this.carterGameOverPanelRuntime.addComponent(BlockInputEvents);
    }
    this.carterGameOverPanelRuntime.setPosition(0, -330, 0);
    this.carterGameOverPanelVisual!.setPosition(0, 0, 0);
    this.carterGameOverTitleVisual!.setPosition(0, 140, 0);
    this.carterGameOverRetryVisual!.setPosition(-125, -125, 0);
    this.carterGameOverReviveVisual!.setPosition(125, -125, 0);
    this.carterGameOverRetryHit!.setPosition(-125, -125, 0);
    this.carterGameOverReviveHit!.setPosition(125, -125, 0);
    this.carterGameOverRetryButton && (this.carterGameOverRetryButton.interactable = true);
    this.carterGameOverReviveButton && (this.carterGameOverReviveButton.interactable = true);
  }

  private async loadCarterGameOverFormalSprites(): Promise<void> {
    if (!this.carterGameOverUiReady) {
      return;
    }
    const [panelSf, titleSf, retrySf, reviveSf] = await Promise.all([
      this.loadSpriteFrameFromResources('ui/game/fail/ui_game_fail_panel/spriteFrame'),
      this.loadSpriteFrameFromResources('ui/game/fail/ui_game_fail_title/spriteFrame'),
      this.loadSpriteFrameFromResources('ui/game/fail/ui_game_fail_btn_retry/spriteFrame'),
      this.loadSpriteFrameFromResources('ui/game/fail/ui_game_fail_btn_revive/spriteFrame'),
    ]);
    if (panelSf && this.carterGameOverPanelSprite && this.carterGameOverPanelVisual) {
      this.carterGameOverPanelSprite.spriteFrame = panelSf;
      this.applyContainSize(this.carterGameOverPanelVisual, panelSf, 700, 560);
    }
    if (titleSf && this.carterGameOverTitleSprite && this.carterGameOverTitleVisual) {
      this.carterGameOverTitleSprite.spriteFrame = titleSf;
      this.applyContainSize(this.carterGameOverTitleVisual, titleSf, 560, 130);
    }
    if (retrySf && this.carterGameOverRetrySprite && this.carterGameOverRetryVisual) {
      this.carterGameOverRetrySprite.spriteFrame = retrySf;
      this.applySpriteFrameByTargetHeight(this.carterGameOverRetryVisual, retrySf, 92, 250);
      this.setNodeSize(this.carterGameOverRetryHit, 220, 122);
    }
    if (reviveSf && this.carterGameOverReviveSprite && this.carterGameOverReviveVisual) {
      this.carterGameOverReviveSprite.spriteFrame = reviveSf;
      this.applySpriteFrameByTargetHeight(this.carterGameOverReviveVisual, reviveSf, 92, 250);
      this.setNodeSize(this.carterGameOverReviveHit, 220, 122);
    }
  }

  private loadSpriteFrameFromResources(path: string): Promise<SpriteFrame | null> {
    return new Promise((resolve) => {
      resources.load(path, SpriteFrame, (error, asset) => {
        if (error) {
          console.warn(`[EvidencePreviewController] Failed to load sprite frame: ${path}`, error);
          resolve(null);
          return;
        }
        resolve(asset ?? null);
      });
    });
  }

  private applyContainSize(node: Node | null, frame: SpriteFrame, maxWidth: number, maxHeight: number): void {
    if (!node) {
      return;
    }
    const transform = node.getComponent(UITransform);
    if (!transform) {
      return;
    }
    const original = frame.originalSize;
    if (!original || original.width <= 0 || original.height <= 0) {
      return;
    }
    const scale = Math.min(maxWidth / original.width, maxHeight / original.height);
    transform.setContentSize(original.width * scale, original.height * scale);
  }

  private applySpriteFrameByTargetHeight(
    node: Node | null,
    spriteFrame: SpriteFrame,
    targetHeight: number,
    maxWidth: number,
  ): void {
    if (!node) {
      return;
    }
    const transform = node.getComponent(UITransform);
    if (!transform) {
      return;
    }
    const sourceWidth = spriteFrame.originalSize.width;
    const sourceHeight = spriteFrame.originalSize.height;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return;
    }

    let displayHeight = targetHeight;
    let displayWidth = (displayHeight * sourceWidth) / sourceHeight;
    if (displayWidth > maxWidth) {
      displayWidth = maxWidth;
      displayHeight = (displayWidth * sourceHeight) / sourceWidth;
    }
    transform.setContentSize(displayWidth, displayHeight);
  }

  private setNodeSize(node: Node | null, width: number, height: number): void {
    if (!node) {
      return;
    }
    const transform = node.getComponent(UITransform);
    if (!transform) {
      return;
    }
    transform.setContentSize(width, height);
  }

  private handleCarterGameOverRetryClick = (): void => {
    if (this.retryLoadInProgress) {
      return;
    }
    this.retryLoadInProgress = true;
    if (this.carterGameOverRetryButton?.node?.isValid) {
      this.carterGameOverRetryButton.interactable = false;
    }
    if (this.carterGameOverRetryHit?.isValid) {
      this.carterGameOverRetryHit.active = false;
    }
    director.loadScene('GameScene', (error) => {
      if (!error) {
        return;
      }
      console.error('[EvidencePreviewController] Failed to reload GameScene via Retry.', error);
      this.retryLoadInProgress = false;
      if (this.carterGameOverRetryButton?.node?.isValid) {
        this.carterGameOverRetryButton.interactable = true;
      }
      if (this.carterGameOverRetryHit?.isValid) {
        this.carterGameOverRetryHit.active = true;
      }
    });
  };

  private handleCarterGameOverReviveClick = (): void => {
    console.info('[EvidencePreviewController] Revive button clicked (UI placeholder, logic not yet connected).');
  };

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

  private applyFullbodyContainSizing(): void {
    if (this.isDestroying || !this.carterMonsterFullbodySprite || !this.carterMonsterFullbodyVisual) {
      return;
    }
    if (!this.carterMonsterFullbodyVisual.isValid) {
      return;
    }
    const frame = this.carterMonsterFullbodySprite.spriteFrame;
    if (!frame) {
      return;
    }
    const transform = this.carterMonsterFullbodyVisual.getComponent(UITransform);
    if (!transform) {
      return;
    }
    const sourceSize = this.resolveSpriteFrameSourceSize(frame);
    if (!sourceSize) {
      return;
    }
    const maxWidth = 520;
    const maxHeight = 960;
    const scale = Math.min(maxWidth / sourceSize.width, maxHeight / sourceSize.height);
    transform.setContentSize(sourceSize.width * scale, sourceSize.height * scale);
  }

  private pickNervousReply(): string {
    const { value, index } = this.pickNonRepeatingLine(
      this.carterAppearanceNervousReplies,
      this.lastNervousReplyIndex,
    );
    this.lastNervousReplyIndex = index;
    return value;
  }

  private pickThreatReply(): string {
    const { value, index } = this.pickNonRepeatingLine(this.carterThreatReplies, this.lastThreatReplyIndex);
    this.lastThreatReplyIndex = index;
    return value;
  }

  private pickEthanApplicationReply(): string {
    const { value, index } = this.pickNonRepeatingLine(
      this.ethanApplicationReplies,
      this.lastEthanApplicationReplyIndex,
    );
    this.lastEthanApplicationReplyIndex = index;
    return value;
  }

  private pickNonRepeatingLine(
    lines: readonly string[],
    lastIndex: number,
  ): { value: string; index: number } {
    if (lines.length <= 1) {
      return { value: lines[0] ?? '', index: lines.length === 0 ? -1 : 0 };
    }
    let next = Math.floor(Math.random() * lines.length);
    if (next === lastIndex) {
      next = (next + 1 + Math.floor(Math.random() * (lines.length - 1))) % lines.length;
    }
    return { value: lines[next], index: next };
  }

  private getCachedButtonInteractable(nodeName: string): boolean {
    for (const button of this.allEncounterButtons) {
      if (!button.node?.isValid || button.node.name !== nodeName) {
        continue;
      }
      return this.encounterButtonStateCache.get(button) ?? false;
    }
    return false;
  }

  private stabilizeChecklistCell(node: Node | null, label: Label | null): boolean {
    if (!node || !label) {
      return false;
    }

    const uiTransform = node.getComponent(UITransform);
    const button = node.getComponent(Button);

    if (!uiTransform || !button) {
      return false;
    }

    label.overflow = Overflow.CLAMP;
    label.enableWrapText = false;

    uiTransform.setContentSize(66, 66);

    button.interactable = true;

    return true;
  }

  private stabilizeChecklistCells(): boolean {
    return [
      this.stabilizeChecklistCell(this.idCardPassCell, this.idCardPassLabel),
      this.stabilizeChecklistCell(this.idCardFailCell, this.idCardFailLabel),
      this.stabilizeChecklistCell(this.applicationPassCell, this.applicationPassLabel),
      this.stabilizeChecklistCell(this.applicationFailCell, this.applicationFailLabel),
      this.stabilizeChecklistCell(this.appearancePassCell, this.appearancePassLabel),
      this.stabilizeChecklistCell(this.appearanceFailCell, this.appearanceFailLabel),
    ].every(Boolean);
  }

  private setManagedButtonsInteractable(interactable: boolean): void {
    for (const button of this.managedButtons) {
      button.interactable = interactable;
    }
  }

  private drawScrim(alpha: number): void {
    if (!this.previewScrimGraphics) {
      return;
    }

    this.previewScrimGraphics.clear();
    this.previewScrimGraphics.fillColor = new Color(0, 0, 0, alpha);
    this.previewScrimGraphics.rect(-360, -640, 720, 1280);
    this.previewScrimGraphics.fill();
  }

  private resolveEthanAssetSources(canvas: Node): void {
    const root = canvas.getChildByName('InspectionSubjectAssetSources');
    if (!root) {
      return;
    }
    this.ethanDisguisedFrame =
      root.getChildByName('EthanDisguisedSource')?.getComponent(Sprite)?.spriteFrame ?? null;
    this.ethanPortraitFrame =
      root.getChildByName('EthanPortraitSource')?.getComponent(Sprite)?.spriteFrame ?? null;
    this.ethanMonsterPortraitFrame =
      root.getChildByName('EthanMonsterPortraitSource')?.getComponent(Sprite)?.spriteFrame ?? null;
    this.ethanMonsterFullbodyFrame =
      root.getChildByName('EthanMonsterFullbodySource')?.getComponent(Sprite)?.spriteFrame ?? null;
    this.ethanEmployeeCardFrame =
      root.getChildByName('EthanEmployeeCardSource')?.getComponent(Sprite)?.spriteFrame ?? null;
    this.ethanApplicationFakeFrame =
      root.getChildByName('EthanApplicationFormFakeSource')?.getComponent(Sprite)?.spriteFrame ?? null;
  }

  private getActiveInspectionSubjectDefinition(): InspectionSubjectDefinition | null {
    if (
      !this.carterCharacterSprite ||
      !this.carterEmployeeCardFrame ||
      !this.carterApplicationFormFrame ||
      !this.carterMonsterPortraitFrame ||
      !this.carterMonsterFullbodyFrame ||
      !this.carterEmployeeFilePortraitFrame ||
      !this.ethanDisguisedFrame ||
      !this.ethanPortraitFrame ||
      !this.ethanMonsterPortraitFrame ||
      !this.ethanMonsterFullbodyFrame ||
      !this.ethanEmployeeCardFrame ||
      !this.ethanApplicationFakeFrame
    ) {
      return null;
    }
    const carterDisguised = this.initialCarterSpriteFrame ?? this.carterCharacterSprite.spriteFrame;
    if (!carterDisguised) {
      return null;
    }
    const carter: InspectionSubjectDefinition = {
      id: 'carter',
      entityKind: 'monster',
      displayName: 'Carter',
      employeeNumber: '017320',
      recordSource: 'employee-file',
      characterDisguisedFrame: carterDisguised,
      employeeFilePortraitFrame: this.carterEmployeeFilePortraitFrame,
      monsterPortraitFrame: this.carterMonsterPortraitFrame,
      monsterFullbodyFrame: this.carterMonsterFullbodyFrame,
      employeeCardFrame: this.carterEmployeeCardFrame,
      applicationFormFrame: this.carterApplicationFormFrame,
      truth: {
        employeeCardPass: true,
        applicationPass: true,
        appearancePass: false,
      },
      documentPresentation: {
        employeeCard: {
          employeeId: '017320',
          displayName: 'Carter',
          position: 'Researcher 101',
          validUntilTitle: 'Valid Until',
          validUntil: '2000/3/31',
        },
        applicationForm: {
          idNumber: '017320',
          displayName: 'Carter',
          position: 'Researcher 101',
          department: 'Research Department',
          validUntil: '2000/3/31',
          reasonForEntry: 'On Duty',
        },
      },
    };
    const ethan: InspectionSubjectDefinition = {
      id: 'ethan',
      entityKind: 'human',
      displayName: 'Ethan',
      employeeNumber: '867530',
      recordSource: 'employee-file',
      characterDisguisedFrame: this.ethanDisguisedFrame,
      employeeFilePortraitFrame: this.ethanPortraitFrame,
      monsterPortraitFrame: this.ethanMonsterPortraitFrame,
      monsterFullbodyFrame: this.ethanMonsterFullbodyFrame,
      employeeCardFrame: this.ethanEmployeeCardFrame,
      applicationFormFrame: this.ethanApplicationFakeFrame,
      truth: {
        employeeCardPass: true,
        applicationPass: false,
        appearancePass: true,
      },
    };
    return this.activeInspectionSubjectId === 'carter' ? carter : ethan;
  }

  private loadInspectionSubject(subjectId: InspectionSubjectId): boolean {
    this.activeInspectionSubjectId = subjectId;
    const def = this.getActiveInspectionSubjectDefinition();
    if (!def || !this.carterCharacterSprite || !this.carterCharacterUi) {
      return false;
    }
    this.carterCharacterSprite.spriteFrame = def.characterDisguisedFrame;
    this.applyCarterPortraitContainSize(def.characterDisguisedFrame);
    if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = true;
    }
    this.activeSubjectEmployeeCardDetailFrame = def.employeeCardFrame;
    this.activeSubjectApplicationDetailFrame = def.applicationFormFrame;
    if (this.employeeCardDetailVisual?.isValid) {
      const sprite = this.employeeCardDetailVisual.getComponent(Sprite);
      if (sprite && this.activeSubjectEmployeeCardDetailFrame) {
        sprite.spriteFrame = this.activeSubjectEmployeeCardDetailFrame;
      }
    }
    if (this.applicationFormDetailVisual?.isValid) {
      const sprite = this.applicationFormDetailVisual.getComponent(Sprite);
      if (sprite && this.activeSubjectApplicationDetailFrame) {
        sprite.spriteFrame = this.activeSubjectApplicationDetailFrame;
      }
    }
    this.syncActiveDocumentPresentation();
    if (!this.restoreStaticDeskEvidenceFrames()) {
      return false;
    }
    const activeMonsterPortrait = this.getActiveMonsterPortraitFrame();
    if (this.carterMonsterPortraitSprite && activeMonsterPortrait) {
      this.carterMonsterPortraitSprite.spriteFrame = activeMonsterPortrait;
    }
    const activeMonsterFullbody = this.getActiveMonsterFullbodyFrame();
    if (this.carterMonsterFullbodySprite && activeMonsterFullbody) {
      this.carterMonsterFullbodySprite.spriteFrame = activeMonsterFullbody;
      this.applyFullbodyContainSizing();
    }
    this.employeeFilesController?.setActiveInspectionSubject(subjectId);
    return true;
  }

  private setCarterDocumentLayersActive(active: boolean): void {
    if (this.carterEmployeeCardDynamicLayer?.isValid) {
      this.carterEmployeeCardDynamicLayer.active = active;
    }
    if (this.carterApplicationDynamicLayer?.isValid) {
      this.carterApplicationDynamicLayer.active = active;
    }
  }

  private applyEmployeeCardPresentation(presentation: EmployeeCardDocumentPresentation): void {
    if (this.employeeCardEmployeeIdValueLabel) {
      this.employeeCardEmployeeIdValueLabel.string = presentation.employeeId;
    }
    if (this.employeeCardNameValueLabel) {
      this.employeeCardNameValueLabel.string = presentation.displayName;
    }
    if (this.employeeCardPositionValueLabel) {
      this.employeeCardPositionValueLabel.string = presentation.position;
    }
    if (this.employeeCardValidUntilTitleLabel) {
      this.employeeCardValidUntilTitleLabel.string = presentation.validUntilTitle;
    }
    if (this.employeeCardValidUntilValueLabel) {
      this.employeeCardValidUntilValueLabel.string = presentation.validUntil;
    }
  }

  private applyApplicationFormPresentation(presentation: ApplicationFormDocumentPresentation): void {
    if (this.applicationIdNumberValueLabel) {
      this.applicationIdNumberValueLabel.string = presentation.idNumber;
    }
    if (this.applicationNameValueLabel) {
      this.applicationNameValueLabel.string = presentation.displayName;
    }
    if (this.applicationPositionValueLabel) {
      this.applicationPositionValueLabel.string = presentation.position;
    }
    if (this.applicationDepartmentValueLabel) {
      this.applicationDepartmentValueLabel.string = presentation.department;
    }
    if (this.applicationValidUntilValueLabel) {
      this.applicationValidUntilValueLabel.string = presentation.validUntil;
    }
    if (this.applicationReasonForEntryValueLabel) {
      this.applicationReasonForEntryValueLabel.string = presentation.reasonForEntry;
    }
  }

  private syncActiveDocumentPresentation(): void {
    const definition = this.getActiveInspectionSubjectDefinition();
    const isCarter = this.activeInspectionSubjectId === 'carter';
    const presentation = definition?.documentPresentation;
    if (!isCarter || !presentation) {
      this.setCarterDocumentLayersActive(false);
      return;
    }
    const bindingsReady = Boolean(
      this.carterEmployeeCardDynamicLayer &&
        this.carterApplicationDynamicLayer &&
        this.employeeCardEmployeeIdValueLabel &&
        this.employeeCardNameValueLabel &&
        this.employeeCardPositionValueLabel &&
        this.employeeCardValidUntilTitleLabel &&
        this.employeeCardValidUntilValueLabel &&
        this.employeeCardSecurityLogoSprite &&
        this.applicationIdNumberValueLabel &&
        this.applicationNameValueLabel &&
        this.applicationPositionValueLabel &&
        this.applicationDepartmentValueLabel &&
        this.applicationValidUntilValueLabel &&
        this.applicationReasonForEntryValueLabel &&
        this.applicationSecurityLogoSprite,
    );
    if (!bindingsReady) {
      this.setCarterDocumentLayersActive(false);
      if (!this.carterDocumentBindingErrorLogged) {
        this.carterDocumentBindingErrorLogged = true;
        console.error('[EvidencePreviewController] Carter document dynamic bindings are incomplete.');
      }
      return;
    }
    this.carterDocumentBindingErrorLogged = false;
    this.applyEmployeeCardPresentation(presentation.employeeCard);
    this.applyApplicationFormPresentation(presentation.applicationForm);
    this.setCarterDocumentLayersActive(true);
  }

  private restoreStaticDeskEvidenceFrames(): boolean {
    if (
      !this.defaultDeskEmployeeCardFrame ||
      !this.defaultDeskApplicationFormFrame ||
      !this.deskEmployeeCardSprite ||
      !this.deskApplicationFormSprite
    ) {
      return false;
    }
    this.deskEmployeeCardSprite.spriteFrame = this.defaultDeskEmployeeCardFrame;
    this.deskApplicationFormSprite.spriteFrame = this.defaultDeskApplicationFormFrame;
    return true;
  }

  private advanceToNextInspectionSubject(): boolean {
    const nextIndex = this.currentInspectionSubjectIndex + 1;
    if (nextIndex >= this.inspectionSequence.length) {
      return false;
    }
    this.currentInspectionSubjectIndex = nextIndex;
    this.activeInspectionSubjectId = this.inspectionSequence[nextIndex];
    return true;
  }

  private resetInspectionRoundForNextSubject(): void {
    this.rejectFlowRequested = false;
    this.threatSequenceActive = false;
    this.emergencyWindowOpen = false;
    this.emergencyDeadlineMs = 0;
    this.emergencyShutterSucceeded = false;
    this.carterAttackTriggered = false;
    this.carterEncounterResolved = false;
    this.phoneResponseWindowOpen = false;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialWindowOpen = false;
    this.phoneDialDeadlineMs = 0;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = false;
    this.delayedDamagedShutterSwitchScheduled = false;
    this.cleanupTransitionScheduled = false;
    this.inspectionDecisionResolutionInProgress = false;
    this.selectedChecklistQuestion = null;
    this.checklistQuestionPanelOpen = false;
    this.checklistReplyContext = 'normal';
    this.checklistReplyPanelOpen = false;
    this.previewOpen = false;
    this.unschedule(this.handleCleanupTransitionComplete);
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDial1414Timeout);
    this.unschedule(this.handleShowCarterGameOver);
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyShutterClosedSettledListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.shutterController?.stopShutterImpactLoop();
  }

  private resetChecklistState(): void {
    this.idCardChoice = 'unset';
    this.applicationChoice = 'unset';
    this.appearanceChoice = 'unset';
    this.selectedChecklistQuestion = null;
    this.refreshChecklistVisuals();
    this.refreshChecklistActionState();
  }

  private playIntroForActiveSubject(): boolean {
    if (!this.visitorIntroController) {
      return false;
    }
    const def = this.getActiveInspectionSubjectDefinition();
    if (!def) {
      return false;
    }
    const prepared = this.visitorIntroController.prepareInspectionSubject(def.characterDisguisedFrame);
    if (!prepared) {
      return false;
    }
    return this.visitorIntroController.playForInspectionSubject(() => {
      this.inspectionDecisionResolutionInProgress = false;
      this.setManagedButtonsInteractable(true);
      this.telephoneController?.setTelephoneEntryEnabled(true);
      this.shutterController?.setInteractionEnabled(true);
    });
  }

  private getActiveMonsterPortraitFrame(): SpriteFrame | null {
    const def = this.getActiveInspectionSubjectDefinition();
    return def?.monsterPortraitFrame ?? null;
  }

  private getActiveMonsterFullbodyFrame(): SpriteFrame | null {
    const def = this.getActiveInspectionSubjectDefinition();
    return def?.monsterFullbodyFrame ?? null;
  }
}
