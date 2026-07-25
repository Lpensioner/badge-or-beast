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
import { ShutterToggleController } from './ShutterToggleController';
import { TelephoneController } from './TelephoneController';

const { ccclass } = _decorator;

type ChecklistChoice = 'unset' | 'pass' | 'fail';
type ChecklistQuestion = 'appearance' | 'id_card' | 'application' | null;
type ChecklistReplyContext = 'normal' | 'nervous' | 'threat';
type VisitorId = 'carter';
type ChecklistActionMode = 'none' | 'pass' | 'question' | 'reject';
type CarterRejectFlowSource = 'checklist-reject' | 'console-deny';
type CarterBreakthroughFailureReason =
  | 'shutter-timeout'
  | 'damaged-visual-unavailable'
  | 'phone-pickup-timeout'
  | 'dial-timeout';
const NORMAL_CHECKLIST_REPLIES: Record<Exclude<ChecklistQuestion, null>, string> = {
  appearance: "I don't think there is a problem. Please compare it again.",
  id_card: 'My employee ID has never changed. Please check it again.',
  application: 'I filled out everything exactly as required. Please check it again.',
};

@ccclass('EvidencePreviewController')
export class EvidencePreviewController extends Component {
  // 当前第一位访客阶段固定为 Carter；
  // 未来接入 VisitorSession / VisitorQueue 时，应由统一访客状态替换该字段。
  private readonly activeVisitorId: VisitorId = 'carter';
  private readonly emergencyCountdownSeconds = 3;
  private readonly phonePickupWindowSeconds = 3;
  private readonly phoneDialWindowSeconds = 5;
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
  private carterAttackScrimGraphics: Graphics | null = null;
  private carterGameOverPanelGraphics: Graphics | null = null;
  private carterEmergencyCloseListenerRegistered = false;

  private lastNervousReplyIndex = -1;
  private lastThreatReplyIndex = -1;
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
  private damagedShutterAppliedListenerRegistered = false;
  private isDestroying = false;

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
    this.bindDamagedShutterAppliedListener();
    const requestAccepted = this.shutterController?.requestDamagedVisualAfterClose() ?? false;
    if (!requestAccepted) {
      this.unbindDamagedShutterAppliedListener();
      console.error('[EvidencePreviewController] Failed to request damaged shutter visual.');
      this.triggerCarterBreakthroughFailure('damaged-visual-unavailable');
      return;
    }
  };

  private readonly handleDamagedShutterApplied = (): void => {
    if (!this.isCurrentVisitorCarter()) {
      this.unbindDamagedShutterAppliedListener();
      return;
    }
    if (
      this.carterEncounterResolved ||
      this.carterAttackTriggered ||
      this.cleanupProgramActivated ||
      this.phoneEmergencyResolved
    ) {
      this.unbindDamagedShutterAppliedListener();
      return;
    }
    if (!this.emergencyShutterSucceeded) {
      return;
    }
    this.unbindDamagedShutterAppliedListener();
    console.info('[CarterEmergency] damaged shutter applied');
    this.beginPhoneResponseWindow();
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
  }

  onEnable(): void {
    this.employeeCardHit?.on(Node.EventType.TOUCH_END, this.openEmployeeCard, this);
    this.applicationFormHit?.on(Node.EventType.TOUCH_END, this.openApplicationForm, this);
    this.screeningChecklistHit?.on(Node.EventType.TOUCH_END, this.openScreeningChecklist, this);
    this.employeeCardCloseHit?.on(Node.EventType.TOUCH_END, this.closePreview, this);
    this.applicationFormCloseHit?.on(Button.EventType.CLICK, this.closePreview, this);
    this.screeningChecklistCloseHit?.on(Button.EventType.CLICK, this.closePreview, this);
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
    this.carterGameOverRetryHit?.on(Button.EventType.CLICK, this.handleCarterGameOverRetryClick, this);
    this.carterGameOverReviveHit?.on(Button.EventType.CLICK, this.handleCarterGameOverReviveClick, this);
  }

  onDisable(): void {
    this.employeeCardHit?.off(Node.EventType.TOUCH_END, this.openEmployeeCard, this);
    this.applicationFormHit?.off(Node.EventType.TOUCH_END, this.openApplicationForm, this);
    this.screeningChecklistHit?.off(Node.EventType.TOUCH_END, this.openScreeningChecklist, this);
    this.employeeCardCloseHit?.off(Node.EventType.TOUCH_END, this.closePreview, this);
    this.applicationFormCloseHit?.off(Button.EventType.CLICK, this.closePreview, this);
    this.screeningChecklistCloseHit?.off(Button.EventType.CLICK, this.closePreview, this);
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
    this.carterGameOverRetryHit?.off(Button.EventType.CLICK, this.handleCarterGameOverRetryClick, this);
    this.carterGameOverReviveHit?.off(Button.EventType.CLICK, this.handleCarterGameOverReviveClick, this);
    this.resetCarterMonsterFlow(true);
  }

  onDestroy(): void {
    this.isDestroying = true;
    this.resetCarterMonsterFlow(true);
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
    this.idCardChoice = this.idCardChoice === 'pass' ? 'unset' : 'pass';
    this.refreshChecklistVisuals();
  }

  private selectIdCardFail(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.idCardChoice = this.idCardChoice === 'fail' ? 'unset' : 'fail';
    this.refreshChecklistVisuals();
  }

  private selectApplicationPass(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.applicationChoice = this.applicationChoice === 'pass' ? 'unset' : 'pass';
    this.refreshChecklistVisuals();
  }

  private selectApplicationFail(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.applicationChoice = this.applicationChoice === 'fail' ? 'unset' : 'fail';
    this.refreshChecklistVisuals();
  }

  private selectAppearancePass(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
    this.appearanceChoice = this.appearanceChoice === 'pass' ? 'unset' : 'pass';
    this.refreshChecklistVisuals();
  }

  private selectAppearanceFail(): void {
    if (!this.checklistInteractionReady) {
      return;
    }
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
        this.checklistActionHit.active = false;
      }
      if (this.checklistActionButton) {
        this.checklistActionButton.interactable = false;
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
      this.requestCarterRejectFlow('checklist-reject');
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

  private isCarterChecklistPatternMatched(): boolean {
    return (
      this.idCardChoice === 'pass' &&
      this.applicationChoice === 'pass' &&
      this.appearanceChoice === 'fail'
    );
  }

  private isCurrentVisitorCarter(): boolean {
    return this.activeVisitorId === 'carter';
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
    this.requestCarterRejectFlow('console-deny');
  }

  private requestCarterRejectFlow(source: CarterRejectFlowSource): void {
    if (!this.node?.isValid || this.isDestroying) {
      this.warnRejectGate(source, 'controller is not ready');
      return;
    }
    if (!this.isCurrentVisitorCarter()) {
      this.warnRejectGate(source, 'current visitor is not Carter');
      return;
    }
    if (!this.isCarterChecklistPatternMatched()) {
      this.warnRejectGate(source, 'checklist pattern is not PASS/PASS/FAIL');
      return;
    }
    if (this.carterEncounterResolved) {
      this.warnRejectGate(source, 'Carter encounter is already resolved');
      return;
    }
    if (this.threatSequenceActive) {
      this.warnRejectGate(source, 'threat sequence is already active');
      return;
    }
    if (this.carterAttackTriggered) {
      this.warnRejectGate(source, 'Carter attack has already been triggered');
      return;
    }
    if (this.rejectFlowRequested) {
      this.warnRejectGate(source, 'reject request is already in progress');
      return;
    }
    if (source === 'checklist-reject' && this.checklistActionMode !== 'reject') {
      this.warnRejectGate(source, `checklistActionMode is "${this.checklistActionMode}"`);
      return;
    }
    if (!this.shutterController || this.shutterController.isShutterClosed()) {
      this.warnRejectGate(source, 'shutter is already closed or unavailable');
      return;
    }

    this.rejectFlowRequested = true;
    this.beginCarterRejectTransition(source);
    if (!this.threatSequenceActive) {
      this.rejectFlowRequested = false;
      this.refreshChecklistActionState();
    }
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

  private startCarterThreatSequence(): void {
    if (!this.isCurrentVisitorCarter()) {
      return;
    }
    if (
      !this.carterCharacterSprite ||
      !this.shutterController ||
      !this.carterMonsterPortraitFrame ||
      !this.isCarterChecklistPatternMatched()
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
    this.carterCharacterSprite.spriteFrame = this.carterMonsterPortraitFrame;
    this.applyCarterPortraitContainSize(this.carterMonsterPortraitFrame);
    this.showChecklistReplyWithContext(this.pickThreatReply(), 'threat', false, false, false);
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
    this.cleanupProgramActivated = true;
    this.phoneEmergencyResolved = true;
    this.phoneResponseWindowOpen = false;
    this.phoneDialWindowOpen = false;
    this.carterEncounterResolved = true;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialDeadlineMs = 0;
    this.emergencyDeadlineMs = 0;
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDial1414Timeout);
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.telephoneController?.setEmergencyInputEnabled(false);
    this.telephoneController?.setTelephoneEntryEnabled(false);
    this.telephoneController?.showEmergencyStatus('CLEANUP ACTIVE');
    this.shutterController?.restoreNormalVisual();
    this.shutterController?.setInteractionEnabled(false);
    if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = false;
    }
    if (this.carterMonsterAttackRuntime?.isValid) {
      this.carterMonsterAttackRuntime.active = false;
    }
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = false;
    }
    this.lockAllEncounterInput();
    console.info('CLEANUP PROGRAM ACTIVATED');
    console.info('THREAT ELIMINATED');
    this.completeCurrentInspectionSubjectAfterCleanup();
  }

  private completeCurrentInspectionSubjectAfterCleanup(): void {
    this.lockAllEncounterInput();
    console.info('NEXT_INSPECTION_SUBJECT_DEFINITION_REQUIRED');
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
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDial1414Timeout);
    this.unschedule(this.handleShowCarterGameOver);
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.telephoneController?.closeEmergencyPhone();
    this.telephoneController?.setTelephoneEntryEnabled(false);
    this.shutterController?.setInteractionEnabled(false);
    this.lockAllEncounterInput();
    this.hideCarterThreatReplyCompletely();
    this.applyFullbodyContainSizing();
    if (this.carterMonsterAttackRuntime?.isValid) {
      this.carterMonsterAttackRuntime.active = true;
    }
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = false;
    }
    this.scheduleOnce(this.handleShowCarterGameOver, 0.3);
    console.warn(`[EvidencePreviewController] Carter breakthrough failure: ${reason}`);
  }

  private handleEmergencyTimeout = (): void => {
    this.triggerCarterBreakthroughFailure('shutter-timeout');
  };

  private resetCarterMonsterFlow(restoreButtons: boolean): void {
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDial1414Timeout);
    this.unschedule(this.handleShowCarterGameOver);
    this.unbindEmergencyCloseListener();
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
    this.telephoneController?.closeEmergencyPhone();
    this.telephoneController?.setTelephoneEntryEnabled(false);
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
    this.shutterController?.restoreNormalVisual();
    this.shutterController?.setInteractionEnabled(this.getCachedButtonInteractable('BtnShutterHit'));

    if (restoreButtons) {
      if (this.encounterButtonStateCache.size > 0) {
        this.restoreEncounterButtonStates();
      }
    }
    this.encounterButtonStateCache.clear();
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
    if (!this.carterCharacterUi) {
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
}
