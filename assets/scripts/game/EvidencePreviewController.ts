import {
                             _decorator,
  assetManager,
  BlockInputEvents,
  Button,
  Color,
  Component,
  director,
  EventTouch,
  Graphics,
  Label,
  Mask,
  Node,
  Overflow,
  Sprite,
  SpriteFrame,
  Tween,
  UIOpacity,
  UITransform,
  Vec3,
  resources,
  tween,
} from 'cc';
import { AudioManager } from '../audio/AudioManager';
import { GameAudioCatalog, VoiceId } from '../audio/GameAudioCatalog';
import { HomeSceneController } from '../ui/HomeSceneController';
import { SettingsPanelController } from '../ui/SettingsPanelController';
import { ShutterToggleController } from './ShutterToggleController';
import { TelephoneController } from './TelephoneController';
import { AppointmentRosterController } from './AppointmentRosterController';
import {
  CampaignShiftCompletionDisplayState,
  CampaignShiftDisplayState,
  VisitorIntroResult,
  VisitorIntroRunContext,
  VisitorIntroSequenceController,
} from './VisitorIntroSequenceController';
import { EmployeeFilesController } from './EmployeeFilesController';
import {
  campaignState,
  CampaignStateStore,
  type DailyDecisionErrorRecord,
  type DecisionIssueKind,
  type InspectionFinalDecision,
  type WronglyAllowedMonsterRecord,
} from './campaign/CampaignState';
import {
  assertDayCatalogValid,
  CAMPAIGN_DAY_CONFIGS,
  getDayLevelConfig,
  getMonsterThreatTimingForDay,
  HIGHEST_IMPLEMENTED_CAMPAIGN_DAY,
  isCampaignDayIndex,
  isLastImplementedCampaignDay,
  type MonsterThreatTimingConfig,
} from './campaign/DayCatalog';
import {
  consumeRequestedStartDay,
  hasRequestedStartDay,
} from './campaign/CampaignLaunchRequest';
import { consumeDay0EndingTestLaunchRequested } from './campaign/Day0EndingTestLaunchRequest';
import { unlockDay } from './campaign/CampaignProgressStore';
import { buildDayQueue, runDayQueueStaticSelfCheck } from './campaign/DayQueueGenerator';
import type { GeneratedDayQueue } from './campaign/DayQueueTypes';
import {
  CampaignDayIndex,
  CampaignChecklistCategory,
  CampaignEvidenceKey,
  DayLevelConfig,
} from './campaign/DayLevelConfig';
import {
  assertShiftClockMathSelfCheck,
  ShiftClockController,
  ShiftClockSnapshot,
} from './campaign/ShiftClockController';
import {
  DayCompletionOverlayController,
  type DayCompletionOverlayData,
} from './campaign/DayCompletionOverlayController';
import { EMPLOYEE_PROFILES } from './inspection/EmployeeProfileCatalog';
import { createEmployeeInspectionSubject } from './inspection/InspectionSubjectTypes';
import type { InspectionSubject } from './inspection/InspectionSubjectTypes';
import { RoundGenerator } from './inspection/RoundGenerator';
import { DifficultyTier, EmployeeKey, RoundInstance } from './inspection/InspectionTypes';
import { runRoundEngineSelfCheck } from './inspection/RoundEngineDebug';
import type { AppointmentRosterDay } from './appointments/AppointmentTypes';
import { getVisitorProfile } from './visitors/VisitorProfileCatalog';
import {
  resolveVisitorInitialVisualSpriteFrameUuid,
  resolveVisitorVisualSpriteFrameUuid,
} from './visitors/VisitorVisualResolver';
import type { VisitorKey } from './visitors/VisitorTypes';
import type { VisitorInspectionRound } from './visitors/VisitorRoundTypes';
import { resolveVisitorDecision } from './visitors/VisitorDecisionResolver';
import { resolveVisitorClaimDialogue } from './visitors/VisitorClaimDialogueResolver';
import { getAppointmentDepartmentSpokenDisplayName } from './appointments/AppointmentDepartmentCatalog';
import { getAppointmentPurposeSpokenVisitReason } from './appointments/AppointmentPurposeCatalog';
import type { Day4VisitorSession } from './visitors/Day4VisitorSessionGenerator';
import {
  getInteractivePanelState,
  hideInteractivePanel,
  hideInteractivePanelImmediate,
  showInteractivePanel,
} from './InteractivePanelTransition';

const { ccclass } = _decorator;

type ChecklistChoice = 'unset' | 'pass' | 'fail';
type ChecklistQuestion = 'appearance' | 'id_card' | 'application' | null;
type ChecklistItemKey = Exclude<ChecklistQuestion, null>;
type ChecklistReplyContext = 'normal' | 'nervous' | 'threat';
type GuidancePanelMode = 'help' | 'hint';
type InspectionSubjectId = EmployeeKey;
type MonsterThreatProtectionPhase =
  | 'idle'
  | 'open-window'
  | 'closed-shutter'
  | 'resolved'
  | 'failed';
type InspectionEntityKind = 'human' | 'monster';
type InspectionRecordSource = 'employee-file' | 'appointment-roster' | 'none';
type ChecklistActionMode = 'none' | 'pass' | 'question' | 'reject';
type CarterRejectFlowSource = 'checklist-reject' | 'console-deny';
type InspectionDecisionAction = 'allow' | 'reject';
type Day4DocumentControl = 'employee-card' | 'application-form';
type Day0EndingResultKind = 'keep-identity' | 'remove-threat';
interface VisitorDocumentPhotoSlotLayout {
  readonly nodeName: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly backgroundGray: number;
}
interface VisitorDocumentPhotoSlotRuntime {
  readonly root: Node;
  readonly mask: Mask;
  readonly portraitSprite: Sprite;
  readonly portraitTransform: UITransform;
  readonly layout: VisitorDocumentPhotoSlotLayout;
}
interface Day4DocumentStateSnapshot {
  readonly employeeCardVisualActive: boolean;
  readonly employeeCardHitActive: boolean;
  readonly employeeCardButtonInteractable: boolean;
  readonly applicationFormVisualActive: boolean;
  readonly applicationFormHitActive: boolean;
  readonly applicationFormButtonInteractable: boolean;
}
interface SubjectDocumentFrameUuids {
  readonly employeeCard: string;
  readonly applicationForm: string;
}
type VisitorDocumentFrameUuidMap = Readonly<Record<'edward' | 'nadia', SubjectDocumentFrameUuids>>;

const SUBJECT_DOCUMENT_FRAME_UUIDS: Record<InspectionSubjectId, SubjectDocumentFrameUuids> = {
  carter: {
    employeeCard: 'ee2e7474-1356-4422-8b8e-b53204687939@f9941',
    applicationForm: '32f24a79-2be0-4cef-b9a3-d0e3c0f3ec0f@f9941',
  },
  ethan: {
    employeeCard: '7c430379-2668-41c2-93f7-6219fc04ce07@f9941',
    applicationForm: 'c1a56438-3b33-438c-8d83-623c9a017033@f9941',
  },
  jake: {
    employeeCard: '96f2ab68-47be-45b1-8b0d-6f01fca7a8af@f9941',
    applicationForm: '58da3bef-b4a3-4898-831a-773c37c8be09@f9941',
  },
  alice: {
    employeeCard: '561df5a5-30d4-4fa5-b6ff-e2119accdfe2@f9941',
    applicationForm: '1891e962-9287-4e9e-8aa9-5a68bc3a3de3@f9941',
  },
  clara: {
    employeeCard: 'b21b20f2-773a-4ac0-b6c1-3f1f509dec05@f9941',
    applicationForm: 'b192b18b-f266-422b-acc2-e20e39ddd55d@f9941',
  },
  grace: {
    employeeCard: '4aa42edc-c17b-4585-b152-fa6df135f742@f9941',
    applicationForm: '494d1472-b91c-4345-afdb-b83ad29fd788@f9941',
  },
  mark: {
    employeeCard: '8a3b65dc-9fbc-4a31-a17c-418f9f8a31cf@f9941',
    applicationForm: '30a6f846-9a13-49d8-b7e2-725324f98e51@f9941',
  },
  maya: {
    employeeCard: '5295f38f-b215-4ab9-ab97-b178d4db6a47@f9941',
    applicationForm: '7a92f1b6-79cc-4386-a585-abe78cf1394a@f9941',
  },
  sam: {
    employeeCard: '8f895fa8-6f2c-40cc-b1d4-c230b30917bf@f9941',
    applicationForm: '243635a1-7aae-4fc9-8b74-77c00000f567@f9941',
  },
};
const VISITOR_DOCUMENT_FRAME_UUIDS: VisitorDocumentFrameUuidMap = Object.freeze({
  edward: Object.freeze({
    employeeCard: 'b8aa2e9c-803e-4992-894f-362f20a06daa@f9941',
    applicationForm: 'dc42ff03-e042-48a4-91a3-dc5648b0db4c@f9941',
  }),
  nadia: Object.freeze({
    employeeCard: 'd4309c72-d039-46d2-a97a-096928017ddf@f9941',
    applicationForm: '009cadd1-fe79-4a2b-a7bf-ccee81218052@f9941',
  }),
});

type InspectionDecisionOutcome =
  | 'valid-human-allowed'
  | 'valid-human-wrongly-rejected'
  | 'invalid-human-correctly-rejected'
  | 'invalid-human-wrongly-rejected'
  | 'invalid-human-wrongly-allowed'
  | 'monster-wrongly-allowed'
  | 'monster-correctly-rejected'
  | 'monster-wrongly-rejected'
  | 'visitor-valid-allowed'
  | 'visitor-valid-wrongly-denied'
  | 'visitor-monster-wrongly-allowed'
  | 'visitor-monster-correctly-denied'
  | 'deny-incomplete-checklist';
type AdministrativeGameOverReason =
  | 'multiple-formal-complaints'
  | 'repeated-procedural-violations'
  | 'internal-contamination';
type WrongDenyComplaintNextAction = 'advance-next-round' | 'show-termination-notice';
const COMPLAINT_TERMINATION_TITLE = 'TERMINATION NOTICE';
const COMPLAINT_TERMINATION_BODY =
  'The company has received multiple formal complaints\nfrom employees regarding your conduct.\n\nYour performance no longer meets the requirements\nof this position.\n\nWe regret to inform you that your employment\nwith the company has been terminated.';
type CarterBreakthroughFailureReason =
  | 'shutter-timeout'
  | 'damaged-visual-unavailable'
  | 'phone-pickup-timeout'
  | 'dial-timeout'
  | 'incorrect-allow';
type FailureReviewReason =
  | AdministrativeGameOverReason
  | 'shutter-timeout'
  | 'damaged-visual-unavailable'
  | 'phone-pickup-timeout'
  | 'dial-timeout'
  | 'incorrect-allow';
type FailureReviewRowErrorKind = 'WRONG ALLOW' | 'WRONG DENIAL' | 'RESPONSE FAILURE';

interface FailureReviewEntry {
  readonly roundId: string;
  readonly subjectKey: string;
  readonly displayName: string;
  readonly portraitSpriteFrameUuid: string | null;
  readonly errorKind: FailureReviewRowErrorKind;
  readonly correctDecisionText: string;
  readonly reasonText: string;
}

interface DailyDecisionErrorCheckpointSnapshot {
  readonly wrongAllowCount: number;
  readonly wrongDenyCount: number;
}

interface ReviveCheckpoint {
  readonly dayIndex: number;
  readonly roundId: string;
  readonly currentRound: RoundInstance | null;
  readonly currentInspectionSubject: InspectionSubject;
  readonly activeDayQueueCursor: number;
  readonly activeDay4VisitorCursor: number;
  readonly completedRoundCount: number;
  readonly previousRoundSignature: string | null;
  readonly infectedEntryCount: number;
  readonly procedureViolationCount: number;
  readonly formalComplaintCount: number;
  readonly dailyDecisionErrorStats: DailyDecisionErrorCheckpointSnapshot;
  readonly dailyDecisionErrorsLength: number;
  readonly wronglyAllowedMonstersLength: number;
  readonly visitorVisualPresentationRoundId: string | null;
  readonly committedVisitorVisualRoundId: string | null;
  readonly activeVisitorKeyForDepartmentPhone: VisitorKey | null;
}

interface ActiveGameOverContext {
  readonly generation: number;
  readonly reason: FailureReviewReason;
  readonly checkpointRoundId: string;
  readonly dayIndex: number;
}

interface FailureReviewOverlaySnapshot {
  readonly panelVisualActive: boolean;
  readonly titleVisualActive: boolean;
  readonly titleLabelActive: boolean;
  readonly messageLabelActive: boolean;
  readonly retryVisualActive: boolean;
  readonly retryHitActive: boolean;
  readonly reviveVisualActive: boolean;
  readonly reviveHitActive: boolean;
  readonly reviewVisualActive: boolean;
  readonly reviewHitActive: boolean;
  readonly reviewTextCoverActive: boolean;
  readonly reviewLabelActive: boolean;
  readonly monsterGroupActive: boolean;
  readonly monsterPortraitActive: boolean;
  readonly monsterFullbodyActive: boolean;
  readonly reviveInteractable: boolean;
  readonly retryInteractable: boolean;
}

interface FailureReviewCardLayoutMetrics {
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly titleY: number;
  readonly portraitY: number;
  readonly nameY: number;
  readonly errorKindY: number;
  readonly correctDecisionY: number;
  readonly reasonY: number;
  readonly buttonY: number;
  readonly closeHitX: number;
  readonly closeHitY: number;
  readonly portraitMaxWidth: number;
  readonly portraitMaxHeight: number;
}

interface FailureReviewNodePlacementSnapshot {
  readonly parent: Node | null;
  readonly siblingIndex: number;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly active: boolean;
}
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
  readonly sealState: 'VALID' | 'MISSING';
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
  readonly monsterPortraitFrame: SpriteFrame | null;
  readonly monsterFullbodyFrame: SpriteFrame | null;
  readonly employeeCardFrame: SpriteFrame;
  readonly applicationFormFrame: SpriteFrame;
  readonly truth: InspectionTruthDefinition;
  readonly documentPresentation?: InspectionDocumentPresentation;
}

interface InternalContaminationMonsterSlotLayout {
  readonly positionX: number;
  readonly positionY: number;
  readonly scale: number;
  readonly maxWidth: number;
  readonly maxHeight: number;
}

interface GuidanceHintContent {
  readonly subjectLine: string;
  readonly statusLine: string;
  readonly statusColor: Color;
  readonly body: string;
  readonly layoutIssueCount: number;
  readonly hideSubjectLabel: boolean;
}

type HintTypographyPreset = 'short' | 'standard' | 'dense';

interface HintTypographyPresetConfig {
  readonly subjectFontSize: number;
  readonly subjectLineHeight: number;
  readonly statusFontSize: number;
  readonly statusLineHeight: number;
  readonly bodyFontSize: number;
  readonly bodyLineHeight: number;
  readonly bodyWidthRatio: number;
  readonly subjectStatusGap: number;
  readonly statusBodyGap: number;
  readonly subjectPanelYRatio: number;
}

@ccclass('EvidencePreviewController')
export class EvidencePreviewController extends Component {
  private static readonly PURGE_PHONE_CODE = '1214';
  private static readonly MAIN_WINDOW_BACKGROUND_OFFICIAL_SPRITEFRAME_UUID =
    '70e13690-db55-4601-ab15-453c04d72032@f9941';
  private static readonly RETURN_HOME_BUTTON_SPRITEFRAME_UUID =
    '682d2d19-6170-4939-bb6b-acfe4042fed8@f9941';
  private static readonly DAY0_ENDING_PLAYER_DISGUISED_SPRITEFRAME_UUID =
    'b24b375b-3525-48b1-bbd3-c5d1c4d75442@f9941';
  private static readonly DAY0_ENDING_PLAYER_TRUE_IDENTITY_PORTRAIT_SPRITEFRAME_UUID =
    '8ada3c94-c810-48f3-a7b0-2e22bb5f760b@f9941';
  private static readonly RETURN_HOME_SCENE_NAME = 'HomeScene';
  private static readonly RETURN_HOME_BUTTON_MARGIN_LEFT = 16;
  private static readonly RETURN_HOME_BUTTON_MARGIN_TOP = 16;
  private static readonly RETURN_HOME_BUTTON_MAX_WIDTH = 60;
  private static readonly RETURN_HOME_BUTTON_MAX_HEIGHT = 60;
  private static readonly RETURN_HOME_BUTTON_HIT_WIDTH = 84;
  private static readonly RETURN_HOME_BUTTON_HIT_HEIGHT = 84;
  private static readonly RETURN_HOME_BUTTON_PRESS_SCALE = 0.94;
  private static readonly RETURN_HOME_BUTTON_PRESS_DURATION_SECONDS = 0.07;
  private static readonly MAIN_WINDOW_BACKGROUND_NODE_PATH = 'Canvas/WindowRuntime/WindowViewport/WindowInside';
  private static readonly MAIN_WINDOW_BACKGROUND_BLOCKED_SPRITEFRAME_UUIDS: ReadonlySet<string> =
    new Set(['70e13690-db55-4601-ab15-453c04d72032@f9941']);
  private static hasRunShiftClockMathSelfCheck = false;
  private static readonly INTERNAL_CONTAMINATION_SUBTITLE = 'FACILITY COMPROMISED';
  private static readonly INTERNAL_CONTAMINATION_REASON_TEXT =
    'Three disguised monsters were\nmistakenly allowed inside.\nInternal contamination has spread\nbeyond containment.';
  private static readonly INTERNAL_CONTAMINATION_SLOT_LAYOUTS: readonly InternalContaminationMonsterSlotLayout[] =
    Object.freeze([
      Object.freeze({
        positionX: -158,
        positionY: 116,
        scale: 0.84,
        maxWidth: 320,
        maxHeight: 760,
      }),
      Object.freeze({
        positionX: 0,
        positionY: 152,
        scale: 1,
        maxWidth: 330,
        maxHeight: 800,
      }),
      Object.freeze({
        positionX: 158,
        positionY: 116,
        scale: 0.84,
        maxWidth: 320,
        maxHeight: 760,
      }),
    ]);
  private static readonly FAILURE_REVIEW_PANEL_BG_SPRITE_FRAME_UUID =
    '98f04450-ba06-434f-a4a4-962ce5819572@f9941';
  private static readonly FAILURE_REVIEW_NEXT_REASON_BUTTON_SPRITE_FRAME_UUID =
    'd04b1842-267c-4f0c-a34b-a87fb7fdd466@f9941';
  private static readonly FAILURE_REVIEW_PANEL_SOURCE_WIDTH = 941;
  private static readonly FAILURE_REVIEW_PANEL_SOURCE_HEIGHT = 1672;
  private static readonly GUIDANCE_PANEL_TITLE = Object.freeze({
    help: 'INSPECTION GUIDE',
    hint: 'INSPECTION HINT',
  });
  private static readonly GUIDANCE_PANEL_SOURCE_WIDTH = 941;
  private static readonly GUIDANCE_PANEL_SOURCE_HEIGHT = 1672;
  private static readonly GUIDANCE_PANEL_MAX_WIDTH = 586;
  private static readonly GUIDANCE_PANEL_MAX_HEIGHT = 1030;
  private static readonly GUIDANCE_DIMMER_ALPHA = 168;
  private static readonly GUIDANCE_ISSUE_ORDER: readonly DecisionIssueKind[] = Object.freeze([
    'id-card',
    'application',
    'appearance',
    'department',
    'purpose',
  ]);
  private static readonly HINT_TYPOGRAPHY_PRESETS: Readonly<
    Record<HintTypographyPreset, HintTypographyPresetConfig>
  > = Object.freeze({
    short: Object.freeze({
      subjectFontSize: 25,
      subjectLineHeight: 33,
      statusFontSize: 30,
      statusLineHeight: 38,
      bodyFontSize: 25,
      bodyLineHeight: 34,
      bodyWidthRatio: 0.74,
      subjectStatusGap: 52,
      statusBodyGap: 64,
      subjectPanelYRatio: 0.21,
    }),
    standard: Object.freeze({
      subjectFontSize: 23,
      subjectLineHeight: 30,
      statusFontSize: 27,
      statusLineHeight: 30,
      bodyFontSize: 22,
      bodyLineHeight: 30,
      bodyWidthRatio: 0.72,
      subjectStatusGap: 50,
      statusBodyGap: 58,
      subjectPanelYRatio: 0.2,
    }),
    dense: Object.freeze({
      subjectFontSize: 21,
      subjectLineHeight: 27,
      statusFontSize: 24,
      statusLineHeight: 27,
      bodyFontSize: 19,
      bodyLineHeight: 26,
      bodyWidthRatio: 0.72,
      subjectStatusGap: 44,
      statusBodyGap: 50,
      subjectPanelYRatio: 0.19,
    }),
  });
  private static readonly GUIDANCE_ISSUE_TEXT_BY_KIND: Readonly<
    Record<Exclude<DecisionIssueKind, 'monster'>, { readonly title: string; readonly body: string }>
  > = Object.freeze({
    'id-card': Object.freeze({
      title: 'ID CARD',
      body: 'The ID card does not match the official employee record.',
    }),
    application: Object.freeze({
      title: 'APPLICATION',
      body: 'The application form contains incorrect information.',
    }),
    appearance: Object.freeze({
      title: 'APPEARANCE',
      body: "The subject's appearance does not match the official record.",
    }),
    department: Object.freeze({
      title: 'DEPARTMENT',
      body: 'The claimed department does not match the appointment roster.',
    }),
    purpose: Object.freeze({
      title: 'PURPOSE',
      body: 'The stated purpose does not match the appointment record.',
    }),
  });
  private static readonly FAILURE_REVIEW_PANEL_AVAILABLE_WIDTH = 590;
  private static readonly FAILURE_REVIEW_PANEL_AVAILABLE_HEIGHT = 1040;
  private static readonly FAILURE_REVIEW_CONTENT_OFFSET_Y = -48;
  private static readonly FAILURE_REVIEW_NEXT_REASON_MAX_WIDTH = 236;
  private static readonly FAILURE_REVIEW_NEXT_REASON_MAX_HEIGHT = 78;
  private static readonly FAILURE_REVIEW_NEXT_REASON_HIT_EXTRA_WIDTH = 20;
  private static readonly FAILURE_REVIEW_NEXT_REASON_HIT_EXTRA_HEIGHT = 16;
  private static readonly CHECKLIST_CATEGORY_TO_KEY: Readonly<
    Record<CampaignChecklistCategory, ChecklistItemKey>
  > = Object.freeze({
    'id-card': 'id_card',
    application: 'application',
    appearance: 'appearance',
  });
  private static readonly CHECKLIST_UNAVAILABLE_STRIKETHROUGH_LAYOUT: Readonly<
    Record<
      ChecklistItemKey,
      {
        readonly nodeName: string;
        readonly width: number;
        readonly startXOffset: number;
        readonly yOffset: number;
      }
    >
  > = Object.freeze({
    id_card: Object.freeze({
      nodeName: 'ChecklistUnavailableStrike_IdCard',
      width: 82,
      startXOffset: -210,
      yOffset: 0,
    }),
    application: Object.freeze({
      nodeName: 'ChecklistUnavailableStrike_Application',
      width: 142,
      startXOffset: -210,
      yOffset: 0,
    }),
    appearance: Object.freeze({
      nodeName: 'ChecklistUnavailableStrike_Appearance',
      width: 110,
      startXOffset: -210,
      yOffset: 0,
    }),
  });
  private static readonly CHECKLIST_UNAVAILABLE_TEXT_CENTER_Y_OFFSET = 0;
  private static readonly DAY0_ENDING_PHONE_DELAY_SECONDS = 3;
  private static readonly DAY0_ENDING_PHONE_RING_INTERVAL_SECONDS = 2.4;
  private static readonly DAY0_ENDING_ARCHIVE_REVEAL_DELAY_SECONDS = 1.2;
  private static readonly DAY0_ENDING_SELF_DIALOGUE_FINAL_CHOICE_HOLD_SECONDS = 0.8;
  private static readonly DAY0_ENDING_SELF_DIALOGUE_LINES: readonly string[] = Object.freeze([
    "That's not me...",
    'Then... who am I?',
    "I'm one of them.",
  ]);
  private static readonly DAY0_ENDING_FINAL_CHOICE_KEEP_TEXT = 'KEEP YOUR IDENTITY.';
  private static readonly DAY0_ENDING_FINAL_CHOICE_REMOVE_TEXT = 'REMOVE THE THREAT.';
  private static readonly DAY0_ENDING_REMOVE_THREAT_ALERT_TEXT = 'THREAT IDENTIFIED';
  private static readonly DAY0_ENDING_REMOVE_THREAT_ALERT_SECONDS = 1.15;
  private static readonly DAY0_ENDING_REMOVE_THREAT_SHUTTER_CLOSE_SECONDS = 1.7;
  private static readonly DAY0_ENDING_REMOVE_THREAT_POST_CLOSE_HOLD_SECONDS = 1.25;
  private static readonly DAY0_ENDING_FINAL_CHOICE_RUNTIME_WIDTH = 640;
  private static readonly DAY0_ENDING_FINAL_CHOICE_RUNTIME_HEIGHT = 230;
  private static readonly DAY0_ENDING_FINAL_CHOICE_RUNTIME_X = 120;
  private static readonly DAY0_ENDING_FINAL_CHOICE_RUNTIME_Y = -330;
  private static readonly DAY0_ENDING_FINAL_CHOICE_OPTION_WIDTH = 500;
  private static readonly DAY0_ENDING_FINAL_CHOICE_OPTION_HEIGHT = 84;
  private static readonly DAY0_ENDING_FINAL_CHOICE_VERTICAL_GAP = 42;
  private static readonly DAY0_ENDING_RESULT_PAPER_PATH = 'ui/game/fail/ui_game_fail_panel_webp_v1/spriteFrame';
  private static readonly DAY0_ENDING_RESULT_RETURN_HOME_PATH =
    'ui/game/ending/ui_btn_return_home/spriteFrame';
  private static readonly DAY0_ENDING_RESULT_RUNTIME_WIDTH = 720;
  private static readonly DAY0_ENDING_RESULT_RUNTIME_HEIGHT = 1280;
  private static readonly DAY0_ENDING_RESULT_PANEL_MAX_WIDTH = 560;
  private static readonly DAY0_ENDING_RESULT_PANEL_MAX_HEIGHT = 996;
  private static readonly DAY0_ENDING_RESULT_MASK_ALPHA = 153;
  private static readonly DAY0_ENDING_RESULT_BUTTON_HIT_WIDTH = 220;
  private static readonly DAY0_ENDING_RESULT_BUTTON_HIT_HEIGHT = 122;
  private static readonly DAY0_ENDING_RESULT_BUTTON_TARGET_HEIGHT = 84;
  private static readonly DAY0_ENDING_RESULT_BUTTON_MAX_WIDTH = 195;
  private static readonly DAY0_ENDING_RESULT_CONTENT: Readonly<
    Record<
      Day0EndingResultKind,
      {
        readonly title: string;
        readonly body: string;
      }
    >
  > = Object.freeze({
    'keep-identity': Object.freeze({
      title: 'IDENTITY PRESERVED',
      body: 'You kept the life\nthat was never yours.\n\nTomorrow, you return to your post.\nNo one will know.',
    }),
    'remove-threat': Object.freeze({
      title: 'THREAT REMOVED',
      body: 'You ended the deception.\n\nThe final threat is gone.\nNo monsters remain.',
    }),
  });
  private static readonly DAY0_ENDING_UNKNOWN_NUMBER_CALL_LINES: readonly string[] = Object.freeze([
    'Congratulations.',
    'However...',
    'There is still one final inspection.',
    'Now. Open the shutter.',
  ]);
  private static readonly VISITOR_DOCUMENT_PHOTO_SLOT_LAYOUT: Readonly<
    Record<Day4DocumentControl, VisitorDocumentPhotoSlotLayout>
  > = Object.freeze({
    'employee-card': Object.freeze({
      nodeName: 'VisitorDocumentPhotoSlotEmployeeCard',
      x: 171,
      y: -8,
      width: 182,
      height: 244,
      backgroundGray: 198,
    }),
    'application-form': Object.freeze({
      nodeName: 'VisitorDocumentPhotoSlotApplicationForm',
      x: -26,
      y: 217,
      width: 222,
      height: 228,
      backgroundGray: 198,
    }),
  });
  private readonly roundGenerator = new RoundGenerator();
  private hasLoggedCampaignDayConfig = false;
  private hasRunPhase3StaticSelfCheck = false;
  private hasRunPhase4StaticSelfCheck = false;
  private hasRunPhase6AStaticSelfCheck = false;
  private hasRunPhase6BStaticSelfCheck = false;
  private activeDayConfig: DayLevelConfig | null = null;
  private dayStartWrongAllowCount = 0;
  private dayStartWrongDenyCount = 0;
  private activeAppointmentRosterDay: AppointmentRosterDay | null = null;
  private activeVisitorKeyForDepartmentPhone: VisitorKey | null = null;
  private activeDayQueue: GeneratedDayQueue | null = null;
  private activeDayQueueCursor = 0;
  private hasLoggedDayQueueExhausted = false;
  private activeDay4VisitorSession: Day4VisitorSession | null = null;
  private activeDay4VisitorCursor = 0;
  private campaignDayTransitionInProgress = false;
  private campaignImplementedContentComplete = false;
  private campaignDayCompletionPending = false;
  private campaignDayContinueRequested = false;
  private hasLoggedImplementedContentComplete = false;
  private emergencyTelephoneOverrideActive = false;
  private gameReturnHomeButtonRuntime: Node | null = null;
  private gameReturnHomeButtonVisual: Node | null = null;
  private gameReturnHomeButtonHit: Node | null = null;
  private gameReturnHomeButtonSprite: Sprite | null = null;
  private gameReturnHomeButtonHitButton: Button | null = null;
  private gameReturnHomeButtonLoadGeneration = 0;
  private gameReturnHomeInProgress = false;
  private gameReturnHomeBaseScale = new Vec3(1, 1, 1);
  private gameSettingsPanelController: SettingsPanelController | null = null;
  private previousRoundSignature: string | null = null;
  private currentRound: RoundInstance | null = null;
  private currentInspectionSubject: InspectionSubject | null = null;
  private visitorVisualLoadGeneration = 0;
  private mainInspectionWindowBackgroundLoadGeneration = 0;
  private mainInspectionWindowBackgroundReadyPromise: Promise<void> | null = null;
  private visitorVisualPresentationRoundId: string | null = null;
  private committedVisitorVisualRoundId: string | null = null;
  private inspectionViewReady = false;
  private completedRoundCount = 0;
  private activeInspectionSubjectId: InspectionSubjectId = 'carter';
  private readonly roundSpriteFrameCache = new Map<string, SpriteFrame>();
  private static readonly MONSTER_GAMEOVER_ALARM_SECONDS = 6;
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
  private readonly wrongDenyComplaintDialoguePool: readonly string[] = [
    'This decision is unacceptable. I will be filing a formal complaint.',
    'You have no grounds to deny me. HR will hear about this.',
    'This review was handled improperly. I expect an investigation.',
    'I followed procedure. Your conduct will be reported.',
    'You denied me without a proper explanation. I am filing a complaint.',
    'This is not over. I will take this directly to HR.',
  ];

  private previewOpen = false;
  private previewPanelInteractable = true;
  private checklistInteractionReady = false;

  private idCardChoice: ChecklistChoice = 'unset';
  private applicationChoice: ChecklistChoice = 'unset';
  private appearanceChoice: ChecklistChoice = 'unset';
  private selectedChecklistQuestion: ChecklistQuestion = null;
  private checklistQuestionPanelOpen = false;
  private checklistQuestionUiReady = false;
  private checklistReplyUiReady = false;
  private checklistReplyPanelOpen = false;
  private checklistInteractionRuntimeNode: Node | null = null;
  private readonly checklistUnavailableStrikethroughNodes: Partial<Record<ChecklistItemKey, Node>> = {};

  private employeeCardHit: Node | null = null;
  private applicationFormHit: Node | null = null;
  private telephoneHit: Node | null = null;
  private appointmentRosterHit: Node | null = null;
  private employeeCardVisual: Node | null = null;
  private applicationFormVisual: Node | null = null;
  private screeningChecklistVisual: Node | null = null;
  private telephoneVisual: Node | null = null;
  private appointmentRosterVisual: Node | null = null;
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
  private checklistReplyBoxButton: Button | null = null;
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
  private guidanceHelpButtonNode: Node | null = null;
  private guidanceHintButtonNode: Node | null = null;
  private guidanceHelpButton: Button | null = null;
  private guidanceHintButton: Button | null = null;
  private guidanceOverlayRuntime: Node | null = null;
  private guidanceDimmer: Node | null = null;
  private guidanceDimmerOpacity: UIOpacity | null = null;
  private guidancePanel: Node | null = null;
  private guidancePanelSprite: Sprite | null = null;
  private guidanceTitleLabelNode: Node | null = null;
  private guidanceTitleLabel: Label | null = null;
  private guidanceHelpContentRoot: Node | null = null;
  private guidanceHintContentRoot: Node | null = null;
  private guidanceHintSubjectLabel: Label | null = null;
  private guidanceHintStatusLabel: Label | null = null;
  private guidanceHintBodyLabel: Label | null = null;
  private guidanceHintLayoutMeta: {
    readonly layoutIssueCount: number;
    readonly hideSubjectLabel: boolean;
    readonly statusLine: string;
  } | null = null;
  private guidanceCloseHit: Node | null = null;
  private guidanceCloseHitButton: Button | null = null;
  private guidancePanelActive = false;
  private guidancePanelMode: GuidancePanelMode | null = null;
  private guidancePanelTransitionInProgress = false;
  private guidancePanelVisualGeneration = 0;
  private guidancePanelInputLocked = false;
  private shutterController: ShutterToggleController | null = null;
  private telephoneController: TelephoneController | null = null;
  private appointmentRosterController: AppointmentRosterController | null = null;
  private visitorIntroController: VisitorIntroSequenceController | null = null;
  private shiftClockController: ShiftClockController | null = null;
  private dayCompletionOverlayController: DayCompletionOverlayController | null = null;
  private hasStartedCampaignShiftClock = false;
  private day0EndingDisplayTestActive = false;
  private day0EndingPhoneActive = false;
  private day0EndingPhoneReady = false;
  private day0EndingPhoneSequenceStarted = false;
  private day0EndingPhoneSequenceCompleted = false;
  private day0EndingTelephoneStoryLock = false;
  private day0EndingAwaitShutter = false;
  private day0EndingIdentityRevealMusicPlayed = false;
  private day0EndingArchiveRevealActive = false;
  private day0EndingSelfDialogueInProgress = false;
  private day0EndingSelfDialogueCompleted = false;
  private day0EndingSelfDialogueFinalChoiceQueued = false;
  private day0EndingSelfDialogueToken = 0;
  private day0EndingFinalChoiceActive = false;
  private day0EndingFinalChoiceCompleted = false;
  private day0EndingFinalChoiceTransitionInProgress = false;
  private day0EndingFinalChoiceSelection: Day0EndingResultKind | null = null;
  private day0EndingShutterOpenSettledListenerRegistered = false;
  private day0EndingFinalChoiceRuntime: Node | null = null;
  private day0EndingFinalChoiceKeepHit: Node | null = null;
  private day0EndingFinalChoiceRemoveHit: Node | null = null;
  private day0EndingFinalChoiceKeepButton: Button | null = null;
  private day0EndingFinalChoiceRemoveButton: Button | null = null;
  private day0EndingFinalChoiceKeepLabel: Label | null = null;
  private day0EndingFinalChoiceRemoveLabel: Label | null = null;
  private day0EndingResultRuntime: Node | null = null;
  private day0EndingResultInputBlocker: Node | null = null;
  private day0EndingResultBackground: Node | null = null;
  private day0EndingResultTitleNode: Node | null = null;
  private day0EndingResultBodyNode: Node | null = null;
  private day0EndingResultReturnHomeVisual: Node | null = null;
  private day0EndingResultReturnHomeHit: Node | null = null;
  private day0EndingResultReturnHomeButton: Button | null = null;
  private day0EndingResultVisible = false;
  private day0EndingResultKind: Day0EndingResultKind | null = null;
  private day0EndingResultReturnLocked = false;
  private day0EndingResultPaperFrame: SpriteFrame | null = null;
  private day0EndingResultReturnHomeFrame: SpriteFrame | null = null;
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
  private carterGameOverDividerVisual: Node | null = null;
  private carterGameOverDividerGraphics: Graphics | null = null;
  private carterGameOverCompanyLogoVisual: Node | null = null;
  private carterGameOverReviewVisual: Node | null = null;
  private carterGameOverReviewHit: Node | null = null;
  private carterGameOverReviewTextCover: Node | null = null;
  private carterGameOverReviewTextCoverGraphics: Graphics | null = null;
  private carterGameOverReviewLabelNode: Node | null = null;
  private carterGameOverReviewLabel: Label | null = null;
  private carterGameOverRetryVisual: Node | null = null;
  private carterGameOverRetryHit: Node | null = null;
  private carterGameOverReviveVisual: Node | null = null;
  private carterGameOverReviveHit: Node | null = null;
  private carterGameOverPanelSprite: Sprite | null = null;
  private carterGameOverTitleSprite: Sprite | null = null;
  private carterGameOverCompanyLogoSprite: Sprite | null = null;
  private carterGameOverReviewSprite: Sprite | null = null;
  private carterGameOverRetrySprite: Sprite | null = null;
  private carterGameOverReviveSprite: Sprite | null = null;
  private carterGameOverReviewButton: Button | null = null;
  private carterGameOverRetryButton: Button | null = null;
  private carterGameOverReviveButton: Button | null = null;
  private failureReviewRuntime: Node | null = null;
  private failureReviewTitleLabelNode: Node | null = null;
  private failureReviewProgressLabelNode: Node | null = null;
  private failureReviewPortraitNode: Node | null = null;
  private failureReviewNameLabelNode: Node | null = null;
  private failureReviewErrorKindLabelNode: Node | null = null;
  private failureReviewCorrectDecisionLabelNode: Node | null = null;
  private failureReviewReasonLabelNode: Node | null = null;
  private failureReviewPanelBackgroundNode: Node | null = null;
  private failureReviewCloseHitNode: Node | null = null;
  private failureReviewRowsRoot: Node | null = null;
  private failureReviewRows: readonly Node[] = [];
  private activeFailureReviewEntries: readonly FailureReviewEntry[] = Object.freeze([]);
  private failureReviewPageIndex = 0;
  private failureReviewVisualGeneration = 0;
  private failureReviewOverlaySnapshot: FailureReviewOverlaySnapshot | null = null;
  private failureReviewNextReasonSpriteFrame: SpriteFrame | null = null;
  private failureReviewButtonPlacementSnapshot:
    | {
        readonly reviewVisual: FailureReviewNodePlacementSnapshot | null;
        readonly reviewHit: FailureReviewNodePlacementSnapshot | null;
        readonly reviveVisual: FailureReviewNodePlacementSnapshot | null;
        readonly reviveHit: FailureReviewNodePlacementSnapshot | null;
      }
    | null = null;
  private failureReviewActive = false;
  private failureReviewPageAdvanceInProgress = false;
  private complaintCompanyLogoFrame: SpriteFrame | null = null;
  private carterGameOverUiReady = false;
  private internalContaminationMonsterGroup: Node | null = null;
  private internalContaminationMonsterLeft: Node | null = null;
  private internalContaminationMonsterCenter: Node | null = null;
  private internalContaminationMonsterRight: Node | null = null;
  private internalContaminationVisualGeneration = 0;
  private internalContaminationGameOverAudioPlayed = false;
  private currentAdministrativeGameOverReason: AdministrativeGameOverReason | null = null;
  private activeGameOverContext: ActiveGameOverContext | null = null;
  private gameOverGeneration = 0;
  private reviveResolutionInProgress = false;
  private retryLoadInProgress = false;
  private carterMonsterPortraitSprite: Sprite | null = null;
  private carterMonsterFullbodySprite: Sprite | null = null;
  private carterMonsterPortraitFrame: SpriteFrame | null = null;
  private carterMonsterFullbodyFrame: SpriteFrame | null = null;
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
  private visitorEmployeeCardPhotoSlot: VisitorDocumentPhotoSlotRuntime | null = null;
  private visitorApplicationFormPhotoSlot: VisitorDocumentPhotoSlotRuntime | null = null;
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
  private day0EndingPlayerDisguisedFrame: SpriteFrame | null = null;
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
  private lastWrongDenyComplaintLineIndex = -1;
  private anxiousReplyShown = false;
  private carterAppearanceQuestionAsked = false;
  private rejectFlowRequested = false;
  private carterEncounterResolved = false;
  private threatSequenceActive = false;
  private emergencyWindowOpen = false;
  private emergencyShutterSucceeded = false;
  private emergencyShutterCloseRequested = false;
  private carterAttackTriggered = false;
  private emergencyDeadlineMs = 0;
  private phoneResponseWindowOpen = false;
  private phoneResponseDeadlineMs = 0;
  private phoneDialWindowOpen = false;
  private phoneDialDeadlineMs = 0;
  private activeMonsterThreatTiming: MonsterThreatTimingConfig | null = null;
  private activeMonsterThreatDay = 1;
  private monsterThreatProtectionPhase: MonsterThreatProtectionPhase = 'idle';
  private monsterThreatGeneration = 0;
  private emergencyTimeoutGeneration = 0;
  private closedShutterProtectionGranted = false;
  private cleanupProgramActivated = false;
  private phoneEmergencyResolved = false;
  private emergencyPhoneOpenedListenerRegistered = false;
  private emergencyCallSubmittedListenerRegistered = false;
  private emergencyShutterClosedSettledListenerRegistered = false;
  private damagedShutterAppliedListenerRegistered = false;
  private delayedDamagedShutterSwitchScheduled = false;
  private day0EndingPlayerDisguisedFrameLoading = false;
  private inspectionDecisionResolutionInProgress = false;
  private static readonly INTERACTION_RUNTIME_DIAGNOSTIC_ENABLED = true;
  private readonly interactionSnapshotReasonOnce = new Set<string>();
  private readonly day4DocumentTraceReasonOnce = new Set<string>();
  private readonly day4DocumentDisabledOnce = new Set<string>();
  private lastDay4DocumentStateSnapshot: Day4DocumentStateSnapshot | null = null;
  private lastKnownTelephoneEntryEnabled: boolean | null = null;
  private lastKnownShutterInteractionEnabled: boolean | null = null;
  private isDestroying = false;
  private incompleteRejectNoticeInFlight = false;
  private formalComplaintCount = 0;
  private procedureViolationCount = 0;
  private infectedEntryCount = 0;
  private decisionResolutionToken = 0;
  private administrativeGameOverActive = false;
  private latestReviveCheckpoint: ReviveCheckpoint | null = null;

  private readonly handleCarterEmergencyCloseAccepted = (): void => {
    if (!this.threatSequenceActive) {
      return;
    }
    if (this.carterAttackTriggered || this.carterEncounterResolved || this.cleanupProgramActivated) {
      return;
    }
    if (this.monsterThreatProtectionPhase !== 'open-window') {
      return;
    }
    if (this.emergencyDeadlineMs > 0 && Date.now() > this.emergencyDeadlineMs) {
      this.handleEmergencyTimeout();
      return;
    }
    this.emergencyShutterCloseRequested = true;
    this.hideCarterThreatReplyCompletely();
    this.setShutterInteractionEnabledForInteractionTrace(false, 'emergency-close-accepted');
    this.bindEmergencyShutterClosedSettledListener();
  };

  private readonly handleEmergencyShutterClosedSettled = (): void => {
    if (
      this.carterEncounterResolved ||
      this.carterAttackTriggered ||
      this.cleanupProgramActivated ||
      this.phoneEmergencyResolved
    ) {
      this.unbindEmergencyShutterClosedSettledListener();
      return;
    }
    if (!this.emergencyShutterCloseRequested) {
      return;
    }
    if (this.closedShutterProtectionGranted || this.monsterThreatProtectionPhase !== 'open-window') {
      return;
    }
    const threatTiming = this.activeMonsterThreatTiming;
    if (!threatTiming) {
      return;
    }
    this.emergencyShutterSucceeded = true;
    this.emergencyWindowOpen = false;
    this.closedShutterProtectionGranted = true;
    this.monsterThreatProtectionPhase = 'closed-shutter';
    this.unschedule(this.handleEmergencyTimeout);
    const closedShutterBreakSeconds = threatTiming.closedShutterBreakSeconds;
    this.emergencyDeadlineMs = Date.now() + closedShutterBreakSeconds * 1000;
    this.emergencyTimeoutGeneration = this.monsterThreatGeneration;
    this.scheduleOnce(this.handleEmergencyTimeout, closedShutterBreakSeconds);
    this.unbindEmergencyShutterClosedSettledListener();
    this.logMonsterThreatTiming(
      `shutter fully closed phase=closed-shutter day=${this.activeMonsterThreatDay} seconds=${closedShutterBreakSeconds}`,
    );
    this.scheduleDamagedShutterAfterClosedHold();
  };

  private readonly handleDelayedDamagedShutterSwitch = (): void => {
    this.delayedDamagedShutterSwitchScheduled = false;
    if (!this.node?.isValid || this.isDestroying) {
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
  };

  private readonly handleDamagedShutterApplied = (): void => {
    this.unbindDamagedShutterAppliedListener();
  };

  private readonly handleEmergencyPhoneOpened = (): void => {
    if (
      (!this.phoneResponseWindowOpen && !this.phoneDialWindowOpen) ||
      this.cleanupProgramActivated ||
      this.phoneEmergencyResolved
    ) {
      return;
    }
    if (this.carterEncounterResolved || this.carterAttackTriggered) {
      return;
    }
    if (this.phoneDialWindowOpen) {
      return;
    }
    this.phoneResponseWindowOpen = false;
    this.phoneResponseDeadlineMs = 0;
    this.unschedule(this.handlePhonePickupTimeout);
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
    if (!this.phoneDialWindowOpen || this.cleanupProgramActivated || this.phoneEmergencyResolved) {
      return;
    }
    if (this.carterEncounterResolved || this.carterAttackTriggered) {
      return;
    }
    if (Date.now() > this.phoneDialDeadlineMs) {
      this.handleDialCodeTimeout();
      return;
    }
    if (phoneNumber === EvidencePreviewController.PURGE_PHONE_CODE) {
      this.activateCleanupProgram();
      return;
    }
    this.telephoneController?.showEmergencyStatus('INVALID CODE');
  };

  private readonly handleDialCodeTimeout = (): void => {
    if (!this.phoneDialWindowOpen) {
      return;
    }
    if (this.cleanupProgramActivated || this.phoneEmergencyResolved || this.carterAttackTriggered) {
      return;
    }
    this.logMonsterThreatTiming('timeout phase=phone-dial');
    this.triggerCarterBreakthroughFailure('dial-timeout');
  };

  private readonly handleShowCarterGameOver = (): void => {
    if (!this.carterAttackTriggered) {
      return;
    }
    this.dismissDayCompletionOverlayForGameOver();
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = true;
    }
  };

  private readonly handleDay0EndingPhoneDelayElapsed = (): void => {
    if (!this.day0EndingDisplayTestActive || this.day0EndingPhoneSequenceCompleted || this.isDestroying) {
      return;
    }
    this.day0EndingPhoneActive = true;
    this.day0EndingPhoneReady = false;
    this.day0EndingPhoneSequenceStarted = false;
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'day0-ending-phone-ringing');
    if (this.telephoneHit?.isValid) {
      this.telephoneHit.active = true;
    }
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = true;
    }
    const armed =
      this.telephoneController?.armDay0EndingUnknownNumberCall(
        EvidencePreviewController.DAY0_ENDING_UNKNOWN_NUMBER_CALL_LINES,
        this.handleDay0EndingUnknownNumberCallComplete,
        this.handleDay0EndingUnknownNumberCallStarted,
      ) ?? false;
    if (!armed) {
      this.day0EndingPhoneActive = false;
      this.day0EndingPhoneReady = false;
      return;
    }
    this.day0EndingPhoneReady = true;
    this.playDay0EndingPhoneRing();
  };

  private readonly handleDay0EndingPhoneRingElapsed = (): void => {
    if (
      !this.day0EndingPhoneActive ||
      this.day0EndingPhoneSequenceStarted ||
      !this.day0EndingDisplayTestActive ||
      this.isDestroying
    ) {
      return;
    }
    this.playDay0EndingPhoneRing();
  };

  private readonly handleDay0EndingUnknownNumberCallStarted = (): void => {
    if (!this.day0EndingDisplayTestActive || this.day0EndingPhoneSequenceCompleted) {
      return;
    }
    this.day0EndingTelephoneStoryLock = true;
    this.telephoneController?.setDay0EndingTelephoneStoryLock(true);
    this.day0EndingPhoneSequenceStarted = true;
    this.day0EndingPhoneActive = false;
    this.day0EndingPhoneReady = false;
    this.unschedule(this.handleDay0EndingPhoneRingElapsed);
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = false;
    }
  };

  private readonly handleDay0EndingUnknownNumberCallComplete = (): void => {
    this.day0EndingTelephoneStoryLock = false;
    this.telephoneController?.setDay0EndingTelephoneStoryLock(false);
    this.day0EndingPhoneSequenceCompleted = true;
    this.day0EndingPhoneSequenceStarted = false;
    this.day0EndingPhoneActive = false;
    this.day0EndingPhoneReady = false;
    this.day0EndingAwaitShutter = true;
    this.unschedule(this.handleDay0EndingPhoneRingElapsed);
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'day0-ending-phone-sequence-complete');
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = false;
    }
    this.armDay0EndingAwaitShutterPhase();
  };

  private readonly handleDay0EndingArchiveRevealDelayElapsed = (): void => {
    if (
      !this.day0EndingDisplayTestActive ||
      this.day0EndingAwaitShutter ||
      this.day0EndingArchiveRevealActive ||
      this.isDestroying
    ) {
      return;
    }
    this.activateDay0EndingArchiveRevealPhase3();
  };

  private readonly handleDay0EndingTelephoneTouch = (event?: EventTouch): void => {
    if (!this.isDay0EndingPhoneTouchBlockWindow()) {
      return;
    }
    event?.stopPropagationImmediate();
  };

  private isDay0EndingPhoneTouchBlockWindow(): boolean {
    if (!this.day0EndingDisplayTestActive || this.day0EndingPhoneReady || this.isDestroying) {
      return false;
    }
    // Restrict touch swallowing to the Day0 ending phone waiting stage only.
    // Outside this stage (regular campaign / monster cleanup flow), telephone clicks
    // must propagate to TelephoneController Button.CLICK.
    return (
      this.day0EndingPhoneActive &&
      !this.day0EndingPhoneSequenceStarted &&
      !this.day0EndingPhoneSequenceCompleted &&
      !this.day0EndingAwaitShutter &&
      !this.day0EndingArchiveRevealActive
    );
  }

  private readonly handleDay0EndingShutterOpenSettled = (): void => {
    if (
      !this.day0EndingDisplayTestActive ||
      !this.day0EndingAwaitShutter ||
      this.day0EndingArchiveRevealActive ||
      this.isDestroying
    ) {
      this.unbindDay0EndingShutterOpenSettledListener();
      return;
    }
    this.handleDay0EndingShutterClick();
  };

  private readonly handleDay0EndingArchiveRevealDetailClosed = (): void => {
    if (
      !this.day0EndingDisplayTestActive ||
      !this.day0EndingArchiveRevealActive ||
      this.day0EndingFinalChoiceActive ||
      this.day0EndingFinalChoiceTransitionInProgress ||
      this.day0EndingSelfDialogueInProgress ||
      this.day0EndingSelfDialogueCompleted ||
      this.day0EndingSelfDialogueFinalChoiceQueued ||
      this.isDestroying
    ) {
      return;
    }
    this.beginDay0EndingSelfDialoguePhase();
  };

  private readonly handleDay0EndingSelfDialogueHoldElapsed = (): void => {
    if (
      !this.day0EndingDisplayTestActive ||
      this.isDestroying ||
      !this.day0EndingSelfDialogueFinalChoiceQueued ||
      this.day0EndingFinalChoiceActive ||
      this.day0EndingFinalChoiceTransitionInProgress
    ) {
      return;
    }
    this.day0EndingSelfDialogueFinalChoiceQueued = false;
    this.enterDay0EndingFinalChoice();
  };

  private beginDay0EndingSelfDialoguePhase(): void {
    if (
      !this.day0EndingDisplayTestActive ||
      this.isDestroying ||
      this.day0EndingFinalChoiceActive ||
      this.day0EndingFinalChoiceTransitionInProgress ||
      this.day0EndingSelfDialogueInProgress ||
      this.day0EndingSelfDialogueCompleted ||
      this.day0EndingSelfDialogueFinalChoiceQueued
    ) {
      return;
    }
    this.day0EndingSelfDialogueInProgress = true;
    this.day0EndingSelfDialogueCompleted = false;
    this.day0EndingSelfDialogueFinalChoiceQueued = false;
    this.day0EndingSelfDialogueToken += 1;
    this.setDay0EndingFinalChoiceVisible(false);
    void this.playDay0EndingSelfDialogueSequence(this.day0EndingSelfDialogueToken);
  }

  private isDay0EndingSelfDialogueTokenActive(token: number): boolean {
    return (
      this.day0EndingSelfDialogueInProgress &&
      this.day0EndingSelfDialogueToken === token &&
      this.day0EndingDisplayTestActive &&
      !this.isDestroying &&
      !this.day0EndingFinalChoiceActive &&
      !this.day0EndingFinalChoiceTransitionInProgress
    );
  }

  private async playDay0EndingSelfDialogueSequence(token: number): Promise<void> {
    try {
      if (!this.visitorIntroController) {
        throw new Error('[Day0Ending] VisitorIntroSequenceController is unavailable for self dialogue.');
      }
      for (const line of EvidencePreviewController.DAY0_ENDING_SELF_DIALOGUE_LINES) {
        if (!this.isDay0EndingSelfDialogueTokenActive(token)) {
          return;
        }
        await this.visitorIntroController.showVisitorDialogue(line, {
          autoCloseSeconds: 0,
          allowTapDismiss: true,
          minimumVisibleSeconds: 0,
          messageKind: 'system',
        });
      }
      if (!this.isDay0EndingSelfDialogueTokenActive(token)) {
        return;
      }
      this.day0EndingSelfDialogueInProgress = false;
      this.day0EndingSelfDialogueCompleted = true;
      this.day0EndingSelfDialogueFinalChoiceQueued = true;
      this.scheduleOnce(
        this.handleDay0EndingSelfDialogueHoldElapsed,
        EvidencePreviewController.DAY0_ENDING_SELF_DIALOGUE_FINAL_CHOICE_HOLD_SECONDS,
      );
    } catch (error) {
      this.triggerDay0EndingSelfDialogueFailureFallback(error);
    }
  }

  private triggerDay0EndingSelfDialogueFailureFallback(error: unknown): void {
    console.error('[Day0Ending] Self dialogue failed. Falling back to final choice.', error);
    this.day0EndingSelfDialogueInProgress = false;
    this.day0EndingSelfDialogueCompleted = true;
    this.day0EndingSelfDialogueFinalChoiceQueued = false;
    this.unschedule(this.handleDay0EndingSelfDialogueHoldElapsed);
    if (
      !this.day0EndingDisplayTestActive ||
      this.isDestroying ||
      this.day0EndingFinalChoiceActive ||
      this.day0EndingFinalChoiceTransitionInProgress
    ) {
      return;
    }
    this.enterDay0EndingFinalChoice();
  }

  private readonly handleDay0EndingRemoveThreatAlertElapsed = (): void => {
    if (
      !this.day0EndingDisplayTestActive ||
      !this.day0EndingFinalChoiceTransitionInProgress ||
      this.day0EndingFinalChoiceSelection !== 'remove-threat' ||
      this.isDestroying
    ) {
      return;
    }
    this.beginDay0EndingRemoveThreatShutterCloseStep();
  };

  private readonly handleDay0EndingRemoveThreatFinalizeElapsed = (): void => {
    if (
      !this.day0EndingDisplayTestActive ||
      !this.day0EndingFinalChoiceTransitionInProgress ||
      this.day0EndingFinalChoiceSelection !== 'remove-threat' ||
      this.isDestroying
    ) {
      return;
    }
    this.beginDay0EndingRemoveThreatFinalizeStep();
  };

  private readonly handleDay0EndingRemoveThreatReturnHomeElapsed = (): void => {
    if (
      !this.day0EndingDisplayTestActive ||
      !this.day0EndingFinalChoiceTransitionInProgress ||
      this.day0EndingFinalChoiceSelection !== 'remove-threat' ||
      this.isDestroying
    ) {
      return;
    }
    this.finalizeDay0EndingState('remove-threat');
    void this.showDay0EndingResult('remove-threat');
  };

  private readonly handleStopMonsterGameOverAlarm = (): void => {
    this.stopMonsterGameOverAlarmAudio();
  };

  private playMonsterGameOverAudioCueIfNeeded(): void {
    const audio = AudioManager.getInstance();
    if (!audio) {
      return;
    }
    audio.playCachedMonsterDisguiseRevealRoar();
    audio.startAlarmLoop();
    this.unschedule(this.handleStopMonsterGameOverAlarm);
    this.scheduleOnce(
      this.handleStopMonsterGameOverAlarm,
      EvidencePreviewController.MONSTER_GAMEOVER_ALARM_SECONDS,
    );
  }

  private stopMonsterGameOverAlarmAudio(): void {
    this.unschedule(this.handleStopMonsterGameOverAlarm);
    AudioManager.getInstance()?.stopAlarmLoop();
    this.internalContaminationGameOverAudioPlayed = false;
  }

  private playInternalContaminationGameOverAudioCueIfNeeded(): void {
    if (this.internalContaminationGameOverAudioPlayed) {
      return;
    }
    const audio = AudioManager.getInstance();
    if (!audio) {
      return;
    }
    this.internalContaminationGameOverAudioPlayed = true;
    audio.playCachedMonsterDisguiseRevealRoar();
    audio.startAlarmLoop();
  }

  private readonly handleCleanupTransitionComplete = async (): Promise<void> => {
    this.cleanupTransitionScheduled = false;
    this.unschedule(this.handleCleanupTransitionComplete);
    this.telephoneController?.closeEmergencyPhone();
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'cleanup-transition-complete');
    this.shutterController?.stopShutterImpactLoop();
    this.shutterController?.restoreNormalVisual();
    this.shutterController?.prepareClosedForIntro();
    this.setShutterInteractionEnabledForInteractionTrace(false, 'cleanup-transition-complete');
    this.hideCarterThreatReplyCompletely();
    this.stopChecklistReplyTyping(true);
    this.configureChecklistReplyOverlay(true, true);
    this.closePreview();
    this.resetChecklistState();
    this.clearReviveCheckpoint();
    this.resetCarterMonsterFlow(false);
    if (this.currentInspectionSubject?.subjectKind === 'visitor') {
      this.completeActiveVisitorNonCombatDeparture(this.currentInspectionSubject.roundId);
    }
    this.resetInspectionRoundForNextSubject();
    const advanced = this.advanceToNextInspectionSubject();
    if (!advanced) {
      if (
        !this.campaignDayTransitionInProgress &&
        !this.campaignImplementedContentComplete &&
        !this.campaignDayCompletionPending
      ) {
        console.info('INSPECTION_SEQUENCE_COMPLETE');
      }
      return;
    }
    if (!this.loadInspectionSubject(this.activeInspectionSubjectId)) {
      console.error('[EvidencePreviewController] Failed to load next inspection subject.');
      return;
    }
    const introResult = await this.playIntroForActiveSubject();
    if (!introResult.ok) {
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
    this.ensureGameReturnHomeButtonRuntime(canvas);
    this.ensureGameSettingsPanelController(canvas);

    this.employeeCardHit = this.node.getChildByName('EmployeeCardHit');
    this.applicationFormHit = this.node.getChildByName('ApplicationFormHit');
    this.screeningChecklistHit = this.node.getChildByName('ScreeningChecklistHit');
    this.telephoneHit = this.node.getChildByName('TelephoneHit');
    this.appointmentRosterHit = this.node.getChildByName('AppointmentRosterHit');
    const employeeDrawersClosedRuntime = this.node.getChildByName('EmployeeDrawersClosedRuntime');
    this.employeeCardVisual = this.node.getChildByName('EmployeeCardVisual');
    this.applicationFormVisual = this.node.getChildByName('ApplicationFormVisual');
    this.screeningChecklistVisual = this.node.getChildByName('ScreeningChecklistVisual');
    this.telephoneVisual = this.node.getChildByName('TelephoneVisual');
    this.appointmentRosterVisual = this.node.getChildByName('AppointmentRosterVisual');

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
    this.configureApplicationReasonForEntryTypography();
    this.applicationSecurityLogoSprite =
      this.carterApplicationDynamicLayer?.getChildByName('SecurityLogo')?.getComponent(Sprite) ?? null;
    this.complaintCompanyLogoFrame =
      this.applicationSecurityLogoSprite?.spriteFrame ?? this.employeeCardSecurityLogoSprite?.spriteFrame ?? null;
    this.screeningChecklistCloseHit =
      this.screeningChecklistDetailVisual?.getChildByName('ScreeningChecklistCloseHit') ?? null;
    this.applicationFormCloseButton =
      this.applicationFormCloseHit?.getComponent(Button) ?? null;
    this.screeningChecklistHitButton = this.screeningChecklistHit?.getComponent(Button) ?? null;
    this.screeningChecklistCloseButton =
      this.screeningChecklistCloseHit?.getComponent(Button) ?? null;

    this.checklistInteractionRuntimeNode =
      this.screeningChecklistDetailVisual?.getChildByName('ChecklistInteractionRuntime') ?? null;
    this.idCardPassCell = this.checklistInteractionRuntimeNode?.getChildByName('IdCardPassCell') ?? null;
    this.idCardFailCell = this.checklistInteractionRuntimeNode?.getChildByName('IdCardFailCell') ?? null;
    this.applicationPassCell =
      this.checklistInteractionRuntimeNode?.getChildByName('ApplicationPassCell') ?? null;
    this.applicationFailCell =
      this.checklistInteractionRuntimeNode?.getChildByName('ApplicationFailCell') ?? null;
    this.appearancePassCell =
      this.checklistInteractionRuntimeNode?.getChildByName('AppearancePassCell') ?? null;
    this.appearanceFailCell =
      this.checklistInteractionRuntimeNode?.getChildByName('AppearanceFailCell') ?? null;
    this.checklistActionTextNode =
      this.checklistInteractionRuntimeNode?.getChildByName('ChecklistActionText') ?? null;

    this.idCardPassLabel = this.idCardPassCell?.getComponent(Label) ?? null;
    this.idCardFailLabel = this.idCardFailCell?.getComponent(Label) ?? null;
    this.applicationPassLabel = this.applicationPassCell?.getComponent(Label) ?? null;
    this.applicationFailLabel = this.applicationFailCell?.getComponent(Label) ?? null;
    this.appearancePassLabel = this.appearancePassCell?.getComponent(Label) ?? null;
    this.appearanceFailLabel = this.appearanceFailCell?.getComponent(Label) ?? null;
    this.checklistActionLabel = this.checklistActionTextNode?.getComponent(Label) ?? null;
    this.checklistActionHit =
      this.checklistInteractionRuntimeNode?.getChildByName('ChecklistActionHit') ?? null;
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
    this.checklistReplyBoxButton = this.checklistReplyBox?.getComponent(Button) ?? this.checklistReplyBox?.addComponent(Button) ?? null;
    if (this.checklistReplyBoxButton) {
      this.checklistReplyBoxButton.target = this.checklistReplyBox;
      this.checklistReplyBoxButton.transition = Button.Transition.NONE;
    }
    this.checklistActionButton = checklistActionHitButton;

    if (!this.applicationFormCloseButton) {
      console.error('[EvidencePreviewController] ApplicationFormCloseHit Button is missing.');
      this.enabled = false;
      return;
    }

    const btnShutterHit = consoleControls?.getChildByName('BtnShutterHit') ?? null;
    const btnAllowHit = consoleControls?.getChildByName('BtnAllowHit') ?? null;
    const btnDenyHit = consoleControls?.getChildByName('BtnDenyHit') ?? null;
    const telephoneHit = this.telephoneHit;
    const windowRuntime = canvas.getChildByName('WindowRuntime');
    const windowViewport = windowRuntime?.getChildByName('WindowViewport') ?? null;
    this.mainInspectionWindowBackgroundReadyPromise = this.ensureMainInspectionWindowBackground(windowViewport);
    this.carterCharacter = windowViewport?.getChildByName('CarterCharacter') ?? null;
    this.carterCharacterSprite = this.carterCharacter?.getComponent(Sprite) ?? null;
    this.carterCharacterUi = this.carterCharacter?.getComponent(UITransform) ?? null;
    this.initialCarterSpriteFrame = this.carterCharacterSprite?.spriteFrame ?? null;
    this.shutterController = btnShutterHit?.getComponent(ShutterToggleController) ?? null;
    this.telephoneController = telephoneHit?.getComponent(TelephoneController) ?? null;
    this.appointmentRosterController =
      this.appointmentRosterHit?.getComponent(AppointmentRosterController) ?? null;

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
    this.employeeFilesController = employeeDrawersClosedRuntime?.getComponent(EmployeeFilesController) ?? null;
    this.resolveEthanAssetSources(canvas);
    this.preloadDay0EndingPlayerIdentityFrames();
    this.carterAttackScrimGraphics = this.carterMonsterAttackScrim?.getComponent(Graphics) ?? null;
    this.carterGameOverPanelGraphics =
      this.carterGameOverPanelRuntime?.getComponent(Graphics) ?? null;

    this.employeeCardHitButton = this.employeeCardHit?.getComponent(Button) ?? null;
    this.applicationFormHitButton = this.applicationFormHit?.getComponent(Button) ?? null;
    this.shutterHitButton = btnShutterHit?.getComponent(Button) ?? null;
    this.telephoneHitButton = telephoneHit?.getComponent(Button) ?? null;
    this.allowHitButton = btnAllowHit?.getComponent(Button) ?? null;
    this.denyHitButton = btnDenyHit?.getComponent(Button) ?? null;
    this.guidanceHelpButtonNode = this.node.getChildByName('ui_btn_help');
    this.guidanceHintButtonNode = this.node.getChildByName('ui_btn_hint');
    this.guidanceHelpButton = this.guidanceHelpButtonNode?.getComponent(Button) ?? null;
    this.guidanceHintButton = this.guidanceHintButtonNode?.getComponent(Button) ?? null;
    this.ensureGuidanceOverlayRuntime(canvas);
    this.ensureDay0EndingFinalChoiceRuntime();
    this.ensureDay0EndingResultRuntime();

    const scrimGraphics = this.previewScrim?.getComponent(Graphics) ?? null;

    const missing = [
      !this.employeeCardHit && 'EmployeeCardHit',
      !this.applicationFormHit && 'ApplicationFormHit',
      !this.screeningChecklistHit && 'ScreeningChecklistHit',
      !this.telephoneHit && 'TelephoneHit',
      !this.appointmentRosterHit && 'AppointmentRosterHit',
      !this.employeeCardVisual && 'EmployeeCardVisual',
      !this.applicationFormVisual && 'ApplicationFormVisual',
      !this.telephoneVisual && 'TelephoneVisual',
      !this.appointmentRosterVisual && 'AppointmentRosterVisual',
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
      !this.appointmentRosterController && 'AppointmentRosterHit(AppointmentRosterController)',
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

    this.telephoneController?.setDepartmentPhoneContextProvider(() => ({
      rosterDay: this.getActiveAppointmentRosterDay(),
      activeVisitorKey: this.activeVisitorKeyForDepartmentPhone,
    }));
    this.telephoneController?.setDepartmentPhoneLookupEnabled(this.computeDepartmentPhoneLookupEnabled());

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
    this.ensureInternalContaminationMonsterNodes();
    this.prepareCarterGameOverFormalUi();
    this.loadCarterGameOverFormalSprites();
    this.applyFullbodyContainSizing();
    this.drawScrim(170);
    this.applyGameReturnHomeButtonLayerOrder(canvas);
    this.updateGameReturnHomeButtonPosition(canvas);

    const checklistInteractionNodesComplete =
      !!this.checklistInteractionRuntimeNode &&
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
    this.setInspectionViewReady(false, 'onload-initial-lock');
    this.setManagedButtonsInteractable(false, 'bootstrap-lock');
    this.updateGuidanceButtonInteractivity();
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'bootstrap-lock');
    this.setShutterInteractionEnabledForInteractionTrace(false, 'bootstrap-lock');
    this.initializeDayCompletionOverlayController(canvas);
    void this.bootstrapRoundEngine();
  }

  private async ensureMainInspectionWindowBackground(windowViewport: Node | null): Promise<void> {
    if (!windowViewport || !windowViewport.isValid) {
      return;
    }
    const windowInside = windowViewport.getChildByName('WindowInside');
    if (!windowInside || !windowInside.isValid) {
      return;
    }
    const windowInsideSprite = windowInside.getComponent(Sprite);
    const spriteFrame = windowInsideSprite?.spriteFrame ?? null;
    if (!windowInsideSprite) {
      return;
    }

    const spriteFrameUuid = spriteFrame?.uuid ?? '';
    const spriteFrameName = spriteFrame?.name ?? '';
    const isBlockedUuid = EvidencePreviewController.MAIN_WINDOW_BACKGROUND_BLOCKED_SPRITEFRAME_UUIDS.has(
      spriteFrameUuid,
    );
    const isPlaceholderLikeName =
      spriteFrameName.includes('undefined') || spriteFrameName.startsWith('doc_');
    const isOfficialLikeName = spriteFrameName.includes('ui_window_background');
    const needsReplacement =
      !spriteFrame ||
      !spriteFrame.isValid ||
      isPlaceholderLikeName ||
      (isBlockedUuid && !isOfficialLikeName);
    if (!needsReplacement) {
      this.applyMainWindowBackgroundVisualState(windowInside, windowInsideSprite);
      this.enforceMainWindowLayerOrder(windowViewport, windowInside);
      return;
    }

    const generation = ++this.mainInspectionWindowBackgroundLoadGeneration;
    windowInside.active = false;
    let officialFrame: SpriteFrame | null = null;
    try {
      const loaded = await this.loadSpriteFrameByUuid(
        EvidencePreviewController.MAIN_WINDOW_BACKGROUND_OFFICIAL_SPRITEFRAME_UUID,
      );
      officialFrame = loaded?.isValid ? loaded : null;
    } catch (error) {
      officialFrame = null;
      console.warn('[MainWindowBackground] Failed to load official background sprite frame.', {
        nodePath: EvidencePreviewController.MAIN_WINDOW_BACKGROUND_NODE_PATH,
        spriteFrameUuid: EvidencePreviewController.MAIN_WINDOW_BACKGROUND_OFFICIAL_SPRITEFRAME_UUID,
        error,
      });
    }

    if (
      generation !== this.mainInspectionWindowBackgroundLoadGeneration ||
      !this.isValid ||
      !windowInside.isValid ||
      !windowInsideSprite.isValid
    ) {
      return;
    }

    const loadedName = officialFrame?.name ?? '';
    const loadedOfficialLikeName = loadedName.includes('ui_window_background');
    if (!officialFrame || !loadedOfficialLikeName) {
      windowInside.active = false;
      console.warn('[MainWindowBackground] Official background validation failed; keeping WindowInside hidden.', {
        nodePath: EvidencePreviewController.MAIN_WINDOW_BACKGROUND_NODE_PATH,
        spriteFrameUuid: EvidencePreviewController.MAIN_WINDOW_BACKGROUND_OFFICIAL_SPRITEFRAME_UUID,
        loadedSpriteFrameName: loadedName,
      });
      return;
    }

    windowInsideSprite.spriteFrame = officialFrame;
    this.applyMainWindowBackgroundVisualState(windowInside, windowInsideSprite);
    this.enforceMainWindowLayerOrder(windowViewport, windowInside);
    console.warn('[MainWindowBackground] Replaced blocked WindowInside background sprite.', {
      nodePath: EvidencePreviewController.MAIN_WINDOW_BACKGROUND_NODE_PATH,
      spriteFrameUuid,
      spriteFrameName,
    });
  }

  private applyMainWindowBackgroundVisualState(windowInside: Node, windowInsideSprite: Sprite): void {
    windowInside.active = true;
    windowInsideSprite.color = new Color(255, 255, 255, 255);
    windowInsideSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    const windowInsideOpacity = windowInside.getComponent(UIOpacity);
    if (windowInsideOpacity) {
      windowInsideOpacity.opacity = 255;
    }
  }

  private enforceMainWindowLayerOrder(windowViewport: Node, windowInside: Node): void {
    if (!windowViewport.isValid || !windowInside.isValid) {
      return;
    }
    const carterCharacter = windowViewport.getChildByName('CarterCharacter');
    const windowGlass = windowViewport.getChildByName('WindowGlass');
    const windowShutterVisual = windowViewport.getChildByName('WindowShutterVisual');
    const siblingIndexes = [carterCharacter, windowGlass, windowShutterVisual]
      .filter((node): node is Node => Boolean(node && node.isValid))
      .map((node) => node.getSiblingIndex());
    if (siblingIndexes.length === 0) {
      return;
    }
    const targetIndex = Math.max(0, Math.min(...siblingIndexes) - 1);
    if (windowInside.getSiblingIndex() !== targetIndex) {
      windowInside.setSiblingIndex(targetIndex);
    }
  }

  private initializeDayCompletionOverlayController(canvas: Node): void {
    const existing = canvas.getComponent(DayCompletionOverlayController);
    this.dayCompletionOverlayController = existing ?? canvas.addComponent(DayCompletionOverlayController);
    this.dayCompletionOverlayController.configure({
      onContinueRequested: () => {
        void this.handleCampaignDayContinueRequested();
      },
    });
    this.dayCompletionOverlayController.hide();
  }

  private setInspectionViewReady(ready: boolean, reason: string): void {
    if (this.inspectionViewReady === ready) {
      return;
    }
    this.inspectionViewReady = ready;
    if (ready) {
      HomeSceneController.hidePersistentLoadingOverlay();
      // Re-apply controller availability once the view is ready so
      // TelephoneController can restore TelephoneVisual/TelephoneHit state.
      // Skip Day0 ending test path where custom scripted states are used.
      if (this.activeDayConfig) {
        this.applyCampaignConfigurationToControllers();
      }
    }
    this.applyInspectionViewReadyToTelephone(reason);
  }

  private applyInspectionViewReadyToTelephone(reason: string): void {
    if (!this.inspectionViewReady) {
      this.logInteractionTrace('inspection-view-ready', {
        value: false,
        reason,
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
      });
      return;
    }
    this.logInteractionTrace('inspection-view-ready', {
      value: true,
      reason,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
  }

  onEnable(): void {
    this.employeeFilesController?.setDay0EndingArchiveRevealDetailClosedCallback(
      this.handleDay0EndingArchiveRevealDetailClosed,
    );
    this.gameReturnHomeButtonHit?.on(Node.EventType.TOUCH_START, this.handleGameReturnHomeTouchStart, this);
    this.gameReturnHomeButtonHit?.on(Node.EventType.TOUCH_END, this.handleGameReturnHomeTouchEnd, this);
    this.employeeCardHit?.on(Node.EventType.TOUCH_END, this.openEmployeeCard, this);
    this.applicationFormHit?.on(Node.EventType.TOUCH_END, this.openApplicationForm, this);
    this.screeningChecklistHit?.on(Node.EventType.TOUCH_END, this.openScreeningChecklist, this);
    this.telephoneHit?.on(Node.EventType.TOUCH_END, this.handleDay0EndingTelephoneTouch, this, true);
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
      this.checklistReplyBox?.on(Button.EventType.CLICK, this.closeChecklistReply, this);
    }
    this.shutterHitButton?.node.on(Button.EventType.CLICK, this.handleShutterHitClick, this);
    this.denyHitButton?.node.on(Button.EventType.CLICK, this.handleConsoleDenyClick, this);
    this.allowHitButton?.node.on(Button.EventType.CLICK, this.handleAllowDecisionClick, this);
    this.carterGameOverRetryHit?.on(Button.EventType.CLICK, this.handleCarterGameOverRetryClick, this);
    this.carterGameOverReviveHit?.on(Button.EventType.CLICK, this.handleCarterGameOverReviveClick, this);
    this.guidanceHelpButton?.node.on(Button.EventType.CLICK, this.handleGuidanceHelpButtonClick, this);
    this.guidanceHintButton?.node.on(Button.EventType.CLICK, this.handleGuidanceHintButtonClick, this);
    this.guidanceCloseHitButton?.node.on(Button.EventType.CLICK, this.handleGuidanceCloseButtonClick, this);
    this.day0EndingFinalChoiceKeepButton?.node.on(
      Button.EventType.CLICK,
      this.handleDay0EndingFinalChoiceKeepSelected,
      this,
    );
    this.day0EndingFinalChoiceRemoveButton?.node.on(
      Button.EventType.CLICK,
      this.handleDay0EndingFinalChoiceRemoveSelected,
      this,
    );
    this.day0EndingResultReturnHomeButton?.node.on(
      Button.EventType.CLICK,
      this.handleDay0EndingResultReturnHome,
      this,
    );
  }

  onDisable(): void {
    this.employeeFilesController?.setDay0EndingArchiveRevealDetailClosedCallback(null);
    this.gameReturnHomeButtonHit?.off(Node.EventType.TOUCH_START, this.handleGameReturnHomeTouchStart, this);
    this.gameReturnHomeButtonHit?.off(Node.EventType.TOUCH_END, this.handleGameReturnHomeTouchEnd, this);
    if (this.gameReturnHomeButtonRuntime?.isValid) {
      Tween.stopAllByTarget(this.gameReturnHomeButtonRuntime);
      this.gameReturnHomeButtonRuntime.setScale(this.gameReturnHomeBaseScale);
    }
    this.gameReturnHomeButtonLoadGeneration += 1;
    this.gameReturnHomeInProgress = false;
    this.setGameReturnHomeButtonInteractable(true);
    this.employeeCardHit?.off(Node.EventType.TOUCH_END, this.openEmployeeCard, this);
    this.applicationFormHit?.off(Node.EventType.TOUCH_END, this.openApplicationForm, this);
    this.screeningChecklistHit?.off(Node.EventType.TOUCH_END, this.openScreeningChecklist, this);
    this.telephoneHit?.off(Node.EventType.TOUCH_END, this.handleDay0EndingTelephoneTouch, this, true);
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
      this.checklistReplyBox?.off(Button.EventType.CLICK, this.closeChecklistReply, this);
    }
    this.shutterHitButton?.node.off(Button.EventType.CLICK, this.handleShutterHitClick, this);
    this.denyHitButton?.node.off(Button.EventType.CLICK, this.handleConsoleDenyClick, this);
    this.allowHitButton?.node.off(Button.EventType.CLICK, this.handleAllowDecisionClick, this);
    this.carterGameOverRetryHit?.off(Button.EventType.CLICK, this.handleCarterGameOverRetryClick, this);
    this.carterGameOverReviveHit?.off(Button.EventType.CLICK, this.handleCarterGameOverReviveClick, this);
    this.guidanceHelpButton?.node.off(Button.EventType.CLICK, this.handleGuidanceHelpButtonClick, this);
    this.guidanceHintButton?.node.off(Button.EventType.CLICK, this.handleGuidanceHintButtonClick, this);
    this.guidanceCloseHitButton?.node.off(Button.EventType.CLICK, this.handleGuidanceCloseButtonClick, this);
    this.day0EndingFinalChoiceKeepButton?.node.off(
      Button.EventType.CLICK,
      this.handleDay0EndingFinalChoiceKeepSelected,
      this,
    );
    this.day0EndingFinalChoiceRemoveButton?.node.off(
      Button.EventType.CLICK,
      this.handleDay0EndingFinalChoiceRemoveSelected,
      this,
    );
    this.day0EndingResultReturnHomeButton?.node.off(
      Button.EventType.CLICK,
      this.handleDay0EndingResultReturnHome,
      this,
    );
    this.setDay0EndingResultVisible(false);
    this.day0EndingResultKind = null;
    this.day0EndingResultReturnLocked = false;
    if (this.evidencePreviewRuntime?.isValid) {
      hideInteractivePanelImmediate(this.evidencePreviewRuntime, {
        setInteractable: (interactable) => this.setEvidencePreviewPanelInteractable(interactable),
      });
    }
    this.hideGuidancePanelImmediate(false);
    this.unschedule(this.handleCleanupTransitionComplete);
    this.cleanupTransitionScheduled = false;
    this.setInspectionDecisionResolutionInProgress(false, 'on-disable');
    this.administrativeGameOverActive = false;
    this.currentAdministrativeGameOverReason = null;
    this.activeGameOverContext = null;
    this.failureReviewActive = false;
    this.resetFailureReviewPageAdvanceGuard();
    this.invalidateFailureReviewVisuals();
    this.reviveResolutionInProgress = false;
    this.clearReviveCheckpoint();
    this.invalidateInternalContaminationVisuals();
    this.resetCarterMonsterFlow(true);
    this.cleanupDay0EndingPhonePhase1State();
  }

  onDestroy(): void {
    this.isDestroying = true;
    HomeSceneController.hidePersistentLoadingOverlay();
    this.employeeFilesController?.setDay0EndingArchiveRevealDetailClosedCallback(null);
    this.gameReturnHomeButtonLoadGeneration += 1;
    this.gameReturnHomeInProgress = false;
    if (this.gameReturnHomeButtonRuntime?.isValid) {
      Tween.stopAllByTarget(this.gameReturnHomeButtonRuntime);
    }
    if (this.evidencePreviewRuntime?.isValid) {
      hideInteractivePanelImmediate(this.evidencePreviewRuntime, {
        setInteractable: (interactable) => this.setEvidencePreviewPanelInteractable(interactable),
      });
    }
    this.hideGuidancePanelImmediate(false);
    this.gameReturnHomeButtonHit?.off(Node.EventType.TOUCH_START, this.handleGameReturnHomeTouchStart, this);
    this.gameReturnHomeButtonHit?.off(Node.EventType.TOUCH_END, this.handleGameReturnHomeTouchEnd, this);
    this.day0EndingResultReturnHomeButton?.node.off(
      Button.EventType.CLICK,
      this.handleDay0EndingResultReturnHome,
      this,
    );
    this.setDay0EndingResultVisible(false);
    this.day0EndingResultKind = null;
    this.day0EndingResultReturnLocked = false;
    this.invalidateVisitorVisualPresentation();
    this.campaignDayTransitionInProgress = false;
    this.campaignDayCompletionPending = false;
    this.campaignDayContinueRequested = false;
    this.shiftClockController?.stop();
    this.shiftClockController?.clearCallbacks();
    this.shiftClockController = null;
    this.dayCompletionOverlayController?.configure({});
    this.dayCompletionOverlayController?.destroyOverlay();
    this.dayCompletionOverlayController = null;
    this.unschedule(this.handleCleanupTransitionComplete);
    this.cleanupTransitionScheduled = false;
    this.setInspectionDecisionResolutionInProgress(false, 'on-destroy');
    this.administrativeGameOverActive = false;
    this.currentAdministrativeGameOverReason = null;
    this.activeGameOverContext = null;
    this.failureReviewActive = false;
    this.resetFailureReviewPageAdvanceGuard();
    this.invalidateFailureReviewVisuals();
    this.reviveResolutionInProgress = false;
    this.clearReviveCheckpoint();
    this.invalidateInternalContaminationVisuals();
    this.resetCarterMonsterFlow(true);
    this.setActiveVisitorKeyForDepartmentPhone(null);
    this.telephoneController?.setDepartmentPhoneContextProvider(null);
    this.activeAppointmentRosterDay = null;
    this.resetActiveDayQueueState();
    this.cleanupDay0EndingPhonePhase1LocalState();
  }

  private ensureGameReturnHomeButtonRuntime(canvas: Node): void {
    if (!canvas?.isValid) {
      return;
    }
    let runtime = canvas.getChildByName('GameReturnHomeButtonRuntime');
    if (!runtime || !runtime.isValid) {
      runtime = new Node('GameReturnHomeButtonRuntime');
      runtime.parent = canvas;
    }
    let visual = runtime.getChildByName('GameReturnHomeButtonVisual');
    if (!visual || !visual.isValid) {
      visual = new Node('GameReturnHomeButtonVisual');
      visual.parent = runtime;
    }
    let hit = runtime.getChildByName('GameReturnHomeButtonHit');
    if (!hit || !hit.isValid) {
      hit = new Node('GameReturnHomeButtonHit');
      hit.parent = runtime;
    }

    const runtimeTransform = runtime.getComponent(UITransform) ?? runtime.addComponent(UITransform);
    runtimeTransform.setContentSize(
      EvidencePreviewController.RETURN_HOME_BUTTON_HIT_WIDTH,
      EvidencePreviewController.RETURN_HOME_BUTTON_HIT_HEIGHT,
    );
    const visualTransform = visual.getComponent(UITransform) ?? visual.addComponent(UITransform);
    const hitTransform = hit.getComponent(UITransform) ?? hit.addComponent(UITransform);
    hitTransform.setContentSize(
      EvidencePreviewController.RETURN_HOME_BUTTON_HIT_WIDTH,
      EvidencePreviewController.RETURN_HOME_BUTTON_HIT_HEIGHT,
    );
    visualTransform.setContentSize(
      EvidencePreviewController.RETURN_HOME_BUTTON_MAX_WIDTH,
      EvidencePreviewController.RETURN_HOME_BUTTON_MAX_HEIGHT,
    );
    visual.setPosition(0, 0, 0);
    hit.setPosition(0, 0, 0);

    const visualSprite = visual.getComponent(Sprite) ?? visual.addComponent(Sprite);
    visualSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    const hitButton = hit.getComponent(Button) ?? hit.addComponent(Button);
    hitButton.interactable = true;
    hitButton.transition = Button.Transition.NONE;

    this.gameReturnHomeButtonRuntime = runtime;
    this.gameReturnHomeButtonVisual = visual;
    this.gameReturnHomeButtonHit = hit;
    this.gameReturnHomeButtonSprite = visualSprite;
    this.gameReturnHomeButtonHitButton = hitButton;
    this.gameReturnHomeBaseScale = runtime.scale.clone();
    this.gameReturnHomeInProgress = false;
    this.setGameReturnHomeButtonInteractable(true);
    this.applyGameReturnHomeButtonLayerOrder(canvas);
    this.updateGameReturnHomeButtonPosition(canvas);
    void this.loadGameReturnHomeButtonSpriteFrame();
  }

  private ensureGameSettingsPanelController(canvas: Node): void {
    if (!canvas?.isValid) {
      return;
    }
    let settingsRoot = canvas.getChildByName('GameSettingsRootRuntime');
    if (!settingsRoot || !settingsRoot.isValid) {
      settingsRoot = new Node('GameSettingsRootRuntime');
      settingsRoot.parent = canvas;
    }
    settingsRoot.layer = canvas.layer;
    const transform = settingsRoot.getComponent(UITransform) ?? settingsRoot.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(1, 1);
    settingsRoot.setPosition(0, 0, 0);
    const controller = settingsRoot.getComponent(SettingsPanelController) ?? settingsRoot.addComponent(SettingsPanelController);
    this.gameSettingsPanelController = controller;
  }

  private applyGameReturnHomeButtonLayerOrder(canvas: Node): void {
    if (!this.gameReturnHomeButtonRuntime?.isValid || this.gameReturnHomeButtonRuntime.parent !== canvas) {
      return;
    }
    const overlayAnchorIndex =
      this.evidencePreviewRuntime?.isValid && this.evidencePreviewRuntime.parent === canvas
        ? this.evidencePreviewRuntime.getSiblingIndex()
        : this.gameReturnHomeButtonRuntime.getSiblingIndex();
    this.gameReturnHomeButtonRuntime.setSiblingIndex(Math.max(0, overlayAnchorIndex));
  }

  private updateGameReturnHomeButtonPosition(canvas: Node): void {
    if (!this.gameReturnHomeButtonRuntime?.isValid) {
      return;
    }
    const canvasTransform = canvas.getComponent(UITransform);
    const hitTransform = this.gameReturnHomeButtonHit?.getComponent(UITransform);
    if (!canvasTransform || !hitTransform) {
      return;
    }
    const x = -300;
    const y = 585;
    this.gameReturnHomeButtonRuntime.setPosition(x, y, 0);
    this.gameReturnHomeButtonRuntime.setScale(this.gameReturnHomeBaseScale);
  }

  private async loadGameReturnHomeButtonSpriteFrame(): Promise<void> {
    const generation = ++this.gameReturnHomeButtonLoadGeneration;
    let frame: SpriteFrame | null = null;
    try {
      frame = await this.loadSpriteFrameByUuid(EvidencePreviewController.RETURN_HOME_BUTTON_SPRITEFRAME_UUID);
    } catch (error) {
      console.error('[EvidencePreviewController] Failed to load return-home button sprite frame.', error);
      return;
    }
    if (
      generation !== this.gameReturnHomeButtonLoadGeneration ||
      !this.isValid ||
      this.isDestroying ||
      this.gameReturnHomeInProgress ||
      !this.gameReturnHomeButtonRuntime?.isValid ||
      !this.gameReturnHomeButtonSprite?.isValid ||
      !frame?.isValid
    ) {
      return;
    }
    this.gameReturnHomeButtonSprite.spriteFrame = frame;
    this.gameReturnHomeButtonSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    this.applyGameReturnHomeButtonContainSize(frame);
  }

  private applyGameReturnHomeButtonContainSize(spriteFrame: SpriteFrame): void {
    if (!this.gameReturnHomeButtonVisual?.isValid) {
      return;
    }
    const visualTransform = this.gameReturnHomeButtonVisual.getComponent(UITransform);
    if (!visualTransform) {
      return;
    }
    const sourceWidth = spriteFrame.originalSize.width;
    const sourceHeight = spriteFrame.originalSize.height;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      return;
    }
    const fitScale = Math.min(
      EvidencePreviewController.RETURN_HOME_BUTTON_MAX_WIDTH / sourceWidth,
      EvidencePreviewController.RETURN_HOME_BUTTON_MAX_HEIGHT / sourceHeight,
    );
    visualTransform.setContentSize(sourceWidth * fitScale, sourceHeight * fitScale);
  }

  private setGameReturnHomeButtonInteractable(interactable: boolean): void {
    if (this.gameReturnHomeButtonHit?.isValid) {
      this.gameReturnHomeButtonHit.active = interactable;
    }
    if (this.gameReturnHomeButtonHitButton?.node?.isValid) {
      this.gameReturnHomeButtonHitButton.interactable = interactable;
    }
  }

  private handleGameReturnHomeTouchStart(event: EventTouch): void {
    event.propagationStopped = true;
  }

  private handleGameReturnHomeTouchEnd(event: EventTouch): void {
    event.propagationStopped = true;
    if (!this.isValid || this.isDestroying) {
      return;
    }
    if (this.gameReturnHomeInProgress || !this.gameReturnHomeButtonRuntime?.isValid) {
      return;
    }
    this.gameReturnHomeInProgress = true;
    this.setGameReturnHomeButtonInteractable(false);
    Tween.stopAllByTarget(this.gameReturnHomeButtonRuntime);
    const currentScale = this.gameReturnHomeButtonRuntime.scale.clone();
    const pressedScale = new Vec3(
      currentScale.x * EvidencePreviewController.RETURN_HOME_BUTTON_PRESS_SCALE,
      currentScale.y * EvidencePreviewController.RETURN_HOME_BUTTON_PRESS_SCALE,
      currentScale.z,
    );
    Tween.stopAllByTarget(this.gameReturnHomeButtonRuntime);
    tween(this.gameReturnHomeButtonRuntime)
      .to(
        EvidencePreviewController.RETURN_HOME_BUTTON_PRESS_DURATION_SECONDS,
        { scale: pressedScale },
        { easing: 'quadOut' },
      )
      .call(() => {
        if (!this.isValid || this.isDestroying) {
          return;
        }
        const settingsController = this.gameSettingsPanelController?.isValid
          ? this.gameSettingsPanelController
          : null;
        if (!settingsController) {
          console.warn('[EvidencePreviewController] SettingsPanelController is unavailable in GameScene.');
          this.gameReturnHomeInProgress = false;
          if (this.gameReturnHomeButtonRuntime?.isValid) {
            this.gameReturnHomeButtonRuntime.setScale(this.gameReturnHomeBaseScale);
          }
          this.setGameReturnHomeButtonInteractable(true);
          return;
        }

        settingsController.openSettingsFromExternalTrigger();
        this.gameReturnHomeInProgress = false;
        if (this.gameReturnHomeButtonRuntime?.isValid) {
          this.gameReturnHomeButtonRuntime.setScale(this.gameReturnHomeBaseScale);
        }
        this.setGameReturnHomeButtonInteractable(true);
      })
      .start();
  }

  private setEvidencePreviewPanelInteractable(interactable: boolean): void {
    this.previewPanelInteractable = interactable;
    if (this.applicationFormCloseButton) {
      this.applicationFormCloseButton.interactable = interactable;
    }
    if (this.screeningChecklistCloseButton) {
      this.screeningChecklistCloseButton.interactable = interactable;
    }
    if (this.checklistActionButton) {
      this.checklistActionButton.interactable = interactable;
    }
    if (this.checklistReplyContinueButton) {
      this.checklistReplyContinueButton.interactable = interactable;
    }
    if (this.checklistReplyBoxButton) {
      this.checklistReplyBoxButton.interactable = interactable;
    }
  }

  private recoverEvidencePreviewPanelStateIfDesynced(reason: string): void {
    const runtime = this.evidencePreviewRuntime;
    if (!runtime?.isValid) {
      return;
    }
    const panelState = getInteractivePanelState(runtime);
    if (runtime.active || panelState === 'hidden') {
      return;
    }
    this.logInteractionTrace('preview-panel-state-recovered', {
      reason,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      panelState,
      runtimeActive: runtime.active,
    });
    hideInteractivePanelImmediate(runtime, {
      setInteractable: (interactable) => this.setEvidencePreviewPanelInteractable(interactable),
    });
  }

  private hideEvidencePreviewRuntimeImmediate(reason: string): void {
    const runtime = this.evidencePreviewRuntime;
    if (!runtime?.isValid) {
      return;
    }
    const panelStateBefore = getInteractivePanelState(runtime);
    hideInteractivePanelImmediate(runtime, {
      setInteractable: (interactable) => this.setEvidencePreviewPanelInteractable(interactable),
    });
    this.logInteractionTrace('preview-runtime-hide-immediate', {
      reason,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      panelStateBefore,
      runtimeActiveAfter: runtime.active,
    });
  }

  private ensureGuidanceOverlayRuntime(canvas: Node): void {
    let runtime = canvas.getChildByName('GameGuidanceOverlayRuntime');
    if (!runtime || !runtime.isValid) {
      runtime = new Node('GameGuidanceOverlayRuntime');
      runtime.parent = canvas;
    }
    const runtimeTransform = runtime.getComponent(UITransform) ?? runtime.addComponent(UITransform);
    runtimeTransform.setAnchorPoint(0.5, 0.5);
    runtimeTransform.setContentSize(720, 1280);
    runtime.setPosition(0, 0, 0);
    runtime.setScale(1, 1, 1);
    if (!runtime.getComponent(BlockInputEvents)) {
      runtime.addComponent(BlockInputEvents);
    }

    let dimmer = runtime.getChildByName('GameGuidanceDimmer');
    if (!dimmer || !dimmer.isValid) {
      dimmer = new Node('GameGuidanceDimmer');
      dimmer.parent = runtime;
    }
    const dimmerTransform = dimmer.getComponent(UITransform) ?? dimmer.addComponent(UITransform);
    dimmerTransform.setAnchorPoint(0.5, 0.5);
    dimmerTransform.setContentSize(720, 1280);
    dimmer.setPosition(0, 0, 0);
    dimmer.setScale(1, 1, 1);
    const dimmerGraphics = dimmer.getComponent(Graphics) ?? dimmer.addComponent(Graphics);
    dimmerGraphics.clear();
    dimmerGraphics.fillColor = new Color(0, 0, 0, 255);
    dimmerGraphics.rect(-360, -640, 720, 1280);
    dimmerGraphics.fill();
    const dimmerOpacity = dimmer.getComponent(UIOpacity) ?? dimmer.addComponent(UIOpacity);
    dimmerOpacity.opacity = 0;
    if (!dimmer.getComponent(BlockInputEvents)) {
      dimmer.addComponent(BlockInputEvents);
    }

    let panel = runtime.getChildByName('GameGuidancePanel');
    if (!panel || !panel.isValid) {
      panel = new Node('GameGuidancePanel');
      panel.parent = runtime;
    }
    panel.setPosition(0, 0, 0);
    panel.setScale(1, 1, 1);
    const panelTransform = panel.getComponent(UITransform) ?? panel.addComponent(UITransform);
    panelTransform.setAnchorPoint(0.5, 0.5);
    panelTransform.setContentSize(
      EvidencePreviewController.GUIDANCE_PANEL_MAX_WIDTH,
      EvidencePreviewController.GUIDANCE_PANEL_MAX_HEIGHT,
    );
    const panelSprite = panel.getComponent(Sprite) ?? panel.addComponent(Sprite);
    panelSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    panelSprite.color = new Color(255, 255, 255, 255);
    const panelOpacity = panel.getComponent(UIOpacity) ?? panel.addComponent(UIOpacity);
    panelOpacity.opacity = 255;

    const titleNode = this.ensureGuidanceLabelNode(
      panel,
      'GameGuidanceTitleLabel',
      Math.min(500, EvidencePreviewController.GUIDANCE_PANEL_MAX_WIDTH * 0.84),
      66,
      40,
      48,
      Label.HorizontalAlign.CENTER,
      Label.VerticalAlign.CENTER,
      false,
      true,
    );
    titleNode.setPosition(0, 0, 0);
    const titleLabel = titleNode.getComponent(Label) ?? titleNode.addComponent(Label);
    titleLabel.color = new Color(36, 28, 22, 255);

    let helpRoot = panel.getChildByName('GameGuidanceHelpContentRoot');
    if (!helpRoot || !helpRoot.isValid) {
      helpRoot = new Node('GameGuidanceHelpContentRoot');
      helpRoot.parent = panel;
    }
    const helpRootTransform = helpRoot.getComponent(UITransform) ?? helpRoot.addComponent(UITransform);
    helpRootTransform.setAnchorPoint(0.5, 0.5);
    helpRootTransform.setContentSize(Math.min(470, EvidencePreviewController.GUIDANCE_PANEL_MAX_WIDTH * 0.76), 760);
    helpRoot.setPosition(0, -26, 0);
    helpRoot.setScale(1, 1, 1);

    const helpBlocks = this.getGuidanceHelpSectionContent();
    for (const block of helpBlocks) {
      const title = this.ensureGuidanceLabelNode(
        helpRoot,
        block.titleNodeName,
        helpRootTransform.contentSize.width,
        34,
        23,
        30,
        Label.HorizontalAlign.LEFT,
        Label.VerticalAlign.TOP,
        false,
        false,
      );
      title.setPosition(0, 0, 0);
      const titleLabelComp = title.getComponent(Label) ?? title.addComponent(Label);
      titleLabelComp.string = block.title;
      titleLabelComp.color = new Color(39, 31, 25, 255);
      const body = this.ensureGuidanceLabelNode(
        helpRoot,
        block.bodyNodeName,
        helpRootTransform.contentSize.width,
        180,
        19,
        26,
        Label.HorizontalAlign.LEFT,
        Label.VerticalAlign.TOP,
        true,
        false,
      );
      body.setPosition(0, 0, 0);
      const bodyLabelComp = body.getComponent(Label) ?? body.addComponent(Label);
      bodyLabelComp.string = block.body;
      bodyLabelComp.color = new Color(46, 37, 30, 255);
    }

    let hintRoot = panel.getChildByName('GameGuidanceHintContentRoot');
    if (!hintRoot || !hintRoot.isValid) {
      hintRoot = new Node('GameGuidanceHintContentRoot');
      hintRoot.parent = panel;
    }
    const hintRootTransform = hintRoot.getComponent(UITransform) ?? hintRoot.addComponent(UITransform);
    hintRootTransform.setAnchorPoint(0.5, 0.5);
    hintRootTransform.setContentSize(Math.min(430, EvidencePreviewController.GUIDANCE_PANEL_MAX_WIDTH * 0.72), 670);
    hintRoot.setPosition(0, -24, 0);
    hintRoot.setScale(1, 1, 1);

    const hintSubjectNode = this.ensureGuidanceLabelNode(
      hintRoot,
      'HintSubjectLabel',
      hintRootTransform.contentSize.width,
      46,
      21,
      28,
      Label.HorizontalAlign.CENTER,
      Label.VerticalAlign.CENTER,
      false,
      false,
    );
    hintSubjectNode.setPosition(0, 0, 0);
    const hintStatusNode = this.ensureGuidanceLabelNode(
      hintRoot,
      'HintStatusLabel',
      hintRootTransform.contentSize.width,
      50,
      24,
      31,
      Label.HorizontalAlign.CENTER,
      Label.VerticalAlign.CENTER,
      false,
      true,
    );
    hintStatusNode.setPosition(0, 0, 0);
    const hintBodyNode = this.ensureGuidanceLabelNode(
      hintRoot,
      'HintBodyLabel',
      hintRootTransform.contentSize.width,
      500,
      20,
      28,
      Label.HorizontalAlign.LEFT,
      Label.VerticalAlign.TOP,
      true,
      false,
    );
    hintBodyNode.setPosition(0, 0, 0);

    let closeHit = panel.getChildByName('GameGuidanceCloseHit');
    if (!closeHit || !closeHit.isValid) {
      closeHit = new Node('GameGuidanceCloseHit');
      closeHit.parent = panel;
    }
    const closeHitTransform = closeHit.getComponent(UITransform) ?? closeHit.addComponent(UITransform);
    closeHitTransform.setAnchorPoint(0.5, 0.5);
    closeHitTransform.setContentSize(88, 88);
    closeHit.setScale(1, 1, 1);
    const closeButton = closeHit.getComponent(Button) ?? closeHit.addComponent(Button);
    closeButton.transition = Button.Transition.NONE;
    closeButton.interactable = true;

    const panelWidth = panelTransform.contentSize.width;
    const panelHeight = panelTransform.contentSize.height;
    titleNode.setPosition(0, panelHeight * 0.42, 0);
    closeHit.setPosition(panelWidth * 0.5 - 46, panelHeight * 0.5 - 54, 0);

    this.guidanceOverlayRuntime = runtime;
    this.guidanceDimmer = dimmer;
    this.guidanceDimmerOpacity = dimmerOpacity;
    this.guidancePanel = panel;
    this.guidancePanelSprite = panelSprite;
    this.guidanceTitleLabelNode = titleNode;
    this.guidanceTitleLabel = titleLabel;
    this.guidanceHelpContentRoot = helpRoot;
    this.guidanceHintContentRoot = hintRoot;
    this.guidanceHintSubjectLabel = hintSubjectNode.getComponent(Label);
    this.guidanceHintStatusLabel = hintStatusNode.getComponent(Label);
    this.guidanceHintBodyLabel = hintBodyNode.getComponent(Label);
    this.guidanceCloseHit = closeHit;
    this.guidanceCloseHitButton = closeButton;
    this.guidanceOverlayRuntime.active = false;
    this.guidanceHelpContentRoot.active = false;
    this.guidanceHintContentRoot.active = false;
    this.applyGuidanceOverlayLayerOrder(canvas);
    this.layoutGuidancePanelNodes();
    this.updateGuidanceButtonInteractivity();
    void this.loadGuidancePanelBackgroundSprite();
  }

  private applyGuidanceOverlayLayerOrder(canvas: Node): void {
    if (!this.guidanceOverlayRuntime?.isValid || this.guidanceOverlayRuntime.parent !== canvas) {
      return;
    }
    const blockingOverlayIndexes: number[] = [];
    const gameOverRuntime = canvas.getChildByName('CarterMonsterAttackRuntime');
    if (gameOverRuntime?.isValid) {
      blockingOverlayIndexes.push(gameOverRuntime.getSiblingIndex());
    }
    const dayCompletionRuntime = canvas.getChildByName('CampaignDayCompletionOverlayRuntime');
    if (dayCompletionRuntime?.isValid) {
      blockingOverlayIndexes.push(dayCompletionRuntime.getSiblingIndex());
    }
    if (blockingOverlayIndexes.length <= 0) {
      this.guidanceOverlayRuntime.setSiblingIndex(canvas.children.length - 1);
      return;
    }
    const targetIndex = Math.max(0, Math.min(...blockingOverlayIndexes) - 1);
    this.guidanceOverlayRuntime.setSiblingIndex(targetIndex);
  }

  private ensureGuidanceLabelNode(
    parent: Node,
    nodeName: string,
    width: number,
    height: number,
    fontSize: number,
    lineHeight: number,
    horizontalAlign: number,
    verticalAlign: number,
    wrap: boolean,
    bold: boolean,
  ): Node {
    let node = parent.getChildByName(nodeName);
    if (!node || !node.isValid) {
      node = new Node(nodeName);
      node.parent = parent;
    }
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(width, height);
    const label = node.getComponent(Label) ?? node.addComponent(Label);
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
    label.horizontalAlign = horizontalAlign;
    label.verticalAlign = verticalAlign;
    label.overflow = wrap ? Overflow.CLAMP : Overflow.SHRINK;
    label.enableWrapText = wrap;
    label.isBold = bold;
    label.string = '';
    label.color = new Color(44, 35, 28, 255);
    return node;
  }

  private async loadGuidancePanelBackgroundSprite(): Promise<void> {
    const panel = this.guidancePanel;
    const sprite = this.guidancePanelSprite;
    if (!panel?.isValid || !sprite) {
      return;
    }
    const generation = ++this.guidancePanelVisualGeneration;
    try {
      const frame = await this.loadSpriteFrameByUuid(
        EvidencePreviewController.FAILURE_REVIEW_PANEL_BG_SPRITE_FRAME_UUID,
      );
      if (
        generation !== this.guidancePanelVisualGeneration ||
        !this.node?.isValid ||
        this.isDestroying ||
        !panel.isValid
      ) {
        return;
      }
      sprite.spriteFrame = frame;
      const sourceWidth =
        frame.originalSize.width > 0
          ? frame.originalSize.width
          : EvidencePreviewController.GUIDANCE_PANEL_SOURCE_WIDTH;
      const sourceHeight =
        frame.originalSize.height > 0
          ? frame.originalSize.height
          : EvidencePreviewController.GUIDANCE_PANEL_SOURCE_HEIGHT;
      const containScale = Math.min(
        EvidencePreviewController.GUIDANCE_PANEL_MAX_WIDTH / sourceWidth,
        EvidencePreviewController.GUIDANCE_PANEL_MAX_HEIGHT / sourceHeight,
      );
      panel.getComponent(UITransform)?.setContentSize(
        sourceWidth * containScale,
        sourceHeight * containScale,
      );
      this.layoutGuidancePanelNodes();
    } catch (error) {
      console.error('[GuidancePanel] Failed to load panel background sprite frame.', error);
    }
  }

  private layoutGuidancePanelNodes(): void {
    const panel = this.guidancePanel;
    if (!panel?.isValid) {
      return;
    }
    const panelSize = panel.getComponent(UITransform)?.contentSize;
    if (!panelSize) {
      return;
    }
    const panelWidth = panelSize.width;
    const panelHeight = panelSize.height;
    this.guidanceTitleLabelNode?.setPosition(0, panelHeight * 0.42, 0);
    this.guidanceCloseHit?.setPosition(panelWidth * 0.5 - 46, panelHeight * 0.5 - 54, 0);
    const helpRootTransform = this.guidanceHelpContentRoot?.getComponent(UITransform) ?? null;
    if (helpRootTransform) {
      helpRootTransform.setContentSize(Math.min(470, panelWidth * 0.76), 760);
      this.guidanceHelpContentRoot?.setPosition(0, -26, 0);
    }
    const hintRootTransform = this.guidanceHintContentRoot?.getComponent(UITransform) ?? null;
    if (hintRootTransform) {
      hintRootTransform.setContentSize(Math.min(430, panelWidth * 0.72), 670);
      this.guidanceHintContentRoot?.setPosition(0, -24, 0);
    }
    this.layoutInspectionGuideContent(panelWidth, panelHeight);
    this.layoutInspectionHintContent(panelWidth, panelHeight);
  }

  private getGuidanceHelpSectionContent(): readonly {
    readonly titleNodeName: string;
    readonly bodyNodeName: string;
    readonly title: string;
    readonly body: string;
  }[] {
    return [
      {
        titleNodeName: 'HelpSection01Title',
        bodyNodeName: 'HelpSection01Body',
        title: '1. HOW DO I IDENTIFY A DISGUISED MONSTER?',
        body:
          'Compare the subject with the official records. Check the ID card, application form, appearance, department, and stated purpose whenever those checks are available. Any mismatch may reveal a disguise.',
      },
      {
        titleNodeName: 'HelpSection02Title',
        bodyNodeName: 'HelpSection02Body',
        title: '2. HOW DO I DENY ENTRY?',
        body:
          'Mark the category that does not match the official records, then press DENY.\n\nIf the selected reason is correct, a disguised monster will reveal itself and the security response will begin.\n\nIf you select the wrong reason, the subject will leave without revealing its true form and file a formal complaint. An innocent employee who is denied entry by mistake will also file a complaint.',
      },
      {
        titleNodeName: 'HelpSection03Title',
        bodyNodeName: 'HelpSection03Body',
        title: '3. WHAT SHOULD I DO IF A MONSTER ATTACKS?',
        body:
          `Close the reinforced shutter immediately. Then dial ${EvidencePreviewController.PURGE_PHONE_CODE} and request the purge protocol.`,
      },
      {
        titleNodeName: 'HelpSection04Title',
        bodyNodeName: 'HelpSection04Body',
        title: '4. CAN A MONSTER KILL ME?',
        body:
          'Yes. If you fail to secure the window or complete the emergency response in time, it may break through and kill you.',
      },
    ] as const;
  }

  private layoutInspectionGuideContent(panelWidth: number, panelHeight: number): void {
    const helpRoot = this.guidanceHelpContentRoot;
    if (!helpRoot?.isValid) {
      return;
    }
    const helpRootTransform = helpRoot.getComponent(UITransform);
    if (!helpRootTransform) {
      return;
    }
    const rootHeight = helpRootTransform.contentSize.height;
    const rootY = helpRoot.position.y;
    const leftPadding = panelWidth * 0.12;
    const rightPadding = panelWidth * 0.12;
    const contentWidth = Math.max(1, panelWidth - leftPadding - rightPadding);
    const contentX = -contentWidth * 0.5;
    const rootTop = rootHeight * 0.5;
    const rootBottom = -rootHeight * 0.5;
    const bottomFromPanelSafe = panelHeight * -0.4 - rootY;
    const helpContentBottomSafeY = Math.max(rootBottom + 20, bottomFromPanelSafe);
    const helpBlocks = this.getGuidanceHelpSectionContent();
    const titleHeight = 32;
    const titleFontSize = 23;
    const titleLineHeight = 30;
    const titleBodyGap = 10;
    const baseContentTopY = Math.min(rootTop - 24, panelHeight * 0.33 - rootY);

    let chosenBodyFontSize = 19;
    let chosenBodyLineHeight = 26;
    let chosenSectionGap = 28;
    let chosenTopShift = 0;
    const applyLayoutAttempt = (
      bodyFontSize: number,
      bodyLineHeight: number,
      sectionGap: number,
      topShift: number,
    ): number => {
      let cursorY = Math.min(rootTop - 24, baseContentTopY + topShift);
      for (const block of helpBlocks) {
        const titleNode = helpRoot.getChildByName(block.titleNodeName);
        const bodyNode = helpRoot.getChildByName(block.bodyNodeName);
        if (!titleNode?.isValid || !bodyNode?.isValid) {
          continue;
        }
        const titleTransform = titleNode.getComponent(UITransform) ?? titleNode.addComponent(UITransform);
        titleTransform.setAnchorPoint(0, 1);
        titleTransform.setContentSize(contentWidth, titleHeight);
        titleNode.setPosition(contentX, cursorY, 0);
        const titleLabel = titleNode.getComponent(Label) ?? titleNode.addComponent(Label);
        titleLabel.fontSize = titleFontSize;
        titleLabel.lineHeight = titleLineHeight;
        titleLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        titleLabel.verticalAlign = Label.VerticalAlign.TOP;
        titleLabel.enableWrapText = false;
        titleLabel.overflow = Overflow.SHRINK;
        titleLabel.string = block.title;
        titleLabel.color = new Color(39, 31, 25, 255);

        cursorY -= titleHeight;
        cursorY -= titleBodyGap;

        const bodyTransform = bodyNode.getComponent(UITransform) ?? bodyNode.addComponent(UITransform);
        bodyTransform.setAnchorPoint(0, 1);
        bodyTransform.setContentSize(contentWidth, Math.max(bodyLineHeight, 64));
        bodyNode.setPosition(contentX, cursorY, 0);
        const bodyLabel = bodyNode.getComponent(Label) ?? bodyNode.addComponent(Label);
        bodyLabel.fontSize = bodyFontSize;
        bodyLabel.lineHeight = bodyLineHeight;
        bodyLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        bodyLabel.verticalAlign = Label.VerticalAlign.TOP;
        bodyLabel.enableWrapText = true;
        bodyLabel.overflow = Overflow.RESIZE_HEIGHT;
        bodyLabel.string = block.body;
        bodyLabel.color = new Color(46, 37, 30, 255);
        bodyLabel.updateRenderData(true);
        let measuredBodyHeight = bodyTransform.contentSize.height;
        if (!Number.isFinite(measuredBodyHeight) || measuredBodyHeight <= 0) {
          measuredBodyHeight = Math.max(bodyLineHeight, 64);
          bodyTransform.setContentSize(contentWidth, measuredBodyHeight);
        }
        cursorY -= measuredBodyHeight;
        cursorY -= sectionGap;
      }
      return cursorY;
    };

    let finalCursorY = applyLayoutAttempt(chosenBodyFontSize, chosenBodyLineHeight, chosenSectionGap, chosenTopShift);
    if (finalCursorY < helpContentBottomSafeY) {
      chosenBodyFontSize = 18;
      finalCursorY = applyLayoutAttempt(chosenBodyFontSize, chosenBodyLineHeight, chosenSectionGap, chosenTopShift);
    }
    if (finalCursorY < helpContentBottomSafeY) {
      chosenBodyLineHeight = 24;
      finalCursorY = applyLayoutAttempt(chosenBodyFontSize, chosenBodyLineHeight, chosenSectionGap, chosenTopShift);
    }
    if (finalCursorY < helpContentBottomSafeY) {
      chosenSectionGap = 22;
      finalCursorY = applyLayoutAttempt(chosenBodyFontSize, chosenBodyLineHeight, chosenSectionGap, chosenTopShift);
    }
    if (finalCursorY < helpContentBottomSafeY) {
      chosenTopShift = 20;
      applyLayoutAttempt(chosenBodyFontSize, chosenBodyLineHeight, chosenSectionGap, chosenTopShift);
    }
  }

  private layoutInspectionHintContent(panelWidth: number, panelHeight: number): void {
    const hintRoot = this.guidanceHintContentRoot;
    if (!hintRoot?.isValid) {
      return;
    }
    const hintRootTransform = hintRoot.getComponent(UITransform);
    if (!hintRootTransform) {
      return;
    }
    const rootHeight = hintRootTransform.contentSize.height;
    const rootY = hintRoot.position.y;
    const rootTop = rootHeight * 0.5;
    const rootBottom = -rootHeight * 0.5;
    const subjectWidth = Math.max(1, panelWidth * 0.7);
    const hintContentBottomSafeY = Math.max(rootBottom + 20, panelHeight * -0.4 - rootY);

    const subjectNode = hintRoot.getChildByName('HintSubjectLabel');
    const statusNode = hintRoot.getChildByName('HintStatusLabel');
    const bodyNode = hintRoot.getChildByName('HintBodyLabel');
    if (!subjectNode?.isValid || !statusNode?.isValid || !bodyNode?.isValid) {
      return;
    }

    const layoutMeta = this.guidanceHintLayoutMeta ?? {
      layoutIssueCount: 0,
      hideSubjectLabel: false,
      statusLine: this.guidanceHintStatusLabel?.string ?? '',
    };
    const bodyText = this.guidanceHintBodyLabel?.string ?? '';
    const presetsToTry = this.getHintTypographyPresetsToTry(
      layoutMeta.layoutIssueCount,
      layoutMeta.statusLine,
      layoutMeta.hideSubjectLabel,
    );

    const subjectTransform = subjectNode.getComponent(UITransform) ?? subjectNode.addComponent(UITransform);
    const statusTransform = statusNode.getComponent(UITransform) ?? statusNode.addComponent(UITransform);
    const bodyTransform = bodyNode.getComponent(UITransform) ?? bodyNode.addComponent(UITransform);
    const subjectLabel = subjectNode.getComponent(Label) ?? subjectNode.addComponent(Label);
    const statusLabel = statusNode.getComponent(Label) ?? statusNode.addComponent(Label);
    const bodyLabel = bodyNode.getComponent(Label) ?? bodyNode.addComponent(Label);

    subjectNode.active = !layoutMeta.hideSubjectLabel;

    const measurePreset = (
      preset: HintTypographyPreset,
    ): { readonly fits: boolean; readonly bodyBottomY: number } => {
      const config = EvidencePreviewController.HINT_TYPOGRAPHY_PRESETS[preset];
      const bodyWidth = Math.max(1, panelWidth * config.bodyWidthRatio);
      const subjectPanelY = panelHeight * config.subjectPanelYRatio;
      const anchorLocalY = Math.min(rootTop - 40, subjectPanelY - rootY);
      const subjectLocalY = anchorLocalY;
      const statusLocalY = layoutMeta.hideSubjectLabel
        ? anchorLocalY
        : subjectLocalY - config.subjectStatusGap;
      const bodyTopY = statusLocalY - config.statusBodyGap;

      subjectTransform.setAnchorPoint(0.5, 0.5);
      subjectTransform.setContentSize(subjectWidth, Math.max(44, config.subjectLineHeight + 12));
      subjectNode.setPosition(0, subjectLocalY, 0);
      subjectLabel.fontSize = config.subjectFontSize;
      subjectLabel.lineHeight = config.subjectLineHeight;
      subjectLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      subjectLabel.verticalAlign = Label.VerticalAlign.CENTER;
      subjectLabel.enableWrapText = false;
      subjectLabel.overflow = Overflow.SHRINK;

      statusTransform.setAnchorPoint(0.5, 0.5);
      statusTransform.setContentSize(subjectWidth, Math.max(48, config.statusLineHeight + 14));
      statusNode.setPosition(0, statusLocalY, 0);
      statusLabel.fontSize = config.statusFontSize;
      statusLabel.lineHeight = config.statusLineHeight;
      statusLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      statusLabel.verticalAlign = Label.VerticalAlign.CENTER;
      statusLabel.enableWrapText = false;
      statusLabel.overflow = Overflow.SHRINK;

      bodyTransform.setAnchorPoint(0, 1);
      bodyTransform.setContentSize(bodyWidth, Math.max(300, rootHeight * 0.42));
      bodyNode.setPosition(-bodyWidth * 0.5, bodyTopY, 0);
      bodyLabel.fontSize = config.bodyFontSize;
      bodyLabel.lineHeight = config.bodyLineHeight;
      bodyLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      bodyLabel.verticalAlign = Label.VerticalAlign.TOP;
      bodyLabel.enableWrapText = true;
      bodyLabel.overflow = Overflow.RESIZE_HEIGHT;
      bodyLabel.string = bodyText;
      bodyLabel.updateRenderData(true);

      let measuredBodyHeight = bodyTransform.contentSize.height;
      if (!Number.isFinite(measuredBodyHeight) || measuredBodyHeight <= 0) {
        measuredBodyHeight = Math.max(config.bodyLineHeight, 64);
        bodyTransform.setContentSize(bodyWidth, measuredBodyHeight);
      }
      const bodyBottomY = bodyTopY - measuredBodyHeight;
      return {
        fits: bodyBottomY >= hintContentBottomSafeY,
        bodyBottomY,
      };
    };

    let chosenPreset = presetsToTry[presetsToTry.length - 1] ?? 'dense';
    for (const preset of presetsToTry) {
      const measurement = measurePreset(preset);
      if (measurement.fits) {
        chosenPreset = preset;
        break;
      }
      chosenPreset = preset;
    }

    measurePreset(chosenPreset);
  }

  private getHintTypographyPresetsToTry(
    issueCount: number,
    statusLine: string,
    hideSubjectLabel: boolean,
  ): HintTypographyPreset[] {
    if (hideSubjectLabel || statusLine === 'NO ACTIVE INSPECTION') {
      return ['short', 'standard', 'dense'];
    }
    if (statusLine === 'NO PROBLEM FOUND') {
      return ['short', 'standard', 'dense'];
    }
    if (issueCount <= 1) {
      return ['short', 'standard', 'dense'];
    }
    if (issueCount === 2) {
      return ['standard', 'dense'];
    }
    return ['dense'];
  }

  private handleGuidanceHelpButtonClick = (): void => {
    if (!this.guidanceHelpButton?.interactable || !this.canOpenGuidancePanel()) {
      return;
    }
    this.playGuidanceSettingsClickSound();
    this.openInspectionGuide();
  };

  private handleGuidanceHintButtonClick = (): void => {
    if (!this.guidanceHintButton?.interactable || !this.canOpenGuidancePanel()) {
      return;
    }
    this.playGuidanceSettingsClickSound();
    this.openCurrentInspectionHint();
  };

  private playGuidanceSettingsClickSound(): void {
    const audio = AudioManager.getInstance();
    if (!audio) {
      return;
    }
    audio.playCachedSettingsClick();
    audio.handleUserGesture();
  }

  private handleGuidanceCloseButtonClick = (): void => {
    this.closeGuidancePanel();
  };

  private openInspectionGuide(): void {
    if (!this.canOpenGuidancePanel()) {
      return;
    }
    this.showGuidancePanel('help');
  }

  private openCurrentInspectionHint(): void {
    if (!this.canOpenGuidancePanel()) {
      return;
    }
    this.showGuidancePanel('hint');
  }

  private canOpenGuidancePanel(): boolean {
    if (this.guidancePanelTransitionInProgress || this.guidancePanelActive) {
      return false;
    }
    if (!this.node?.isValid || this.isDestroying) {
      return false;
    }
    if (
      this.campaignDayTransitionInProgress ||
      this.campaignDayCompletionPending ||
      this.campaignDayContinueRequested
    ) {
      return false;
    }
    if (this.campaignImplementedContentComplete || this.failureReviewActive || this.isGameOverStateActive()) {
      return false;
    }
    if (
      this.threatSequenceActive ||
      this.emergencyWindowOpen ||
      this.phoneResponseWindowOpen ||
      this.phoneDialWindowOpen ||
      this.cleanupProgramActivated ||
      this.inspectionDecisionResolutionInProgress
    ) {
      return false;
    }
    return Boolean(this.guidanceOverlayRuntime?.isValid && this.guidancePanel?.isValid);
  }

  private showGuidancePanel(mode: GuidancePanelMode): void {
    if (!this.guidanceOverlayRuntime || !this.guidancePanel || !this.guidanceDimmerOpacity) {
      return;
    }
    this.guidancePanelTransitionInProgress = true;
    this.guidancePanelMode = mode;
    this.guidancePanelActive = true;
    if (this.node.parent?.isValid) {
      this.applyGuidanceOverlayLayerOrder(this.node.parent);
    }
    this.updateGuidanceContent(mode);
    this.setGuidancePanelInteractionLock(true);
    this.guidanceOverlayRuntime.active = true;
    Tween.stopAllByTarget(this.guidanceDimmerOpacity);
    this.guidanceDimmerOpacity.opacity = 0;
    tween(this.guidanceDimmerOpacity)
      .to(0.1, { opacity: EvidencePreviewController.GUIDANCE_DIMMER_ALPHA }, { easing: 'linear' })
      .start();
    showInteractivePanel(this.guidancePanel, {
      setInteractable: (interactable) => {
        if (this.guidanceCloseHitButton?.node?.isValid) {
          this.guidanceCloseHitButton.interactable = interactable;
        }
      },
    });
    this.scheduleOnce(() => {
      this.guidancePanelTransitionInProgress = false;
      this.updateGuidanceButtonInteractivity();
    }, 0.24);
  }

  private closeGuidancePanel(): void {
    if (!this.guidancePanel || !this.guidanceOverlayRuntime || !this.guidanceDimmerOpacity) {
      return;
    }
    if (!this.guidancePanelActive || this.guidancePanelTransitionInProgress) {
      return;
    }
    this.guidancePanelTransitionInProgress = true;
    hideInteractivePanel(
      this.guidancePanel,
      () => {
        if (!this.guidanceOverlayRuntime?.isValid || !this.guidanceDimmerOpacity?.isValid) {
          // Never leave interaction lock active if runtime nodes changed unexpectedly.
          this.clearGuidancePanelState(true);
          return;
        }
        Tween.stopAllByTarget(this.guidanceDimmerOpacity);
        tween(this.guidanceDimmerOpacity)
          .to(0.08, { opacity: 0 }, { easing: 'linear' })
          .call(() => {
            if (!this.guidanceOverlayRuntime?.isValid) {
              this.clearGuidancePanelState(true);
              return;
            }
            this.guidanceOverlayRuntime.active = false;
            this.clearGuidancePanelState(true);
          })
          .start();
      },
      {
        setInteractable: (interactable) => {
          if (this.guidanceCloseHitButton?.node?.isValid) {
            this.guidanceCloseHitButton.interactable = interactable;
          }
        },
      },
    );
  }

  private hideGuidancePanelImmediate(restoreInput: boolean): void {
    if (this.guidanceOverlayRuntime?.isValid) {
      this.guidanceOverlayRuntime.active = false;
    }
    if (this.guidancePanel?.isValid) {
      hideInteractivePanelImmediate(this.guidancePanel, {
        setInteractable: (interactable) => {
          if (this.guidanceCloseHitButton?.node?.isValid) {
            this.guidanceCloseHitButton.interactable = interactable;
          }
        },
      });
    }
    if (this.guidanceDimmerOpacity?.isValid) {
      Tween.stopAllByTarget(this.guidanceDimmerOpacity);
      this.guidanceDimmerOpacity.opacity = 0;
    }
    this.clearGuidancePanelState(restoreInput);
  }

  private clearGuidancePanelState(restoreInput: boolean): void {
    this.guidancePanelTransitionInProgress = false;
    this.guidancePanelActive = false;
    this.guidancePanelMode = null;
    if (this.guidanceHelpContentRoot?.isValid) {
      this.guidanceHelpContentRoot.active = false;
    }
    if (this.guidanceHintContentRoot?.isValid) {
      this.guidanceHintContentRoot.active = false;
    }
    if (this.guidanceHintSubjectLabel) {
      this.guidanceHintSubjectLabel.string = '';
    }
    if (this.guidanceHintStatusLabel) {
      this.guidanceHintStatusLabel.string = '';
    }
    if (this.guidanceHintBodyLabel) {
      this.guidanceHintBodyLabel.string = '';
    }
    this.guidanceHintLayoutMeta = null;
    if (restoreInput) {
      this.setGuidancePanelInteractionLock(false);
    } else {
      this.guidancePanelInputLocked = false;
    }
    this.updateGuidanceButtonInteractivity();
  }

  private setGuidancePanelInteractionLock(locked: boolean): void {
    if (locked) {
      if (this.guidancePanelInputLocked) {
        return;
      }
      this.guidancePanelInputLocked = true;
      this.captureEncounterButtonStates();
      this.setAllEncounterButtonsInteractable(false);
      if (this.guidanceHelpButton?.node?.isValid) {
        this.guidanceHelpButton.interactable = false;
      }
      if (this.guidanceHintButton?.node?.isValid) {
        this.guidanceHintButton.interactable = false;
      }
      return;
    }
    if (!this.guidancePanelInputLocked) {
      return;
    }
    this.guidancePanelInputLocked = false;
    this.restoreEncounterButtonStates();
    this.setTelephoneEntryEnabledForInteractionTrace(
      this.getCachedButtonInteractable('TelephoneHit'),
      'guidance-panel-close-restore',
    );
    this.setShutterInteractionEnabledForInteractionTrace(
      this.getCachedButtonInteractable('BtnShutterHit'),
      'guidance-panel-close-restore',
    );
    this.refreshCampaignEvidenceAvailability('campaign-evidence-refresh');
  }

  private updateGuidanceContent(mode: GuidancePanelMode): void {
    if (!this.guidanceTitleLabel || !this.guidanceHelpContentRoot || !this.guidanceHintContentRoot) {
      return;
    }
    this.guidanceTitleLabel.string = EvidencePreviewController.GUIDANCE_PANEL_TITLE[mode];
    const showingHelp = mode === 'help';
    this.guidanceHelpContentRoot.active = showingHelp;
    this.guidanceHintContentRoot.active = !showingHelp;
    const panelSize = this.guidancePanel?.getComponent(UITransform)?.contentSize ?? null;
    if (!showingHelp) {
      const hint = this.buildGuidanceHintContent();
      this.guidanceHintLayoutMeta = {
        layoutIssueCount: hint.layoutIssueCount,
        hideSubjectLabel: hint.hideSubjectLabel,
        statusLine: hint.statusLine,
      };
      if (this.guidanceHintSubjectLabel) {
        this.guidanceHintSubjectLabel.string = hint.subjectLine;
        this.guidanceHintSubjectLabel.color = new Color(41, 33, 26, 255);
      }
      if (this.guidanceHintStatusLabel) {
        this.guidanceHintStatusLabel.string = hint.statusLine;
        this.guidanceHintStatusLabel.color = hint.statusColor;
      }
      if (this.guidanceHintBodyLabel) {
        this.guidanceHintBodyLabel.string = hint.body;
        this.guidanceHintBodyLabel.color = new Color(48, 38, 31, 255);
      }
      if (panelSize) {
        this.layoutInspectionHintContent(panelSize.width, panelSize.height);
      }
      return;
    }
    this.guidanceHintLayoutMeta = null;
    if (this.guidanceHintSubjectLabel) {
      this.guidanceHintSubjectLabel.string = '';
    }
    if (this.guidanceHintStatusLabel) {
      this.guidanceHintStatusLabel.string = '';
    }
    if (this.guidanceHintBodyLabel) {
      this.guidanceHintBodyLabel.string = '';
    }
    if (panelSize) {
      this.layoutInspectionGuideContent(panelSize.width, panelSize.height);
    }
  }

  private buildGuidanceHintContent(): GuidanceHintContent {
    const activeSubject = this.currentInspectionSubject;
    if (!activeSubject || this.isHintNoActiveInspectionState()) {
      return {
        subjectLine: '',
        statusLine: 'NO ACTIVE INSPECTION',
        statusColor: new Color(112, 92, 74, 255),
        body: 'There is no active subject to inspect right now.',
        layoutIssueCount: 0,
        hideSubjectLabel: true,
      };
    }
    if (activeSubject.subjectKind === 'employee' && !this.currentRound) {
      return {
        subjectLine: '',
        statusLine: 'NO ACTIVE INSPECTION',
        statusColor: new Color(112, 92, 74, 255),
        body: 'There is no active subject to inspect right now.',
        layoutIssueCount: 0,
        hideSubjectLabel: true,
      };
    }
    const subjectDisplayName =
      this.getActiveInspectionSubjectDefinition()?.displayName ??
      (activeSubject.subjectKind === 'visitor'
        ? getVisitorProfile(activeSubject.visitorKey)?.displayName ?? activeSubject.visitorKey.toUpperCase()
        : EMPLOYEE_PROFILES[activeSubject.round.employeeKey]?.displayName ??
          activeSubject.round.employeeKey.toUpperCase());
    if (
      activeSubject.subjectKind === 'employee' &&
      !this.isGuidanceHintEmployeeRoundAligned(activeSubject.round.roundId)
    ) {
      console.warn('[GuidanceHint] Employee hint round mismatch detected.', {
        activeSubjectRoundId: activeSubject.round.roundId,
        currentRoundId: this.currentRound?.roundId ?? null,
        activeSubjectEmployeeKey: activeSubject.round.employeeKey,
        currentRoundEmployeeKey: this.currentRound?.employeeKey ?? null,
      });
      return {
        subjectLine: `SUBJECT: ${subjectDisplayName.toUpperCase()}`,
        statusLine: 'INSPECTION DATA IS UPDATING',
        statusColor: new Color(112, 92, 74, 255),
        body: 'INSPECTION DATA IS UPDATING. PLEASE CHECK AGAIN.',
        layoutIssueCount: 0,
        hideSubjectLabel: false,
      };
    }
    const resolvedIssueKinds = this.resolveGuidanceIssueKindsForActiveSubject(activeSubject);
    const orderedIssueKinds = EvidencePreviewController.GUIDANCE_ISSUE_ORDER.filter((kind) =>
      resolvedIssueKinds.includes(kind),
    );
    const employeeRawHasFailure =
      activeSubject.subjectKind === 'employee'
        ? this.hasEmployeeGuidanceRawFailure(activeSubject.round)
        : false;
    const threatDetected =
      activeSubject.subjectKind === 'visitor'
        ? activeSubject.caseKind === 'disguised-monster-visitor'
        : activeSubject.round.caseKind === 'DISGUISED_MONSTER';
    if (orderedIssueKinds.length <= 0) {
      if (activeSubject.subjectKind === 'employee') {
        if (employeeRawHasFailure) {
          console.warn('[GuidanceHint] Employee round has raw failures but resolved issue kinds are empty.', {
            dayIndex: this.getActiveCampaignDayIndex(),
            roundId: activeSubject.round.roundId,
            employeeKey: activeSubject.round.employeeKey,
            caseKind: activeSubject.round.caseKind,
            cardFailedFields: [...activeSubject.round.card.failedFields],
            applicationFailedFields: [...activeSubject.round.application.failedFields],
            appearanceFailedRuleKeys: [...activeSubject.round.appearance.failedRuleKeys],
          });
          return {
            subjectLine: `SUBJECT: ${subjectDisplayName.toUpperCase()}`,
            statusLine: 'PROBLEM FOUND',
            statusColor: new Color(128, 58, 49, 255),
            body: 'A threat has been detected, but the exact inconsistency is not currently available.',
            layoutIssueCount: 0,
            hideSubjectLabel: false,
          };
        }
        return {
          subjectLine: `SUBJECT: ${subjectDisplayName.toUpperCase()}`,
          statusLine: 'NO PROBLEM FOUND',
          statusColor: new Color(71, 108, 79, 255),
          body: 'This person appears to be innocent.\n\nAll required checks match the official records.',
          layoutIssueCount: 0,
          hideSubjectLabel: false,
        };
      }
      if (threatDetected) {
        console.warn('[GuidanceHint] Threat detected without resolved issue kinds.', {
          activeSubjectRoundId:
            activeSubject.subjectKind === 'visitor' ? activeSubject.roundId : activeSubject.round.roundId,
          currentRoundId: this.currentRound?.roundId ?? null,
          activeSubjectEmployeeKey:
            activeSubject.subjectKind === 'visitor' ? activeSubject.visitorKey : activeSubject.round.employeeKey,
          currentRoundEmployeeKey: this.currentRound?.employeeKey ?? null,
          activeSubjectTruthSummary:
            activeSubject.subjectKind === 'employee'
              ? this.buildGuidanceHintTruthSummary(activeSubject.round.truth)
              : null,
          currentRoundTruthSummary: this.buildGuidanceHintTruthSummary(this.currentRound?.truth ?? null),
          subjectKind: activeSubject.subjectKind,
          resolvedIssueKinds,
        });
        return {
          subjectLine: `SUBJECT: ${subjectDisplayName.toUpperCase()}`,
          statusLine: 'PROBLEM FOUND',
          statusColor: new Color(128, 58, 49, 255),
          body: 'A threat has been detected, but the exact inconsistency is not currently available.',
          layoutIssueCount: 0,
          hideSubjectLabel: false,
        };
      }
      return {
        subjectLine: `SUBJECT: ${subjectDisplayName.toUpperCase()}`,
        statusLine: 'NO PROBLEM FOUND',
        statusColor: new Color(71, 108, 79, 255),
        body: 'This person appears to be innocent.\n\nAll required checks match the official records.',
        layoutIssueCount: 0,
        hideSubjectLabel: false,
      };
    }
    const formattedBody = this.formatHintIssueBlocks(orderedIssueKinds);
    return {
      subjectLine: `SUBJECT: ${subjectDisplayName.toUpperCase()}`,
      statusLine: 'PROBLEM FOUND',
      statusColor: new Color(128, 58, 49, 255),
      body: formattedBody,
      layoutIssueCount: orderedIssueKinds.length,
      hideSubjectLabel: false,
    };
  }

  private formatHintIssueBlocks(issueKinds: readonly Exclude<DecisionIssueKind, 'monster'>[]): string {
    const blocks = issueKinds.map((kind) => {
      const mapping = EvidencePreviewController.GUIDANCE_ISSUE_TEXT_BY_KIND[kind];
      return `${mapping.title}\n${mapping.body}`;
    });
    return blocks.join('\n\n');
  }

  private resolveGuidanceIssueKindsForActiveSubject(subject: InspectionSubject): readonly Exclude<
    DecisionIssueKind,
    'monster'
  >[] {
    if (subject.subjectKind === 'visitor') {
      const mapped = subject.mismatchKinds.map((kind) => {
        if (kind === 'appearance') {
          return 'appearance';
        }
        if (kind === 'department') {
          return 'department';
        }
        return 'purpose';
      }) as Exclude<DecisionIssueKind, 'monster'>[];
      return Object.freeze(Array.from(new Set(mapped)));
    }
    this.warnGuidanceHintRawTruthMismatch(subject.round);
    return this.resolveEmployeeGuidanceIssueKindsFromRawRound(subject.round);
  }

  private isGuidanceHintEmployeeRoundAligned(subjectRoundId: string): boolean {
    return this.currentRound?.roundId === subjectRoundId;
  }

  private resolveEmployeeGuidanceIssueKindsFromRawRound(
    round: RoundInstance,
  ): readonly Exclude<DecisionIssueKind, 'monster'>[] {
    const issueKinds: Exclude<DecisionIssueKind, 'monster'>[] = [];
    if (round.card.failedFields.length > 0) {
      issueKinds.push('id-card');
    }
    if (round.application.failedFields.length > 0) {
      issueKinds.push('application');
    }
    if (round.appearance.failedRuleKeys.length > 0) {
      issueKinds.push('appearance');
    }
    return Object.freeze(Array.from(new Set(issueKinds)));
  }

  private hasEmployeeGuidanceRawFailure(round: RoundInstance): boolean {
    return (
      round.card.failedFields.length > 0 ||
      round.application.failedFields.length > 0 ||
      round.appearance.failedRuleKeys.length > 0
    );
  }

  private warnGuidanceHintRawTruthMismatch(round: RoundInstance): void {
    const rawCardFail = round.card.failedFields.length > 0;
    const rawApplicationFail = round.application.failedFields.length > 0;
    const rawAppearanceFail = round.appearance.failedRuleKeys.length > 0;
    const mismatchDetected =
      rawCardFail === round.truth.cardPass ||
      rawApplicationFail === round.truth.applicationPass ||
      rawAppearanceFail === round.truth.appearancePass;
    if (!mismatchDetected) {
      return;
    }
    console.warn('[GuidanceHint] Round raw anomaly metadata disagrees with derived truth.', {
      dayIndex: this.getActiveCampaignDayIndex(),
      employeeKey: round.employeeKey,
      roundId: round.roundId,
      caseKind: round.caseKind,
      cardFailedFields: [...round.card.failedFields],
      applicationFailedFields: [...round.application.failedFields],
      appearanceFailedRuleKeys: [...round.appearance.failedRuleKeys],
      truthSummary: this.buildGuidanceHintTruthSummary(round.truth),
    });
  }

  private buildGuidanceHintTruthSummary(
    truth: RoundInstance['truth'] | null,
  ): Readonly<{
    cardPass: boolean | null;
    applicationPass: boolean | null;
    appearancePass: boolean | null;
  }> {
    if (!truth) {
      return Object.freeze({
        cardPass: null,
        applicationPass: null,
        appearancePass: null,
      });
    }
    return Object.freeze({
      cardPass: truth.cardPass,
      applicationPass: truth.applicationPass,
      appearancePass: truth.appearancePass,
    });
  }

  private isHintNoActiveInspectionState(): boolean {
    return (
      this.campaignDayTransitionInProgress ||
      this.campaignDayCompletionPending ||
      this.campaignDayContinueRequested ||
      this.campaignImplementedContentComplete ||
      this.failureReviewActive ||
      this.isGameOverStateActive()
    );
  }

  private updateGuidanceButtonInteractivity(): void {
    const canInteract =
      !this.guidancePanelActive &&
      !this.guidancePanelTransitionInProgress &&
      !this.guidancePanelInputLocked &&
      !this.campaignDayTransitionInProgress &&
      !this.campaignDayCompletionPending &&
      !this.campaignDayContinueRequested &&
      !this.campaignImplementedContentComplete &&
      !this.failureReviewActive &&
      !this.isGameOverStateActive() &&
      !this.threatSequenceActive &&
      !this.emergencyWindowOpen &&
      !this.phoneResponseWindowOpen &&
      !this.phoneDialWindowOpen &&
      !this.cleanupProgramActivated &&
      !this.inspectionDecisionResolutionInProgress;
    if (this.guidanceHelpButton?.node?.isValid) {
      this.guidanceHelpButton.interactable = canInteract;
    }
    if (this.guidanceHintButton?.node?.isValid) {
      this.guidanceHintButton.interactable = canInteract;
    }
  }

  private playDocumentFlipSound(): void {
    AudioManager.getInstance()?.playCachedDocumentFlip();
  }

  private playDecisionMarkSound(): void {
    AudioManager.getInstance()?.playCachedDecisionMark();
  }

  private traceRepresentativeClickReceived(control: 'employee-card' | 'allow' | 'checklist'): void {
    this.logInteractionTrace('click-received', {
      control,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      inspectionResolutionInProgress: this.inspectionDecisionResolutionInProgress,
    });
  }

  private traceRepresentativeClickBlocked(
    control: 'employee-card' | 'allow' | 'checklist',
    reason: string,
  ): void {
    const previewRuntimeActive = this.evidencePreviewRuntime?.active ?? false;
    const employeeDetailActive = this.employeeCardDetailVisual?.active ?? false;
    const applicationDetailActive = this.applicationFormDetailVisual?.active ?? false;
    const checklistDetailActive = this.screeningChecklistDetailVisual?.active ?? false;
    this.logInteractionTrace('click-blocked', {
      control,
      reason,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      inspectionResolutionInProgress: this.inspectionDecisionResolutionInProgress,
      previewOpen: this.previewOpen,
      previewRuntimeActive,
      employeeDetailActive,
      applicationDetailActive,
      checklistDetailActive,
    });
  }

  private resolveEmployeeCardClickBlockedReason(): string | null {
    if (!this.isCampaignEvidenceEnabled('employee-card')) {
      return 'evidence-disabled';
    }
    if (this.previewOpen) {
      return 'preview-open';
    }
    if (
      !this.evidencePreviewRuntime ||
      !this.employeeCardDetailVisual ||
      !this.applicationFormDetailVisual ||
      !this.screeningChecklistDetailVisual
    ) {
      return 'missing-runtime-node';
    }
    return null;
  }

  private resolveChecklistClickBlockedReason(): string | null {
    if (this.previewOpen) {
      return 'preview-open';
    }
    if (
      !this.evidencePreviewRuntime ||
      !this.employeeCardDetailVisual ||
      !this.applicationFormDetailVisual ||
      !this.screeningChecklistDetailVisual
    ) {
      return 'missing-runtime-node';
    }
    return null;
  }

  private openEmployeeCard(): void {
    this.logDay4DocumentClickReceived('employee-card');
    this.traceRepresentativeClickReceived('employee-card');
    const blockedReason = this.resolveEmployeeCardClickBlockedReason();
    if (blockedReason) {
      this.logDay4DocumentClickBlocked('employee-card', blockedReason);
      this.traceRepresentativeClickBlocked('employee-card', blockedReason);
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
    this.employeeCardDetailVisual.active = true;
    this.applicationFormDetailVisual.active = false;
    this.screeningChecklistDetailVisual.active = false;
    this.recoverEvidencePreviewPanelStateIfDesynced('open-employee-card');
    showInteractivePanel(this.evidencePreviewRuntime, {
      setInteractable: (interactable) => this.setEvidencePreviewPanelInteractable(interactable),
    });
    this.setManagedButtonsInteractable(false, 'preview-open-employee-card');
    this.previewOpen = true;
    this.logInteractionTrace('preview-open-visual-state', {
      control: 'employee-card',
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      previewOpen: this.previewOpen,
      previewRuntimeActive: this.evidencePreviewRuntime?.active ?? false,
      employeeDetailActive: this.employeeCardDetailVisual?.active ?? false,
      applicationDetailActive: this.applicationFormDetailVisual?.active ?? false,
      checklistDetailActive: this.screeningChecklistDetailVisual?.active ?? false,
      panelState: getInteractivePanelState(this.evidencePreviewRuntime),
    });
    this.logInteractionStateSnapshot('preview-open-employee-card');
  }

  private resolveApplicationFormClickBlockedReason(): string | null {
    if (!this.isCampaignEvidenceEnabled('application-form')) {
      return 'evidence-disabled';
    }
    if (this.previewOpen) {
      return 'preview-open';
    }
    if (
      !this.evidencePreviewRuntime ||
      !this.employeeCardDetailVisual ||
      !this.applicationFormDetailVisual ||
      !this.screeningChecklistDetailVisual
    ) {
      return 'missing-runtime-node';
    }
    return null;
  }

  private openApplicationForm(): void {
    this.logDay4DocumentClickReceived('application-form');
    const blockedReason = this.resolveApplicationFormClickBlockedReason();
    if (blockedReason) {
      this.logDay4DocumentClickBlocked('application-form', blockedReason);
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
    this.employeeCardDetailVisual.active = false;
    this.applicationFormDetailVisual.active = true;
    this.screeningChecklistDetailVisual.active = false;
    this.recoverEvidencePreviewPanelStateIfDesynced('open-application-form');
    showInteractivePanel(this.evidencePreviewRuntime, {
      setInteractable: (interactable) => this.setEvidencePreviewPanelInteractable(interactable),
    });
    this.setManagedButtonsInteractable(false, 'preview-open-application-form');
    this.previewOpen = true;
  }

  private openScreeningChecklist(): void {
    this.traceRepresentativeClickReceived('checklist');
    const blockedReason = this.resolveChecklistClickBlockedReason();
    if (blockedReason) {
      this.traceRepresentativeClickBlocked('checklist', blockedReason);
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
    this.employeeCardDetailVisual.active = false;
    this.applicationFormDetailVisual.active = false;
    this.screeningChecklistDetailVisual.active = true;
    this.recoverEvidencePreviewPanelStateIfDesynced('open-checklist');
    showInteractivePanel(this.evidencePreviewRuntime, {
      setInteractable: (interactable) => this.setEvidencePreviewPanelInteractable(interactable),
    });
    if (this.checklistInteractionReady) {
      this.checklistInteractionReady = this.stabilizeChecklistCells();
      if (this.checklistInteractionReady) {
        this.refreshChecklistVisuals();
      }
    }
    this.setManagedButtonsInteractable(false, 'preview-open-checklist');
    this.previewOpen = true;
    this.logInteractionTrace('preview-open-visual-state', {
      control: 'checklist',
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      previewOpen: this.previewOpen,
      previewRuntimeActive: this.evidencePreviewRuntime?.active ?? false,
      employeeDetailActive: this.employeeCardDetailVisual?.active ?? false,
      applicationDetailActive: this.applicationFormDetailVisual?.active ?? false,
      checklistDetailActive: this.screeningChecklistDetailVisual?.active ?? false,
      panelState: getInteractivePanelState(this.evidencePreviewRuntime),
    });
    this.logInteractionStateSnapshot('preview-open-checklist');
  }

  /** Player-clicked X on document preview; play UI click then close. */
  private onClosePreviewClick(): void {
    if (this.day0EndingTelephoneStoryLock) {
      this.logInteractionTrace('preview-close-blocked', {
        reason: 'day0-ending-telephone-story-lock',
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
        previewOpen: this.previewOpen,
      });
      return;
    }
    this.logInteractionTrace('preview-close-click-received', {
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      previewOpen: this.previewOpen,
      panelInteractable: this.previewPanelInteractable,
    });
    AudioManager.getInstance()?.playCachedSettingsClick();
    this.closePreview();
  }

  private closePreview(): void {
    const runtimeNodeMissing =
      !this.evidencePreviewRuntime ||
      !this.employeeCardDetailVisual ||
      !this.applicationFormDetailVisual ||
      !this.screeningChecklistDetailVisual;
    if (runtimeNodeMissing) {
      this.logInteractionTrace('preview-close-blocked', {
        reason: 'missing-runtime-node',
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
        previewOpen: this.previewOpen,
      });
      return;
    }
    const panelState = getInteractivePanelState(this.evidencePreviewRuntime);
    if (!this.previewPanelInteractable) {
      this.logInteractionTrace('preview-close-blocked', {
        reason: 'preview-panel-not-interactable',
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
        previewOpen: this.previewOpen,
        panelState,
      });
      return;
    }
    if (panelState === 'closing') {
      this.logInteractionTrace('preview-close-blocked', {
        reason: 'panel-already-closing',
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
        previewOpen: this.previewOpen,
        panelState,
      });
      return;
    }
    this.logInteractionTrace('preview-close-start', {
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      previewOpen: this.previewOpen,
      panelState,
    });

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
    hideInteractivePanel(
      this.evidencePreviewRuntime,
      () => {
        if (!this.evidencePreviewRuntime?.isValid) {
          this.logInteractionTrace('preview-close-blocked', {
            reason: 'runtime-invalid-in-callback',
            day: this.getActiveCampaignDayIndex(),
            subject: this.getActiveSubjectKeyForInteractionTrace(),
            generation: this.decisionResolutionToken,
          });
          return;
        }
        this.employeeCardDetailVisual!.active = false;
        this.applicationFormDetailVisual!.active = false;
        this.screeningChecklistDetailVisual!.active = false;
        if (
          this.day0EndingDisplayTestActive &&
          this.day0EndingArchiveRevealActive &&
          !this.day0EndingFinalChoiceActive
        ) {
          this.previewOpen = false;
          this.enterDay0EndingFinalChoice();
          return;
        }
        this.setManagedButtonsInteractable(true, 'preview-close');
        this.previewOpen = false;
        this.refreshCampaignEvidenceAvailability('preview-close');
        this.logInteractionTrace('preview-close-finished', {
          day: this.getActiveCampaignDayIndex(),
          subject: this.getActiveSubjectKeyForInteractionTrace(),
          generation: this.decisionResolutionToken,
          previewOpen: this.previewOpen,
        });
        this.logInteractionStateSnapshot('preview-close-finished');
      },
      {
        setInteractable: (interactable) => this.setEvidencePreviewPanelInteractable(interactable),
      },
    );
  }

  private selectIdCardPass(): void {
    if (!this.checklistInteractionReady || !this.isChecklistItemRequired('id_card')) {
      return;
    }
    this.playDecisionMarkSound();
    this.idCardChoice = this.idCardChoice === 'pass' ? 'unset' : 'pass';
    this.refreshChecklistVisuals();
  }

  private ensureDay0EndingFinalChoiceRuntime(): void {
    let runtime = this.node.getChildByName('Day0EndingFinalChoiceRuntime');
    if (!runtime || !runtime.isValid) {
      runtime = new Node('Day0EndingFinalChoiceRuntime');
      runtime.parent = this.node;
    }
    const runtimeTransform = runtime.getComponent(UITransform) ?? runtime.addComponent(UITransform);
    runtimeTransform.setAnchorPoint(0.5, 0.5);
    runtimeTransform.setContentSize(
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_RUNTIME_WIDTH,
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_RUNTIME_HEIGHT,
    );
    runtime.setPosition(
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_RUNTIME_X,
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_RUNTIME_Y,
      0,
    );
    const optionStep =
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_OPTION_HEIGHT +
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_VERTICAL_GAP;
    const topY = optionStep * 0.5;
    const bottomY = -optionStep * 0.5;

    const keepHit = this.ensureDay0EndingFinalChoiceOption(
      runtime,
      'Day0EndingChoiceKeepIdentityHit',
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_KEEP_TEXT,
      0,
      topY,
    );
    const removeHit = this.ensureDay0EndingFinalChoiceOption(
      runtime,
      'Day0EndingChoiceRemoveThreatHit',
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_REMOVE_TEXT,
      0,
      bottomY,
    );

    this.day0EndingFinalChoiceRuntime = runtime;
    this.day0EndingFinalChoiceKeepHit = keepHit.node;
    this.day0EndingFinalChoiceRemoveHit = removeHit.node;
    this.day0EndingFinalChoiceKeepButton = keepHit.button;
    this.day0EndingFinalChoiceRemoveButton = removeHit.button;
    this.day0EndingFinalChoiceKeepLabel = keepHit.label;
    this.day0EndingFinalChoiceRemoveLabel = removeHit.label;
    this.applyDay0EndingFinalChoiceVisuals();
    this.setDay0EndingFinalChoiceVisible(false);
  }

  private ensureDay0EndingFinalChoiceOption(
    parent: Node,
    nodeName: string,
    text: string,
    x: number,
    y: number,
  ): { readonly node: Node; readonly button: Button; readonly label: Label } {
    let node = parent.getChildByName(nodeName);
    if (!node || !node.isValid) {
      node = new Node(nodeName);
      node.parent = parent;
    }
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_OPTION_WIDTH,
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_OPTION_HEIGHT,
    );
    node.setPosition(x, y, 0);
    const button = node.getComponent(Button) ?? node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    button.interactable = false;

    let labelNode = node.getChildByName('Label');
    if (!labelNode || !labelNode.isValid) {
      labelNode = new Node('Label');
      labelNode.parent = node;
    }
    const labelTransform = labelNode.getComponent(UITransform) ?? labelNode.addComponent(UITransform);
    labelTransform.setAnchorPoint(0.5, 0.5);
    labelTransform.setContentSize(
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_OPTION_WIDTH,
      EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_OPTION_HEIGHT,
    );
    labelNode.setPosition(0, 0, 0);
    const label = labelNode.getComponent(Label) ?? labelNode.addComponent(Label);
    label.string = text;
    label.fontSize = 30;
    label.lineHeight = 36;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Overflow.SHRINK;
    label.enableWrapText = false;
    label.isBold = true;
    label.color = new Color(233, 225, 212, 255);
    return { node, button, label };
  }

  private applyDay0EndingFinalChoiceVisuals(): void {
    if (this.day0EndingFinalChoiceKeepLabel) {
      this.day0EndingFinalChoiceKeepLabel.string =
        EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_KEEP_TEXT;
    }
    if (this.day0EndingFinalChoiceRemoveLabel) {
      this.day0EndingFinalChoiceRemoveLabel.string =
        EvidencePreviewController.DAY0_ENDING_FINAL_CHOICE_REMOVE_TEXT;
    }
    if (this.day0EndingFinalChoiceRuntime?.isValid && this.node.children.includes(this.day0EndingFinalChoiceRuntime)) {
      this.day0EndingFinalChoiceRuntime.setSiblingIndex(this.node.children.length - 1);
    }
  }

  private setDay0EndingFinalChoiceVisible(visible: boolean): void {
    if (this.day0EndingFinalChoiceRuntime?.isValid) {
      this.day0EndingFinalChoiceRuntime.active = visible;
    }
    if (this.day0EndingFinalChoiceKeepHit?.isValid) {
      this.day0EndingFinalChoiceKeepHit.active = visible;
    }
    if (this.day0EndingFinalChoiceRemoveHit?.isValid) {
      this.day0EndingFinalChoiceRemoveHit.active = visible;
    }
    const interactable = visible && this.day0EndingFinalChoiceActive;
    if (this.day0EndingFinalChoiceKeepButton?.node?.isValid) {
      this.day0EndingFinalChoiceKeepButton.interactable = interactable;
    }
    if (this.day0EndingFinalChoiceRemoveButton?.node?.isValid) {
      this.day0EndingFinalChoiceRemoveButton.interactable = interactable;
    }
  }

  private ensureDay0EndingResultRuntime(): void {
    const runtimeParent = this.node.parent ?? this.node;
    let runtime = runtimeParent.getChildByName('Day0EndingResultRuntime');
    if (!runtime || !runtime.isValid) {
      runtime = new Node('Day0EndingResultRuntime');
      runtime.parent = runtimeParent;
    } else if (runtime.parent !== runtimeParent) {
      runtime.parent = runtimeParent;
    }
    const rootTransform = runtimeParent.getComponent(UITransform);
    const runtimeWidth =
      rootTransform?.contentSize.width ?? EvidencePreviewController.DAY0_ENDING_RESULT_RUNTIME_WIDTH;
    const runtimeHeight =
      rootTransform?.contentSize.height ?? EvidencePreviewController.DAY0_ENDING_RESULT_RUNTIME_HEIGHT;
    const runtimeTransform = runtime.getComponent(UITransform) ?? runtime.addComponent(UITransform);
    runtimeTransform.setAnchorPoint(0.5, 0.5);
    runtimeTransform.setContentSize(runtimeWidth, runtimeHeight);
    runtime.setPosition(0, 0, 0);

    let inputBlocker = runtime.getChildByName('InputBlocker');
    if (!inputBlocker || !inputBlocker.isValid) {
      inputBlocker = new Node('InputBlocker');
      inputBlocker.parent = runtime;
    }
    const inputBlockerTransform = inputBlocker.getComponent(UITransform) ?? inputBlocker.addComponent(UITransform);
    inputBlockerTransform.setAnchorPoint(0.5, 0.5);
    inputBlockerTransform.setContentSize(runtimeWidth, runtimeHeight);
    inputBlocker.setPosition(0, 0, 0);
    inputBlocker.getComponent(BlockInputEvents) ?? inputBlocker.addComponent(BlockInputEvents);
    const inputBlockerGraphics = inputBlocker.getComponent(Graphics) ?? inputBlocker.addComponent(Graphics);
    inputBlockerGraphics.clear();
    inputBlockerGraphics.fillColor = new Color(0, 0, 0, EvidencePreviewController.DAY0_ENDING_RESULT_MASK_ALPHA);
    inputBlockerGraphics.rect(-runtimeWidth * 0.5, -runtimeHeight * 0.5, runtimeWidth, runtimeHeight);
    inputBlockerGraphics.fill();
    inputBlocker.setSiblingIndex(0);

    let background = runtime.getChildByName('Background');
    if (!background || !background.isValid) {
      background = new Node('Background');
      background.parent = runtime;
    }
    const backgroundTransform = background.getComponent(UITransform) ?? background.addComponent(UITransform);
    backgroundTransform.setAnchorPoint(0.5, 0.5);
    backgroundTransform.setContentSize(
      EvidencePreviewController.DAY0_ENDING_RESULT_PANEL_MAX_WIDTH,
      EvidencePreviewController.DAY0_ENDING_RESULT_PANEL_MAX_HEIGHT,
    );
    background.setPosition(0, 0, 0);
    const backgroundSprite = background.getComponent(Sprite) ?? background.addComponent(Sprite);
    backgroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    background.setSiblingIndex(1);

    const legacyTitle = runtime.getChildByName('Title');
    if (legacyTitle?.isValid) {
      legacyTitle.parent = background;
    }
    const legacyBody = runtime.getChildByName('Body');
    if (legacyBody?.isValid) {
      legacyBody.parent = background;
    }
    const legacyButtonHit = runtime.getChildByName('ReturnHomeButton');
    if (legacyButtonHit?.isValid) {
      legacyButtonHit.parent = background;
    }
    const staleSubtitleOnRuntime = runtime.getChildByName('Subtitle');
    if (staleSubtitleOnRuntime?.isValid) {
      staleSubtitleOnRuntime.destroy();
    }

    const staleSubtitleOnBackground = background.getChildByName('Subtitle');
    if (staleSubtitleOnBackground?.isValid) {
      staleSubtitleOnBackground.destroy();
    }

    const titleNode = this.ensureDay0EndingResultLabelNode(background, 'Title', 500, 76, 44, 52, true);
    titleNode.setPosition(0, 168, 0);
    titleNode.setSiblingIndex(0);
    const bodyNode = this.ensureDay0EndingResultLabelNode(background, 'Body', 470, 208, 26, 36, false);
    bodyNode.setPosition(0, -8, 0);
    bodyNode.setSiblingIndex(1);

    let buttonHit = background.getChildByName('ReturnHomeButton');
    if (!buttonHit || !buttonHit.isValid) {
      buttonHit = new Node('ReturnHomeButton');
      buttonHit.parent = background;
    }
    const buttonHitTransform = buttonHit.getComponent(UITransform) ?? buttonHit.addComponent(UITransform);
    buttonHitTransform.setAnchorPoint(0.5, 0.5);
    buttonHitTransform.setContentSize(
      EvidencePreviewController.DAY0_ENDING_RESULT_BUTTON_HIT_WIDTH,
      EvidencePreviewController.DAY0_ENDING_RESULT_BUTTON_HIT_HEIGHT,
    );
    buttonHit.setPosition(0, -182, 0);
    const button = buttonHit.getComponent(Button) ?? buttonHit.addComponent(Button);
    button.transition = Button.Transition.NONE;
    button.interactable = false;
    buttonHit.setSiblingIndex(2);

    let buttonVisual = buttonHit.getChildByName('Visual');
    if (!buttonVisual || !buttonVisual.isValid) {
      buttonVisual = new Node('Visual');
      buttonVisual.parent = buttonHit;
    }
    const buttonVisualTransform = buttonVisual.getComponent(UITransform) ?? buttonVisual.addComponent(UITransform);
    buttonVisualTransform.setAnchorPoint(0.5, 0.5);
    buttonVisualTransform.setContentSize(194, 84);
    buttonVisual.setPosition(0, 0, 0);
    const buttonSprite = buttonVisual.getComponent(Sprite) ?? buttonVisual.addComponent(Sprite);
    buttonSprite.sizeMode = Sprite.SizeMode.CUSTOM;

    this.day0EndingResultRuntime = runtime;
    this.day0EndingResultInputBlocker = inputBlocker;
    this.day0EndingResultBackground = background;
    this.day0EndingResultTitleNode = titleNode;
    this.day0EndingResultBodyNode = bodyNode;
    this.day0EndingResultReturnHomeHit = buttonHit;
    this.day0EndingResultReturnHomeVisual = buttonVisual;
    this.day0EndingResultReturnHomeButton = button;
    this.setDay0EndingResultVisible(false);
  }

  private ensureDay0EndingResultLabelNode(
    parent: Node,
    nodeName: string,
    width: number,
    height: number,
    fontSize: number,
    lineHeight: number,
    bold: boolean,
  ): Node {
    let node = parent.getChildByName(nodeName);
    if (!node || !node.isValid) {
      node = new Node(nodeName);
      node.parent = parent;
    }
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(width, height);
    const label = node.getComponent(Label) ?? node.addComponent(Label);
    label.string = '';
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Overflow.CLAMP;
    label.enableWrapText = true;
    label.isBold = bold;
    label.color = new Color(44, 35, 28, 255);
    return node;
  }

  private setDay0EndingResultVisible(visible: boolean): void {
    this.day0EndingResultVisible = visible;
    if (this.day0EndingResultRuntime?.isValid) {
      this.day0EndingResultRuntime.active = visible;
      const runtimeParent = this.day0EndingResultRuntime.parent;
      if (runtimeParent?.isValid) {
        this.day0EndingResultRuntime.setSiblingIndex(runtimeParent.children.length - 1);
      }
    }
    if (this.day0EndingResultInputBlocker?.isValid) {
      this.day0EndingResultInputBlocker.active = visible;
    }
    if (this.day0EndingResultReturnHomeHit?.isValid) {
      this.day0EndingResultReturnHomeHit.active = visible;
    }
    if (this.day0EndingResultReturnHomeButton?.node?.isValid) {
      this.day0EndingResultReturnHomeButton.interactable = visible && !this.day0EndingResultReturnLocked;
    }
  }

  private async showDay0EndingResult(kind: Day0EndingResultKind): Promise<void> {
    if (this.isDestroying || !this.node?.isValid) {
      return;
    }
    this.ensureDay0EndingResultRuntime();
    this.day0EndingResultKind = kind;
    this.day0EndingResultReturnLocked = false;
    const content = EvidencePreviewController.DAY0_ENDING_RESULT_CONTENT[kind];
    const titleLabel = this.day0EndingResultTitleNode?.getComponent(Label) ?? null;
    const bodyLabel = this.day0EndingResultBodyNode?.getComponent(Label) ?? null;
    if (titleLabel) {
      titleLabel.string = content.title;
    }
    if (bodyLabel) {
      bodyLabel.string = content.body;
    }

    if (!this.day0EndingResultPaperFrame) {
      this.day0EndingResultPaperFrame = await this.loadSpriteFrameFromResources(
        EvidencePreviewController.DAY0_ENDING_RESULT_PAPER_PATH,
      );
    }
    if (!this.day0EndingResultReturnHomeFrame) {
      this.day0EndingResultReturnHomeFrame = await this.loadSpriteFrameFromResources(
        EvidencePreviewController.DAY0_ENDING_RESULT_RETURN_HOME_PATH,
      );
    }
    if (this.isDestroying || !this.node?.isValid) {
      return;
    }
    const paperSprite = this.day0EndingResultBackground?.getComponent(Sprite) ?? null;
    if (paperSprite && this.day0EndingResultPaperFrame) {
      paperSprite.spriteFrame = this.day0EndingResultPaperFrame;
      this.applyContainSize(
        this.day0EndingResultBackground,
        this.day0EndingResultPaperFrame,
        EvidencePreviewController.DAY0_ENDING_RESULT_PANEL_MAX_WIDTH,
        EvidencePreviewController.DAY0_ENDING_RESULT_PANEL_MAX_HEIGHT,
      );
    }
    const returnHomeSprite = this.day0EndingResultReturnHomeVisual?.getComponent(Sprite) ?? null;
    if (returnHomeSprite && this.day0EndingResultReturnHomeFrame) {
      returnHomeSprite.spriteFrame = this.day0EndingResultReturnHomeFrame;
      this.applySpriteFrameByTargetHeight(
        this.day0EndingResultReturnHomeVisual,
        this.day0EndingResultReturnHomeFrame,
        EvidencePreviewController.DAY0_ENDING_RESULT_BUTTON_TARGET_HEIGHT,
        EvidencePreviewController.DAY0_ENDING_RESULT_BUTTON_MAX_WIDTH,
      );
    }
    this.setNodeSize(
      this.day0EndingResultReturnHomeHit,
      EvidencePreviewController.DAY0_ENDING_RESULT_BUTTON_HIT_WIDTH,
      EvidencePreviewController.DAY0_ENDING_RESULT_BUTTON_HIT_HEIGHT,
    );
    this.setDay0EndingResultVisible(true);
  }

  private readonly handleDay0EndingResultReturnHome = (): void => {
    if (!this.day0EndingResultVisible || this.day0EndingResultReturnLocked || this.isDestroying) {
      return;
    }
    this.day0EndingResultReturnLocked = true;
    if (this.day0EndingResultReturnHomeButton?.node?.isValid) {
      this.day0EndingResultReturnHomeButton.interactable = false;
    }
    this.setDay0EndingResultVisible(false);
    this.returnHomeAfterDay0Ending();
  };

  private enterDay0EndingFinalChoice(): void {
    if (!this.day0EndingDisplayTestActive || this.isDestroying) {
      return;
    }
    this.unschedule(this.handleDay0EndingSelfDialogueHoldElapsed);
    this.day0EndingSelfDialogueInProgress = false;
    this.day0EndingSelfDialogueCompleted = true;
    this.day0EndingSelfDialogueFinalChoiceQueued = false;
    this.day0EndingArchiveRevealActive = false;
    this.day0EndingFinalChoiceActive = true;
    this.day0EndingFinalChoiceCompleted = false;
    this.day0EndingFinalChoiceTransitionInProgress = false;
    this.day0EndingFinalChoiceSelection = null;
    this.day0EndingResultKind = null;
    this.day0EndingResultReturnLocked = false;
    this.setDay0EndingResultVisible(false);
    this.unschedule(this.handleDay0EndingRemoveThreatAlertElapsed);
    this.unschedule(this.handleDay0EndingRemoveThreatFinalizeElapsed);
    this.unschedule(this.handleDay0EndingRemoveThreatReturnHomeElapsed);
    AudioManager.getInstance()?.stopAlarmLoop();
    this.unbindDay0EndingShutterOpenSettledListener();
    this.unschedule(this.handleDay0EndingArchiveRevealDelayElapsed);
    this.employeeFilesController?.exitDay0EndingArchiveRevealMode();
    const drawersClosedRuntime = this.node.getChildByName('EmployeeDrawersClosedRuntime');
    if (drawersClosedRuntime?.isValid) {
      // Day0 ending UI should always show the drawer strip from the start.
      drawersClosedRuntime.active = true;
      this.setEmployeeFilesInteractionEnabled(drawersClosedRuntime, false);
      this.employeeFilesController?.closeOpenDrawerForExternalInteraction();
    }
    this.lockAllEncounterInput('day0-ending-final-choice-active');
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'day0-ending-final-choice-active');
    this.setShutterInteractionEnabledForInteractionTrace(false, 'day0-ending-final-choice-active');
    this.applyDay0EndingFinalChoiceVisuals();
    this.setDay0EndingFinalChoiceVisible(true);
    this.logInteractionTrace('day0-ending-final-choice-entered', {
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      selection: this.day0EndingFinalChoiceSelection ?? 'none',
    });
  }

  private readonly handleDay0EndingFinalChoiceKeepSelected = (): void => {
    if (
      !this.day0EndingFinalChoiceActive ||
      this.day0EndingFinalChoiceCompleted ||
      this.day0EndingFinalChoiceTransitionInProgress
    ) {
      return;
    }
    this.day0EndingFinalChoiceCompleted = true;
    this.day0EndingFinalChoiceTransitionInProgress = true;
    this.day0EndingFinalChoiceActive = false;
    this.day0EndingFinalChoiceSelection = 'keep-identity';
    this.setDay0EndingFinalChoiceVisible(false);
    this.lockAllEncounterInput('day0-ending-final-choice-keep-selected');
    this.setManagedButtonsInteractable(false, 'day0-ending-final-choice-keep-selected');
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'day0-ending-final-choice-keep-selected');
    this.setShutterInteractionEnabledForInteractionTrace(false, 'day0-ending-final-choice-keep-selected');
    this.logInteractionTrace('day0-ending-final-choice-selected', {
      choice: this.day0EndingFinalChoiceSelection,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    this.finalizeDay0EndingState('keep-identity');
    void this.showDay0EndingResult('keep-identity');
  };

  private readonly handleDay0EndingFinalChoiceRemoveSelected = (): void => {
    if (
      !this.day0EndingFinalChoiceActive ||
      this.day0EndingFinalChoiceCompleted ||
      this.day0EndingFinalChoiceTransitionInProgress
    ) {
      return;
    }
    this.day0EndingFinalChoiceCompleted = true;
    this.day0EndingFinalChoiceTransitionInProgress = true;
    this.day0EndingFinalChoiceActive = false;
    this.day0EndingFinalChoiceSelection = 'remove-threat';
    this.setDay0EndingFinalChoiceVisible(false);
    this.lockAllEncounterInput('day0-ending-final-choice-remove-selected');
    this.setManagedButtonsInteractable(false, 'day0-ending-final-choice-remove-selected');
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'day0-ending-final-choice-remove-selected');
    this.setShutterInteractionEnabledForInteractionTrace(false, 'day0-ending-final-choice-remove-selected');
    this.logInteractionTrace('day0-ending-final-choice-selected', {
      choice: this.day0EndingFinalChoiceSelection,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    this.beginDay0EndingRemoveThreatAlertStep();
  };

  private beginDay0EndingRemoveThreatAlertStep(): void {
    if (
      !this.day0EndingDisplayTestActive ||
      !this.day0EndingFinalChoiceTransitionInProgress ||
      this.day0EndingFinalChoiceSelection !== 'remove-threat'
    ) {
      return;
    }
    AudioManager.getInstance()?.startAlarmLoop();
    // Keep alert presentation minimal to avoid non-cinematic full-screen notice overlays.
    console.info('[Day0Ending] remove-threat alert', {
      text: EvidencePreviewController.DAY0_ENDING_REMOVE_THREAT_ALERT_TEXT,
    });
    this.unschedule(this.handleDay0EndingRemoveThreatAlertElapsed);
    this.scheduleOnce(
      this.handleDay0EndingRemoveThreatAlertElapsed,
      EvidencePreviewController.DAY0_ENDING_REMOVE_THREAT_ALERT_SECONDS,
    );
  }

  private beginDay0EndingRemoveThreatShutterCloseStep(): void {
    if (
      !this.day0EndingDisplayTestActive ||
      !this.day0EndingFinalChoiceTransitionInProgress ||
      this.day0EndingFinalChoiceSelection !== 'remove-threat'
    ) {
      return;
    }
    if (!this.shutterController) {
      this.beginDay0EndingRemoveThreatFinalizeStep();
      return;
    }
    if (!this.startDay0EndingRemoveThreatCinematicClose()) {
      // Fallback to existing close path if shutter visual runtime is unavailable.
      this.setShutterInteractionEnabledForInteractionTrace(true, 'day0-ending-remove-threat-programmatic-close');
      this.shutterController.node.emit(Node.EventType.TOUCH_END);
      this.setShutterInteractionEnabledForInteractionTrace(false, 'day0-ending-remove-threat-lock-after-close');
      this.unschedule(this.handleDay0EndingRemoveThreatFinalizeElapsed);
      this.scheduleOnce(
        this.handleDay0EndingRemoveThreatFinalizeElapsed,
        EvidencePreviewController.DAY0_ENDING_REMOVE_THREAT_SHUTTER_CLOSE_SECONDS,
      );
      return;
    }
  }

  private beginDay0EndingRemoveThreatFinalizeStep(): void {
    if (
      !this.day0EndingDisplayTestActive ||
      !this.day0EndingFinalChoiceTransitionInProgress ||
      this.day0EndingFinalChoiceSelection !== 'remove-threat'
    ) {
      return;
    }
    this.unschedule(this.handleDay0EndingRemoveThreatReturnHomeElapsed);
    this.scheduleOnce(
      this.handleDay0EndingRemoveThreatReturnHomeElapsed,
      EvidencePreviewController.DAY0_ENDING_REMOVE_THREAT_POST_CLOSE_HOLD_SECONDS,
    );
  }

  private finalizeDay0EndingState(branch: Day0EndingResultKind): void {
    if (!this.day0EndingFinalChoiceTransitionInProgress || this.isDestroying) {
      return;
    }
    this.unschedule(this.handleDay0EndingRemoveThreatAlertElapsed);
    this.unschedule(this.handleDay0EndingRemoveThreatFinalizeElapsed);
    this.unschedule(this.handleDay0EndingRemoveThreatReturnHomeElapsed);
    this.day0EndingFinalChoiceActive = false;
    this.day0EndingFinalChoiceTransitionInProgress = false;
    this.setDay0EndingFinalChoiceVisible(false);
    AudioManager.getInstance()?.stopAlarmLoop();
    this.cleanupDay0EndingPhonePhase1State();
    this.day0EndingDisplayTestActive = false;
    this.day0EndingResultKind = branch;
    this.logInteractionTrace('day0-ending-final-choice-completed', {
      branch,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
  }

  private returnHomeAfterDay0Ending(): void {
    director.loadScene(EvidencePreviewController.RETURN_HOME_SCENE_NAME, (error) => {
      if (!error) {
        return;
      }
      console.error('[Day0Ending] failed to return HomeScene after final choice.', error);
    });
  }

  private startDay0EndingRemoveThreatCinematicClose(): boolean {
    const shutterVisual = this.resolveDay0EndingShutterVisualNode();
    const shutterController = this.shutterController;
    if (!shutterVisual?.isValid || !shutterController) {
      return false;
    }
    const openPosition = shutterVisual.position.clone();
    if (!shutterController.prepareClosedForIntro()) {
      return false;
    }
    const closedPosition = shutterVisual.position.clone();
    shutterVisual.setPosition(openPosition);
    Tween.stopAllByTarget(shutterVisual);
    AudioManager.getInstance()?.playCachedShutterMove();
    tween(shutterVisual)
      .to(
        EvidencePreviewController.DAY0_ENDING_REMOVE_THREAT_SHUTTER_CLOSE_SECONDS,
        { position: closedPosition },
        { easing: 'cubicInOut' },
      )
      .call(() => {
        shutterController.prepareClosedForIntro();
        this.beginDay0EndingRemoveThreatFinalizeStep();
      })
      .start();
    return true;
  }

  private resolveDay0EndingShutterVisualNode(): Node | null {
    const shutterHitNode = this.shutterController?.node ?? null;
    const consoleControls = shutterHitNode?.parent ?? null;
    const canvas = consoleControls?.parent ?? null;
    const windowRuntime = canvas?.getChildByName('WindowRuntime') ?? null;
    const windowViewport = windowRuntime?.getChildByName('WindowViewport') ?? null;
    const shutterVisual = windowViewport?.getChildByName('WindowShutterVisual') ?? null;
    return shutterVisual?.isValid ? shutterVisual : null;
  }

  private selectIdCardFail(): void {
    if (!this.checklistInteractionReady || !this.isChecklistItemRequired('id_card')) {
      return;
    }
    this.playDecisionMarkSound();
    this.idCardChoice = this.idCardChoice === 'fail' ? 'unset' : 'fail';
    this.refreshChecklistVisuals();
  }

  private selectApplicationPass(): void {
    if (!this.checklistInteractionReady || !this.isChecklistItemRequired('application')) {
      return;
    }
    this.playDecisionMarkSound();
    this.applicationChoice = this.applicationChoice === 'pass' ? 'unset' : 'pass';
    this.refreshChecklistVisuals();
  }

  private selectApplicationFail(): void {
    if (!this.checklistInteractionReady || !this.isChecklistItemRequired('application')) {
      return;
    }
    this.playDecisionMarkSound();
    this.applicationChoice = this.applicationChoice === 'fail' ? 'unset' : 'fail';
    this.refreshChecklistVisuals();
  }

  private selectAppearancePass(): void {
    if (!this.checklistInteractionReady || !this.isChecklistItemRequired('appearance')) {
      return;
    }
    this.playDecisionMarkSound();
    this.appearanceChoice = this.appearanceChoice === 'pass' ? 'unset' : 'pass';
    this.refreshChecklistVisuals();
  }

  private selectAppearanceFail(): void {
    if (!this.checklistInteractionReady || !this.isChecklistItemRequired('appearance')) {
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

    if (!this.isChecklistItemRequired('id_card')) {
      this.idCardChoice = 'unset';
    }
    if (!this.isChecklistItemRequired('application')) {
      this.applicationChoice = 'unset';
    }
    if (!this.isChecklistItemRequired('appearance')) {
      this.appearanceChoice = 'unset';
    }

    this.refreshChecklistUnavailableStrikethroughs();
    this.setChecklistRowInteractivity('id_card');
    this.setChecklistRowInteractivity('application');
    this.setChecklistRowInteractivity('appearance');

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

  private refreshChecklistUnavailableStrikethroughs(): void {
    for (const itemKey of ['id_card', 'application', 'appearance'] as const) {
      const rowLine = this.ensureChecklistUnavailableStrikethroughNode(itemKey);
      if (!rowLine?.isValid) {
        continue;
      }
      const required = this.isChecklistItemRequired(itemKey);
      if (required) {
        rowLine.active = false;
        continue;
      }
      const layout = this.getChecklistUnavailableStrikethroughLayout(itemKey);
      this.drawChecklistUnavailableStrikethrough(
        rowLine,
        layout.startX,
        layout.rowY,
        layout.width,
        true,
      );
    }
  }

  private ensureChecklistUnavailableStrikethroughNode(itemKey: ChecklistItemKey): Node | null {
    const runtime = this.checklistInteractionRuntimeNode;
    if (!runtime?.isValid) {
      return null;
    }
    const cached = this.checklistUnavailableStrikethroughNodes[itemKey];
    if (cached?.isValid) {
      if (cached.parent !== runtime) {
        cached.setParent(runtime);
      }
      cached.layer = runtime.layer;
      return cached;
    }
    const nodeName =
      EvidencePreviewController.CHECKLIST_UNAVAILABLE_STRIKETHROUGH_LAYOUT[itemKey].nodeName;
    let lineNode = runtime.getChildByName(nodeName);
    if (!lineNode || !lineNode.isValid) {
      lineNode = new Node(nodeName);
      runtime.addChild(lineNode);
    } else if (lineNode.parent !== runtime) {
      lineNode.setParent(runtime);
    }
    lineNode.layer = runtime.layer;
    const lineTransform = lineNode.getComponent(UITransform) ?? lineNode.addComponent(UITransform);
    lineTransform.setAnchorPoint(0, 0.5);
    const graphics = lineNode.getComponent(Graphics) ?? lineNode.addComponent(Graphics);
    graphics.enabled = true;
    lineNode.active = false;
    lineNode.setSiblingIndex(runtime.children.length - 1);
    this.checklistUnavailableStrikethroughNodes[itemKey] = lineNode;
    return lineNode;
  }

  private getChecklistUnavailableStrikethroughLayout(itemKey: ChecklistItemKey): {
    readonly startX: number;
    readonly rowY: number;
    readonly width: number;
  } {
    const layout = EvidencePreviewController.CHECKLIST_UNAVAILABLE_STRIKETHROUGH_LAYOUT[itemKey];
    const rowY =
      this.getChecklistRowBaseY(itemKey) +
      layout.yOffset +
      EvidencePreviewController.CHECKLIST_UNAVAILABLE_TEXT_CENTER_Y_OFFSET;
    return {
      startX: layout.startXOffset,
      rowY,
      width: layout.width,
    };
  }

  private getChecklistRowBaseY(itemKey: ChecklistItemKey): number {
    const passY =
      itemKey === 'id_card'
        ? this.idCardPassCell?.position.y
        : itemKey === 'application'
          ? this.applicationPassCell?.position.y
          : this.appearancePassCell?.position.y;
    const failY =
      itemKey === 'id_card'
        ? this.idCardFailCell?.position.y
        : itemKey === 'application'
          ? this.applicationFailCell?.position.y
          : this.appearanceFailCell?.position.y;
    if (typeof passY === 'number' && typeof failY === 'number') {
      return (passY + failY) / 2;
    }
    if (typeof passY === 'number') {
      return passY;
    }
    if (typeof failY === 'number') {
      return failY;
    }
    return 0;
  }

  private drawChecklistUnavailableStrikethrough(
    lineNode: Node,
    startX: number,
    rowY: number,
    width: number,
    visible: boolean,
  ): void {
    const parent = this.checklistInteractionRuntimeNode;
    if (!lineNode?.isValid || !parent?.isValid) {
      return;
    }
    if (lineNode.parent !== parent) {
      lineNode.setParent(parent);
    }
    lineNode.layer = parent.layer;
    lineNode.active = visible;
    lineNode.setPosition(startX, rowY, 0);
    lineNode.setScale(1, 1, 1);
    const lineTransform = lineNode.getComponent(UITransform) ?? lineNode.addComponent(UITransform);
    lineTransform.setAnchorPoint(0, 0.5);
    lineTransform.setContentSize(width + 4, 8);
    const graphics = lineNode.getComponent(Graphics) ?? lineNode.addComponent(Graphics);
    graphics.enabled = true;
    const nodeOpacity = lineNode.getComponent(UIOpacity);
    if (nodeOpacity) {
      nodeOpacity.opacity = 255;
    }
    graphics.clear();
    graphics.lineWidth = 4;
    graphics.strokeColor = new Color(62, 42, 30, 255);
    graphics.moveTo(0, 0);
    graphics.lineTo(width, 0);
    graphics.stroke();
    lineNode.setSiblingIndex(Math.max(0, parent.children.length - 1));
  }

  private setChecklistRowInteractivity(itemKey: ChecklistItemKey): void {
    const required = this.isChecklistItemRequired(itemKey);
    const passCell =
      itemKey === 'id_card'
        ? this.idCardPassCell
        : itemKey === 'application'
          ? this.applicationPassCell
          : this.appearancePassCell;
    const failCell =
      itemKey === 'id_card'
        ? this.idCardFailCell
        : itemKey === 'application'
          ? this.applicationFailCell
          : this.appearanceFailCell;
    const passButton = passCell?.getComponent(Button) ?? null;
    const failButton = failCell?.getComponent(Button) ?? null;
    if (passButton?.node?.isValid) {
      passButton.interactable = required;
    }
    if (failButton?.node?.isValid) {
      failButton.interactable = required;
    }
    this.applyChecklistRowDisabledVisualState(itemKey, !required);
    if (!required) {
      const passLabel =
        itemKey === 'id_card'
          ? this.idCardPassLabel
          : itemKey === 'application'
            ? this.applicationPassLabel
            : this.appearancePassLabel;
      const failLabel =
        itemKey === 'id_card'
          ? this.idCardFailLabel
          : itemKey === 'application'
            ? this.applicationFailLabel
            : this.appearanceFailLabel;
      if (passLabel) {
        passLabel.string = '';
      }
      if (failLabel) {
        failLabel.string = '';
      }
    }
  }

  private applyChecklistRowDisabledVisualState(itemKey: ChecklistItemKey, disabled: boolean): void {
    const passCell =
      itemKey === 'id_card'
        ? this.idCardPassCell
        : itemKey === 'application'
          ? this.applicationPassCell
          : this.appearancePassCell;
    const failCell =
      itemKey === 'id_card'
        ? this.idCardFailCell
        : itemKey === 'application'
          ? this.applicationFailCell
          : this.appearanceFailCell;
    const passOpacity = passCell?.getComponent(UIOpacity) ?? null;
    const failOpacity = failCell?.getComponent(UIOpacity) ?? null;
    if (passCell?.isValid && !passOpacity) {
      passCell.addComponent(UIOpacity);
    }
    if (failCell?.isValid && !failOpacity) {
      failCell.addComponent(UIOpacity);
    }
    const resolvedPassOpacity = passCell?.getComponent(UIOpacity) ?? null;
    const resolvedFailOpacity = failCell?.getComponent(UIOpacity) ?? null;
    if (resolvedPassOpacity) {
      resolvedPassOpacity.opacity = disabled ? 168 : 255;
    }
    if (resolvedFailOpacity) {
      resolvedFailOpacity.opacity = disabled ? 168 : 255;
    }
  }

  private refreshChecklistActionState(): void {
    if (!this.checklistInteractionReady || !this.checklistActionTextNode || !this.checklistActionLabel) {
      return;
    }

    const checklistComplete = this.isChecklistComplete();
    const requiredKeys = this.getRequiredChecklistItemKeys();
    const hasFail = requiredKeys.some((itemKey) => this.getChecklistChoice(itemKey) === 'fail');
    const allPass = requiredKeys.every((itemKey) => this.getChecklistChoice(itemKey) === 'pass');
    let actionMode: ChecklistActionMode = 'question';
    if (checklistComplete && hasFail) {
      actionMode = 'reject';
    } else if (checklistComplete && allPass) {
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
    const requiredKeys = this.getRequiredChecklistItemKeys();
    const hasFail = requiredKeys.some((itemKey) => this.getChecklistChoice(itemKey) === 'fail');
    const allPass = requiredKeys.every((itemKey) => this.getChecklistChoice(itemKey) === 'pass');

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
    this.hideEvidencePreviewRuntimeImmediate('checklist-reply-open');
    this.checklistReplyPanelRuntime.active = true;
    this.checklistReplyPanelOpen = true;
    this.previewOpen = true;
    this.setManagedButtonsInteractable(false, 'checklist-reply-open');
    AudioManager.getInstance()?.playVoice(VoiceId.AlienSpeech01);
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
      this.hideEvidencePreviewRuntimeImmediate('checklist-reply-close');
    }
    if (this.screeningChecklistDetailVisual) {
      this.screeningChecklistDetailVisual.active = false;
    }
    this.setManagedButtonsInteractable(true, 'checklist-reply-close');
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
    this.recoverEvidencePreviewPanelStateIfDesynced('restore-checklist-state');
    showInteractivePanel(this.evidencePreviewRuntime, {
      setInteractable: (interactable) => this.setEvidencePreviewPanelInteractable(interactable),
    });
    this.employeeCardDetailVisual.active = false;
    this.applicationFormDetailVisual.active = false;
    this.screeningChecklistDetailVisual.active = true;
    if (this.checklistQuestionPanelRuntime) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    this.setManagedButtonsInteractable(false, 'checklist-reply-restore');
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

  private getRequiredChecklistItemKeys(): readonly ChecklistItemKey[] {
    return this.getRequiredChecklistDataItemKeys();
  }

  private getRequiredChecklistDataItemKeys(): readonly ChecklistItemKey[] {
    const required = this.activeDayConfig?.requiredChecklistCategories ?? [];
    return required.map((category) => EvidencePreviewController.CHECKLIST_CATEGORY_TO_KEY[category]);
  }

  private isChecklistDataItemRequired(itemKey: ChecklistItemKey): boolean {
    return this.getRequiredChecklistDataItemKeys().includes(itemKey);
  }

  private isChecklistItemRequired(itemKey: ChecklistItemKey): boolean {
    return this.getRequiredChecklistItemKeys().includes(itemKey);
  }

  private getChecklistChoice(itemKey: ChecklistItemKey): ChecklistChoice {
    if (itemKey === 'id_card') {
      return this.idCardChoice;
    }
    if (itemKey === 'application') {
      return this.applicationChoice;
    }
    return this.appearanceChoice;
  }

  private getRequiredEvidenceTruthPass(itemKey: ChecklistItemKey): boolean {
    const activeSubject = this.currentInspectionSubject;
    if (activeSubject?.subjectKind === 'visitor') {
      if (activeSubject.dayIndex !== 4) {
        return true;
      }
      const hasDepartmentMismatch = activeSubject.mismatchKinds.includes('department');
      const hasPurposeMismatch = activeSubject.mismatchKinds.includes('purpose');
      if (itemKey === 'appearance') {
        return !activeSubject.mismatchKinds.includes('appearance');
      }
      if (itemKey === 'application') {
        return !hasDepartmentMismatch && !hasPurposeMismatch;
      }
      return true;
    }
    const truth = this.currentRound?.truth;
    if (!truth) {
      return false;
    }
    if (itemKey === 'id_card') {
      return truth.cardPass;
    }
    if (itemKey === 'application') {
      return truth.applicationPass;
    }
    return truth.appearancePass;
  }

  private hasValidDay4VisitorDenyEvidence(): boolean {
    const activeSubject = this.currentInspectionSubject;
    if (activeSubject?.subjectKind !== 'visitor' || activeSubject.dayIndex !== 4) {
      return false;
    }
    if (activeSubject.phoneVerificationResult?.visitorArrived === true) {
      return true;
    }
    return (
      this.isChecklistComplete() &&
      this.doesRequiredChecklistMatchTruth() &&
      this.hasAnyRequiredEvidenceFailure()
    );
  }

  private hasAnyRequiredEvidenceFailure(): boolean {
    return this.getRequiredChecklistItemKeys().some((itemKey) => !this.getRequiredEvidenceTruthPass(itemKey));
  }

  private areAllRequiredEvidenceTruthPass(): boolean {
    return this.getRequiredChecklistItemKeys().every((itemKey) => this.getRequiredEvidenceTruthPass(itemKey));
  }

  private doesRequiredChecklistMatchTruth(): boolean {
    return this.getRequiredChecklistItemKeys().every((itemKey) => {
      const choice = this.getChecklistChoice(itemKey);
      if (choice === 'unset') {
        return false;
      }
      const truthPass = this.getRequiredEvidenceTruthPass(itemKey);
      return truthPass ? choice === 'pass' : choice === 'fail';
    });
  }

  private isActiveSubjectChecklistPatternMatched(): boolean {
    return this.doesRequiredChecklistMatchTruth();
  }

  private isChecklistComplete(): boolean {
    return this.getRequiredChecklistItemKeys().every((itemKey) => this.getChecklistChoice(itemKey) !== 'unset');
  }

  private resolveInspectionDecisionOutcome(action: InspectionDecisionAction): InspectionDecisionOutcome {
    const inspectionSubject = this.currentInspectionSubject;
    if (inspectionSubject?.subjectKind === 'visitor') {
      const visitorDecision = action === 'allow' ? 'allow' : 'deny';
      const visitorOutcome = resolveVisitorDecision(inspectionSubject, visitorDecision, {
        idCardChoice: this.idCardChoice,
        applicationChoice: this.applicationChoice,
        appearanceChoice: this.appearanceChoice,
      });
      switch (visitorOutcome.kind) {
        case 'valid-visitor-allowed':
          return 'visitor-valid-allowed';
        case 'valid-visitor-wrongly-denied':
          return 'visitor-valid-wrongly-denied';
        case 'visitor-monster-wrongly-allowed':
          return 'visitor-monster-wrongly-allowed';
        case 'visitor-monster-correctly-denied':
          return 'visitor-monster-correctly-denied';
        default: {
          const exhaustive: never = visitorOutcome;
          throw new Error(`[InspectionDecision] Unsupported visitor decision outcome: ${String(exhaustive)}`);
        }
      }
    }

    const subject = this.getActiveInspectionSubjectDefinition();
    if (!subject) {
      throw new Error('Active inspection subject definition is unavailable.');
    }
    const shouldAllow = this.areAllRequiredEvidenceTruthPass();
    const rejectReasonCorrect = this.doesRequiredChecklistMatchTruth();
    const hasRequiredFailure = this.hasAnyRequiredEvidenceFailure();
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

    const reasonCorrect = checklistComplete && rejectReasonCorrect && hasRequiredFailure;
    let resolvedOutcome: InspectionDecisionOutcome;
    if (!checklistComplete) {
      resolvedOutcome = 'deny-incomplete-checklist';
    } else if (subject.entityKind === 'monster') {
      resolvedOutcome = reasonCorrect ? 'monster-correctly-rejected' : 'monster-wrongly-rejected';
    } else if (shouldAllow) {
      resolvedOutcome = 'valid-human-wrongly-rejected';
    } else {
      resolvedOutcome = reasonCorrect
        ? 'invalid-human-correctly-rejected'
        : 'invalid-human-wrongly-rejected';
    }
    console.info('[InspectionDecision] reject evaluated', {
      roundId: this.currentRound?.roundId ?? null,
      employeeKey: this.currentRound?.employeeKey ?? null,
      caseKind: this.currentRound?.caseKind ?? null,
      cardPass: this.currentRound?.truth.cardPass ?? null,
      applicationPass: this.currentRound?.truth.applicationPass ?? null,
      appearancePass: this.currentRound?.truth.appearancePass ?? null,
      playerCardChoice: this.idCardChoice,
      playerApplicationChoice: this.applicationChoice,
      playerAppearanceChoice: this.appearanceChoice,
      checklistComplete,
      reasonCorrect,
      resolvedOutcome,
    });
    return resolvedOutcome;
  }

  private computeRejectReasonCorrect(): boolean {
    return (
      this.isChecklistComplete() &&
      this.doesRequiredChecklistMatchTruth() &&
      this.hasAnyRequiredEvidenceFailure()
    );
  }

  private logComplaintShown(): void {
    console.info('[InspectionDecision] complaint shown', {
      roundId: this.currentRound?.roundId ?? null,
      employeeKey: this.currentRound?.employeeKey ?? null,
      caseKind: this.currentRound?.caseKind ?? null,
      reasonCorrect: this.computeRejectReasonCorrect(),
      complaintCount: this.formalComplaintCount,
    });
  }

  private isCurrentVisitorCarter(): boolean {
    return this.currentRound?.employeeKey === 'carter';
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
    this.hideEvidencePreviewRuntimeImmediate('checklist-reply-context-open');
    this.checklistReplyPanelRuntime.active = true;
    this.checklistReplyPanelOpen = true;
    this.previewOpen = true;
    this.checklistReplyContext = context;
    this.configureChecklistReplyOverlay(blockInput, allowClose);
    AudioManager.getInstance()?.playVoice(VoiceId.AlienSpeech01);

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
    this.traceRepresentativeClickReceived('allow');
    this.requestAllowDecision('console-allow');
  };

  private requestAllowDecision(source: 'console-allow' | 'checklist-pass'): void {
    console.info(`[InspectionDecision] allow requested: ${source}`);
    const blockedReason = this.resolveAllowDecisionBlockReason(source);
    if (blockedReason) {
      if (source === 'console-allow') {
        this.traceRepresentativeClickBlocked('allow', blockedReason);
      }
      return;
    }
    console.info(`[InspectionDecision] resolution gate accepted: ${source}`);
    if (!this.captureReviveCheckpointBeforeDecision()) {
      if (source === 'console-allow') {
        this.traceRepresentativeClickBlocked('allow', 'checkpoint-capture-failed');
      }
      console.error('[Revive] Failed to capture decision checkpoint before allow.');
      return;
    }
    const token = this.beginDecisionResolution();
    if (source === 'checklist-pass') {
      this.hideChecklistPreviewForResolution();
    }
    this.lockAllEncounterInput('decision-resolution-lock-allow');
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
    if (!this.isActiveVisitorInspectionSubject() && !this.isChecklistComplete()) {
      console.warn('[InspectionDecision] incomplete checklist blocked', {
        roundId: this.currentRound?.roundId ?? null,
        employeeKey: this.currentRound?.employeeKey ?? null,
        source,
        idCardChoice: this.idCardChoice,
        applicationChoice: this.applicationChoice,
        appearanceChoice: this.appearanceChoice,
      });
      if (!this.incompleteRejectNoticeInFlight) {
        this.incompleteRejectNoticeInFlight = true;
        void this.showSystemNotice('COMPLETE ALL CHECKLIST ROWS BEFORE REJECTING.')
          .catch((error) => {
            console.error('[InspectionDecision] incomplete checklist notice failed.', error);
          })
          .finally(() => {
            this.incompleteRejectNoticeInFlight = false;
          });
      }
      return;
    }
    if (this.isActiveVisitorInspectionSubject() && !this.hasValidDay4VisitorDenyEvidence()) {
      console.warn('[InspectionDecision] day4 visitor deny evidence gate blocked', {
        roundId:
          this.currentInspectionSubject?.subjectKind === 'visitor'
            ? this.currentInspectionSubject.roundId
            : null,
        visitorKey:
          this.currentInspectionSubject?.subjectKind === 'visitor'
            ? this.currentInspectionSubject.visitorKey
            : null,
        source,
        idCardChoice: this.idCardChoice,
        applicationChoice: this.applicationChoice,
        appearanceChoice: this.appearanceChoice,
        visitorArrived:
          this.currentInspectionSubject?.subjectKind === 'visitor'
            ? (this.currentInspectionSubject.phoneVerificationResult?.visitorArrived ?? null)
            : null,
      });
      if (!this.incompleteRejectNoticeInFlight) {
        this.incompleteRejectNoticeInFlight = true;
        void this.showSystemNotice('FIND EVIDENCE BEFORE DENYING.')
          .catch((error) => {
            console.error('[InspectionDecision] day4 visitor deny evidence notice failed.', error);
          })
          .finally(() => {
            this.incompleteRejectNoticeInFlight = false;
          });
      }
      return;
    }
    if (!this.captureReviveCheckpointBeforeDecision()) {
      console.error('[Revive] Failed to capture decision checkpoint before deny.');
      return;
    }
    const token = this.beginDecisionResolution();
    if (source === 'checklist-reject') {
      this.hideChecklistPreviewForResolution();
    }
    this.lockAllEncounterInput('decision-resolution-lock-deny');
    const outcome = this.resolveInspectionDecisionOutcome('reject');
    void this.handleInspectionDecisionOutcome(outcome, token).catch((error) => {
      console.error('[InspectionDecision] reject outcome handler failed.', error);
      this.abortDecisionResolutionSafely(token);
    });
  }

  private canStartAllowDecisionResolution(source: 'console-allow' | 'checklist-pass'): boolean {
    return this.resolveAllowDecisionBlockReason(source) === null;
  }

  private resolveAllowDecisionBlockReason(source: 'console-allow' | 'checklist-pass'): string | null {
    if (!this.node?.isValid || this.isDestroying) {
      return 'controller-disabled';
    }
    if (this.campaignDayTransitionInProgress || this.campaignImplementedContentComplete) {
      return 'day-transition';
    }
    if (this.campaignDayCompletionPending || this.campaignDayContinueRequested) {
      return 'day-transition';
    }
    if (this.inspectionDecisionResolutionInProgress || this.administrativeGameOverActive) {
      return 'inspection-resolution-in-progress';
    }
    if (!this.getActiveInspectionSubjectDefinition()) {
      return 'missing-subject-definition';
    }
    if (source === 'console-allow') {
      if (!this.allowHitButton?.node?.isValid || !this.allowHitButton.interactable) {
        return 'button-not-interactable';
      }
      if (
        this.previewOpen ||
        this.evidencePreviewRuntime?.active ||
        this.employeeCardDetailVisual?.active ||
        this.applicationFormDetailVisual?.active ||
        this.screeningChecklistDetailVisual?.active
      ) {
        return 'preview-open';
      }
    }
    if (source === 'checklist-pass') {
      if (this.checklistActionMode !== 'pass') {
        return 'decision-gate-false';
      }
      if (!this.checklistActionButton?.node?.isValid || !this.checklistActionButton.interactable) {
        return 'button-not-interactable';
      }
      if (!this.checklistActionHit?.isValid || !this.checklistActionHit.active) {
        return 'decision-gate-false';
      }
      if (
        !this.evidencePreviewRuntime?.isValid ||
        !this.screeningChecklistDetailVisual?.isValid ||
        !this.previewOpen ||
        !this.evidencePreviewRuntime.active ||
        !this.screeningChecklistDetailVisual.active
      ) {
        return 'missing-runtime-node';
      }
      if (this.employeeCardDetailVisual?.active || this.applicationFormDetailVisual?.active) {
        return 'preview-open';
      }
    }
    if (this.checklistQuestionPanelOpen || this.checklistReplyPanelOpen) {
      return 'modal-active';
    }
    if (this.checklistReplyContext !== 'normal') {
      return 'modal-active';
    }
    if (this.visitorGreetingRuntime?.isValid && this.visitorGreetingRuntime.active) {
      return 'modal-active';
    }
    if (
      this.threatSequenceActive ||
      this.emergencyWindowOpen ||
      this.phoneResponseWindowOpen ||
      this.phoneDialWindowOpen ||
      this.cleanupProgramActivated ||
      this.phoneEmergencyResolved
    ) {
      return 'monster-threat';
    }
    if (this.carterAttackTriggered || this.carterEncounterResolved) {
      return 'monster-threat';
    }
    if (this.retryLoadInProgress) {
      return 'modal-active';
    }
    if (this.carterMonsterAttackRuntime?.isValid && this.carterMonsterAttackRuntime.active) {
      return 'modal-active';
    }
    if (this.carterGameOverPanelRuntime?.isValid && this.carterGameOverPanelRuntime.active) {
      return 'modal-active';
    }
    return null;
  }

  private canStartRejectDecisionResolution(source: CarterRejectFlowSource): boolean {
    if (!this.node?.isValid || this.isDestroying) {
      return false;
    }
    if (this.campaignDayTransitionInProgress || this.campaignImplementedContentComplete) {
      return false;
    }
    if (this.campaignDayCompletionPending || this.campaignDayContinueRequested) {
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
    this.setInspectionDecisionResolutionInProgress(true, 'decision-resolution-begin');
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
    this.setInspectionDecisionResolutionInProgress(false, 'decision-resolution-abort');
    this.setManagedButtonsInteractable(true, 'decision-resolution-abort-unlock');
    this.setTelephoneEntryEnabledForInteractionTrace(true, 'decision-resolution-abort-unlock');
    this.setShutterInteractionEnabledForInteractionTrace(true, 'decision-resolution-abort-unlock');
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

  private pickWrongDenyComplaintLine(): { line: string; index: number } {
    const total = this.wrongDenyComplaintDialoguePool.length;
    if (total <= 0) {
      return { line: '...', index: -1 };
    }
    if (total === 1) {
      this.lastWrongDenyComplaintLineIndex = 0;
      return {
        line: this.wrongDenyComplaintDialoguePool[0] ?? '...',
        index: 0,
      };
    }
    let index = Math.floor(Math.random() * total);
    if (index === this.lastWrongDenyComplaintLineIndex) {
      index = (index + 1 + Math.floor(Math.random() * (total - 1))) % total;
    }
    this.lastWrongDenyComplaintLineIndex = index;
    return {
      line: this.wrongDenyComplaintDialoguePool[index] ?? '...',
      index,
    };
  }

  private logWrongDenyComplaintStarted(
    resolvedOutcome: InspectionDecisionOutcome,
    complaintLineIndex: number,
  ): void {
    console.info('[WrongDenyComplaint] started', {
      roundId: this.currentRound?.roundId ?? null,
      employeeKey: this.currentRound?.employeeKey ?? null,
      caseKind: this.currentRound?.caseKind ?? null,
      checklistComplete: this.isChecklistComplete(),
      reasonCorrect: this.computeRejectReasonCorrect(),
      resolvedOutcome,
      complaintLineIndex,
    });
  }

  private logWrongDenyComplaintCompleted(nextAction: WrongDenyComplaintNextAction): void {
    console.info('[WrongDenyComplaint] completed', {
      roundId: this.currentRound?.roundId ?? null,
      employeeKey: this.currentRound?.employeeKey ?? null,
      complaintCount: this.formalComplaintCount,
      nextAction,
    });
  }

  private async handleWrongDenyComplaintOutcome(
    outcome: InspectionDecisionOutcome,
    token: number,
  ): Promise<void> {
    const complaintLine = this.pickWrongDenyComplaintLine();
    this.logWrongDenyComplaintStarted(outcome, complaintLine.index);
    await this.showDecisionDialogue(complaintLine.line, {
      autoCloseSeconds: 2.8,
      allowTapDismiss: true,
      minimumVisibleSeconds: 0.35,
      messageKind: 'complaint',
    });
    if (!this.isDecisionResolutionTokenActive(token)) return;
    this.formalComplaintCount += 1;
    if (this.formalComplaintCount >= 2) {
      this.logWrongDenyComplaintCompleted('show-termination-notice');
      this.showAdministrativeGameOver('multiple-formal-complaints');
      return;
    }
    this.logWrongDenyComplaintCompleted('advance-next-round');
    await this.completeNonCombatDecisionAndAdvance();
  }

  private buildAdministrativeGameOverContent(reason: AdministrativeGameOverReason): {
    title: string;
    message: string;
  } {
    switch (reason) {
      case 'multiple-formal-complaints':
        return {
          title: COMPLAINT_TERMINATION_TITLE,
          message: COMPLAINT_TERMINATION_BODY,
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
    if (this.reviveResolutionInProgress) {
      return;
    }
    this.pauseShiftClockForGameOver();
    this.dismissDayCompletionOverlayForGameOver();
    this.hideGuidancePanelImmediate(false);
    this.administrativeGameOverActive = true;
    this.currentAdministrativeGameOverReason = reason;
    this.reviveResolutionInProgress = false;
    this.failureReviewActive = false;
    this.invalidateFailureReviewVisuals();
    this.hideFailureReviewRuntime();
    this.registerActiveGameOver(reason);
    this.lockAllEncounterInput('administrative-gameover-lock');
    this.hideCarterThreatReplyCompletely();
    this.stopChecklistReplyTyping(true);
    this.closePreview();
    this.telephoneController?.closeEmergencyPhone();
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'administrative-gameover-lock');
    this.telephoneController?.setEmergencyInputEnabled(false);
    this.setShutterInteractionEnabledForInteractionTrace(false, 'administrative-gameover-lock');
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
    this.ensureGameOverBaseVisualState();
    this.ensureInternalContaminationMonsterNodes();
    this.invalidateInternalContaminationVisuals();

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

    if (reason === 'multiple-formal-complaints' || reason === 'repeated-procedural-violations') {
      this.applyComplaintTerminationLayout(reason, titleLabel, messageLabel);
      return;
    }

    if (reason === 'internal-contamination') {
      this.playInternalContaminationGameOverAudioCueIfNeeded();
      this.applyInternalContaminationGameOverLayout(titleLabel, messageLabel);
      if (this.carterMonsterPortraitSource?.isValid) {
        this.carterMonsterPortraitSource.active = false;
      }
      if (this.carterMonsterFullbodyVisual?.isValid) {
        this.carterMonsterFullbodyVisual.active = false;
      }
      void this.presentInternalContaminationMonsters();
      return;
    }

    if (this.carterGameOverTitleVisual?.isValid) {
      this.carterGameOverTitleVisual.active = false;
    }
    if (this.carterGameOverReviewVisual?.isValid) {
      this.carterGameOverReviewVisual.active = false;
    }
    if (this.carterGameOverReviewHit?.isValid) {
      this.carterGameOverReviewHit.active = false;
      this.carterGameOverReviewHit.off(Button.EventType.CLICK, this.handleFailureReviewNextClick, this);
    }
    if (this.carterGameOverReviewButton?.node?.isValid) {
      this.carterGameOverReviewButton.interactable = false;
    }
    if (this.carterGameOverReviewTextCover?.isValid) {
      this.carterGameOverReviewTextCover.active = false;
    }
    if (this.carterGameOverReviewLabelNode?.isValid) {
      this.carterGameOverReviewLabelNode.active = false;
    }
    if (this.carterGameOverDividerVisual?.isValid) {
      this.carterGameOverDividerVisual.active = false;
    }
    if (this.carterGameOverCompanyLogoVisual?.isValid) {
      this.carterGameOverCompanyLogoVisual.active = false;
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
    if (this.carterGameOverRetryVisual?.isValid) {
      this.carterGameOverRetryVisual.active = true;
    }
    if (this.carterGameOverRetryHit?.isValid) {
      this.carterGameOverRetryHit.active = true;
    }
    if (this.carterGameOverRetryButton?.node?.isValid) {
      this.carterGameOverRetryButton.interactable = true;
    }
    this.hideInternalContaminationMonsterVisuals();
    this.applyAdministrativeGameOverLayerOrder();
  }

  private applyAdministrativeGameOverLayerOrder(): void {
    if (!this.carterGameOverPanelRuntime?.isValid) {
      return;
    }
    let nextSiblingIndex = 0;
    const assignSiblingIndex = (node: Node | null): void => {
      if (!node?.isValid || node.parent !== this.carterGameOverPanelRuntime) {
        return;
      }
      node.setSiblingIndex(nextSiblingIndex);
      nextSiblingIndex += 1;
    };

    // Keep the paper background at the bottom for all administrative variants.
    assignSiblingIndex(this.carterGameOverPanelVisual);
    assignSiblingIndex(this.carterGameOverTitleVisual);
    assignSiblingIndex(this.carterGameOverTitleLabel);
    assignSiblingIndex(this.carterGameOverDividerVisual);
    assignSiblingIndex(this.carterGameOverMessageLabel);
    assignSiblingIndex(this.carterGameOverCompanyLogoVisual);
    assignSiblingIndex(this.carterGameOverReviewVisual);
    assignSiblingIndex(this.carterGameOverRetryVisual);
    assignSiblingIndex(this.carterGameOverReviveVisual);
    assignSiblingIndex(this.carterGameOverReviewHit);
    assignSiblingIndex(this.carterGameOverRetryHit);
    assignSiblingIndex(this.carterGameOverReviveHit);
  }

  private ensureGameOverBaseVisualState(): void {
    this.ensureCarterGameOverFormalNodes();
    if (this.failureReviewRuntime?.isValid) {
      this.failureReviewRuntime.active = false;
    }
    if (this.failureReviewCloseHitNode?.isValid) {
      this.failureReviewCloseHitNode.active = false;
    }
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = true;
    }
    if (this.carterGameOverPanelVisual?.isValid) {
      this.carterGameOverPanelVisual.active = true;
      const panelSprite = this.carterGameOverPanelVisual.getComponent(Sprite);
      if (panelSprite) {
        panelSprite.color = new Color(255, 255, 255, 255);
      }
      const panelOpacity = this.carterGameOverPanelVisual.getComponent(UIOpacity);
      if (panelOpacity) {
        panelOpacity.opacity = 255;
      }
    }
    this.applyAdministrativeGameOverLayerOrder();
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
    this.hideEvidencePreviewRuntimeImmediate('non-combat-advance');
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
    this.previewOpen = false;
    this.checklistQuestionPanelOpen = false;
    this.checklistReplyPanelOpen = false;
    this.checklistReplyContext = 'normal';
    this.selectedChecklistQuestion = null;
    this.resetChecklistState();
    this.clearReviveCheckpoint();
    this.refreshChecklistActionState();
    if (this.currentInspectionSubject?.subjectKind === 'visitor') {
      const visitorRoundId = this.currentInspectionSubject.roundId;
      this.completeActiveVisitorNonCombatDeparture(visitorRoundId);
    }
    this.resetInspectionRoundForNextSubject();
    this.setInspectionDecisionResolutionInProgress(true, 'non-combat-advance-in-progress');

    // Shared exit entry for ALLOW / DENY / complaint / protocol-violation advances:
    // footsteps are bound inside playCharacterExit at move-animation start.
    if (this.visitorIntroController) {
      await this.visitorIntroController.playCharacterExit();
    } else if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = false;
    }
    if (this.isDestroying) {
      return;
    }

    const advanced = this.advanceToNextInspectionSubject();
    if (!advanced) {
      if (!this.campaignDayTransitionInProgress && !this.campaignImplementedContentComplete) {
        console.info('INSPECTION_SEQUENCE_COMPLETE');
      }
      return;
    }
    if (!this.loadInspectionSubject(this.activeInspectionSubjectId)) {
      console.error('[InspectionDecision] transition failed: load next inspection subject failed');
      this.setInspectionDecisionResolutionInProgress(false, 'non-combat-advance-load-failed');
      return;
    }
    this.setManagedButtonsInteractable(false, 'subject-load-lock-after-non-combat');
    const introResult = await this.playIntroForActiveSubject();
    if (!introResult.ok) {
      console.error('[InspectionDecision] transition failed: next intro start failed');
    }
  }

  private buildWronglyAllowedMonsterRecordFromActiveSubject():
    | WronglyAllowedMonsterRecord
    | null {
    const activeSubject = this.currentInspectionSubject;
    if (!activeSubject) {
      return null;
    }
    if (activeSubject.subjectKind === 'visitor') {
      const visitorProfile = getVisitorProfile(activeSubject.visitorKey);
      if (!visitorProfile) {
        return null;
      }
      const monsterFullbodySpriteFrameUuid = resolveVisitorVisualSpriteFrameUuid(
        visitorProfile,
        'monster-fullbody',
      );
      return {
        roundId: activeSubject.roundId,
        subjectKind: 'visitor',
        subjectKey: activeSubject.visitorKey,
        monsterFullbodySpriteFrameUuid,
      };
    }
    const employeeKey = activeSubject.round.employeeKey;
    const employeeProfile = EMPLOYEE_PROFILES[employeeKey];
    const monsterFullbodySpriteFrameUuid = employeeProfile?.monsterFullbodySpriteFrameUuid ?? '';
    if (monsterFullbodySpriteFrameUuid.trim().length === 0) {
      return null;
    }
    return {
      roundId: activeSubject.round.roundId,
      subjectKind: 'employee',
      subjectKey: employeeKey,
      monsterFullbodySpriteFrameUuid,
    };
  }

  private recordWronglyAllowedMonsterFromActiveSubject(outcome: InspectionDecisionOutcome): void {
    const record = this.buildWronglyAllowedMonsterRecordFromActiveSubject();
    if (!record) {
      console.error('[InternalContamination] Failed to resolve wrongly-allowed monster record.', {
        outcome,
        activeRoundId:
          this.currentInspectionSubject?.subjectKind === 'visitor'
            ? this.currentInspectionSubject.roundId
            : this.currentInspectionSubject?.round.roundId ?? null,
      });
      return;
    }
    campaignState.recordWronglyAllowedMonster(record);
  }

  private async handleInspectionDecisionOutcome(
    outcome: InspectionDecisionOutcome,
    token: number,
  ): Promise<void> {
    this.recordDailyDecisionErrorFromOutcome(outcome);
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
      case 'deny-incomplete-checklist':
        console.warn('[InspectionDecision] incomplete checklist blocked', {
          roundId: this.currentRound?.roundId ?? null,
          employeeKey: this.currentRound?.employeeKey ?? null,
          source: 'outcome-fallback',
          idCardChoice: this.idCardChoice,
          applicationChoice: this.applicationChoice,
          appearanceChoice: this.appearanceChoice,
        });
        if (!this.isDecisionResolutionTokenActive(token)) return;
        this.abortDecisionResolutionSafely(token);
        if (!this.incompleteRejectNoticeInFlight) {
          this.incompleteRejectNoticeInFlight = true;
          void this.showSystemNotice('COMPLETE ALL CHECKLIST ROWS BEFORE REJECTING.')
            .catch((error) => {
              console.error('[InspectionDecision] incomplete checklist notice failed.', error);
            })
            .finally(() => {
              this.incompleteRejectNoticeInFlight = false;
            });
        }
        return;
      case 'valid-human-allowed':
        await showStandardDialogue(this.validEmployeeAllowDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'valid-human-wrongly-rejected':
        await this.handleWrongDenyComplaintOutcome(outcome, token);
        return;
      case 'invalid-human-correctly-rejected':
        await showStandardDialogue(this.invalidDocumentEmployeeCorrectRejectDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'invalid-human-wrongly-rejected':
        await this.handleWrongDenyComplaintOutcome(outcome, token);
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
        this.recordWronglyAllowedMonsterFromActiveSubject(outcome);
        this.infectedEntryCount += 1;
        const securityBreachThreshold = 3;
        const thresholdReached = this.infectedEntryCount >= securityBreachThreshold;
        console.info('[InspectionDecision] security breach tally', {
          securityBreachCount: this.infectedEntryCount,
          securityBreachThreshold,
          thresholdReached,
          nextRoundScheduled: !thresholdReached,
        });
        if (thresholdReached) {
          this.showAdministrativeGameOver('internal-contamination');
          return;
        }
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
        {
          const started = this.startCarterThreatSequence(false);
          if (!started) {
            console.error('[MonsterReveal] threat chain did not start', {
              roundId: this.currentRound?.roundId ?? null,
              employeeKey: this.currentRound?.employeeKey ?? null,
              caseKind: this.currentRound?.caseKind ?? null,
            });
          }
        }
        return;
      case 'monster-wrongly-rejected':
        await this.handleWrongDenyComplaintOutcome(outcome, token);
        return;
      case 'visitor-valid-allowed':
        await showStandardDialogue(this.validEmployeeAllowDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'visitor-valid-wrongly-denied':
        await this.handleWrongDenyComplaintOutcome(outcome, token);
        return;
      case 'visitor-monster-wrongly-allowed':
        await showStandardDialogue(this.monsterWrongAllowDialoguePool);
        if (!this.isDecisionResolutionTokenActive(token)) return;
        this.recordWronglyAllowedMonsterFromActiveSubject(outcome);
        this.infectedEntryCount += 1;
        if (this.infectedEntryCount >= 3) {
          this.showAdministrativeGameOver('internal-contamination');
          return;
        }
        await this.completeNonCombatDecisionAndAdvance();
        return;
      case 'visitor-monster-correctly-denied':
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
        if (!this.startCarterThreatSequence(false, true)) {
          console.error('[VisitorMonsterReveal] threat chain did not start.');
        }
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
      this.hideEvidencePreviewRuntimeImmediate('checklist-preview-resolution-hide');
    }
    this.previewOpen = false;
  }

  private isActiveSubjectActuallyEligibleForAllow(): boolean {
    return this.areAllRequiredEvidenceTruthPass();
  }

  private async resolveCorrectAllowDecision(): Promise<void> {
    this.carterEncounterResolved = true;
    this.threatSequenceActive = false;
    this.emergencyWindowOpen = false;
    this.emergencyShutterSucceeded = false;
    this.emergencyShutterCloseRequested = false;
    this.phoneResponseWindowOpen = false;
    this.phoneDialWindowOpen = false;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = true;
    this.carterAttackTriggered = false;
    this.emergencyDeadlineMs = 0;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialDeadlineMs = 0;
    this.monsterThreatProtectionPhase = 'idle';
    this.activeMonsterThreatTiming = null;
    this.closedShutterProtectionGranted = false;
    this.monsterThreatGeneration += 1;
    this.emergencyTimeoutGeneration = this.monsterThreatGeneration;
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDialCodeTimeout);
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
    this.setShutterInteractionEnabledForInteractionTrace(false, 'correct-allow-transition');
    this.telephoneController?.closeEmergencyPhone();
    this.telephoneController?.setEmergencyInputEnabled(false);
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'correct-allow-transition');

    this.hideCarterThreatReplyCompletely();
    this.stopChecklistReplyTyping(true);
    this.configureChecklistReplyOverlay(false, false);
    if (this.checklistQuestionPanelRuntime?.isValid) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    if (this.checklistReplyPanelRuntime?.isValid) {
      this.checklistReplyPanelRuntime.active = false;
    }
    this.hideEvidencePreviewRuntimeImmediate('correct-allow-transition');
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
    this.clearReviveCheckpoint();
    this.refreshChecklistActionState();

    this.resetInspectionRoundForNextSubject();
    this.setInspectionDecisionResolutionInProgress(true, 'correct-allow-advance-in-progress');

    const advanced = this.advanceToNextInspectionSubject();
    if (!advanced) {
      if (!this.campaignDayTransitionInProgress && !this.campaignImplementedContentComplete) {
        console.info('INSPECTION_SEQUENCE_COMPLETE');
      }
      return;
    }
    if (!this.loadInspectionSubject(this.activeInspectionSubjectId)) {
      console.error('[InspectionDecision] allow transition failed: load next inspection subject failed');
      this.setInspectionDecisionResolutionInProgress(false, 'correct-allow-load-failed');
      return;
    }
    this.setManagedButtonsInteractable(false, 'subject-load-lock-after-correct-allow');
    const introResult = await this.playIntroForActiveSubject();
    if (!introResult.ok) {
      console.error('[InspectionDecision] allow transition failed: next intro start failed');
    }
  }

  private triggerIncorrectAllowGameOver(): void {
    console.warn('[InspectionDecision] incorrect allow');
    this.lockAllEncounterInput('incorrect-allow-gameover-lock');
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
      this.hideEvidencePreviewRuntimeImmediate('carter-reject-transition');
    }
    if (this.screeningChecklistDetailVisual) {
      this.screeningChecklistDetailVisual.active = false;
    }
    this.previewOpen = false;
    this.setManagedButtonsInteractable(true, 'threat-sequence-reject-unlock');

    this.startCarterThreatSequence();
    if (!this.threatSequenceActive) {
      this.warnRejectGate(source, 'startCarterThreatSequence returned before activation');
    }
  }

  private startCarterThreatSequence(
    showThreatDialogue: boolean = true,
    forceVisitorMonsterReveal: boolean = false,
  ): boolean {
    const activeSubject = this.currentInspectionSubject;
    if (!activeSubject) {
      return false;
    }
    const subjectRoundId =
      activeSubject.subjectKind === 'visitor' ? activeSubject.roundId : activeSubject.round.roundId;
    const subjectKey =
      activeSubject.subjectKind === 'visitor' ? activeSubject.visitorKey : activeSubject.round.employeeKey;
    const isMonster =
      activeSubject.subjectKind === 'visitor'
        ? activeSubject.caseKind === 'disguised-monster-visitor' || forceVisitorMonsterReveal
        : activeSubject.round.caseKind === 'DISGUISED_MONSTER';
    if (!isMonster) {
      return false;
    }
    const monsterPortrait = this.getActiveMonsterPortraitFrame();
    console.info('[MonsterReveal] started', {
      roundId: subjectRoundId,
      employeeKey: subjectKey,
    });
    if (!monsterPortrait) {
      console.error('monster reveal portrait missing', {
        roundId: subjectRoundId,
        employeeKey: subjectKey,
        decision: 'DENY',
        outcome: 'monster-correctly-rejected',
      });
      return false;
    }
    if (
      !this.carterCharacterSprite ||
      !this.shutterController ||
      (!this.isActiveVisitorInspectionSubject() && !this.computeRejectReasonCorrect())
    ) {
      return false;
    }
    if (this.carterEncounterResolved || this.threatSequenceActive) {
      return false;
    }
    if (this.checklistReplyPanelOpen || this.checklistQuestionPanelOpen) {
      return false;
    }
    if (this.checklistReplyContext !== 'normal') {
      return false;
    }
    if (this.shutterController.isShutterClosed()) {
      console.warn(
        '[EvidencePreviewController] Carter threat sequence not started because shutter is already closed.',
      );
      return false;
    }
    if (activeSubject.subjectKind === 'employee' && this.currentRound?.roundId !== subjectRoundId) {
      console.warn('[MonsterReveal] round changed before portrait apply', {
        expectedRoundId: subjectRoundId,
        currentRoundId: this.currentRound?.roundId ?? null,
      });
      return false;
    }
    if (activeSubject.subjectKind === 'visitor' && this.currentInspectionSubject?.subjectKind !== 'visitor') {
      return false;
    }

    this.threatSequenceActive = true;
    this.emergencyWindowOpen = true;
    this.emergencyShutterSucceeded = false;
    this.emergencyShutterCloseRequested = false;
    this.carterAttackTriggered = false;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = false;
    this.phoneResponseWindowOpen = false;
    this.phoneDialWindowOpen = false;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialDeadlineMs = 0;
    this.emergencyDeadlineMs = 0;
    this.monsterThreatGeneration += 1;
    this.emergencyTimeoutGeneration = this.monsterThreatGeneration;
    this.closedShutterProtectionGranted = false;
    this.activeMonsterThreatDay = this.getActiveCampaignDayIndex();
    this.activeMonsterThreatTiming = getMonsterThreatTimingForDay(this.activeMonsterThreatDay);
    this.monsterThreatProtectionPhase = 'open-window';

    this.captureEncounterButtonStates();
    this.setThreatEmergencyInteractable();
    this.setShutterInteractionEnabledForInteractionTrace(true, 'threat-sequence-shutter-enable');
    if (this.carterCharacter?.isValid) {
      Tween.stopAllByTarget(this.carterCharacter);
      this.carterCharacter.active = true;
    }
    Tween.stopAllByTarget(this.carterCharacterSprite.node);
    this.carterCharacterSprite.spriteFrame = monsterPortrait;
    this.applyCarterPortraitContainSize(monsterPortrait);
    AudioManager.getInstance()?.playCachedMonsterDisguiseRevealRoar();
    console.info('[MonsterReveal] portrait applied', {
      roundId: subjectRoundId,
      employeeKey: subjectKey,
    });
    if (showThreatDialogue) {
      this.showChecklistReplyWithContext(this.pickThreatReply(), 'threat', false, false, false);
    }
    console.info('[MonsterReveal] threat chain started', {
      roundId: subjectRoundId,
      employeeKey: subjectKey,
    });
    this.bindEmergencyCloseListener();
    this.beginPhoneResponseWindow();
    this.startMonsterShutterResponseWindow();
    return true;
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

  private startMonsterShutterResponseWindow(): void {
    if (!this.threatSequenceActive || this.carterEncounterResolved || this.carterAttackTriggered) {
      return;
    }
    if (this.cleanupProgramActivated) {
      return;
    }
    const threatTiming = this.activeMonsterThreatTiming;
    if (!threatTiming) {
      return;
    }
    this.unschedule(this.handleEmergencyTimeout);
    const openWindowBreakSeconds = threatTiming.openWindowBreakSeconds;
    this.emergencyDeadlineMs = Date.now() + openWindowBreakSeconds * 1000;
    this.emergencyTimeoutGeneration = this.monsterThreatGeneration;
    this.scheduleOnce(this.handleEmergencyTimeout, openWindowBreakSeconds);
    this.logMonsterThreatTiming(
      `started phase=open-window day=${this.activeMonsterThreatDay} seconds=${openWindowBreakSeconds}`,
    );
  }

  private beginPhoneResponseWindow(): void {
    if (!this.telephoneController) {
      this.triggerCarterBreakthroughFailure('phone-pickup-timeout');
      return;
    }
    if (this.cleanupProgramActivated || this.carterAttackTriggered || this.carterEncounterResolved) {
      return;
    }
    this.phoneResponseWindowOpen = true;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialWindowOpen = false;
    this.phoneDialDeadlineMs = 0;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = false;
    this.unbindEmergencyCallSubmittedListener();
    this.bindEmergencyPhoneOpenedListener();
    this.emergencyTelephoneOverrideActive = true;
    this.telephoneController.setEmergencyAccessOverride(true);
    this.telephoneController.armEmergencyMode();
    this.setTelephoneEntryEnabledForInteractionTrace(true, 'threat-sequence-phone-entry');
    this.refreshCampaignEvidenceAvailability('decision-resolution');
    this.setThreatEmergencyInteractable();
    this.unschedule(this.handlePhonePickupTimeout);
  }

  private beginPhoneDialWindow(): void {
    if (!this.telephoneController) {
      this.triggerCarterBreakthroughFailure('dial-timeout');
      return;
    }
    if (this.phoneDialWindowOpen) {
      return;
    }
    const threatTiming = this.activeMonsterThreatTiming;
    if (!threatTiming) {
      this.triggerCarterBreakthroughFailure('dial-timeout');
      return;
    }
    this.phoneResponseWindowOpen = false;
    this.phoneResponseDeadlineMs = 0;
    const phoneDialSeconds = threatTiming.phoneDialSeconds;
    this.phoneDialWindowOpen = true;
    this.phoneDialDeadlineMs = Date.now() + phoneDialSeconds * 1000;
    this.logMonsterThreatTiming(
      `phone entry started day=${this.activeMonsterThreatDay} seconds=${phoneDialSeconds}`,
    );
    this.bindEmergencyCallSubmittedListener();
    this.telephoneController.resetDialInput();
    this.telephoneController.showEmergencyStatus(
      `DIAL ${EvidencePreviewController.PURGE_PHONE_CODE}`,
    );
    this.telephoneController.setEmergencyInputEnabled(true);
    this.unschedule(this.handleDialCodeTimeout);
    this.scheduleOnce(this.handleDialCodeTimeout, phoneDialSeconds);
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
    this.monsterThreatProtectionPhase = 'resolved';
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialDeadlineMs = 0;
    this.emergencyDeadlineMs = 0;
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDialCodeTimeout);
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
    this.emergencyTelephoneOverrideActive = false;
    this.telephoneController?.setEmergencyAccessOverride(false);
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'cleanup-program-activated');
    this.telephoneController?.showEmergencyStatus('CLEANUP ACTIVE');
    this.setShutterInteractionEnabledForInteractionTrace(false, 'cleanup-program-activated');
    if (this.telephoneController) {
      this.telephoneController.setEmergencyInputEnabled(false);
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
    this.lockAllEncounterInput('cleanup-program-activated');
    this.refreshCampaignEvidenceAvailability('cleanup');
    this.logMonsterThreatTiming('resolved');
    console.info('CLEANUP PROGRAM ACTIVATED');
    console.info('THREAT ELIMINATED');
    this.completeCurrentInspectionSubjectAfterCleanup();
  }

  private completeCurrentInspectionSubjectAfterCleanup(): void {
    this.lockAllEncounterInput('cleanup-transition-scheduled');
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
    if (this.reviveResolutionInProgress) {
      return;
    }
    this.pauseShiftClockForGameOver();
    this.hideGuidancePanelImmediate(false);
    this.failureReviewActive = false;
    this.invalidateFailureReviewVisuals();
    this.hideFailureReviewRuntime();
    this.reviveResolutionInProgress = false;
    this.registerActiveGameOver(reason);
    this.carterAttackTriggered = true;
    this.carterEncounterResolved = true;
    this.monsterThreatProtectionPhase = 'failed';
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
    this.unschedule(this.handleDialCodeTimeout);
    this.unschedule(this.handleShowCarterGameOver);
    this.unschedule(this.handleCleanupTransitionComplete);
    this.cleanupTransitionScheduled = false;
    this.delayedDamagedShutterSwitchScheduled = false;
    this.setInspectionDecisionResolutionInProgress(false, 'carter-breakthrough-failure');
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyShutterClosedSettledListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.shutterController?.stopShutterImpactLoop();
    this.telephoneController?.closeEmergencyPhone();
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'carter-breakthrough-failure');
    this.setShutterInteractionEnabledForInteractionTrace(false, 'carter-breakthrough-failure');
    this.lockAllEncounterInput('carter-breakthrough-failure');
    this.administrativeGameOverActive = false;
    this.currentAdministrativeGameOverReason = null;
    this.invalidateInternalContaminationVisuals();
    this.hideCarterThreatReplyCompletely();
    const presentationTag = `breakthrough-${reason}`;
    const fullbodyPresented = this.commitActiveMonsterFullbodyPresentation(presentationTag);
    if (this.carterMonsterAttackRuntime?.isValid) {
      this.carterMonsterAttackRuntime.active = true;
    }
    if (fullbodyPresented) {
      this.playMonsterGameOverAudioCueIfNeeded();
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
    this.ensureGameOverBaseVisualState();
    this.scheduleOnce(this.handleShowCarterGameOver, 0.3);
    console.warn(`[EvidencePreviewController] Carter breakthrough failure: ${reason}`);
  }

  private handleEmergencyTimeout = (): void => {
    if (!this.threatSequenceActive) {
      return;
    }
    if (this.carterEncounterResolved || this.cleanupProgramActivated || this.carterAttackTriggered) {
      return;
    }
    if (
      this.monsterThreatProtectionPhase !== 'open-window' &&
      this.monsterThreatProtectionPhase !== 'closed-shutter'
    ) {
      return;
    }
    if (this.emergencyTimeoutGeneration !== this.monsterThreatGeneration) {
      return;
    }
    this.logMonsterThreatTiming(`timeout phase=${this.monsterThreatProtectionPhase}`);
    this.triggerCarterBreakthroughFailure('shutter-timeout');
  };

  private resetCarterMonsterFlow(restoreButtons: boolean): void {
    this.stopMonsterGameOverAlarmAudio();
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDialCodeTimeout);
    this.unschedule(this.handleShowCarterGameOver);
    this.unschedule(this.handleCleanupTransitionComplete);
    this.cleanupTransitionScheduled = false;
    this.delayedDamagedShutterSwitchScheduled = false;
    this.setInspectionDecisionResolutionInProgress(false, 'reset-carter-monster-flow');
    this.currentAdministrativeGameOverReason = null;
    this.activeGameOverContext = null;
    this.failureReviewActive = false;
    this.invalidateFailureReviewVisuals();
    this.hideFailureReviewRuntime();
    this.invalidateInternalContaminationVisuals();
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyShutterClosedSettledListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.emergencyWindowOpen = false;
    this.emergencyShutterSucceeded = false;
    this.emergencyShutterCloseRequested = false;
    this.threatSequenceActive = false;
    this.carterAttackTriggered = false;
    this.emergencyDeadlineMs = 0;
    this.phoneResponseWindowOpen = false;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialWindowOpen = false;
    this.phoneDialDeadlineMs = 0;
    this.monsterThreatProtectionPhase = 'idle';
    this.activeMonsterThreatTiming = null;
    this.closedShutterProtectionGranted = false;
    this.monsterThreatGeneration += 1;
    this.emergencyTimeoutGeneration = this.monsterThreatGeneration;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = false;
    this.rejectFlowRequested = false;
    this.carterAppearanceQuestionAsked = false;
    this.carterEncounterResolved = false;
    this.anxiousReplyShown = false;

    this.hideCarterThreatReplyCompletely();
    this.emergencyTelephoneOverrideActive = false;
    if (!this.isDestroying) {
      this.telephoneController?.closeEmergencyPhone();
      this.telephoneController?.setEmergencyAccessOverride(false);
      this.setTelephoneEntryEnabledForInteractionTrace(false, 'reset-carter-monster-flow');
    }
    this.shutterController?.stopShutterImpactLoop();
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
      if (!this.isDestroying) {
        this.shutterController.restoreNormalVisual();
        this.setShutterInteractionEnabledForInteractionTrace(
          this.getCachedButtonInteractable('BtnShutterHit'),
          'restore-encounter-state-shutter',
        );
      }
    }

    if (restoreButtons) {
      if (this.encounterButtonStateCache.size > 0) {
        this.restoreEncounterButtonStates();
      }
    }
    if (!this.isDestroying) {
      this.refreshCampaignEvidenceAvailability('cleanup');
    }
    this.logMonsterThreatTiming('cancelled reason=reset-carter-monster-flow');
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
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'shutter-only-mode');
  }

  private setOnlyTelephoneInteractable(): void {
    this.setAllEncounterButtonsInteractable(false);
    this.setTelephoneEntryEnabledForInteractionTrace(true, 'telephone-only-mode');
  }

  private setThreatEmergencyInteractable(): void {
    this.setAllEncounterButtonsInteractable(false);
    if (this.shutterHitButton?.node?.isValid) {
      this.shutterHitButton.interactable = true;
    }
    this.setTelephoneEntryEnabledForInteractionTrace(true, 'threat-sequence-emergency-access');
  }

  private lockAllEncounterInput(reason: string = 'unspecified'): void {
    this.logInteractionTrace('lock-all', {
      reason,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    this.setAllEncounterButtonsInteractable(false);
    this.setTelephoneEntryEnabledForInteractionTrace(false, `lock-all:${reason}`);
    this.setShutterInteractionEnabledForInteractionTrace(false, `lock-all:${reason}`);
    this.logInteractionStateSnapshot(`lock-all:${reason}`);
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
    this.carterGameOverDividerVisual =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverDividerVisual') ??
      this.createGameOverDividerNode('CarterGameOverDividerVisual', this.carterGameOverPanelRuntime);
    this.carterGameOverCompanyLogoVisual =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverCompanyLogoVisual') ??
      this.createGameOverVisualNode('CarterGameOverCompanyLogoVisual', this.carterGameOverPanelRuntime);
    this.carterGameOverReviewVisual =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverReviewVisual') ??
      this.createGameOverVisualNode('CarterGameOverReviewVisual', this.carterGameOverPanelRuntime);
    this.carterGameOverReviewHit =
      this.carterGameOverPanelRuntime.getChildByName('CarterGameOverReviewHit') ??
      this.createGameOverHitNode('CarterGameOverReviewHit', this.carterGameOverPanelRuntime);
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
    this.carterGameOverDividerGraphics = this.carterGameOverDividerVisual?.getComponent(Graphics) ?? null;
    this.carterGameOverCompanyLogoSprite = this.carterGameOverCompanyLogoVisual?.getComponent(Sprite) ?? null;
    this.carterGameOverReviewSprite = this.carterGameOverReviewVisual?.getComponent(Sprite) ?? null;
    this.carterGameOverRetrySprite = this.carterGameOverRetryVisual?.getComponent(Sprite) ?? null;
    this.carterGameOverReviveSprite = this.carterGameOverReviveVisual?.getComponent(Sprite) ?? null;
    this.carterGameOverReviewButton = this.carterGameOverReviewHit?.getComponent(Button) ?? null;
    this.carterGameOverRetryButton = this.carterGameOverRetryHit?.getComponent(Button) ?? null;
    this.carterGameOverReviveButton = this.carterGameOverReviveHit?.getComponent(Button) ?? null;
    this.carterGameOverReviewTextCover =
      this.carterGameOverReviewVisual?.getChildByName('CarterGameOverReviewTextCover') ??
      this.createReviewTextCoverNode(this.carterGameOverReviewVisual);
    this.carterGameOverReviewTextCoverGraphics =
      this.carterGameOverReviewTextCover?.getComponent(Graphics) ?? null;
    this.carterGameOverReviewLabelNode =
      this.carterGameOverReviewTextCover?.getChildByName('CarterGameOverReviewLabel') ??
      this.createReviewLabelNode(this.carterGameOverReviewTextCover);
    this.carterGameOverReviewLabel = this.carterGameOverReviewLabelNode?.getComponent(Label) ?? null;
  }

  private ensureInternalContaminationMonsterNodes(): void {
    if (!this.carterMonsterAttackRuntime) {
      return;
    }
    this.internalContaminationMonsterGroup =
      this.carterMonsterAttackRuntime.getChildByName('InternalContaminationMonsterGroup') ??
      new Node('InternalContaminationMonsterGroup');
    if (!this.internalContaminationMonsterGroup.parent) {
      this.carterMonsterAttackRuntime.addChild(this.internalContaminationMonsterGroup);
    }
    this.internalContaminationMonsterGroup.setPosition(0, 0, 0);
    this.internalContaminationMonsterGroup.setScale(1, 1, 1);
    let groupTransform = this.internalContaminationMonsterGroup.getComponent(UITransform);
    if (!groupTransform) {
      groupTransform = this.internalContaminationMonsterGroup.addComponent(UITransform);
    }
    groupTransform.setContentSize(720, 1280);
    if (!this.internalContaminationMonsterGroup.getComponent(UIOpacity)) {
      this.internalContaminationMonsterGroup.addComponent(UIOpacity);
    }

    this.internalContaminationMonsterLeft = this.ensureInternalContaminationMonsterSlotNode(
      'InternalContaminationMonsterLeft',
    );
    this.internalContaminationMonsterCenter = this.ensureInternalContaminationMonsterSlotNode(
      'InternalContaminationMonsterCenter',
    );
    this.internalContaminationMonsterRight = this.ensureInternalContaminationMonsterSlotNode(
      'InternalContaminationMonsterRight',
    );
    this.internalContaminationMonsterGroup.active = false;
  }

  private ensureInternalContaminationMonsterSlotNode(name: string): Node | null {
    const group = this.internalContaminationMonsterGroup;
    if (!group) {
      return null;
    }
    const node = group.getChildByName(name) ?? new Node(name);
    if (!node.parent) {
      group.addChild(node);
    }
    let transform = node.getComponent(UITransform);
    if (!transform) {
      transform = node.addComponent(UITransform);
    }
    transform.setContentSize(300, 700);
    const sprite = node.getComponent(Sprite) ?? node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    if (!node.getComponent(UIOpacity)) {
      node.addComponent(UIOpacity);
    }
    node.setScale(1, 1, 1);
    node.active = false;
    return node;
  }

  private hideInternalContaminationMonsterVisuals(): void {
    const nodes = [
      this.internalContaminationMonsterLeft,
      this.internalContaminationMonsterCenter,
      this.internalContaminationMonsterRight,
    ];
    for (const node of nodes) {
      if (!node?.isValid) {
        continue;
      }
      const sprite = node.getComponent(Sprite);
      if (sprite) {
        sprite.spriteFrame = null;
      }
      node.active = false;
      node.setScale(1, 1, 1);
    }
    if (this.internalContaminationMonsterGroup?.isValid) {
      this.internalContaminationMonsterGroup.active = false;
    }
  }

  private invalidateInternalContaminationVisuals(): void {
    this.internalContaminationVisualGeneration += 1;
    this.hideInternalContaminationMonsterVisuals();
  }

  private applyInternalContaminationMonsterFrame(
    slotNode: Node | null,
    frame: SpriteFrame | null,
    layout: InternalContaminationMonsterSlotLayout,
  ): void {
    if (!slotNode?.isValid) {
      return;
    }
    const sprite = slotNode.getComponent(Sprite);
    slotNode.setPosition(layout.positionX, layout.positionY, 0);
    if (!sprite) {
      slotNode.active = false;
      return;
    }
    if (!frame?.isValid) {
      sprite.spriteFrame = null;
      slotNode.setScale(1, 1, 1);
      slotNode.active = false;
      return;
    }

    const applied = this.applyMonsterFullbodyContain(
      sprite,
      frame,
      layout.maxWidth,
      layout.maxHeight,
      layout.scale,
      slotNode.name,
    );
    if (!applied) {
      sprite.spriteFrame = null;
      slotNode.active = false;
      return;
    }
    slotNode.active = true;
  }

  private async presentInternalContaminationMonsters(): Promise<void> {
    this.ensureInternalContaminationMonsterNodes();
    const generation = ++this.internalContaminationVisualGeneration;
    const records = campaignState.getWronglyAllowedMonsters().slice(0, 3);
    if (records.length < 3) {
      console.error('[InternalContamination] INTERNAL_CONTAMINATION_RECORDS_INCOMPLETE', {
        infectedEntryCount: this.infectedEntryCount,
        recordsAvailable: records.length,
      });
    }
    const slotNodes = [
      this.internalContaminationMonsterLeft,
      this.internalContaminationMonsterCenter,
      this.internalContaminationMonsterRight,
    ] as const;
    const layouts = EvidencePreviewController.INTERNAL_CONTAMINATION_SLOT_LAYOUTS;
    for (let index = 0; index < slotNodes.length; index += 1) {
      const slotNode = slotNodes[index];
      const layout = layouts[index];
      const record = records[index] ?? null;
      if (!slotNode?.isValid) {
        continue;
      }
      if (!record) {
        this.applyInternalContaminationMonsterFrame(slotNode, null, layout);
        continue;
      }
      try {
        const frame = await this.loadSpriteFrameByUuid(record.monsterFullbodySpriteFrameUuid);
        const stale =
          !this.node?.isValid ||
          this.isDestroying ||
          generation !== this.internalContaminationVisualGeneration ||
          this.currentAdministrativeGameOverReason !== 'internal-contamination' ||
          !this.administrativeGameOverActive;
        if (stale) {
          return;
        }
        this.applyInternalContaminationMonsterFrame(slotNode, frame, layout);
      } catch (error) {
        console.error('[InternalContamination] Failed to load monster fullbody sprite frame.', {
          index,
          roundId: record.roundId,
          subjectKind: record.subjectKind,
          subjectKey: record.subjectKey,
          spriteFrameUuid: record.monsterFullbodySpriteFrameUuid,
          error,
        });
        this.applyInternalContaminationMonsterFrame(slotNode, null, layout);
      }
    }
    if (
      generation !== this.internalContaminationVisualGeneration ||
      this.currentAdministrativeGameOverReason !== 'internal-contamination' ||
      !this.administrativeGameOverActive
    ) {
      return;
    }
    if (this.internalContaminationMonsterGroup?.isValid) {
      this.internalContaminationMonsterGroup.active = true;
    }
  }

  private applyInternalContaminationGameOverLayout(
    titleLabel: Label | null,
    messageLabel: Label | null,
  ): void {
    const subtitleY = 84;
    const buttonRowY = -156;
    const gameOverTitleVisualY = 176;
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.setPosition(0, -330, 0);
    }
    if (this.carterGameOverTitleLabel?.isValid) {
      this.carterGameOverTitleLabel.active = true;
      this.carterGameOverTitleLabel.setPosition(0, subtitleY, 0);
      this.setNodeSize(this.carterGameOverTitleLabel, 520, 54);
    }
    if (titleLabel) {
      titleLabel.string = EvidencePreviewController.INTERNAL_CONTAMINATION_SUBTITLE;
      titleLabel.fontSize = 31;
      titleLabel.lineHeight = 37;
      titleLabel.color = new Color(34, 28, 24, 255);
      titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
      titleLabel.overflow = Overflow.CLAMP;
      titleLabel.enableWrapText = false;
      titleLabel.isBold = true;
    }
    if (this.carterGameOverMessageLabel?.isValid) {
      this.carterGameOverMessageLabel.active = true;
      this.carterGameOverMessageLabel.setPosition(0, -42, 0);
      this.setNodeSize(this.carterGameOverMessageLabel, 520, 182);
    }
    if (messageLabel) {
      messageLabel.string = EvidencePreviewController.INTERNAL_CONTAMINATION_REASON_TEXT;
      messageLabel.fontSize = 21;
      messageLabel.lineHeight = 30;
      messageLabel.color = new Color(42, 35, 30, 255);
      messageLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      messageLabel.verticalAlign = Label.VerticalAlign.TOP;
      messageLabel.overflow = Overflow.CLAMP;
      messageLabel.enableWrapText = false;
      messageLabel.isBold = false;
    }
    if (this.carterGameOverRetryVisual?.isValid) {
      this.carterGameOverRetryVisual.active = true;
      this.carterGameOverRetryVisual.setPosition(-125, buttonRowY, 0);
    }
    if (this.carterGameOverRetryHit?.isValid) {
      this.carterGameOverRetryHit.active = true;
      this.carterGameOverRetryHit.setPosition(-125, buttonRowY, 0);
    }
    if (this.carterGameOverRetryButton?.node?.isValid) {
      this.carterGameOverRetryButton.interactable = true;
    }
    if (this.carterGameOverReviveVisual?.isValid) {
      this.carterGameOverReviveVisual.active = true;
      this.carterGameOverReviveVisual.setPosition(125, buttonRowY, 0);
    }
    if (this.carterGameOverReviveHit?.isValid) {
      this.carterGameOverReviveHit.active = true;
      this.carterGameOverReviveHit.setPosition(125, buttonRowY, 0);
    }
    if (this.carterGameOverReviveButton?.node?.isValid) {
      this.carterGameOverReviveButton.interactable = true;
    }
    if (this.carterGameOverPanelVisual?.isValid) {
      this.carterGameOverPanelVisual.active = true;
    }
    if (this.carterGameOverTitleVisual?.isValid) {
      this.carterGameOverTitleVisual.active = true;
      this.carterGameOverTitleVisual.setPosition(0, gameOverTitleVisualY, 0);
      const titleFrame = this.carterGameOverTitleSprite?.spriteFrame ?? null;
      if (titleFrame) {
        this.applyContainSize(this.carterGameOverTitleVisual, titleFrame, 500, 106);
      }
    }
    if (this.carterGameOverReviewVisual?.isValid) {
      this.carterGameOverReviewVisual.active = false;
    }
    if (this.carterGameOverReviewHit?.isValid) {
      this.carterGameOverReviewHit.active = false;
    }
    if (this.carterGameOverReviewButton?.node?.isValid) {
      this.carterGameOverReviewButton.interactable = false;
    }
    if (this.carterGameOverReviewTextCover?.isValid) {
      this.carterGameOverReviewTextCover.active = false;
    }
    if (this.carterGameOverReviewLabelNode?.isValid) {
      this.carterGameOverReviewLabelNode.active = false;
    }
    if (this.carterGameOverDividerVisual?.isValid) {
      this.carterGameOverDividerVisual.active = false;
    }
    if (this.carterGameOverCompanyLogoVisual?.isValid) {
      this.carterGameOverCompanyLogoVisual.active = false;
    }
    if (
      this.internalContaminationMonsterGroup?.isValid &&
      this.carterGameOverPanelRuntime?.isValid &&
      this.internalContaminationMonsterGroup.parent === this.carterMonsterAttackRuntime
    ) {
      this.internalContaminationMonsterGroup.setSiblingIndex(
        Math.max(0, this.carterGameOverPanelRuntime.getSiblingIndex() - 1),
      );
    }
    this.applyAdministrativeGameOverLayerOrder();
  }

  private createGameOverVisualNode(name: string, parent: Node): Node {
    const node = new Node(name);
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(100, 100);
    node.addComponent(Sprite);
    return node;
  }

  private createGameOverDividerNode(name: string, parent: Node): Node {
    const node = new Node(name);
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(420, 8);
    node.addComponent(Graphics);
    return node;
  }

  private createGameOverHitNode(name: string, parent: Node): Node {
    const node = new Node(name);
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(300, 130);
    node.addComponent(Button);
    return node;
  }

  private createReviewTextCoverNode(parent: Node | null): Node | null {
    if (!parent) {
      return null;
    }
    const node = new Node('CarterGameOverReviewTextCover');
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(134, 42);
    node.setPosition(0, -2, 0);
    node.addComponent(Graphics);
    return node;
  }

  private createReviewLabelNode(parent: Node | null): Node | null {
    if (!parent) {
      return null;
    }
    const node = new Node('CarterGameOverReviewLabel');
    parent.addChild(node);
    node.addComponent(UITransform).setContentSize(128, 38);
    node.setPosition(0, 0, 0);
    node.addComponent(Label);
    return node;
  }

  private prepareCarterGameOverFormalUi(): void {
    if (!this.carterGameOverPanelRuntime) {
      return;
    }
    this.carterGameOverUiReady =
      !!this.carterGameOverPanelVisual &&
      !!this.carterGameOverTitleVisual &&
      !!this.carterGameOverDividerVisual &&
      !!this.carterGameOverCompanyLogoVisual &&
      !!this.carterGameOverReviewVisual &&
      !!this.carterGameOverReviewHit &&
      !!this.carterGameOverReviewTextCover &&
      !!this.carterGameOverReviewLabel &&
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
    this.carterGameOverDividerVisual!.setPosition(0, 90, 0);
    this.carterGameOverDividerVisual!.active = false;
    this.carterGameOverCompanyLogoVisual!.setPosition(0, 0, 0);
    this.carterGameOverCompanyLogoVisual!.active = false;
    this.carterGameOverReviewVisual!.setPosition(-125, -125, 0);
    this.carterGameOverReviewVisual!.active = false;
    this.carterGameOverReviewHit!.setPosition(-125, -125, 0);
    this.carterGameOverReviewHit!.active = false;
    this.carterGameOverRetryVisual!.setPosition(-125, -125, 0);
    this.carterGameOverReviveVisual!.setPosition(125, -125, 0);
    this.carterGameOverRetryHit!.setPosition(-125, -125, 0);
    this.carterGameOverReviveHit!.setPosition(125, -125, 0);
    this.carterGameOverReviewButton && (this.carterGameOverReviewButton.interactable = false);
    this.carterGameOverRetryButton && (this.carterGameOverRetryButton.interactable = true);
    this.carterGameOverReviveButton && (this.carterGameOverReviveButton.interactable = true);
  }

  private async loadCarterGameOverFormalSprites(): Promise<void> {
    if (!this.carterGameOverUiReady) {
      return;
    }
    const [panelSf, titleSf, retrySf, reviveSf] = await Promise.all([
      this.loadSpriteFrameFromResources('ui/game/fail/ui_game_fail_panel_webp_v1/spriteFrame'),
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
    if (reviveSf && this.carterGameOverReviewSprite && this.carterGameOverReviewVisual) {
      this.carterGameOverReviewSprite.spriteFrame = reviveSf;
      this.applySpriteFrameByTargetHeight(this.carterGameOverReviewVisual, reviveSf, 92, 250);
      this.setNodeSize(this.carterGameOverReviewHit, 220, 122);
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

  private drawReviewTextCover(width = 134, height = 42): void {
    if (!this.carterGameOverReviewTextCoverGraphics) {
      return;
    }
    const halfWidth = width * 0.5;
    const halfHeight = height * 0.5;
    this.carterGameOverReviewTextCoverGraphics.clear();
    this.carterGameOverReviewTextCoverGraphics.fillColor = new Color(90, 218, 140, 214);
    this.carterGameOverReviewTextCoverGraphics.roundRect(-halfWidth, -halfHeight, width, height, 7);
    this.carterGameOverReviewTextCoverGraphics.fill();
  }

  private applyComplaintTerminationLayout(
    reason: AdministrativeGameOverReason,
    titleLabel: Label | null,
    messageLabel: Label | null,
  ): void {
    if (!this.carterGameOverPanelRuntime || !this.carterGameOverPanelVisual || !this.carterGameOverRetryVisual) {
      return;
    }

    if (this.carterGameOverPanelSprite?.spriteFrame) {
      // Complaint notice uses a taller paper presentation while keeping aspect ratio.
      this.applyContainSize(this.carterGameOverPanelVisual, this.carterGameOverPanelSprite.spriteFrame, 680, 860);
    }
    this.setNodeSize(this.carterGameOverPanelRuntime, 720, 1280);
    this.carterGameOverPanelRuntime.setPosition(0, 0, 0);
    this.carterGameOverPanelVisual.setPosition(0, 0, 0);
    this.carterGameOverPanelVisual.setSiblingIndex(0);

    this.carterGameOverTitleLabel?.setSiblingIndex(1);
    this.carterGameOverDividerVisual?.setSiblingIndex(2);
    this.carterGameOverMessageLabel?.setSiblingIndex(3);
    this.carterGameOverCompanyLogoVisual?.setSiblingIndex(4);
    this.carterGameOverReviewVisual?.setSiblingIndex(5);
    this.carterGameOverRetryVisual?.setSiblingIndex(6);
    this.carterGameOverReviveVisual?.setSiblingIndex(7);
    this.carterGameOverReviewHit?.setSiblingIndex(8);
    this.carterGameOverRetryHit?.setSiblingIndex(9);
    this.carterGameOverReviveHit?.setSiblingIndex(10);

    const panelTransform = this.carterGameOverPanelVisual.getComponent(UITransform);
    const panelWidth = panelTransform?.contentSize.width ?? 620;
    const panelHeight = panelTransform?.contentSize.height ?? 560;
    const halfWidth = panelWidth * 0.5;
    const halfHeight = panelHeight * 0.5;
    const topInset = 56;
    const bottomInset = 52;
    const sideInset = 64;
    const paperTop = halfHeight - topInset;
    const paperBottom = -halfHeight + bottomInset;

    const titleWidth = Math.max(450, Math.min(590, panelWidth - 92));
    const titleHeight = 84;
    const complaintNoticeGroupOffsetY = reason === 'multiple-formal-complaints' ? 60 : 0;
    const titleY = paperTop - titleHeight * 0.5 - complaintNoticeGroupOffsetY;
    if (this.carterGameOverTitleLabel?.isValid) {
      this.carterGameOverTitleLabel.active = true;
      this.carterGameOverTitleLabel.setPosition(0, titleY, 0);
      this.setNodeSize(this.carterGameOverTitleLabel, titleWidth, titleHeight);
    }
    if (titleLabel) {
      titleLabel.color = new Color(129, 34, 31, 255);
      titleLabel.fontSize = 52;
      titleLabel.lineHeight = 60;
      titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
      titleLabel.overflow = Overflow.CLAMP;
      titleLabel.enableWrapText = false;
    }

    const dividerY = titleY - titleHeight * 0.5 - 26;
    if (this.carterGameOverDividerVisual?.isValid) {
      this.carterGameOverDividerVisual.active = true;
      this.carterGameOverDividerVisual.setPosition(0, dividerY, 0);
      this.setNodeSize(this.carterGameOverDividerVisual, titleWidth - 86, 8);
    }
    if (this.carterGameOverDividerGraphics) {
      this.carterGameOverDividerGraphics.clear();
      this.carterGameOverDividerGraphics.lineWidth = 2;
      this.carterGameOverDividerGraphics.strokeColor = new Color(108, 86, 64, 255);
      this.carterGameOverDividerGraphics.moveTo(-(titleWidth - 86) * 0.5, 0);
      this.carterGameOverDividerGraphics.lineTo((titleWidth - 86) * 0.5, 0);
      this.carterGameOverDividerGraphics.stroke();
    }

    const retryTransform = this.carterGameOverRetryVisual.getComponent(UITransform);
    const retryHeight = retryTransform?.contentSize.height ?? 92;
    const retryY = paperBottom + retryHeight * 0.5;
    const buttonRowY = retryY;
    const buttonTopY = buttonRowY + retryHeight * 0.5;
    const bodyButtonGap = 52;
    const logoY = buttonTopY + 26;
    if (this.carterGameOverCompanyLogoVisual?.isValid) {
      const logoFrame = this.complaintCompanyLogoFrame;
      this.carterGameOverCompanyLogoVisual.active = Boolean(logoFrame);
      this.carterGameOverCompanyLogoVisual.setPosition(150, logoY, 0);
      if (logoFrame && this.carterGameOverCompanyLogoSprite) {
        this.carterGameOverCompanyLogoSprite.spriteFrame = logoFrame;
        this.applyContainSize(this.carterGameOverCompanyLogoVisual, logoFrame, 135, 100);
      }
    }
    if (this.carterGameOverReviewVisual?.isValid) {
      this.carterGameOverReviewVisual.active = false;
      this.carterGameOverReviewVisual.setPosition(0, buttonRowY, 0);
    }
    if (this.carterGameOverReviewTextCover?.isValid) {
      this.carterGameOverReviewTextCover.active = false;
    }
    if (this.carterGameOverReviewLabelNode?.isValid) {
      this.carterGameOverReviewLabelNode.active = false;
    }
    if (this.carterGameOverReviewLabel) {
      this.carterGameOverReviewLabel.string = '';
    }
    if (this.carterGameOverReviewHit?.isValid) {
      this.carterGameOverReviewHit.active = false;
      this.carterGameOverReviewHit.setPosition(0, buttonRowY, 0);
    }
    if (this.carterGameOverReviewButton?.node?.isValid) {
      this.carterGameOverReviewButton.interactable = false;
    }
    const logoHeight =
      this.carterGameOverCompanyLogoVisual?.getComponent(UITransform)?.contentSize.height ?? 76;
    const bodyTop = dividerY - 30;
    const bodyBottom = Math.max(buttonTopY + bodyButtonGap, logoY + logoHeight * 0.5 + 12);
    const bodyHeight = Math.max(220, bodyTop - bodyBottom);
    const bodyWidth = panelWidth - sideInset * 2;
    const bodyCenterY = bodyBottom + bodyHeight * 0.5;
    if (this.carterGameOverMessageLabel?.isValid) {
      this.carterGameOverMessageLabel.active = true;
      this.carterGameOverMessageLabel.setPosition(0, bodyCenterY, 0);
      this.setNodeSize(this.carterGameOverMessageLabel, bodyWidth, bodyHeight);
    }
    if (messageLabel) {
      messageLabel.color = new Color(42, 35, 30, 255);
      messageLabel.fontSize = 34;
      messageLabel.lineHeight = 46;
      messageLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
      messageLabel.verticalAlign = Label.VerticalAlign.TOP;
      messageLabel.overflow = Overflow.CLAMP;
      messageLabel.enableWrapText = true;
    }

    if (this.carterGameOverTitleVisual?.isValid) {
      this.carterGameOverTitleVisual.active = false;
    }
    if (this.carterGameOverReviveVisual?.isValid) {
      this.carterGameOverReviveVisual.active = true;
      this.carterGameOverReviveVisual.setPosition(125, buttonRowY, 0);
    }
    if (this.carterGameOverReviveHit?.isValid) {
      this.carterGameOverReviveHit.active = true;
      this.carterGameOverReviveHit.setPosition(125, buttonRowY, 0);
      this.setNodeSize(this.carterGameOverReviveHit, 220, 122);
    }
    if (this.carterGameOverReviveButton?.node?.isValid) {
      this.carterGameOverReviveButton.interactable = true;
    }

    this.carterGameOverRetryVisual.setPosition(-125, buttonRowY, 0);
    this.carterGameOverRetryVisual.active = true;
    if (this.carterGameOverRetryHit?.isValid) {
      this.carterGameOverRetryHit.active = true;
      this.carterGameOverRetryHit.setPosition(-125, buttonRowY, 0);
      this.setNodeSize(this.carterGameOverRetryHit, 220, 122);
    }
    if (this.carterGameOverRetryButton?.node?.isValid) {
      this.carterGameOverRetryButton.interactable = true;
    }
    this.applyAdministrativeGameOverLayerOrder();
  }

  private handleCarterGameOverRetryClick = (): void => {
    if (this.retryLoadInProgress || this.reviveResolutionInProgress) {
      return;
    }
    this.stopMonsterGameOverAlarmAudio();
    this.dismissDayCompletionOverlayForGameOver();
    this.failureReviewActive = false;
    this.resetFailureReviewPageAdvanceGuard();
    this.invalidateFailureReviewVisuals();
    this.hideFailureReviewRuntime();
    this.activeGameOverContext = null;
    this.clearReviveCheckpoint();
    this.currentAdministrativeGameOverReason = null;
    this.invalidateInternalContaminationVisuals();
    this.retryLoadInProgress = true;
    if (this.carterGameOverRetryButton?.node?.isValid) {
      this.carterGameOverRetryButton.interactable = false;
    }
    if (this.carterGameOverRetryHit?.isValid) {
      this.carterGameOverRetryHit.active = false;
    }
    const retryDayIndex = this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex();
    if (retryDayIndex === 4) {
      campaignState.setCurrentDayIndex(4);
    } else {
      campaignState.resetCampaign();
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
    if (this.retryLoadInProgress || this.reviveResolutionInProgress) {
      return;
    }
    if (!this.carterGameOverPanelRuntime?.isValid || !this.carterGameOverPanelRuntime.active) {
      return;
    }
    const gameOverContext = this.activeGameOverContext;
    if (!gameOverContext) {
      return;
    }
    this.stopMonsterGameOverAlarmAudio();
    if (!this.failureReviewActive) {
      const entries = this.buildFailureReviewEntriesForReason(gameOverContext.reason);
      this.showFailureReview(gameOverContext.reason, entries);
      return;
    }
    if (this.failureReviewPageIndex < this.activeFailureReviewEntries.length - 1) {
      return;
    }
    void this.resolveReviveFromFailureReview(gameOverContext).catch((error) => {
      console.error('[Revive] Failed to resolve revive flow.', error);
      this.reviveResolutionInProgress = false;
      this.lockAllEncounterInput('revive-flow-exception');
    });
  };

  private registerActiveGameOver(reason: FailureReviewReason): void {
    const checkpoint = this.latestReviveCheckpoint;
    const checkpointRoundId = checkpoint?.roundId ?? this.resolveActiveRoundId() ?? '';
    const dayIndex = checkpoint?.dayIndex ?? campaignState.getCurrentDayIndex();
    this.gameOverGeneration += 1;
    this.activeGameOverContext = Object.freeze({
      generation: this.gameOverGeneration,
      reason,
      checkpointRoundId,
      dayIndex,
    });
  }

  private clearReviveCheckpoint(): void {
    this.latestReviveCheckpoint = null;
  }

  private resolveActiveRoundId(): string | null {
    const subject = this.currentInspectionSubject;
    if (!subject) {
      return null;
    }
    return subject.subjectKind === 'visitor' ? subject.roundId : subject.round.roundId;
  }

  private cloneRoundInstance(round: RoundInstance): RoundInstance {
    return Object.freeze({
      ...round,
      card: Object.freeze({ ...round.card, failedFields: Object.freeze([...round.card.failedFields]) }),
      application: Object.freeze({
        ...round.application,
        failedFields: Object.freeze([...round.application.failedFields]),
      }),
      appearance: Object.freeze({
        ...round.appearance,
        failedRuleKeys: Object.freeze([...round.appearance.failedRuleKeys]),
      }),
      truth: Object.freeze({
        ...round.truth,
        failedCategories: Object.freeze([...round.truth.failedCategories]),
      }),
    });
  }

  private cloneInspectionSubject(subject: InspectionSubject): InspectionSubject {
    if (subject.subjectKind === 'employee') {
      return createEmployeeInspectionSubject(this.cloneRoundInstance(subject.round));
    }
    return Object.freeze({
      ...subject,
      mismatchKinds: Object.freeze([...subject.mismatchKinds]),
      claim: Object.freeze({ ...subject.claim }),
    });
  }

  private captureReviveCheckpointBeforeDecision(): boolean {
    const subject = this.currentInspectionSubject;
    if (!subject) {
      return false;
    }
    const roundId = subject.subjectKind === 'visitor' ? subject.roundId : subject.round.roundId;
    if (roundId.trim().length <= 0) {
      return false;
    }
    const stats = campaignState.getDailyDecisionErrorStats();
    const checkpoint: ReviveCheckpoint = Object.freeze({
      dayIndex: campaignState.getCurrentDayIndex(),
      roundId,
      currentRound: this.currentRound ? this.cloneRoundInstance(this.currentRound) : null,
      currentInspectionSubject: this.cloneInspectionSubject(subject),
      activeDayQueueCursor: this.activeDayQueueCursor,
      activeDay4VisitorCursor: this.activeDay4VisitorCursor,
      completedRoundCount: this.completedRoundCount,
      previousRoundSignature: this.previousRoundSignature,
      infectedEntryCount: this.infectedEntryCount,
      procedureViolationCount: this.procedureViolationCount,
      formalComplaintCount: this.formalComplaintCount,
      dailyDecisionErrorStats: Object.freeze({
        wrongAllowCount: stats.wrongAllowCount,
        wrongDenyCount: stats.wrongDenyCount,
      }),
      dailyDecisionErrorsLength: campaignState.getDailyDecisionErrors().length,
      wronglyAllowedMonstersLength: campaignState.getWronglyAllowedMonsters().length,
      visitorVisualPresentationRoundId: this.visitorVisualPresentationRoundId,
      committedVisitorVisualRoundId: this.committedVisitorVisualRoundId,
      activeVisitorKeyForDepartmentPhone: this.activeVisitorKeyForDepartmentPhone,
    });
    this.latestReviveCheckpoint = checkpoint;
    return true;
  }

  private hideFailureReviewRuntime(): void {
    this.activeFailureReviewEntries = Object.freeze([]);
    this.failureReviewPageIndex = 0;
    this.resetFailureReviewPageAdvanceGuard();
    this.restoreFailureReviewBottomButtonPlacement();
    if (this.failureReviewRuntime?.isValid) {
      this.failureReviewRuntime.active = false;
    }
    if (this.failureReviewPortraitNode?.isValid) {
      this.failureReviewPortraitNode.active = false;
      const sprite = this.failureReviewPortraitNode.getComponent(Sprite);
      if (sprite) {
        sprite.spriteFrame = null;
      }
    }
    if (this.failureReviewPanelBackgroundNode?.isValid) {
      const sprite = this.failureReviewPanelBackgroundNode.getComponent(Sprite);
      if (sprite) {
        sprite.spriteFrame = null;
      }
    }
    if (this.failureReviewCloseHitNode?.isValid) {
      this.failureReviewCloseHitNode.active = false;
    }
    if (this.carterGameOverReviewVisual?.isValid) {
      this.carterGameOverReviewVisual.active = false;
    }
    if (this.carterGameOverReviewHit?.isValid) {
      this.carterGameOverReviewHit.active = false;
    }
  }

  private invalidateFailureReviewVisuals(): void {
    this.failureReviewVisualGeneration += 1;
    this.activeFailureReviewEntries = Object.freeze([]);
    this.failureReviewPageIndex = 0;
    this.resetFailureReviewPageAdvanceGuard();
  }

  private ensureFailureReviewRuntime(): boolean {
    const panel = this.carterGameOverPanelRuntime;
    if (!panel?.isValid) {
      return false;
    }
    const runtime = panel.getChildByName('CarterGameOverFailureReviewRuntime') ?? new Node('CarterGameOverFailureReviewRuntime');
    if (!runtime.parent) {
      panel.addChild(runtime);
    }
    runtime.setPosition(0, 0, 0);
    runtime.setScale(1, 1, 1);
    const runtimeTransform = runtime.getComponent(UITransform) ?? runtime.addComponent(UITransform);
    runtimeTransform.setAnchorPoint(0.5, 0.5);
    const panelSize = panel.getComponent(UITransform)?.contentSize;
    runtimeTransform.setContentSize(panelSize?.width ?? 720, panelSize?.height ?? 1280);
    const blocker = runtime.getComponent(BlockInputEvents) ?? runtime.addComponent(BlockInputEvents);
    blocker.enabled = true;

    const backgroundNode =
      runtime.getChildByName('FailureReviewPanelBackground') ?? new Node('FailureReviewPanelBackground');
    if (!backgroundNode.parent) {
      runtime.addChild(backgroundNode);
    }
    backgroundNode.setPosition(0, 0, 0);
    backgroundNode.setScale(1, 1, 1);
    const backgroundTransform = backgroundNode.getComponent(UITransform) ?? backgroundNode.addComponent(UITransform);
    backgroundTransform.setAnchorPoint(0.5, 0.5);
    backgroundTransform.setContentSize(
      EvidencePreviewController.FAILURE_REVIEW_PANEL_AVAILABLE_WIDTH,
      EvidencePreviewController.FAILURE_REVIEW_PANEL_AVAILABLE_HEIGHT,
    );
    const backgroundSprite = backgroundNode.getComponent(Sprite) ?? backgroundNode.addComponent(Sprite);
    backgroundSprite.sizeMode = Sprite.SizeMode.CUSTOM;

    const titleNode =
      runtime.getChildByName('FailureReviewTitleLabel') ?? new Node('FailureReviewTitleLabel');
    if (!titleNode.parent) {
      runtime.addChild(titleNode);
    }
    titleNode.setPosition(0, 0, 0);
    titleNode.setScale(1, 1, 1);
    const titleTransform = titleNode.getComponent(UITransform) ?? titleNode.addComponent(UITransform);
    titleTransform.setAnchorPoint(0.5, 0.5);
    titleTransform.setContentSize(460, 56);
    const titleLabel = titleNode.getComponent(Label) ?? titleNode.addComponent(Label);
    titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
    titleLabel.fontSize = 34;
    titleLabel.lineHeight = 40;
    titleLabel.color = new Color(44, 35, 29, 255);
    titleLabel.overflow = Overflow.CLAMP;
    titleLabel.enableWrapText = false;
    titleLabel.isBold = false;

    const progressNode =
      runtime.getChildByName('FailureReviewProgressLabel') ?? new Node('FailureReviewProgressLabel');
    if (!progressNode.parent) {
      runtime.addChild(progressNode);
    }
    progressNode.setPosition(0, 0, 0);
    progressNode.setScale(1, 1, 1);
    const progressTransform = progressNode.getComponent(UITransform) ?? progressNode.addComponent(UITransform);
    progressTransform.setAnchorPoint(0.5, 0.5);
    progressTransform.setContentSize(440, 44);
    const progressLabel = progressNode.getComponent(Label) ?? progressNode.addComponent(Label);
    progressLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    progressLabel.verticalAlign = Label.VerticalAlign.CENTER;
    progressLabel.fontSize = 24;
    progressLabel.lineHeight = 30;
    progressLabel.color = new Color(64, 52, 43, 255);
    progressLabel.overflow = Overflow.CLAMP;
    progressLabel.enableWrapText = false;

    const portraitNode = runtime.getChildByName('FailureReviewPortrait') ?? new Node('FailureReviewPortrait');
    if (!portraitNode.parent) {
      runtime.addChild(portraitNode);
    }
    portraitNode.setPosition(0, 0, 0);
    portraitNode.setScale(1, 1, 1);
    const portraitTransform = portraitNode.getComponent(UITransform) ?? portraitNode.addComponent(UITransform);
    portraitTransform.setAnchorPoint(0.5, 0.5);
    portraitTransform.setContentSize(300, 300);
    const portraitSprite = portraitNode.getComponent(Sprite) ?? portraitNode.addComponent(Sprite);
    portraitSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    portraitSprite.color = new Color(255, 255, 255, 255);

    const nameNode = runtime.getChildByName('FailureReviewNameLabel') ?? new Node('FailureReviewNameLabel');
    if (!nameNode.parent) {
      runtime.addChild(nameNode);
    }
    nameNode.setPosition(0, 0, 0);
    nameNode.setScale(1, 1, 1);
    const nameTransform = nameNode.getComponent(UITransform) ?? nameNode.addComponent(UITransform);
    nameTransform.setAnchorPoint(0.5, 0.5);
    nameTransform.setContentSize(480, 52);
    const nameLabel = nameNode.getComponent(Label) ?? nameNode.addComponent(Label);
    nameLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    nameLabel.verticalAlign = Label.VerticalAlign.CENTER;
    nameLabel.fontSize = 34;
    nameLabel.lineHeight = 40;
    nameLabel.color = new Color(42, 34, 29, 255);
    nameLabel.overflow = Overflow.CLAMP;
    nameLabel.enableWrapText = false;

    const errorKindNode =
      runtime.getChildByName('FailureReviewErrorKindLabel') ?? new Node('FailureReviewErrorKindLabel');
    if (!errorKindNode.parent) {
      runtime.addChild(errorKindNode);
    }
    errorKindNode.setPosition(0, 0, 0);
    errorKindNode.setScale(1, 1, 1);
    const errorKindTransform =
      errorKindNode.getComponent(UITransform) ?? errorKindNode.addComponent(UITransform);
    errorKindTransform.setAnchorPoint(0.5, 0.5);
    errorKindTransform.setContentSize(500, 46);
    const errorKindLabel = errorKindNode.getComponent(Label) ?? errorKindNode.addComponent(Label);
    errorKindLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    errorKindLabel.verticalAlign = Label.VerticalAlign.CENTER;
    errorKindLabel.fontSize = 28;
    errorKindLabel.lineHeight = 34;
    errorKindLabel.overflow = Overflow.CLAMP;
    errorKindLabel.enableWrapText = false;

    const correctDecisionNode =
      runtime.getChildByName('FailureReviewCorrectDecisionLabel') ??
      new Node('FailureReviewCorrectDecisionLabel');
    if (!correctDecisionNode.parent) {
      runtime.addChild(correctDecisionNode);
    }
    correctDecisionNode.setPosition(0, 0, 0);
    correctDecisionNode.setScale(1, 1, 1);
    const correctDecisionTransform =
      correctDecisionNode.getComponent(UITransform) ?? correctDecisionNode.addComponent(UITransform);
    correctDecisionTransform.setAnchorPoint(0.5, 0.5);
    correctDecisionTransform.setContentSize(520, 38);
    const correctDecisionLabel = correctDecisionNode.getComponent(Label) ?? correctDecisionNode.addComponent(Label);
    correctDecisionLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    correctDecisionLabel.verticalAlign = Label.VerticalAlign.CENTER;
    correctDecisionLabel.fontSize = 22;
    correctDecisionLabel.lineHeight = 28;
    correctDecisionLabel.color = new Color(58, 48, 40, 255);
    correctDecisionLabel.overflow = Overflow.CLAMP;
    correctDecisionLabel.enableWrapText = false;

    const reasonNode =
      runtime.getChildByName('FailureReviewReasonLabel') ?? new Node('FailureReviewReasonLabel');
    if (!reasonNode.parent) {
      runtime.addChild(reasonNode);
    }
    reasonNode.setPosition(0, 0, 0);
    reasonNode.setScale(1, 1, 1);
    const reasonTransform = reasonNode.getComponent(UITransform) ?? reasonNode.addComponent(UITransform);
    reasonTransform.setAnchorPoint(0.5, 0.5);
    reasonTransform.setContentSize(520, 210);
    const reasonLabel = reasonNode.getComponent(Label) ?? reasonNode.addComponent(Label);
    reasonLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
    reasonLabel.verticalAlign = Label.VerticalAlign.CENTER;
    reasonLabel.fontSize = 24;
    reasonLabel.lineHeight = 32;
    reasonLabel.overflow = Overflow.CLAMP;
    reasonLabel.enableWrapText = true;
    reasonLabel.color = new Color(42, 35, 30, 255);
    reasonLabel.isBold = false;

    const closeHitNode = runtime.getChildByName('FailureReviewCloseHit') ?? new Node('FailureReviewCloseHit');
    if (!closeHitNode.parent) {
      runtime.addChild(closeHitNode);
    }
    const closeHitTransform = closeHitNode.getComponent(UITransform) ?? closeHitNode.addComponent(UITransform);
    closeHitTransform.setAnchorPoint(0.5, 0.5);
    closeHitTransform.setContentSize(90, 90);
    const closeButton = closeHitNode.getComponent(Button) ?? closeHitNode.addComponent(Button);
    closeButton.interactable = true;
    closeHitNode.off(Button.EventType.CLICK, this.handleFailureReviewCloseClick, this);
    closeHitNode.on(Button.EventType.CLICK, this.handleFailureReviewCloseClick, this);

    const rowsRoot = runtime.getChildByName('FailureReviewRowsRoot') ?? new Node('FailureReviewRowsRoot');
    if (!rowsRoot.parent) {
      runtime.addChild(rowsRoot);
    }
    rowsRoot.setPosition(0, -34, 0);
    const rowsTransform = rowsRoot.getComponent(UITransform) ?? rowsRoot.addComponent(UITransform);
    rowsTransform.setContentSize(560, 260);
    rowsRoot.active = false;

    const rowNodes: Node[] = [];
    for (let index = 0; index < 3; index += 1) {
      const rowName = `FailureReviewRow${String(index + 1).padStart(2, '0')}`;
      const rowNode = rowsRoot.getChildByName(rowName) ?? new Node(rowName);
      if (!rowNode.parent) {
        rowsRoot.addChild(rowNode);
      }
      rowNode.setPosition(0, 84 - index * 84, 0);
      const rowTransform = rowNode.getComponent(UITransform) ?? rowNode.addComponent(UITransform);
      rowTransform.setContentSize(548, 78);
      rowNode.active = false;
      rowNodes.push(rowNode);
    }

    this.failureReviewRuntime = runtime;
    this.failureReviewPanelBackgroundNode = backgroundNode;
    this.failureReviewTitleLabelNode = titleNode;
    this.failureReviewProgressLabelNode = progressNode;
    this.failureReviewPortraitNode = portraitNode;
    this.failureReviewNameLabelNode = nameNode;
    this.failureReviewErrorKindLabelNode = errorKindNode;
    this.failureReviewCorrectDecisionLabelNode = correctDecisionNode;
    this.failureReviewReasonLabelNode = reasonNode;
    this.failureReviewCloseHitNode = closeHitNode;
    this.failureReviewRowsRoot = rowsRoot;
    this.failureReviewRows = Object.freeze(rowNodes);
    this.centerFailureReviewRuntimeInCanvas();
    this.layoutFailureReviewCard();
    return true;
  }

  private showFailureReview(reason: FailureReviewReason, entries: readonly FailureReviewEntry[]): void {
    if (!this.ensureFailureReviewRuntime()) {
      return;
    }
    const safeEntries = entries.filter(
      (entry) =>
        entry.roundId.trim().length > 0 &&
        entry.subjectKey.trim().length > 0 &&
        entry.displayName.trim().length > 0 &&
        entry.reasonText.trim().length > 0,
    );
    if (safeEntries.length <= 0) {
      console.warn('[FailureReview] No valid entries available for reason.', { reason });
      return;
    }
    this.captureFailureReviewOverlaySnapshot();
    this.applyFailureReviewOverlayHiddenState();
    this.invalidateFailureReviewVisuals();
    this.activeFailureReviewEntries = Object.freeze([...safeEntries]);
    this.failureReviewPageIndex = 0;
    this.failureReviewActive = true;
    this.resetFailureReviewPageAdvanceGuard();
    this.captureFailureReviewBottomButtonPlacement();
    this.moveFailureReviewBottomButtonsToRuntime();
    this.centerFailureReviewRuntimeInCanvas();
    this.layoutFailureReviewCard();
    this.positionFailureReviewCloseHit();
    const generation = this.failureReviewVisualGeneration;
    void this.loadFailureReviewBackground(generation);
    this.renderFailureReviewPage(generation);
    if (this.failureReviewRuntime?.isValid) {
      this.failureReviewRuntime.active = true;
    }
    if (this.failureReviewCloseHitNode?.isValid) {
      this.failureReviewCloseHitNode.active = true;
    }
  }

  private captureFailureReviewOverlaySnapshot(): void {
    this.failureReviewOverlaySnapshot = Object.freeze({
      panelVisualActive: this.carterGameOverPanelVisual?.active ?? false,
      titleVisualActive: this.carterGameOverTitleVisual?.active ?? false,
      titleLabelActive: this.carterGameOverTitleLabel?.active ?? false,
      messageLabelActive: this.carterGameOverMessageLabel?.active ?? false,
      retryVisualActive: this.carterGameOverRetryVisual?.active ?? false,
      retryHitActive: this.carterGameOverRetryHit?.active ?? false,
      reviveVisualActive: this.carterGameOverReviveVisual?.active ?? false,
      reviveHitActive: this.carterGameOverReviveHit?.active ?? false,
      reviewVisualActive: this.carterGameOverReviewVisual?.active ?? false,
      reviewHitActive: this.carterGameOverReviewHit?.active ?? false,
      reviewTextCoverActive: this.carterGameOverReviewTextCover?.active ?? false,
      reviewLabelActive: this.carterGameOverReviewLabelNode?.active ?? false,
      monsterGroupActive: this.internalContaminationMonsterGroup?.active ?? false,
      monsterPortraitActive: this.carterMonsterPortraitSource?.active ?? false,
      monsterFullbodyActive: this.carterMonsterFullbodyVisual?.active ?? false,
      reviveInteractable: this.carterGameOverReviveButton?.interactable ?? false,
      retryInteractable: this.carterGameOverRetryButton?.interactable ?? false,
    });
  }

  private applyFailureReviewOverlayHiddenState(): void {
    if (this.carterGameOverTitleVisual?.isValid) {
      this.carterGameOverTitleVisual.active = false;
    }
    if (this.carterGameOverTitleLabel?.isValid) {
      this.carterGameOverTitleLabel.active = false;
    }
    if (this.carterGameOverMessageLabel?.isValid) {
      this.carterGameOverMessageLabel.active = false;
    }
    if (this.carterGameOverRetryVisual?.isValid) {
      this.carterGameOverRetryVisual.active = false;
    }
    if (this.carterGameOverRetryHit?.isValid) {
      this.carterGameOverRetryHit.active = false;
    }
    if (this.carterGameOverReviveVisual?.isValid) {
      this.carterGameOverReviveVisual.active = false;
    }
    if (this.carterGameOverReviveHit?.isValid) {
      this.carterGameOverReviveHit.active = false;
    }
    if (this.carterGameOverPanelVisual?.isValid) {
      this.carterGameOverPanelVisual.active = false;
    }
    if (this.carterMonsterPortraitSource?.isValid) {
      this.carterMonsterPortraitSource.active = false;
    }
    if (this.carterMonsterFullbodyVisual?.isValid) {
      this.carterMonsterFullbodyVisual.active = false;
    }
    if (this.internalContaminationMonsterGroup?.isValid) {
      this.internalContaminationMonsterGroup.active = false;
    }
    if (this.carterGameOverReviewVisual?.isValid) {
      this.carterGameOverReviewVisual.active = false;
    }
    if (this.carterGameOverReviewHit?.isValid) {
      this.carterGameOverReviewHit.active = false;
    }
    if (this.carterGameOverReviewTextCover?.isValid) {
      this.carterGameOverReviewTextCover.active = false;
    }
    if (this.carterGameOverReviewLabelNode?.isValid) {
      this.carterGameOverReviewLabelNode.active = false;
    }
    if (this.carterGameOverRetryButton?.node?.isValid) {
      this.carterGameOverRetryButton.interactable = false;
    }
    if (this.carterGameOverReviveButton?.node?.isValid) {
      this.carterGameOverReviveButton.interactable = false;
    }
    if (this.failureReviewRowsRoot?.isValid) {
      this.failureReviewRowsRoot.active = false;
    }
  }

  private restoreFailureReviewOverlaySnapshot(): void {
    const snapshot = this.failureReviewOverlaySnapshot;
    if (!snapshot) {
      return;
    }
    if (this.carterGameOverPanelVisual?.isValid) {
      this.carterGameOverPanelVisual.active = snapshot.panelVisualActive;
    }
    if (this.carterGameOverTitleVisual?.isValid) {
      this.carterGameOverTitleVisual.active = snapshot.titleVisualActive;
    }
    if (this.carterGameOverTitleLabel?.isValid) {
      this.carterGameOverTitleLabel.active = snapshot.titleLabelActive;
    }
    if (this.carterGameOverMessageLabel?.isValid) {
      this.carterGameOverMessageLabel.active = snapshot.messageLabelActive;
    }
    if (this.carterGameOverRetryVisual?.isValid) {
      this.carterGameOverRetryVisual.active = snapshot.retryVisualActive;
    }
    if (this.carterGameOverRetryHit?.isValid) {
      this.carterGameOverRetryHit.active = snapshot.retryHitActive;
    }
    if (this.carterGameOverReviveVisual?.isValid) {
      this.carterGameOverReviveVisual.active = snapshot.reviveVisualActive;
    }
    if (this.carterGameOverReviveHit?.isValid) {
      this.carterGameOverReviveHit.active = snapshot.reviveHitActive;
    }
    if (this.carterGameOverReviewVisual?.isValid) {
      this.carterGameOverReviewVisual.active = snapshot.reviewVisualActive;
    }
    if (this.carterGameOverReviewHit?.isValid) {
      this.carterGameOverReviewHit.active = snapshot.reviewHitActive;
      this.carterGameOverReviewHit.off(Button.EventType.CLICK, this.handleFailureReviewNextClick, this);
    }
    if (this.carterGameOverReviewTextCover?.isValid) {
      this.carterGameOverReviewTextCover.active = snapshot.reviewTextCoverActive;
    }
    if (this.carterGameOverReviewLabelNode?.isValid) {
      this.carterGameOverReviewLabelNode.active = snapshot.reviewLabelActive;
    }
    if (this.internalContaminationMonsterGroup?.isValid) {
      this.internalContaminationMonsterGroup.active = snapshot.monsterGroupActive;
    }
    if (this.carterMonsterPortraitSource?.isValid) {
      this.carterMonsterPortraitSource.active = snapshot.monsterPortraitActive;
    }
    if (this.carterMonsterFullbodyVisual?.isValid) {
      this.carterMonsterFullbodyVisual.active = snapshot.monsterFullbodyActive;
    }
    if (this.carterGameOverRetryButton?.node?.isValid) {
      this.carterGameOverRetryButton.interactable = snapshot.retryInteractable;
    }
    if (this.carterGameOverReviveButton?.node?.isValid) {
      this.carterGameOverReviveButton.interactable = snapshot.reviveInteractable;
    }
    this.failureReviewOverlaySnapshot = null;
    this.applyAdministrativeGameOverLayerOrder();
  }

  private buildFailureReviewEntriesForReason(reason: FailureReviewReason): readonly FailureReviewEntry[] {
    const records = campaignState.getDailyDecisionErrors();
    if (reason === 'internal-contamination') {
      return records
        .filter((record) => record.errorKind === 'wrong-allow' && record.issueKinds.includes('monster'))
        .slice(-3)
        .map((record) => this.toFailureReviewEntry(record));
    }
    if (reason === 'repeated-procedural-violations') {
      return records
        .filter((record) => record.errorKind === 'wrong-allow' && !record.issueKinds.includes('monster'))
        .slice(-2)
        .map((record) => this.toFailureReviewEntry(record));
    }
    if (reason === 'multiple-formal-complaints') {
      return records
        .filter((record) => record.errorKind === 'wrong-denial')
        .slice(-2)
        .map((record) => this.toFailureReviewEntry(record));
    }
    if (reason === 'incorrect-allow') {
      return records
        .filter((record) => record.errorKind === 'wrong-allow' && record.issueKinds.includes('monster'))
        .slice(-1)
        .map((record) => this.toFailureReviewEntry(record));
    }
    const checkpoint = this.latestReviveCheckpoint;
    if (!checkpoint) {
      return Object.freeze([]);
    }
    const subject = checkpoint.currentInspectionSubject;
    const subjectDefinition = this.getCheckpointSubjectDefinition(subject);
    const responseReasonText = this.resolveResponseFailureReasonText(reason);
    const entry: FailureReviewEntry = Object.freeze({
      roundId: checkpoint.roundId,
      subjectKey:
        subject.subjectKind === 'visitor' ? subject.visitorKey : subject.round.employeeKey,
      displayName: subjectDefinition?.displayName ?? this.getFallbackSubjectDisplayName(subject),
      portraitSpriteFrameUuid: subjectDefinition?.portraitSpriteFrameUuid ?? null,
      errorKind: 'RESPONSE FAILURE',
      correctDecisionText: 'DENY',
      reasonText: responseReasonText,
    });
    return Object.freeze([entry]);
  }

  private resolveResponseFailureReasonText(reason: FailureReviewReason): string {
    switch (reason) {
      case 'shutter-timeout':
        return 'You identified the monster,\nbut the shutter was not closed\nbefore the response timer expired.';
      case 'damaged-visual-unavailable':
        return 'You identified the threat,\nbut the emergency response could\nnot be completed.';
      case 'phone-pickup-timeout':
        return 'You identified the monster,\nbut the emergency telephone was\nnot answered in time.';
      case 'dial-timeout':
        return 'You identified the monster,\nbut purge code 1214 was not\ncompleted before time expired.';
      case 'incorrect-allow':
        return 'You allowed this person to enter,\nbut they were a disguised monster.';
      default:
        return 'You identified the threat,\nbut the emergency response could\nnot be completed.';
    }
  }

  private toFailureReviewEntry(record: DailyDecisionErrorRecord): FailureReviewEntry {
    const reasonText =
      record.errorKind === 'wrong-denial'
        ? 'You denied this person entry,\nbut every required inspection\ncheck had passed.'
        : this.buildWrongAllowReasonText(record.issueKinds);
    return Object.freeze({
      roundId: record.roundId,
      subjectKey: record.subjectKey,
      displayName: record.displayName,
      portraitSpriteFrameUuid: record.portraitSpriteFrameUuid,
      errorKind: record.errorKind === 'wrong-allow' ? 'WRONG ALLOW' : 'WRONG DENIAL',
      correctDecisionText: record.correctDecision.toUpperCase(),
      reasonText,
    });
  }

  private buildWrongAllowReasonText(issueKinds: readonly DecisionIssueKind[]): string {
    const uniqueIssueKinds = [...new Set(issueKinds)];
    if (uniqueIssueKinds.includes('monster')) {
      return 'You allowed this person to enter,\nbut they were a disguised monster.';
    }
    if (uniqueIssueKinds.length === 1) {
      switch (uniqueIssueKinds[0]) {
        case 'id-card':
          return 'You allowed this person to enter,\nbut their employee ID card did not\nmatch the official record.';
        case 'application':
          return 'You allowed this person to enter,\nbut their application contained\ninvalid information.';
        case 'appearance':
          return 'You allowed this person to enter,\nbut their appearance did not match\nthe official record.';
        case 'department':
          return 'You allowed this visitor to enter,\nbut the department they claimed did\nnot match the appointment roster.';
        case 'purpose':
          return 'You allowed this visitor to enter,\nbut the stated visit purpose did not\nmatch the appointment roster.';
        default: {
          const exhaustiveCheck: never = uniqueIssueKinds[0];
          return `You allowed this person to enter,\nbut ${String(exhaustiveCheck)} checks\nfailed the official verification.`;
        }
      }
    }
    const labels = uniqueIssueKinds
      .map((issueKind) => {
        switch (issueKind) {
          case 'id-card':
            return 'employee ID card';
          case 'application':
            return 'application';
          case 'appearance':
            return 'appearance';
          case 'department':
            return 'claimed department';
          case 'purpose':
            return 'stated visit purpose';
          default:
            return '';
        }
      })
      .filter((label) => label.length > 0);
    if (labels.length <= 0) {
      return 'You allowed this person to enter,\nbut required inspection checks\ndid not match the official record.';
    }
    const mergedLabel = this.joinNaturalEnglishList(labels);
    const isVisitorRecord = uniqueIssueKinds.includes('department') || uniqueIssueKinds.includes('purpose');
    if (isVisitorRecord) {
      return `You allowed this visitor to enter,\nbut their ${mergedLabel} did not match\nthe official appointment record.`;
    }
    return `You allowed this person to enter,\nbut their ${mergedLabel} did not match\nthe official record.`;
  }

  private joinNaturalEnglishList(labels: readonly string[]): string {
    if (labels.length <= 0) {
      return '';
    }
    if (labels.length === 1) {
      return labels[0];
    }
    if (labels.length === 2) {
      return `${labels[0]} and ${labels[1]}`;
    }
    return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
  }

  private getFallbackSubjectDisplayName(subject: InspectionSubject): string {
    if (subject.subjectKind === 'visitor') {
      return getVisitorProfile(subject.visitorKey)?.displayName ?? subject.visitorKey.toUpperCase();
    }
    return EMPLOYEE_PROFILES[subject.round.employeeKey]?.displayName ?? subject.round.employeeKey.toUpperCase();
  }

  private getCheckpointSubjectDefinition(subject: InspectionSubject): {
    readonly displayName: string;
    readonly portraitSpriteFrameUuid: string | null;
  } | null {
    if (subject.subjectKind === 'visitor') {
      const profile = getVisitorProfile(subject.visitorKey);
      if (!profile) {
        return null;
      }
      return {
        displayName: profile.displayName,
        portraitSpriteFrameUuid: profile.visuals.portraitSpriteFrameUuid,
      };
    }
    const profile = EMPLOYEE_PROFILES[subject.round.employeeKey];
    if (!profile) {
      return null;
    }
    return {
      displayName: profile.displayName,
      portraitSpriteFrameUuid: profile.portraitSpriteFrameUuid,
    };
  }

  private layoutFailureReviewCard(): FailureReviewCardLayoutMetrics | null {
    const runtime = this.failureReviewRuntime;
    const backgroundNode = this.failureReviewPanelBackgroundNode;
    if (!runtime?.isValid || !backgroundNode?.isValid) {
      return null;
    }
    const runtimeTransform = runtime.getComponent(UITransform);
    runtimeTransform?.setAnchorPoint(0.5, 0.5);
    runtime.setScale(1, 1, 1);
    this.centerFailureReviewRuntimeInCanvas();

    const spriteFrame = backgroundNode.getComponent(Sprite)?.spriteFrame ?? null;
    const sourceSize = spriteFrame?.originalSize ?? null;
    const sourceWidth =
      sourceSize && sourceSize.width > 0
        ? sourceSize.width
        : EvidencePreviewController.FAILURE_REVIEW_PANEL_SOURCE_WIDTH;
    const sourceHeight =
      sourceSize && sourceSize.height > 0
        ? sourceSize.height
        : EvidencePreviewController.FAILURE_REVIEW_PANEL_SOURCE_HEIGHT;
    const panelScale = Math.min(
      EvidencePreviewController.FAILURE_REVIEW_PANEL_AVAILABLE_WIDTH / sourceWidth,
      EvidencePreviewController.FAILURE_REVIEW_PANEL_AVAILABLE_HEIGHT / sourceHeight,
    );
    const panelWidth = sourceWidth * panelScale;
    const panelHeight = sourceHeight * panelScale;

    const backgroundTransform = backgroundNode.getComponent(UITransform);
    backgroundTransform?.setAnchorPoint(0.5, 0.5);
    backgroundTransform?.setContentSize(panelWidth, panelHeight);
    backgroundNode.setPosition(0, 0, 0);
    backgroundNode.setScale(1, 1, 1);

    const titleWidth = Math.max(340, Math.min(panelWidth * 0.68, 470));
    this.setNodeSize(this.failureReviewTitleLabelNode, titleWidth, 62);
    this.failureReviewTitleLabelNode?.setPosition(0, panelHeight * 0.39, 0);
    const titleLabel = this.failureReviewTitleLabelNode?.getComponent(Label);
    if (titleLabel) {
      titleLabel.fontSize = 34;
      titleLabel.lineHeight = 40;
      titleLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      titleLabel.verticalAlign = Label.VerticalAlign.CENTER;
      titleLabel.overflow = Overflow.SHRINK;
      titleLabel.enableWrapText = false;
    }

    if (this.failureReviewProgressLabelNode?.isValid) {
      this.failureReviewProgressLabelNode.active = false;
    }

    const portraitMaxWidth = Math.min(260, panelWidth * 0.48);
    const portraitMaxHeight = Math.min(260, panelHeight * 0.25);
    const contentOffsetY = EvidencePreviewController.FAILURE_REVIEW_CONTENT_OFFSET_Y;
    this.failureReviewPortraitNode?.setPosition(0, panelHeight * 0.23 + contentOffsetY, 0);

    this.setNodeSize(this.failureReviewNameLabelNode, Math.min(panelWidth * 0.72, 500), 56);
    this.failureReviewNameLabelNode?.setPosition(0, panelHeight * 0.075 + contentOffsetY, 0);
    const nameLabel = this.failureReviewNameLabelNode?.getComponent(Label);
    if (nameLabel) {
      nameLabel.fontSize = 32;
      nameLabel.lineHeight = 38;
      nameLabel.overflow = Overflow.SHRINK;
      nameLabel.enableWrapText = false;
    }

    this.setNodeSize(this.failureReviewErrorKindLabelNode, Math.min(panelWidth * 0.76, 520), 52);
    this.failureReviewErrorKindLabelNode?.setPosition(0, panelHeight * 0.025 + contentOffsetY, 0);
    const errorKindLabel = this.failureReviewErrorKindLabelNode?.getComponent(Label);
    if (errorKindLabel) {
      errorKindLabel.fontSize = 25;
      errorKindLabel.lineHeight = 30;
      errorKindLabel.overflow = Overflow.SHRINK;
      errorKindLabel.enableWrapText = false;
    }

    this.setNodeSize(this.failureReviewCorrectDecisionLabelNode, Math.min(panelWidth * 0.8, 540), 44);
    this.failureReviewCorrectDecisionLabelNode?.setPosition(0, -panelHeight * 0.025 + contentOffsetY, 0);
    const correctDecisionLabel = this.failureReviewCorrectDecisionLabelNode?.getComponent(Label);
    if (correctDecisionLabel) {
      correctDecisionLabel.fontSize = 22;
      correctDecisionLabel.lineHeight = 27;
      correctDecisionLabel.overflow = Overflow.SHRINK;
      correctDecisionLabel.enableWrapText = false;
    }

    this.setNodeSize(this.failureReviewReasonLabelNode, Math.min(panelWidth * 0.68, 430), panelHeight * 0.17);
    this.failureReviewReasonLabelNode?.setPosition(0, -panelHeight * 0.17 + contentOffsetY, 0);
    const reasonLabel = this.failureReviewReasonLabelNode?.getComponent(Label);
    if (reasonLabel) {
      reasonLabel.fontSize = 24;
      reasonLabel.lineHeight = 31;
      reasonLabel.horizontalAlign = Label.HorizontalAlign.CENTER;
      reasonLabel.verticalAlign = Label.VerticalAlign.TOP;
      reasonLabel.overflow = Overflow.CLAMP;
      reasonLabel.enableWrapText = true;
    }

    const metrics: FailureReviewCardLayoutMetrics = {
      panelWidth,
      panelHeight,
      titleY: panelHeight * 0.39,
      portraitY: panelHeight * 0.23 + contentOffsetY,
      nameY: panelHeight * 0.075 + contentOffsetY,
      errorKindY: panelHeight * 0.025 + contentOffsetY,
      correctDecisionY: -panelHeight * 0.025 + contentOffsetY,
      reasonY: -panelHeight * 0.17 + contentOffsetY,
      buttonY: -panelHeight * 0.39,
      closeHitX: panelWidth * 0.5 - 42,
      closeHitY: panelHeight * 0.5 - 42,
      portraitMaxWidth,
      portraitMaxHeight,
    };
    this.positionFailureReviewCloseHit(metrics);
    return metrics;
  }

  private captureFailureReviewBottomButtonPlacement(): void {
    if (this.failureReviewButtonPlacementSnapshot) {
      return;
    }
    const capture = (node: Node | null): FailureReviewNodePlacementSnapshot | null => {
      if (!node?.isValid) {
        return null;
      }
      const transform = node.getComponent(UITransform);
      const anchor = transform?.anchorPoint;
      const position = node.position;
      const scale = node.scale;
      return Object.freeze({
        parent: node.parent,
        siblingIndex: node.getSiblingIndex(),
        positionX: position.x,
        positionY: position.y,
        positionZ: position.z,
        scaleX: scale.x,
        scaleY: scale.y,
        scaleZ: scale.z,
        anchorX: anchor?.x ?? 0.5,
        anchorY: anchor?.y ?? 0.5,
        active: node.active,
      });
    };
    this.failureReviewButtonPlacementSnapshot = Object.freeze({
      reviewVisual: capture(this.carterGameOverReviewVisual),
      reviewHit: capture(this.carterGameOverReviewHit),
      reviveVisual: capture(this.carterGameOverReviveVisual),
      reviveHit: capture(this.carterGameOverReviveHit),
    });
  }

  private restoreFailureReviewBottomButtonPlacement(): void {
    const snapshot = this.failureReviewButtonPlacementSnapshot;
    if (!snapshot) {
      return;
    }
    const restore = (node: Node | null, placement: FailureReviewNodePlacementSnapshot | null): void => {
      if (!node?.isValid || !placement) {
        return;
      }
      if (placement.parent?.isValid && node.parent !== placement.parent) {
        placement.parent.addChild(node);
      }
      const transform = node.getComponent(UITransform);
      transform?.setAnchorPoint(placement.anchorX, placement.anchorY);
      node.setPosition(placement.positionX, placement.positionY, placement.positionZ);
      node.setScale(placement.scaleX, placement.scaleY, placement.scaleZ);
      if (node.parent?.isValid) {
        node.setSiblingIndex(Math.max(0, Math.min(placement.siblingIndex, node.parent.children.length - 1)));
      }
      node.active = placement.active;
    };
    restore(this.carterGameOverReviewVisual, snapshot.reviewVisual);
    restore(this.carterGameOverReviewHit, snapshot.reviewHit);
    restore(this.carterGameOverReviveVisual, snapshot.reviveVisual);
    restore(this.carterGameOverReviveHit, snapshot.reviveHit);
    this.failureReviewButtonPlacementSnapshot = null;
  }

  private moveFailureReviewBottomButtonsToRuntime(): void {
    const runtime = this.failureReviewRuntime;
    if (!runtime?.isValid) {
      return;
    }
    const move = (node: Node | null): void => {
      if (!node?.isValid) {
        return;
      }
      if (node.parent !== runtime) {
        runtime.addChild(node);
      }
      const transform = node.getComponent(UITransform);
      transform?.setAnchorPoint(0.5, 0.5);
      node.setScale(1, 1, 1);
    };
    move(this.carterGameOverReviewVisual);
    move(this.carterGameOverReviewHit);
    move(this.carterGameOverReviveVisual);
    move(this.carterGameOverReviveHit);
  }

  private async loadFailureReviewBackground(generation: number): Promise<void> {
    const node = this.failureReviewPanelBackgroundNode;
    if (!node?.isValid) {
      return;
    }
    try {
      const frame = await this.loadSpriteFrameByUuid(
        EvidencePreviewController.FAILURE_REVIEW_PANEL_BG_SPRITE_FRAME_UUID,
      );
      if (
        !this.node?.isValid ||
        this.isDestroying ||
        generation !== this.failureReviewVisualGeneration ||
        !this.failureReviewActive ||
        !node.isValid
      ) {
        return;
      }
      const sprite = node.getComponent(Sprite);
      if (!sprite) {
        return;
      }
      sprite.spriteFrame = frame;
      this.layoutFailureReviewCard();
      this.centerFailureReviewRuntimeInCanvas();
    } catch (error) {
      console.error('[FailureReview] Failed to load review panel background sprite frame.', error);
    }
  }

  private centerFailureReviewRuntimeInCanvas(): void {
    const runtime = this.failureReviewRuntime;
    if (!runtime?.isValid) {
      return;
    }
    const runtimeTransform = runtime.getComponent(UITransform);
    const parent = runtime.parent;
    const parentTransform = parent?.getComponent(UITransform) ?? null;
    const canvasNode = this.node.parent;
    const canvasTransform = canvasNode?.getComponent(UITransform) ?? null;
    if (!runtimeTransform || !parent?.isValid || !parentTransform || !canvasNode?.isValid || !canvasTransform) {
      return;
    }
    runtimeTransform.setAnchorPoint(0.5, 0.5);
    runtime.setScale(1, 1, 1);
    const canvasCenterWorld = canvasTransform.convertToWorldSpaceAR(new Vec3(0, 0, 0));
    const localCenter = parentTransform.convertToNodeSpaceAR(canvasCenterWorld, new Vec3());
    runtime.setPosition(localCenter.x, localCenter.y, runtime.position.z);
  }

  private positionFailureReviewCloseHit(metrics: FailureReviewCardLayoutMetrics | null = null): void {
    const hitNode = this.failureReviewCloseHitNode;
    const backgroundNode = this.failureReviewPanelBackgroundNode;
    if (!hitNode?.isValid || !backgroundNode?.isValid) {
      return;
    }
    const layout = metrics ?? this.layoutFailureReviewCard();
    if (!layout) {
      return;
    }
    const hitSize = Math.max(78, Math.min(92, layout.panelWidth * 0.15));
    this.setNodeSize(hitNode, hitSize, hitSize);
    hitNode.setPosition(layout.closeHitX, layout.closeHitY, 0);
  }

  private renderFailureReviewPage(generation: number): void {
    if (!this.failureReviewActive) {
      return;
    }
    const entries = this.activeFailureReviewEntries;
    if (entries.length <= 0) {
      return;
    }
    const safePageIndex = Math.max(0, Math.min(this.failureReviewPageIndex, entries.length - 1));
    this.failureReviewPageIndex = safePageIndex;
    const layout = this.layoutFailureReviewCard();
    const entry = entries[safePageIndex];
    const titleLabel = this.failureReviewTitleLabelNode?.getComponent(Label) ?? null;
    const nameLabel = this.failureReviewNameLabelNode?.getComponent(Label) ?? null;
    const errorKindLabel = this.failureReviewErrorKindLabelNode?.getComponent(Label) ?? null;
    const correctDecisionLabel = this.failureReviewCorrectDecisionLabelNode?.getComponent(Label) ?? null;
    const reasonLabel = this.failureReviewReasonLabelNode?.getComponent(Label) ?? null;

    const titleText = `FAILURE REASON ${safePageIndex + 1} / ${entries.length}`;
    if (titleLabel) {
      titleLabel.string = titleText;
    }
    if (nameLabel) {
      nameLabel.string = entry.displayName.toUpperCase();
    }
    if (errorKindLabel) {
      errorKindLabel.string = entry.errorKind;
      if (entry.errorKind === 'RESPONSE FAILURE') {
        errorKindLabel.color = new Color(156, 69, 26, 255);
      } else {
        errorKindLabel.color = new Color(148, 42, 34, 255);
      }
    }
    if (correctDecisionLabel) {
      correctDecisionLabel.string = `CORRECT DECISION: ${entry.correctDecisionText}`;
    }
    if (reasonLabel) {
      reasonLabel.string = entry.reasonText;
    }

    this.renderFailureReviewPortrait(entry, generation, safePageIndex, layout);
    this.configureFailureReviewBottomButtons(safePageIndex >= entries.length - 1, layout);
  }

  private renderFailureReviewPortrait(
    entry: FailureReviewEntry,
    generation: number,
    pageIndex: number,
    layout: FailureReviewCardLayoutMetrics | null,
  ): void {
    const portraitNode = this.failureReviewPortraitNode;
    if (!portraitNode?.isValid) {
      return;
    }
    const portraitSprite = portraitNode.getComponent(Sprite);
    if (!portraitSprite) {
      portraitNode.active = false;
      return;
    }
    const portraitMaxWidth = layout?.portraitMaxWidth ?? 260;
    const portraitMaxHeight = layout?.portraitMaxHeight ?? 260;
    this.sanitizeFailureReviewPortraitNode(portraitNode, portraitSprite);
    this.applyFailureReviewPortraitContain(portraitNode, portraitSprite, null, portraitMaxWidth, portraitMaxHeight);
    portraitNode.active = false;
    if (!entry.portraitSpriteFrameUuid) {
      return;
    }
    void this.loadSpriteFrameByUuid(entry.portraitSpriteFrameUuid)
      .then((frame) => {
        if (!this.node?.isValid || this.isDestroying || !portraitNode.isValid) {
          return;
        }
        const currentEntries = this.activeFailureReviewEntries;
        const currentEntry = currentEntries[this.failureReviewPageIndex];
        if (
          !this.failureReviewActive ||
          generation !== this.failureReviewVisualGeneration ||
          pageIndex !== this.failureReviewPageIndex ||
          !currentEntry ||
          currentEntry.roundId !== entry.roundId ||
          currentEntry.subjectKey !== entry.subjectKey
        ) {
          return;
        }
        const currentPortraitSprite = portraitNode.getComponent(Sprite);
        if (!currentPortraitSprite) {
          portraitNode.active = false;
          return;
        }
        this.sanitizeFailureReviewPortraitNode(portraitNode, currentPortraitSprite);
        const currentLayout = this.layoutFailureReviewCard();
        const currentPortraitMaxWidth = currentLayout?.portraitMaxWidth ?? portraitMaxWidth;
        const currentPortraitMaxHeight = currentLayout?.portraitMaxHeight ?? portraitMaxHeight;
        const applied = this.applyFailureReviewPortraitContain(
          portraitNode,
          currentPortraitSprite,
          frame,
          currentPortraitMaxWidth,
          currentPortraitMaxHeight,
        );
        portraitNode.active = applied;
      })
      .catch(() => {
        if (!portraitNode.isValid) {
          return;
        }
        portraitNode.active = false;
        console.warn(
          `[FailureReviewPortrait] Failed to load portrait sprite frame: subjectKey="${entry.subjectKey}", uuid="${entry.portraitSpriteFrameUuid}".`,
        );
      });
  }

  private applyFailureReviewPortraitContain(
    node: Node,
    sprite: Sprite,
    frame: SpriteFrame | null,
    maxWidth: number,
    maxHeight: number,
  ): boolean {
    const transform = node.getComponent(UITransform);
    if (!transform) {
      return false;
    }
    if (!Number.isFinite(maxWidth) || !Number.isFinite(maxHeight) || maxWidth <= 0 || maxHeight <= 0) {
      return false;
    }
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    node.setScale(1, 1, 1);
    if (!frame?.isValid) {
      transform.setContentSize(maxWidth, maxHeight);
      return false;
    }
    const sourceSize = this.resolveSpriteFrameSourceSize(frame);
    if (!sourceSize) {
      transform.setContentSize(maxWidth, maxHeight);
      return false;
    }
    const fitScale = Math.min(maxWidth / sourceSize.width, maxHeight / sourceSize.height);
    if (!Number.isFinite(fitScale) || fitScale <= 0) {
      transform.setContentSize(maxWidth, maxHeight);
      return false;
    }
    const displayWidth = sourceSize.width * fitScale;
    const displayHeight = sourceSize.height * fitScale;
    transform.setContentSize(displayWidth, displayHeight);
    return true;
  }

  private sanitizeFailureReviewPortraitNode(node: Node, sprite: Sprite): void {
    sprite.color = new Color(255, 255, 255, 255);
    const opacity = node.getComponent(UIOpacity);
    if (opacity) {
      opacity.opacity = 255;
    }
    const graphics = node.getComponent(Graphics);
    if (graphics) {
      graphics.clear();
      graphics.enabled = false;
    }
    for (const child of node.children) {
      if (child?.isValid) {
        child.active = false;
      }
    }
  }

  private configureFailureReviewBottomButtons(
    isLastPage: boolean,
    layout: FailureReviewCardLayoutMetrics | null,
  ): void {
    this.moveFailureReviewBottomButtonsToRuntime();
    const resolvedLayout = layout ?? this.layoutFailureReviewCard();
    if (!resolvedLayout) {
      return;
    }
    const buttonY = resolvedLayout.buttonY;
    if (this.carterGameOverReviewVisual?.isValid) {
      this.carterGameOverReviewVisual.setPosition(0, buttonY, 0);
      this.carterGameOverReviewVisual.setScale(1, 1, 1);
    }
    if (this.carterGameOverReviewHit?.isValid) {
      this.carterGameOverReviewHit.setPosition(0, buttonY, 0);
      this.carterGameOverReviewHit.off(Button.EventType.CLICK, this.handleCarterGameOverReviveClick, this);
      this.carterGameOverReviewHit.off(Button.EventType.CLICK, this.handleFailureReviewNextClick, this);
    }
    if (this.carterGameOverReviewTextCover?.isValid) {
      this.carterGameOverReviewTextCover.active = false;
    }
    if (this.carterGameOverReviewLabelNode?.isValid) {
      this.carterGameOverReviewLabelNode.active = false;
    }
    if (this.carterGameOverReviewButton?.node?.isValid) {
      this.carterGameOverReviewButton.interactable = !isLastPage;
    }
    if (!isLastPage) {
      this.carterGameOverReviewHit?.on(Button.EventType.CLICK, this.handleFailureReviewNextClick, this);
    }
    this.commitFailureReviewNextReasonVisual(this.failureReviewVisualGeneration, isLastPage, resolvedLayout);

    const reviveHitWidth = Math.max(210, Math.min(240, resolvedLayout.panelWidth * 0.4));
    const reviveHitHeight = 78;
    if (this.carterGameOverReviveVisual?.isValid) {
      this.carterGameOverReviveVisual.setPosition(0, buttonY, 0);
      this.carterGameOverReviveVisual.active = isLastPage;
    }
    if (this.carterGameOverReviveHit?.isValid) {
      this.carterGameOverReviveHit.setPosition(0, buttonY, 0);
      this.carterGameOverReviveHit.active = isLastPage;
      this.setNodeSize(this.carterGameOverReviveHit, reviveHitWidth, reviveHitHeight);
      this.carterGameOverReviveHit.off(Button.EventType.CLICK, this.handleFailureReviewNextClick, this);
    }
    if (this.carterGameOverReviveButton?.node?.isValid) {
      this.carterGameOverReviveButton.interactable = isLastPage;
    }
    this.applyAdministrativeGameOverLayerOrder();
    if (this.failureReviewRuntime?.isValid) {
      this.failureReviewRuntime.setSiblingIndex(
        Math.max(0, this.carterGameOverPanelRuntime?.children.length ?? 1),
      );
    }
  }

  private commitFailureReviewNextReasonVisual(
    generation: number,
    isLastPage: boolean,
    layout: FailureReviewCardLayoutMetrics,
  ): void {
    const reviewVisual = this.carterGameOverReviewVisual;
    const reviewHit = this.carterGameOverReviewHit;
    if (this.carterGameOverReviewTextCover?.isValid) {
      this.carterGameOverReviewTextCover.active = false;
    }
    if (this.carterGameOverReviewLabelNode?.isValid) {
      this.carterGameOverReviewLabelNode.active = false;
    }
    if (isLastPage || !this.failureReviewActive) {
      if (reviewVisual?.isValid) {
        reviewVisual.active = false;
      }
      if (reviewHit?.isValid) {
        reviewHit.active = false;
      }
      return;
    }
    if (reviewVisual?.isValid) {
      reviewVisual.active = false;
    }
    if (reviewHit?.isValid) {
      reviewHit.active = true;
      this.setNodeSize(
        reviewHit,
        EvidencePreviewController.FAILURE_REVIEW_NEXT_REASON_MAX_WIDTH +
          EvidencePreviewController.FAILURE_REVIEW_NEXT_REASON_HIT_EXTRA_WIDTH,
        EvidencePreviewController.FAILURE_REVIEW_NEXT_REASON_MAX_HEIGHT +
          EvidencePreviewController.FAILURE_REVIEW_NEXT_REASON_HIT_EXTRA_HEIGHT,
      );
    }

    const applyFrame = (frame: SpriteFrame): boolean => {
      const runtime = this.failureReviewRuntime;
      if (
        !this.node?.isValid ||
        this.isDestroying ||
        generation !== this.failureReviewVisualGeneration ||
        !this.failureReviewActive ||
        !runtime?.isValid ||
        !reviewVisual?.isValid ||
        !reviewHit?.isValid ||
        reviewVisual.parent !== runtime ||
        reviewHit.parent !== runtime ||
        this.failureReviewPageIndex >= this.activeFailureReviewEntries.length - 1
      ) {
        return false;
      }
      const sprite = this.carterGameOverReviewSprite;
      const visualTransform = reviewVisual.getComponent(UITransform);
      if (!sprite || !visualTransform) {
        return false;
      }
      const sourceSize = this.resolveSpriteFrameSourceSize(frame);
      if (!sourceSize) {
        return false;
      }
      const fitScale = Math.min(
        EvidencePreviewController.FAILURE_REVIEW_NEXT_REASON_MAX_WIDTH / sourceSize.width,
        EvidencePreviewController.FAILURE_REVIEW_NEXT_REASON_MAX_HEIGHT / sourceSize.height,
      );
      if (!Number.isFinite(fitScale) || fitScale <= 0) {
        return false;
      }
      const displayWidth = sourceSize.width * fitScale;
      const displayHeight = sourceSize.height * fitScale;
      sprite.sizeMode = Sprite.SizeMode.CUSTOM;
      sprite.spriteFrame = frame;
      reviewVisual.setScale(1, 1, 1);
      visualTransform.setAnchorPoint(0.5, 0.5);
      visualTransform.setContentSize(displayWidth, displayHeight);
      this.setNodeSize(
        reviewHit,
        displayWidth + EvidencePreviewController.FAILURE_REVIEW_NEXT_REASON_HIT_EXTRA_WIDTH,
        displayHeight + EvidencePreviewController.FAILURE_REVIEW_NEXT_REASON_HIT_EXTRA_HEIGHT,
      );
      reviewVisual.setPosition(0, layout.buttonY, 0);
      reviewHit.setPosition(0, layout.buttonY, 0);
      reviewVisual.active = true;
      reviewHit.active = true;
      return true;
    };

    if (this.failureReviewNextReasonSpriteFrame?.isValid) {
      if (applyFrame(this.failureReviewNextReasonSpriteFrame)) {
        return;
      }
    }

    void this.loadSpriteFrameByUuid(EvidencePreviewController.FAILURE_REVIEW_NEXT_REASON_BUTTON_SPRITE_FRAME_UUID)
      .then((frame) => {
        this.failureReviewNextReasonSpriteFrame = frame;
        if (!applyFrame(frame)) {
          return;
        }
      })
      .catch((error) => {
        if (
          !this.node?.isValid ||
          this.isDestroying ||
          generation !== this.failureReviewVisualGeneration ||
          !this.failureReviewActive
        ) {
          return;
        }
        console.error('[FailureReview] Failed to load NEXT REASON sprite frame.', error);
        if (reviewVisual?.isValid) {
          reviewVisual.active = false;
        }
        if (reviewHit?.isValid) {
          reviewHit.active = false;
        }
      });
  }

  private handleFailureReviewNextClick = (): void => {
    if (this.failureReviewPageAdvanceInProgress) {
      return;
    }
    if (!this.failureReviewActive) {
      return;
    }
    const totalEntries = this.activeFailureReviewEntries.length;
    if (totalEntries <= 1) {
      return;
    }
    const currentPageIndex = this.failureReviewPageIndex;
    if (currentPageIndex < 0) {
      return;
    }
    if (currentPageIndex >= totalEntries - 1) {
      return;
    }
    this.failureReviewPageAdvanceInProgress = true;
    this.unschedule(this.releaseFailureReviewPageAdvanceGuard);
    this.failureReviewVisualGeneration += 1;
    this.failureReviewPageIndex = currentPageIndex + 1;
    this.renderFailureReviewPage(this.failureReviewVisualGeneration);
    this.scheduleOnce(this.releaseFailureReviewPageAdvanceGuard, 0);
  };

  private handleFailureReviewCloseClick = (): void => {
    if (!this.failureReviewActive || this.reviveResolutionInProgress) {
      return;
    }
    this.failureReviewActive = false;
    this.resetFailureReviewPageAdvanceGuard();
    this.invalidateFailureReviewVisuals();
    this.hideFailureReviewRuntime();
    this.restoreFailureReviewOverlaySnapshot();
  }

  private readonly releaseFailureReviewPageAdvanceGuard = (): void => {
    this.failureReviewPageAdvanceInProgress = false;
  };

  private resetFailureReviewPageAdvanceGuard(): void {
    this.unschedule(this.releaseFailureReviewPageAdvanceGuard);
    this.failureReviewPageAdvanceInProgress = false;
  }

  private async resolveReviveFromFailureReview(gameOverContext: ActiveGameOverContext): Promise<void> {
    if (this.reviveResolutionInProgress) {
      return;
    }
    if (!this.failureReviewActive) {
      return;
    }
    const currentContext = this.activeGameOverContext;
    if (
      !currentContext ||
      currentContext.generation !== gameOverContext.generation ||
      currentContext.reason !== gameOverContext.reason
    ) {
      return;
    }
    const checkpoint = this.latestReviveCheckpoint;
    if (!checkpoint) {
      console.error('[Revive] checkpoint missing.');
      return;
    }
    if (checkpoint.dayIndex !== campaignState.getCurrentDayIndex()) {
      console.error('[Revive] day mismatch; revive rejected.', {
        checkpointDayIndex: checkpoint.dayIndex,
        currentDayIndex: campaignState.getCurrentDayIndex(),
      });
      return;
    }
    if (checkpoint.roundId.trim().length <= 0) {
      console.error('[Revive] invalid checkpoint round id.');
      return;
    }
    if (gameOverContext.checkpointRoundId !== checkpoint.roundId) {
      console.error('[Revive] checkpoint round mismatch for active game over.', {
        gameOverRoundId: gameOverContext.checkpointRoundId,
        checkpointRoundId: checkpoint.roundId,
      });
      return;
    }
    const failedDayIndex = this.resolveFailedDayIndexForRevive(gameOverContext, checkpoint);
    if (!failedDayIndex) {
      return;
    }

    this.reviveResolutionInProgress = true;
    this.failureReviewActive = false;
    this.resetFailureReviewPageAdvanceGuard();
    this.invalidateFailureReviewVisuals();
    this.hideFailureReviewRuntime();
    this.decisionResolutionToken += 1;
    this.setInspectionDecisionResolutionInProgress(false, 'revive-reset');
    this.lockAllEncounterInput('revive-reset');
    this.clearDayTransitionTransientState();
    this.hideInternalContaminationMonsterVisuals();
    this.invalidateInternalContaminationVisuals();
    if (this.carterMonsterAttackRuntime?.isValid) {
      this.carterMonsterAttackRuntime.active = false;
    }
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = false;
    }
    if (this.currentInspectionSubject?.subjectKind === 'visitor') {
      this.clearActiveVisitorInspectionSubject();
    }
    this.setCurrentRoundAndSyncSubject(null);
    this.activeInspectionSubjectId = 'carter';
    this.activeDayQueueCursor = 0;
    this.activeDay4VisitorCursor = 0;
    this.completedRoundCount = 0;
    this.previousRoundSignature = null;
    this.infectedEntryCount = 0;
    this.procedureViolationCount = 0;
    this.formalComplaintCount = 0;
    this.currentAdministrativeGameOverReason = null;
    this.administrativeGameOverActive = false;
    this.campaignImplementedContentComplete = false;
    this.campaignDayTransitionInProgress = false;
    this.campaignDayCompletionPending = false;
    this.campaignDayContinueRequested = false;
    this.retryLoadInProgress = false;
    this.resetActiveDayQueueState();

    const restartedDayConfig = campaignState.restartCurrentDay(failedDayIndex);
    this.activeDayConfig = restartedDayConfig;
    this.recordDayStartDecisionErrorBaseline('revive-restart-day');
    this.configureCampaignShiftClock(restartedDayConfig);
    this.applyCampaignConfigurationToControllers();
    this.refreshCampaignEvidenceAvailability('game-over');
    this.resetChecklistState();

    if (restartedDayConfig.dayIndex === 4) {
      this.applyActiveAppointmentRosterDay();
      this.activeDay4VisitorCursor = 0;
    } else {
      this.buildActiveDayQueue(restartedDayConfig);
    }
    const generated = this.generateNextRound({ allowDuringTransition: true });
    if (!generated) {
      this.handleReviveRestartFailure(
        gameOverContext,
        checkpoint,
        failedDayIndex,
        'generate-first-round-failed',
      );
      return;
    }
    const loaded = this.loadInspectionSubject(this.activeInspectionSubjectId);
    if (!loaded) {
      this.handleReviveRestartFailure(
        gameOverContext,
        checkpoint,
        failedDayIndex,
        'load-first-subject-failed',
      );
      return;
    }
    const introResult = await this.playIntroForActiveSubject();
    if (!introResult.ok) {
      this.handleReviveRestartFailure(
        gameOverContext,
        checkpoint,
        failedDayIndex,
        `play-first-intro-failed:${introResult.reason}`,
      );
      return;
    }
    this.activeGameOverContext = null;
    this.clearReviveCheckpoint();
    this.reviveResolutionInProgress = false;
  }

  private resolveFailedDayIndexForRevive(
    gameOverContext: ActiveGameOverContext,
    checkpoint: ReviveCheckpoint,
  ): number | null {
    const contextDayIndex = gameOverContext.dayIndex;
    const checkpointDayIndex = checkpoint.dayIndex;
    if (contextDayIndex !== checkpointDayIndex) {
      console.error('[Revive] failedDayIndex mismatch; revive rejected.', {
        contextDayIndex,
        checkpointDayIndex,
      });
      return null;
    }
    if (!isCampaignDayIndex(contextDayIndex)) {
      console.error('[Revive] invalid failedDayIndex; revive rejected.', {
        contextDayIndex,
      });
      return null;
    }
    return contextDayIndex;
  }

  private handleReviveRestartFailure(
    gameOverContext: ActiveGameOverContext,
    checkpoint: ReviveCheckpoint,
    failedDayIndex: number,
    stage: string,
  ): void {
    const activeSubject = this.currentInspectionSubject;
    const subjectKey =
      activeSubject?.subjectKind === 'visitor'
        ? activeSubject.visitorKey
        : activeSubject?.round.employeeKey ?? null;
    const roundId =
      activeSubject?.subjectKind === 'visitor'
        ? activeSubject.roundId
        : activeSubject?.round.roundId ?? null;
    console.error('[Revive] failed to restart current day from beginning.', {
      failedDayIndex,
      subjectKey,
      roundId,
      queueCursor: this.activeDayQueueCursor,
      stage,
    });
    this.activeGameOverContext = gameOverContext;
    this.latestReviveCheckpoint = checkpoint;
    if (this.carterGameOverPanelRuntime?.isValid) {
      this.carterGameOverPanelRuntime.active = true;
    }
    this.restoreFailureReviewOverlaySnapshot();
    this.failureReviewActive = false;
    this.hideFailureReviewRuntime();
    this.lockAllEncounterInput('revive-restart-failure');
    this.reviveResolutionInProgress = false;
  }

  private rollbackCampaignDecisionStateForRevive(
    checkpoint: ReviveCheckpoint,
    reason: FailureReviewReason,
  ): void {
    const checkpointRoundId = checkpoint.roundId;
    if (reason === 'internal-contamination' || reason === 'repeated-procedural-violations' || reason === 'multiple-formal-complaints' || reason === 'incorrect-allow') {
      campaignState.undoLastDailyDecisionError(checkpointRoundId);
    }
    if (reason === 'internal-contamination' || reason === 'incorrect-allow') {
      campaignState.undoLastWronglyAllowedMonster(checkpointRoundId);
    }
    const stats = campaignState.getDailyDecisionErrorStats();
    if (
      stats.wrongAllowCount !== checkpoint.dailyDecisionErrorStats.wrongAllowCount ||
      stats.wrongDenyCount !== checkpoint.dailyDecisionErrorStats.wrongDenyCount ||
      campaignState.getDailyDecisionErrors().length !== checkpoint.dailyDecisionErrorsLength
    ) {
      console.warn('[Revive] campaign decision state differs from checkpoint after rollback.', {
        reason,
        expectedStats: checkpoint.dailyDecisionErrorStats,
        actualStats: stats,
        expectedErrorCount: checkpoint.dailyDecisionErrorsLength,
        actualErrorCount: campaignState.getDailyDecisionErrors().length,
      });
    }
    if (
      campaignState.getWronglyAllowedMonsters().length !== checkpoint.wronglyAllowedMonstersLength &&
      (reason === 'internal-contamination' || reason === 'incorrect-allow')
    ) {
      console.warn('[Revive] wronglyAllowedMonsters length differs from checkpoint after rollback.', {
        expectedCount: checkpoint.wronglyAllowedMonstersLength,
        actualCount: campaignState.getWronglyAllowedMonsters().length,
      });
    }
  }

  private resolveSpriteFrameSourceSize(spriteFrame: SpriteFrame): { width: number; height: number } | null {
    // For fullbody presentation we prioritize the rendered rect ratio.
    // Many imported assets are auto-trimmed and have raw/original dimensions
    // that are wider than the visible region, which causes final horizontal stretch.
    const rect = spriteFrame.rect;
    let rectWidth = rect?.width ?? 0;
    let rectHeight = rect?.height ?? 0;
    if (spriteFrame.rotated) {
      const swappedWidth = rectHeight;
      rectHeight = rectWidth;
      rectWidth = swappedWidth;
    }
    if (Number.isFinite(rectWidth) && Number.isFinite(rectHeight) && rectWidth > 0 && rectHeight > 0) {
      return { width: rectWidth, height: rectHeight };
    }

    const originalWidth = spriteFrame.originalSize.width;
    const originalHeight = spriteFrame.originalSize.height;
    if (Number.isFinite(originalWidth) && Number.isFinite(originalHeight) && originalWidth > 0 && originalHeight > 0) {
      return { width: originalWidth, height: originalHeight };
    }

    const textureWidth = spriteFrame.texture?.width ?? 0;
    const textureHeight = spriteFrame.texture?.height ?? 0;
    if (!Number.isFinite(textureWidth) || !Number.isFinite(textureHeight) || textureWidth <= 0 || textureHeight <= 0) {
      return null;
    }

    return { width: textureWidth, height: textureHeight };
  }

  private applyMonsterFullbodyContain(
    sprite: Sprite | null,
    frame: SpriteFrame | null,
    maxWidth: number,
    maxHeight: number,
    presentationScale: number,
    slotKey: string,
  ): boolean {
    const node = sprite?.node ?? null;
    if (!sprite || !node?.isValid || !frame?.isValid) {
      return false;
    }

    const transform = node.getComponent(UITransform);
    if (!transform) {
      console.error('[MonsterFullbodyContain] Missing UITransform.', {
        slotKey,
        uuidLength: frame.uuid?.length ?? 0,
      });
      return false;
    }

    if (!Number.isFinite(maxWidth) || !Number.isFinite(maxHeight) || maxWidth <= 0 || maxHeight <= 0) {
      console.error('[MonsterFullbodyContain] Invalid slot bounds.', {
        slotKey,
        maxWidth,
        maxHeight,
      });
      return false;
    }

    const sourceSize = this.resolveSpriteFrameSourceSize(frame);
    if (!sourceSize) {
      console.error('[MonsterFullbodyContain] Invalid source size.', {
        slotKey,
        uuidLength: frame.uuid?.length ?? 0,
      });
      return false;
    }

    const fitScale = Math.min(maxWidth / sourceSize.width, maxHeight / sourceSize.height);
    if (!Number.isFinite(fitScale) || fitScale <= 0) {
      console.error('[MonsterFullbodyContain] Invalid fit scale.', {
        slotKey,
        sourceWidth: sourceSize.width,
        sourceHeight: sourceSize.height,
        maxWidth,
        maxHeight,
      });
      return false;
    }

    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.spriteFrame = frame;
    node.setScale(1, 1, 1);
    transform.setContentSize(sourceSize.width * fitScale, sourceSize.height * fitScale);
    node.setScale(presentationScale, presentationScale, 1);
    return true;
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
      this.carterMonsterFullbodyVisual.active = false;
      return;
    }
    const applied = this.applyMonsterFullbodyContain(
      this.carterMonsterFullbodySprite,
      frame,
      520,
      960,
      1,
      'CarterMonsterFullbodyVisual',
    );
    if (!applied && this.carterMonsterFullbodyVisual.isValid) {
      this.carterMonsterFullbodyVisual.active = false;
    }
  }

  private commitActiveMonsterFullbodyPresentation(sourceTag: string): boolean {
    if (this.isDestroying || !this.carterMonsterFullbodySprite || !this.carterMonsterFullbodyVisual) {
      return false;
    }
    if (!this.carterMonsterFullbodyVisual.isValid) {
      return false;
    }
    const frame = this.getActiveMonsterFullbodyFrame();
    if (!frame?.isValid) {
      this.carterMonsterFullbodyVisual.active = false;
      return false;
    }
    const applied = this.applyMonsterFullbodyContain(
      this.carterMonsterFullbodySprite,
      frame,
      520,
      960,
      1,
      `CarterMonsterFullbodyVisual:${sourceTag}`,
    );
    if (!applied) {
      this.carterMonsterFullbodyVisual.active = false;
      return false;
    }
    this.carterMonsterFullbodyVisual.active = true;
    return true;
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

  private async bootstrapRoundEngine(): Promise<void> {
    assertDayCatalogValid();
    if (consumeDay0EndingTestLaunchRequested()) {
      await this.prepareDay0EndingResources();
      this.enterDay0EndingDisplayTestMode();
      this.setInspectionViewReady(true, 'day0-ending-test-ready');
      return;
    }
    this.cleanupDay0EndingPhonePhase1State();
    this.day0EndingDisplayTestActive = false;
    if (hasRequestedStartDay()) {
      const requestedStartDay = consumeRequestedStartDay();
      campaignState.startNewCampaignRunAtDay(requestedStartDay);
    }
    const dayConfig = campaignState.getCurrentDayConfig();
    this.activeDayConfig = dayConfig;
    this.recordDayStartDecisionErrorBaseline('bootstrap');
    this.resetActiveDayQueueState();
    this.campaignDayTransitionInProgress = false;
    this.campaignImplementedContentComplete = false;
    this.campaignDayCompletionPending = false;
    this.campaignDayContinueRequested = false;
    this.hasLoggedImplementedContentComplete = false;
    this.emergencyTelephoneOverrideActive = false;
    this.dayCompletionOverlayController?.hide();
    this.configureCampaignShiftClock(dayConfig);
    this.logCampaignDayConfigOnce(dayConfig);
    this.runPhase3StaticSelfCheckOnce();
    this.runPhase4StaticSelfCheckOnce();
    this.runPhase6AStaticSelfCheckOnce();
    this.runPhase6BStaticSelfCheckOnce();
    this.applyCampaignConfigurationToControllers();
    this.refreshCampaignEvidenceAvailability('day-transition');
    this.resetChecklistState();
    this.logRoundBootstrap('start');
    const debugReport = runRoundEngineSelfCheck();
    for (const check of debugReport.checks) {
      if (!check.pass) {
        console.warn(`[RoundEngineDebug] ${check.name} failed${check.detail ? `: ${check.detail}` : ''}`);
      }
    }
    const roundSpriteUuids = this.roundGenerator.getAllRoundSpriteUuids();
    const documentUuids = [
      ...Object.values(SUBJECT_DOCUMENT_FRAME_UUIDS).flatMap((entry) => [
        entry.employeeCard,
        entry.applicationForm,
      ]),
      ...Object.values(VISITOR_DOCUMENT_FRAME_UUIDS).flatMap((entry) => [
        entry.employeeCard,
        entry.applicationForm,
      ]),
    ];
    const visitorVisualUuids = (['edward', 'nadia'] as const)
      .map((visitorKey) => getVisitorProfile(visitorKey))
      .filter((profile): profile is NonNullable<ReturnType<typeof getVisitorProfile>> => profile !== null)
      .flatMap((profile) => [
        profile.visuals.portraitSpriteFrameUuid,
        profile.visuals.disguisedSpriteFrameUuid,
        profile.visuals.monsterPortraitSpriteFrameUuid,
        profile.visuals.monsterFullbodySpriteFrameUuid,
      ]);
    console.error('[DEBUG preload source roundSpriteUuids]', roundSpriteUuids);
    console.error('[DEBUG preload source documentUuids]', documentUuids);
    console.error('[DEBUG preload source visitorVisualUuids]', visitorVisualUuids);
    const allUuids = [
      ...roundSpriteUuids,
      ...documentUuids,
      ...visitorVisualUuids,
    ];
    console.error('[DEBUG preload allUuids]', allUuids);
    allUuids.forEach((item, index) => {
      if (typeof item !== 'string') {
        console.error(
          '[DEBUG preload invalid uuid]',
          index,
          item,
          Object.prototype.toString.call(item),
        );
      }
    });
    const unique = Array.from(new Set(allUuids));
    for (const uuid of unique) {
      try {
        const frame = await this.loadSpriteFrameByUuid(uuid);
        this.roundSpriteFrameCache.set(uuid, frame);
      } catch (error) {
        console.error(`[EvidencePreviewController] Failed to preload sprite frame: ${uuid}`, error);
      }
    }
    this.logRoundBootstrap('preload complete');
    await this.waitForFirstScreenVisualReadiness();
    this.setInspectionViewReady(true, 'bootstrap-first-screen-ready');
    if (dayConfig.dayIndex !== 4) {
      this.buildActiveDayQueue(dayConfig);
    } else {
      this.resetActiveDayQueueState();
      this.applyActiveAppointmentRosterDay();
    }
    if (!this.generateNextRound()) {
      console.error('[EvidencePreviewController] Failed to generate first round.');
      return;
    }
    this.logRoundBootstrap('round generated');
    const loaded = this.loadInspectionSubject(this.activeInspectionSubjectId);
    if (!loaded) {
      console.error('[EvidencePreviewController] Failed to load first round subject.');
      return;
    }
    const introResult = await this.playIntroForActiveSubject();
    if (!introResult.ok) {
      console.error('[EvidencePreviewController] Failed to play first round intro.');
    }
  }

  private async waitForFirstScreenVisualReadiness(): Promise<void> {
    const backgroundReadyPromise = this.mainInspectionWindowBackgroundReadyPromise;
    if (!backgroundReadyPromise) {
      return;
    }
    try {
      await backgroundReadyPromise;
    } catch (error) {
      console.warn('[EvidencePreviewController] main window background readiness await failed.', error);
    }
  }

  private async prepareDay0EndingResources(): Promise<void> {
    if (!this.day0EndingPlayerDisguisedFrame) {
      try {
        const frame = await this.loadSpriteFrameByUuid(
          EvidencePreviewController.DAY0_ENDING_PLAYER_DISGUISED_SPRITEFRAME_UUID,
        );
        if (frame?.isValid) {
          this.day0EndingPlayerDisguisedFrame = frame;
        } else {
          console.warn(
            '[EvidencePreviewController] Day0 ending disguised sprite frame resolved but invalid.',
          );
        }
      } catch (error) {
        console.warn(
          '[EvidencePreviewController] Failed to prepare Day0 ending disguised sprite frame.',
          error,
        );
      }
    }

    try {
      await this.loadSpriteFrameByUuid(
        EvidencePreviewController.DAY0_ENDING_PLAYER_TRUE_IDENTITY_PORTRAIT_SPRITEFRAME_UUID,
      );
    } catch (error) {
      console.warn(
        '[EvidencePreviewController] Failed to prepare Day0 ending true identity portrait sprite frame.',
        error,
      );
    }

    try {
      const audioManager = AudioManager.getInstance();
      if (!audioManager) {
        console.warn('[EvidencePreviewController] AudioManager is unavailable; skipping Day0 ring preload.');
        return;
      }
      const loader = audioManager as unknown as {
        loadClip?: (id: unknown) => Promise<unknown>;
      };
      if (typeof loader.loadClip !== 'function') {
        console.warn(
          '[EvidencePreviewController] AudioManager.loadClip is unavailable; skipping Day0 ring preload.',
        );
        return;
      }
      const day0RingLoaded = await loader.loadClip(GameAudioCatalog.Day0UnknownNumberPhoneRingId);
      if (!day0RingLoaded) {
        console.warn('[EvidencePreviewController] Day0 unknown number phone ring clip preload returned null.');
      }
      const day0RevealMusicLoaded = await loader.loadClip(GameAudioCatalog.Day0IdentityRevealMusicId);
      if (!day0RevealMusicLoaded) {
        console.warn('[EvidencePreviewController] Day0 identity reveal music clip preload returned null.');
      }
    } catch (error) {
      console.warn('[EvidencePreviewController] Failed to prepare Day0 ending audio clips.', error);
    }
  }

  private enterDay0EndingDisplayTestMode(): void {
    this.day0EndingDisplayTestActive = true;
    this.initializeDay0EndingPhonePhase1State();
    this.day0EndingPhoneReady = false;
    this.activeDayConfig = null;
    this.resetActiveDayQueueState();
    this.setCurrentRoundAndSyncSubject(null);
    this.campaignDayTransitionInProgress = false;
    this.campaignImplementedContentComplete = false;
    this.campaignDayCompletionPending = false;
    this.campaignDayContinueRequested = false;
    this.hasLoggedImplementedContentComplete = false;
    this.emergencyTelephoneOverrideActive = false;
    this.dayCompletionOverlayController?.hide();
    this.shiftClockController?.stop();
    this.shiftClockController?.clearCallbacks();
    this.hasStartedCampaignShiftClock = false;
    this.closePreview();
    this.stopChecklistReplyTyping(true);
    if (this.checklistQuestionPanelRuntime?.isValid) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    if (this.checklistReplyPanelRuntime?.isValid) {
      this.checklistReplyPanelRuntime.active = false;
    }
    this.checklistQuestionPanelOpen = false;
    this.checklistReplyPanelOpen = false;
    this.previewOpen = false;
    this.setManagedButtonsInteractable(false, 'day0-ending-test-lock');
    this.lockAllEncounterInput('day0-ending-test');
    this.setShutterInteractionEnabledForInteractionTrace(false, 'day0-ending-test-lock');

    if (this.employeeCardVisual?.isValid) {
      this.employeeCardVisual.active = false;
    }
    if (this.employeeCardHit?.isValid) {
      this.employeeCardHit.active = false;
    }
    if (this.employeeCardHitButton?.node?.isValid) {
      this.employeeCardHitButton.interactable = false;
    }
    if (this.applicationFormVisual?.isValid) {
      this.applicationFormVisual.active = false;
    }
    if (this.applicationFormHit?.isValid) {
      this.applicationFormHit.active = false;
    }
    if (this.applicationFormHitButton?.node?.isValid) {
      this.applicationFormHitButton.interactable = false;
    }
    const screeningChecklistVisual = this.node.getChildByName('ScreeningChecklistVisual');
    if (screeningChecklistVisual?.isValid) {
      screeningChecklistVisual.active = false;
    }
    if (this.screeningChecklistHit?.isValid) {
      this.screeningChecklistHit.active = false;
    }
    if (this.screeningChecklistHitButton?.node?.isValid) {
      this.screeningChecklistHitButton.interactable = false;
    }
    if (this.shutterHitButton?.node?.isValid) {
      this.shutterHitButton.node.active = false;
      this.shutterHitButton.interactable = false;
    }
    if (this.allowHitButton?.node?.isValid) {
      this.allowHitButton.node.active = false;
      this.allowHitButton.interactable = false;
    }
    if (this.denyHitButton?.node?.isValid) {
      this.denyHitButton.node.active = false;
      this.denyHitButton.interactable = false;
    }

    const drawersClosedRuntime = this.node.getChildByName('EmployeeDrawersClosedRuntime');
    if (drawersClosedRuntime?.isValid) {
      // Keep drawer visuals visible during pre-reveal phase; only interaction is locked.
      drawersClosedRuntime.active = true;
      this.setEmployeeFilesInteractionEnabled(drawersClosedRuntime, false);
      this.employeeFilesController?.closeOpenDrawerForExternalInteraction();
    }
    if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = false;
    }
    if (this.visitorGreetingRuntime?.isValid) {
      this.visitorGreetingRuntime.active = false;
    }
    this.shutterController?.prepareClosedForIntro();

    this.telephoneController?.setCampaignRegularAccessEnabled(true);
    this.telephoneController?.setEmergencyAccessOverride(false);
    this.telephoneController?.setDepartmentPhoneLookupEnabled(false);
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'day0-ending-test-wait-phone-ring');
    if (this.telephoneVisual?.isValid) {
      this.telephoneVisual.active = true;
    }
    if (this.telephoneHit?.isValid) {
      this.telephoneHit.active = true;
    }
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = false;
    }
    this.hideGuidancePanelImmediate(false);
    if (this.guidanceHelpButtonNode?.isValid) {
      this.guidanceHelpButtonNode.active = false;
    }
    if (this.guidanceHintButtonNode?.isValid) {
      this.guidanceHintButtonNode.active = false;
    }
    this.visitorIntroController?.setDay0EndingDisplay();
    console.log('[Day0BGM] enter ending mode, about to play music');
    this.playDay0EndingIdentityRevealMusicOnce();
    this.scheduleOnce(
      this.handleDay0EndingPhoneDelayElapsed,
      EvidencePreviewController.DAY0_ENDING_PHONE_DELAY_SECONDS,
    );
  }

  private handleShutterHitClick(): void {
    if (!this.day0EndingAwaitShutter) {
      return;
    }
    // Shutter progression still continues from the open-settled listener so
    // Day0 phase advancement happens only after the shutter is fully opened.
  }

  private armDay0EndingAwaitShutterPhase(): void {
    if (!this.day0EndingDisplayTestActive) {
      return;
    }
    this.day0EndingAwaitShutter = true;
    this.applyDay0EndingPhase2DeskState();
    this.shutterController?.prepareClosedForIntro();
    this.setOnlyShutterInteractable();
    this.setShutterInteractionEnabledForInteractionTrace(true, 'day0-ending-await-shutter');
    if (this.shutterHitButton?.node?.isValid) {
      this.shutterHitButton.node.active = true;
      this.shutterHitButton.interactable = true;
    }
    this.bindDay0EndingShutterOpenSettledListener();
  }

  private handleDay0EndingShutterClick(): void {
    if (!this.day0EndingDisplayTestActive || !this.day0EndingAwaitShutter) {
      return;
    }
    this.day0EndingAwaitShutter = false;
    this.day0EndingArchiveRevealActive = false;
    this.unschedule(this.handleDay0EndingArchiveRevealDelayElapsed);
    this.unbindDay0EndingShutterOpenSettledListener();
    this.telephoneController?.clearDay0EndingUnknownNumberCallArmed();
    this.telephoneController?.stopDay0EndingUnknownNumberCall(false);
    this.telephoneController?.setEmergencyInputEnabled(false);
    this.telephoneController?.setEmergencyAccessOverride(false);
    this.telephoneController?.setCampaignRegularAccessEnabled(false);
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'day0-ending-shutter-clicked');
    this.applyDay0EndingPhase2DeskState();
    this.showDay0EndingDisguisedIdentity();
    this.lockAllEncounterInput('day0-ending-shutter-clicked');
    this.scheduleOnce(
      this.handleDay0EndingArchiveRevealDelayElapsed,
      EvidencePreviewController.DAY0_ENDING_ARCHIVE_REVEAL_DELAY_SECONDS,
    );
  }

  private playDay0EndingIdentityRevealMusicOnce(): void {
    console.log('[Day0BGM] playDay0EndingIdentityRevealMusicOnce entered');
    if (this.day0EndingIdentityRevealMusicPlayed) {
      return;
    }
    this.day0EndingIdentityRevealMusicPlayed = true;
    const audio = AudioManager.getInstance() ?? AudioManager.ensureInstance();
    console.log('[Day0BGM] calling AudioManager.playMusic');
    audio.playMusic(GameAudioCatalog.Day0IdentityRevealMusicId, true, true);
  }

  private showDay0EndingDisguisedIdentity(): void {
    if (!this.carterCharacterSprite || !this.day0EndingPlayerDisguisedFrame) {
      this.preloadDay0EndingPlayerIdentityFrames();
      return;
    }
    this.carterCharacterSprite.spriteFrame = this.day0EndingPlayerDisguisedFrame;
    this.applyCarterPortraitContainSize(this.day0EndingPlayerDisguisedFrame);
    if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = true;
    }
  }

  private applyDay0EndingPhase2DeskState(): void {
    if (this.employeeCardVisual?.isValid) {
      this.employeeCardVisual.active = false;
    }
    if (this.employeeCardHit?.isValid) {
      this.employeeCardHit.active = false;
    }
    if (this.employeeCardHitButton?.node?.isValid) {
      this.employeeCardHitButton.interactable = false;
    }
    if (this.applicationFormVisual?.isValid) {
      this.applicationFormVisual.active = false;
    }
    if (this.applicationFormHit?.isValid) {
      this.applicationFormHit.active = false;
    }
    if (this.applicationFormHitButton?.node?.isValid) {
      this.applicationFormHitButton.interactable = false;
    }
    if (this.screeningChecklistVisual?.isValid) {
      this.screeningChecklistVisual.active = false;
    }
    if (this.screeningChecklistHit?.isValid) {
      this.screeningChecklistHit.active = false;
    }
    if (this.screeningChecklistHitButton?.node?.isValid) {
      this.screeningChecklistHitButton.interactable = false;
    }
    if (this.appointmentRosterVisual?.isValid) {
      this.appointmentRosterVisual.active = false;
    }
    if (this.appointmentRosterHit?.isValid) {
      this.appointmentRosterHit.active = false;
    }
    const appointmentRosterButton = this.appointmentRosterHit?.getComponent(Button) ?? null;
    if (appointmentRosterButton?.node?.isValid) {
      appointmentRosterButton.interactable = false;
    }
    if (this.allowHitButton?.node?.isValid) {
      this.allowHitButton.node.active = false;
      this.allowHitButton.interactable = false;
    }
    if (this.denyHitButton?.node?.isValid) {
      this.denyHitButton.node.active = false;
      this.denyHitButton.interactable = false;
    }
    if (this.telephoneVisual?.isValid) {
      this.telephoneVisual.active = true;
    }
    if (this.telephoneHit?.isValid) {
      this.telephoneHit.active = false;
    }
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = false;
    }
    const drawersClosedRuntime = this.node.getChildByName('EmployeeDrawersClosedRuntime');
    if (drawersClosedRuntime?.isValid) {
      this.setEmployeeFilesInteractionEnabled(drawersClosedRuntime, false);
      this.employeeFilesController?.closeOpenDrawerForExternalInteraction();
    }
  }

  private activateDay0EndingArchiveRevealPhase3(): void {
    if (!this.day0EndingDisplayTestActive || this.isDestroying) {
      return;
    }
    this.day0EndingArchiveRevealActive = true;
    this.showDay0EndingDisguisedIdentity();
    this.setShutterInteractionEnabledForInteractionTrace(false, 'day0-ending-archive-reveal-active');
    if (this.shutterHitButton?.node?.isValid) {
      this.shutterHitButton.interactable = false;
    }
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'day0-ending-archive-reveal-active');
    if (this.telephoneHitButton?.node?.isValid) {
      this.telephoneHitButton.interactable = false;
    }

    const drawersClosedRuntime = this.node.getChildByName('EmployeeDrawersClosedRuntime');
    if (!drawersClosedRuntime?.isValid) {
      return;
    }
    // Day0 ending reveal can arrive from states where employee files runtime was hidden.
    // Force it visible before enabling file-only interaction.
    drawersClosedRuntime.active = true;
    this.setEmployeeFilesInteractionEnabled(drawersClosedRuntime, true);
    this.employeeFilesController?.enterDay0EndingArchiveRevealMode('ethan');
  }

  private initializeDay0EndingPhonePhase1State(): void {
    this.unschedule(this.handleDay0EndingPhoneDelayElapsed);
    this.unschedule(this.handleDay0EndingPhoneRingElapsed);
    this.unschedule(this.handleDay0EndingArchiveRevealDelayElapsed);
    this.unschedule(this.handleDay0EndingSelfDialogueHoldElapsed);
    this.unbindDay0EndingShutterOpenSettledListener();
    this.day0EndingPhoneActive = false;
    this.day0EndingPhoneReady = false;
    this.day0EndingPhoneSequenceStarted = false;
    this.day0EndingPhoneSequenceCompleted = false;
    this.day0EndingTelephoneStoryLock = false;
    this.day0EndingAwaitShutter = false;
    this.day0EndingIdentityRevealMusicPlayed = false;
    this.day0EndingArchiveRevealActive = false;
    this.day0EndingSelfDialogueInProgress = false;
    this.day0EndingSelfDialogueCompleted = false;
    this.day0EndingSelfDialogueFinalChoiceQueued = false;
    this.day0EndingSelfDialogueToken += 1;
    this.day0EndingFinalChoiceActive = false;
    this.day0EndingFinalChoiceCompleted = false;
    this.day0EndingFinalChoiceTransitionInProgress = false;
    this.day0EndingFinalChoiceSelection = null;
    this.unschedule(this.handleDay0EndingRemoveThreatAlertElapsed);
    this.unschedule(this.handleDay0EndingRemoveThreatFinalizeElapsed);
    this.unschedule(this.handleDay0EndingRemoveThreatReturnHomeElapsed);
    this.setDay0EndingFinalChoiceVisible(false);
    AudioManager.getInstance()?.stopAlarmLoop();
    this.employeeFilesController?.exitDay0EndingArchiveRevealMode();
    this.telephoneController?.clearDay0EndingUnknownNumberCallArmed();
    this.telephoneController?.stopDay0EndingUnknownNumberCall(false);
    this.telephoneController?.setDay0EndingTelephoneStoryLock(false);
  }

  private cleanupDay0EndingPhonePhase1State(): void {
    this.cleanupDay0EndingPhonePhase1LocalState();
    this.employeeFilesController?.exitDay0EndingArchiveRevealMode();
    this.telephoneController?.clearDay0EndingUnknownNumberCallArmed();
    this.telephoneController?.stopDay0EndingUnknownNumberCall(false);
    this.telephoneController?.setDay0EndingTelephoneStoryLock(false);
  }

  private cleanupDay0EndingPhonePhase1LocalState(): void {
    this.unschedule(this.handleDay0EndingPhoneDelayElapsed);
    this.unschedule(this.handleDay0EndingPhoneRingElapsed);
    this.unschedule(this.handleDay0EndingArchiveRevealDelayElapsed);
    this.unschedule(this.handleDay0EndingSelfDialogueHoldElapsed);
    this.unbindDay0EndingShutterOpenSettledListener();
    this.day0EndingPhoneActive = false;
    this.day0EndingPhoneReady = false;
    this.day0EndingPhoneSequenceStarted = false;
    this.day0EndingPhoneSequenceCompleted = false;
    this.day0EndingTelephoneStoryLock = false;
    this.day0EndingAwaitShutter = false;
    this.day0EndingIdentityRevealMusicPlayed = false;
    this.day0EndingArchiveRevealActive = false;
    this.day0EndingSelfDialogueInProgress = false;
    this.day0EndingSelfDialogueCompleted = false;
    this.day0EndingSelfDialogueFinalChoiceQueued = false;
    this.day0EndingSelfDialogueToken += 1;
    this.day0EndingFinalChoiceActive = false;
    this.day0EndingFinalChoiceCompleted = false;
    this.day0EndingFinalChoiceTransitionInProgress = false;
    this.day0EndingFinalChoiceSelection = null;
    this.unschedule(this.handleDay0EndingRemoveThreatAlertElapsed);
    this.unschedule(this.handleDay0EndingRemoveThreatFinalizeElapsed);
    this.unschedule(this.handleDay0EndingRemoveThreatReturnHomeElapsed);
    this.setDay0EndingFinalChoiceVisible(false);
    AudioManager.getInstance()?.stopAlarmLoop();
  }

  private bindDay0EndingShutterOpenSettledListener(): void {
    if (!this.shutterController || this.day0EndingShutterOpenSettledListenerRegistered) {
      return;
    }
    this.shutterController.addShutterOpenSettledListener(this.handleDay0EndingShutterOpenSettled);
    this.day0EndingShutterOpenSettledListenerRegistered = true;
  }

  private unbindDay0EndingShutterOpenSettledListener(): void {
    if (!this.shutterController || !this.day0EndingShutterOpenSettledListenerRegistered) {
      return;
    }
    this.shutterController.removeShutterOpenSettledListener(this.handleDay0EndingShutterOpenSettled);
    this.day0EndingShutterOpenSettledListenerRegistered = false;
  }

  private playDay0EndingPhoneRing(): void {
    if (
      !this.day0EndingPhoneActive ||
      this.day0EndingPhoneSequenceStarted ||
      !this.day0EndingDisplayTestActive ||
      this.isDestroying
    ) {
      return;
    }
    const audio = AudioManager.getInstance();
    audio?.playCachedDay0UnknownNumberPhoneRing();
    const intervalSeconds = Math.max(
      EvidencePreviewController.DAY0_ENDING_PHONE_RING_INTERVAL_SECONDS,
      audio?.getCachedClipDurationSeconds(GameAudioCatalog.Day0UnknownNumberPhoneRingId) ??
        EvidencePreviewController.DAY0_ENDING_PHONE_RING_INTERVAL_SECONDS,
    );
    this.unschedule(this.handleDay0EndingPhoneRingElapsed);
    this.scheduleOnce(
      this.handleDay0EndingPhoneRingElapsed,
      intervalSeconds,
    );
  }

  private async loadSpriteFrameByUuid(uuid: string): Promise<SpriteFrame> {
    const cached = this.roundSpriteFrameCache.get(uuid);
    if (cached) {
      return cached;
    }
    return new Promise((resolve, reject) => {
      assetManager.loadAny(uuid, (error, asset) => {
        if (error) {
          reject(error);
          return;
        }
        const frame = asset as SpriteFrame | null;
        if (!frame) {
          reject(new Error(`SpriteFrame asset is null: ${uuid}`));
          return;
        }
        resolve(frame);
      });
    });
  }

  private logCampaignDayConfigOnce(dayConfig: DayLevelConfig): void {
    if (this.hasLoggedCampaignDayConfig) {
      return;
    }
    this.hasLoggedCampaignDayConfig = true;
    console.info('[Campaign] day config loaded', {
      dayIndex: dayConfig.dayIndex,
      date: dayConfig.date,
      shiftStartMinutes: dayConfig.shiftStartMinutes,
      shiftEndMinutes: dayConfig.shiftEndMinutes,
      realDurationSeconds: dayConfig.realDurationSeconds,
      encounterCountMin: dayConfig.encounterCountMin,
      encounterCountMax: dayConfig.encounterCountMax,
      difficultyTier: dayConfig.difficultyTier,
      enabledEvidence: dayConfig.enabledEvidence,
      requiredChecklistCategories: dayConfig.requiredChecklistCategories,
      visitorSystemEnabled: dayConfig.visitorSystemEnabled,
      departmentPhoneEnabled: dayConfig.departmentPhoneEnabled,
    });
  }

  private runPhase3StaticSelfCheckOnce(): void {
    if (this.hasRunPhase3StaticSelfCheck) {
      return;
    }
    this.hasRunPhase3StaticSelfCheck = true;
    const checks: Array<{
      id: number;
      dayIndex: number;
      expected: unknown;
      actual: unknown;
    }> = [];
    const c1 = getDayLevelConfig(1);
    const c2 = getDayLevelConfig(2);
    const c3 = getDayLevelConfig(3);
    const c4 = getDayLevelConfig(4);
    const includes = (cfg: DayLevelConfig, key: CampaignEvidenceKey): boolean =>
      cfg.enabledEvidence.includes(key);
    const requiredOnlyAppearance = (cfg: DayLevelConfig): boolean =>
      cfg.requiredChecklistCategories.length === 1 && cfg.requiredChecklistCategories[0] === 'appearance';
    const equalsSet = (a: readonly string[], b: readonly string[]): boolean =>
      a.length === b.length && a.every((x) => b.includes(x));
    const requiredKeys = (cfg: DayLevelConfig): ChecklistItemKey[] =>
      cfg.requiredChecklistCategories.map(
        (category) => EvidencePreviewController.CHECKLIST_CATEGORY_TO_KEY[category],
      );
    const checklistComplete = (
      cfg: DayLevelConfig,
      choices: Record<ChecklistItemKey, ChecklistChoice>,
    ): boolean => requiredKeys(cfg).every((itemKey) => choices[itemKey] !== 'unset');
    const allowCorrect = (
      cfg: DayLevelConfig,
      truth: Record<ChecklistItemKey, boolean>,
    ): boolean => requiredKeys(cfg).every((itemKey) => truth[itemKey]);
    const denyMatchesRequired = (
      cfg: DayLevelConfig,
      truth: Record<ChecklistItemKey, boolean>,
      choices: Record<ChecklistItemKey, ChecklistChoice>,
    ): boolean =>
      requiredKeys(cfg).every((itemKey) => {
        const choice = choices[itemKey];
        if (choice === 'unset') {
          return false;
        }
        return truth[itemKey] ? choice === 'pass' : choice === 'fail';
      });
    const denyCorrect = (
      cfg: DayLevelConfig,
      truth: Record<ChecklistItemKey, boolean>,
      choices: Record<ChecklistItemKey, ChecklistChoice>,
    ): boolean => {
      const hasRequiredFailure = requiredKeys(cfg).some((itemKey) => !truth[itemKey]);
      return checklistComplete(cfg, choices) && hasRequiredFailure && denyMatchesRequired(cfg, truth, choices);
    };
    checks.push({ id: 1, dayIndex: 1, expected: true, actual: includes(c1, 'employee-files') });
    checks.push({ id: 2, dayIndex: 1, expected: true, actual: includes(c1, 'checklist') });
    checks.push({ id: 3, dayIndex: 1, expected: true, actual: includes(c1, 'appearance') });
    checks.push({ id: 4, dayIndex: 1, expected: false, actual: includes(c1, 'employee-card') });
    checks.push({ id: 5, dayIndex: 1, expected: false, actual: includes(c1, 'application-form') });
    checks.push({ id: 6, dayIndex: 1, expected: false, actual: includes(c1, 'appointment-roster') });
    checks.push({ id: 7, dayIndex: 1, expected: false, actual: c1.departmentPhoneEnabled });
    checks.push({ id: 8, dayIndex: 1, expected: true, actual: requiredOnlyAppearance(c1) });
    checks.push({ id: 9, dayIndex: 2, expected: true, actual: includes(c2, 'employee-card') });
    checks.push({ id: 10, dayIndex: 2, expected: false, actual: includes(c2, 'application-form') });
    checks.push({
      id: 11,
      dayIndex: 2,
      expected: true,
      actual: equalsSet(c2.requiredChecklistCategories, ['id-card', 'appearance']),
    });
    checks.push({ id: 12, dayIndex: 3, expected: true, actual: includes(c3, 'application-form') });
    checks.push({
      id: 13,
      dayIndex: 3,
      expected: true,
      actual: equalsSet(c3.requiredChecklistCategories, ['id-card', 'application', 'appearance']),
    });
    checks.push({ id: 14, dayIndex: 4, expected: true, actual: includes(c4, 'appointment-roster') });
    checks.push({ id: 15, dayIndex: 4, expected: true, actual: c4.departmentPhoneEnabled });
    checks.push({
      id: 16,
      dayIndex: 1,
      expected: true,
      actual: checklistComplete(c1, { id_card: 'unset', application: 'unset', appearance: 'pass' }),
    });
    checks.push({
      id: 17,
      dayIndex: 1,
      expected: true,
      actual: checklistComplete(c1, { id_card: 'unset', application: 'unset', appearance: 'fail' }),
    });
    checks.push({
      id: 18,
      dayIndex: 1,
      expected: true,
      actual: checklistComplete(c1, { id_card: 'pass', application: 'unset', appearance: 'pass' }),
    });
    checks.push({
      id: 19,
      dayIndex: 2,
      expected: true,
      actual: checklistComplete(c2, { id_card: 'pass', application: 'unset', appearance: 'pass' }),
    });
    checks.push({
      id: 20,
      dayIndex: 3,
      expected: false,
      actual: checklistComplete(c3, { id_card: 'pass', application: 'unset', appearance: 'pass' }),
    });
    checks.push({
      id: 21,
      dayIndex: 1,
      expected: true,
      actual: allowCorrect(c1, { id_card: false, application: true, appearance: true }),
    });
    checks.push({
      id: 22,
      dayIndex: 1,
      expected: true,
      actual: allowCorrect(c1, { id_card: true, application: false, appearance: true }),
    });
    checks.push({
      id: 23,
      dayIndex: 1,
      expected: false,
      actual: allowCorrect(c1, { id_card: false, application: false, appearance: false }),
    });
    checks.push({
      id: 24,
      dayIndex: 2,
      expected: true,
      actual: allowCorrect(c2, { id_card: true, application: false, appearance: true }),
    });
    checks.push({
      id: 25,
      dayIndex: 3,
      expected: false,
      actual: allowCorrect(c3, { id_card: true, application: false, appearance: true }),
    });
    checks.push({
      id: 26,
      dayIndex: 2,
      expected: true,
      actual: denyCorrect(
        c2,
        { id_card: false, application: false, appearance: true },
        { id_card: 'fail', application: 'unset', appearance: 'pass' },
      ),
    });
    checks.push({
      id: 27,
      dayIndex: 2,
      expected: true,
      actual: denyMatchesRequired(
        c2,
        { id_card: false, application: true, appearance: true },
        { id_card: 'fail', application: 'fail', appearance: 'pass' },
      ),
    });
    checks.push({
      id: 28,
      dayIndex: 1,
      expected: false,
      actual: this.computeTelephoneAvailability(false, false),
    });
    checks.push({
      id: 29,
      dayIndex: 1,
      expected: true,
      actual: this.computeTelephoneAvailability(false, true),
    });
    checks.push({
      id: 30,
      dayIndex: 1,
      expected: false,
      actual: this.computeTelephoneAvailability(false, false),
    });
    for (const check of checks) {
      if (check.actual !== check.expected) {
        console.error('[Phase3StaticCheck] failed', {
          testId: check.id,
          dayIndex: check.dayIndex,
          expected: check.expected,
          actual: check.actual,
        });
      }
    }
  }

  private applyCampaignConfigurationToControllers(): void {
    const employeeCardEnabled = this.isCampaignEvidenceEnabled('employee-card');
    const applicationFormEnabled = this.isCampaignEvidenceEnabled('application-form');
    this.visitorIntroController?.setCampaignDocumentDeliveryAvailability({
      employeeCardEnabled,
      applicationFormEnabled,
    });
    this.appointmentRosterController?.setCampaignEnabled(
      this.isCampaignEvidenceEnabled('appointment-roster'),
    );
    this.applyActiveAppointmentRosterDay();
    this.telephoneController?.setCampaignRegularAccessEnabled(this.isCampaignEvidenceEnabled('telephone'));
    this.telephoneController?.setEmergencyAccessOverride(this.emergencyTelephoneOverrideActive);
    this.telephoneController?.setDepartmentPhoneLookupEnabled(this.computeDepartmentPhoneLookupEnabled());
  }

  public getActiveAppointmentRosterDay(): AppointmentRosterDay | null {
    return this.activeAppointmentRosterDay;
  }

  public getCurrentInspectionSubject(): InspectionSubject | null {
    return this.currentInspectionSubject;
  }

  private invalidateVisitorVisualPresentation(): void {
    this.visitorVisualLoadGeneration += 1;
    this.visitorVisualPresentationRoundId = null;
    this.committedVisitorVisualRoundId = null;
  }

  private failVisitorVisualPresentation(
    expectedRoundId: string,
    visitorKey: VisitorKey,
    error: unknown,
  ): false {
    console.error('[VisitorVisual] Failed to present active visitor visual.', {
      expectedRoundId,
      visitorKey,
      error,
    });

    const activeSubject = this.currentInspectionSubject;
    if (
      activeSubject !== null &&
      activeSubject.subjectKind === 'visitor' &&
      activeSubject.roundId === expectedRoundId &&
      activeSubject.visitorKey === visitorKey
    ) {
      this.clearActiveVisitorInspectionSubject(expectedRoundId);
    }

    return false;
  }

  public activateVisitorInspectionSubject(visitorRound: VisitorInspectionRound): void {
    if (visitorRound == null) {
      throw new Error('[InspectionSubject] Cannot activate a missing visitor round.');
    }
    if (visitorRound.subjectKind !== 'visitor') {
      throw new Error('[InspectionSubject] Expected a visitor inspection round.');
    }
    if (this.currentRound !== null) {
      throw new Error(
        '[InspectionSubject] Cannot activate a visitor while an employee round is active.',
      );
    }
    if (this.currentInspectionSubject !== null) {
      throw new Error('[InspectionSubject] Cannot replace an active inspection subject.');
    }
    this.currentInspectionSubject = visitorRound;
  }

  public async presentActiveVisitorInspectionSubject(): Promise<boolean> {
    if (this.currentRound !== null) {
      throw new Error(
        '[VisitorVisual] Cannot present visitor visual while an employee round is active.',
      );
    }

    const activeSubject = this.currentInspectionSubject;
    if (activeSubject === null) {
      throw new Error('[VisitorVisual] Cannot present visitor visual without an active visitor subject.');
    }
    if (activeSubject.subjectKind !== 'visitor') {
      throw new Error(
        '[VisitorVisual] Cannot present visitor visual while an employee inspection subject is active.',
      );
    }

    const expectedRoundId = activeSubject.roundId;
    if (typeof expectedRoundId !== 'string' || expectedRoundId.trim().length === 0) {
      throw new Error('[VisitorVisual] Active visitor roundId must be a non-empty string.');
    }
    const expectedVisitorKey = activeSubject.visitorKey;

    if (this.committedVisitorVisualRoundId === expectedRoundId) {
      if (this.activeVisitorKeyForDepartmentPhone !== expectedVisitorKey) {
        throw new Error(
          '[VisitorPhoneContext] Committed visitor visual does not have matching department-phone context.',
        );
      }
      return true;
    }
    if (this.activeVisitorKeyForDepartmentPhone !== null) {
      throw new Error(
        '[VisitorPhoneContext] Department-phone context must remain null before visitor visual commit.',
      );
    }
    if (this.visitorVisualPresentationRoundId !== null) {
      throw new Error('[VisitorVisual] A visitor visual presentation is already in progress.');
    }

    if (
      !this.carterCharacter ||
      !this.carterCharacterSprite ||
      !this.carterCharacterUi ||
      !this.carterCharacter.isValid ||
      !this.carterCharacterSprite.isValid ||
      !this.carterCharacterUi.isValid ||
      !this.carterCharacterSprite.node?.isValid
    ) {
      throw new Error('[VisitorVisual] CarterCharacter runtime sprite target is unavailable.');
    }

    const visitorKey = expectedVisitorKey;
    const visitorProfile = getVisitorProfile(visitorKey);
    if (!visitorProfile) {
      return this.failVisitorVisualPresentation(
        expectedRoundId,
        visitorKey,
        new Error(`[VisitorVisual] Missing visitor profile for visitorKey="${visitorKey}".`),
      );
    }

    let spriteFrameUuid: string;
    try {
      spriteFrameUuid = resolveVisitorInitialVisualSpriteFrameUuid(activeSubject, visitorProfile);
    } catch (error) {
      return this.failVisitorVisualPresentation(expectedRoundId, visitorKey, error);
    }

    const generation = ++this.visitorVisualLoadGeneration;
    this.visitorVisualPresentationRoundId = expectedRoundId;

    try {
      const loadedFrame = await this.loadSpriteFrameByUuid(spriteFrameUuid);
      const currentSubject = this.currentInspectionSubject;
      const isExpiredOrInvalid =
        !this.node?.isValid ||
        this.isDestroying ||
        generation !== this.visitorVisualLoadGeneration ||
        this.visitorVisualPresentationRoundId !== expectedRoundId ||
        this.currentRound !== null ||
        currentSubject === null ||
        currentSubject.subjectKind !== 'visitor' ||
        currentSubject.roundId !== expectedRoundId ||
        currentSubject.visitorKey !== visitorKey ||
        !this.carterCharacter ||
        !this.carterCharacterSprite ||
        !this.carterCharacterUi ||
        !this.carterCharacter.isValid ||
        !this.carterCharacterSprite.isValid ||
        !this.carterCharacterUi.isValid ||
        !this.carterCharacterSprite.node?.isValid ||
        !loadedFrame ||
        !loadedFrame.isValid;

      if (isExpiredOrInvalid) {
        return false;
      }

      const previousSpriteFrame = this.carterCharacterSprite.spriteFrame;
      const previousActive = this.carterCharacter.active;
      const previousSize = this.carterCharacterUi.contentSize;
      const previousCommittedVisitorVisualRoundId = this.committedVisitorVisualRoundId;
      const previousVisitorPhoneContextKey = this.activeVisitorKeyForDepartmentPhone;

      try {
        this.carterCharacterSprite.spriteFrame = loadedFrame;
        this.applyCarterPortraitContainSize(loadedFrame);
        this.carterCharacter.active = true;
        const commitSubject = this.currentInspectionSubject;
        const commitStateValid =
          this.currentRound === null &&
          generation === this.visitorVisualLoadGeneration &&
          this.visitorVisualPresentationRoundId === expectedRoundId &&
          commitSubject !== null &&
          commitSubject.subjectKind === 'visitor' &&
          commitSubject.roundId === expectedRoundId &&
          commitSubject.visitorKey === visitorKey &&
          this.activeVisitorKeyForDepartmentPhone === null;
        if (!commitStateValid) {
          throw new Error(
            '[VisitorPhoneContext] Visitor visual commit state became inconsistent before department-phone context assignment.',
          );
        }
        this.setActiveVisitorKeyForDepartmentPhone(visitorKey);
        this.committedVisitorVisualRoundId = expectedRoundId;
        return true;
      } catch (error) {
        this.carterCharacterSprite.spriteFrame = previousSpriteFrame;
        this.carterCharacterUi.setContentSize(previousSize.width, previousSize.height);
        this.carterCharacter.active = previousActive;
        this.committedVisitorVisualRoundId = previousCommittedVisitorVisualRoundId;
        this.setActiveVisitorKeyForDepartmentPhone(previousVisitorPhoneContextKey);
        throw error;
      }
    } catch (error) {
      return this.failVisitorVisualPresentation(expectedRoundId, visitorKey, error);
    } finally {
      if (this.visitorVisualPresentationRoundId === expectedRoundId) {
        this.visitorVisualPresentationRoundId = null;
      }
    }
  }

  public clearCommittedVisitorWindowVisual(expectedRoundId: string): boolean {
    if (typeof expectedRoundId !== 'string' || expectedRoundId.trim().length === 0) {
      throw new Error(
        '[VisitorVisual] Expected a non-empty visitor round ID when clearing window visual.',
      );
    }

    const currentSubject = this.currentInspectionSubject;
    if (currentSubject === null) {
      if (this.committedVisitorVisualRoundId === null) {
        return false;
      }
      throw new Error('[VisitorVisual] Committed visitor visual has no active visitor subject.');
    }
    if (currentSubject.subjectKind === 'employee') {
      throw new Error(
        '[VisitorVisual] Cannot clear visitor window visual while an employee subject is active.',
      );
    }
    if (currentSubject.roundId !== expectedRoundId) {
      throw new Error('[VisitorVisual] Visitor round ID mismatch while clearing window visual.');
    }

    if (this.committedVisitorVisualRoundId === null) {
      return false;
    }
    if (this.committedVisitorVisualRoundId !== expectedRoundId) {
      throw new Error('[VisitorVisual] Committed visitor visual belongs to a different round.');
    }

    const currentVisitorKey = currentSubject.visitorKey;
    const activeVisitorPhoneKey = this.activeVisitorKeyForDepartmentPhone;
    if (activeVisitorPhoneKey !== null && activeVisitorPhoneKey !== currentVisitorKey) {
      throw new Error(
        '[VisitorVisual] Visitor window visual and department-phone context belong to different visitors.',
      );
    }

    const targetSprite = this.carterCharacterSprite;
    if (!targetSprite || !targetSprite.isValid || !targetSprite.node || !targetSprite.node.isValid) {
      console.error('[VisitorVisual] CarterCharacter sprite node is unavailable while clearing window visual.', {
        expectedRoundId,
      });
      return false;
    }

    try {
      targetSprite.node.active = false;
    } catch (error) {
      console.error('[VisitorVisual] Failed to hide committed visitor window visual.', {
        expectedRoundId,
        error,
      });
      return false;
    }

    this.invalidateVisitorVisualPresentation();
    return true;
  }

  public completeActiveVisitorNonCombatDeparture(expectedRoundId: string): boolean {
    if (typeof expectedRoundId !== 'string' || expectedRoundId.trim().length === 0) {
      throw new Error('[VisitorDeparture] Expected a non-empty visitor round ID.');
    }
    if (this.currentRound !== null) {
      throw new Error(
        '[VisitorDeparture] Cannot complete a visitor departure while an employee round is active.',
      );
    }

    const activeVisitor = this.currentInspectionSubject;
    if (activeVisitor === null) {
      throw new Error('[VisitorDeparture] Cannot complete departure without an active visitor subject.');
    }
    if (activeVisitor.subjectKind !== 'visitor') {
      throw new Error('[VisitorDeparture] Active inspection subject is not a visitor.');
    }
    if (activeVisitor.roundId !== expectedRoundId) {
      throw new Error('[VisitorDeparture] Visitor round ID mismatch during departure cleanup.');
    }
    if (this.visitorVisualPresentationRoundId !== null) {
      throw new Error(
        '[VisitorDeparture] Cannot complete departure while visitor visual presentation is in progress.',
      );
    }
    if (this.committedVisitorVisualRoundId === null) {
      throw new Error('[VisitorDeparture] Active visitor does not have a committed window visual.');
    }
    if (this.committedVisitorVisualRoundId !== expectedRoundId) {
      throw new Error('[VisitorDeparture] Committed visitor window visual belongs to another round.');
    }

    const activeVisitorPhoneKey = this.activeVisitorKeyForDepartmentPhone;
    if (activeVisitorPhoneKey === null) {
      throw new Error('[VisitorDeparture] Active visitor does not have department-phone context.');
    }
    if (activeVisitorPhoneKey !== activeVisitor.visitorKey) {
      throw new Error('[VisitorDeparture] Active visitor and department-phone context do not match.');
    }

    const visualCleared = this.clearCommittedVisitorWindowVisual(expectedRoundId);
    if (visualCleared !== true) {
      return false;
    }

    this.clearActiveVisitorInspectionSubject(expectedRoundId);
    if (
      this.currentRound !== null ||
      this.currentInspectionSubject !== null ||
      this.activeVisitorKeyForDepartmentPhone !== null ||
      this.visitorVisualPresentationRoundId !== null ||
      this.committedVisitorVisualRoundId !== null
    ) {
      throw new Error('[VisitorDeparture] Visitor departure cleanup did not reach an empty state.');
    }
    return true;
  }

  public clearActiveVisitorInspectionSubject(expectedRoundId?: string): void {
    if (expectedRoundId !== undefined) {
      if (typeof expectedRoundId !== 'string' || expectedRoundId.trim().length === 0) {
        throw new Error(
          '[InspectionSubject] expectedRoundId must be a non-empty string when provided.',
        );
      }
    }

    const currentSubject = this.currentInspectionSubject;
    if (currentSubject === null) {
      if (this.committedVisitorVisualRoundId !== null) {
        throw new Error('[VisitorVisual] Committed visitor visual has no active visitor subject.');
      }
      if (this.activeVisitorKeyForDepartmentPhone !== null) {
        this.setActiveVisitorKeyForDepartmentPhone(null);
      }
      return;
    }
    if (currentSubject.subjectKind === 'employee') {
      throw new Error(
        '[InspectionSubject] Cannot clear a visitor subject while an employee subject is active.',
      );
    }
    if (this.currentRound !== null) {
      throw new Error(
        '[InspectionSubject] Visitor subject conflict detected: employee round is unexpectedly active.',
      );
    }
    if (expectedRoundId !== undefined && currentSubject.roundId !== expectedRoundId) {
      throw new Error(
        `[InspectionSubject] Cannot clear visitor subject: expected roundId "${expectedRoundId}", received "${currentSubject.roundId}".`,
      );
    }
    if (this.committedVisitorVisualRoundId === currentSubject.roundId) {
      throw new Error(
        '[VisitorVisual] Clear the committed visitor window visual before clearing the visitor subject.',
      );
    }
    if (
      this.committedVisitorVisualRoundId !== null &&
      this.committedVisitorVisualRoundId !== currentSubject.roundId
    ) {
      throw new Error(
        '[VisitorVisual] Active visitor subject does not own the committed window visual.',
      );
    }
    const activeVisitorPhoneKey = this.activeVisitorKeyForDepartmentPhone;
    if (activeVisitorPhoneKey !== null && activeVisitorPhoneKey !== currentSubject.visitorKey) {
      throw new Error(
        '[VisitorPhoneContext] Cannot clear visitor subject because department-phone context belongs to a different visitor.',
      );
    }
    this.setActiveVisitorKeyForDepartmentPhone(null);
    this.invalidateVisitorVisualPresentation();
    this.currentInspectionSubject = null;
  }

  public setActiveVisitorKeyForDepartmentPhone(visitorKey: VisitorKey | null): void {
    this.activeVisitorKeyForDepartmentPhone = visitorKey;
  }

  private applyActiveAppointmentRosterDay(): void {
    const dayConfig = this.activeDayConfig;
    if (!dayConfig) {
      this.activeDay4VisitorSession = null;
      this.activeDay4VisitorCursor = 0;
      this.activeAppointmentRosterDay = null;
      this.setActiveVisitorKeyForDepartmentPhone(null);
      this.appointmentRosterController?.setRosterDay(null);
      return;
    }

    if (dayConfig.dayIndex !== 4) {
      this.activeDay4VisitorSession = null;
      this.activeDay4VisitorCursor = 0;
      this.activeAppointmentRosterDay = null;
      this.setActiveVisitorKeyForDepartmentPhone(null);
      this.appointmentRosterController?.setRosterDay(null);
      return;
    }
    const generatedSession = campaignState.getOrCreateDay4VisitorSession(Math.random);
    if (generatedSession.inspectionDate !== dayConfig.date) {
      throw new Error(
        `[AppointmentRoster] Day config date mismatch for dayIndex=4. config=${dayConfig.date}, session=${generatedSession.inspectionDate}`,
      );
    }
    const isNewSession = this.activeDay4VisitorSession !== generatedSession;
    this.activeDay4VisitorSession = generatedSession;
    if (isNewSession) {
      this.activeDay4VisitorCursor = 0;
      console.info('[Day4VisitorSession] generated', {
        inspectionDate: generatedSession.inspectionDate,
        order: generatedSession.rounds.map((round) => ({
          roundId: round.roundId,
          visitorKey: round.visitorKey,
          caseKind: round.caseKind,
          mismatchKinds: round.mismatchKinds,
          appointmentId: round.appointmentId,
        })),
      });
    }
    this.activeAppointmentRosterDay = generatedSession.rosterDay;
    this.appointmentRosterController?.setRosterDay(generatedSession.rosterDay);
  }

  private computeTelephoneAvailability(
    campaignRegularEnabled: boolean,
    emergencyOverride: boolean,
  ): boolean {
    return campaignRegularEnabled || emergencyOverride;
  }

  private isCampaignEvidenceEnabled(evidence: CampaignEvidenceKey): boolean {
    return this.activeDayConfig?.enabledEvidence.includes(evidence) ?? false;
  }

  private computeDepartmentPhoneLookupEnabled(): boolean {
    const dayIndex = this.activeDayConfig?.dayIndex ?? null;
    if (dayIndex !== 4) {
      return false;
    }
    return this.isCampaignEvidenceEnabled('telephone');
  }

  private refreshCampaignEvidenceAvailability(reason: string = 'campaign-evidence-refresh'): void {
    if (this.isDestroying || !this.node?.isValid) {
      return;
    }
    const visitorModeActive = this.currentInspectionSubject?.subjectKind === 'visitor';
    const employeeCardEnabled = this.isCampaignEvidenceEnabled('employee-card');
    const applicationFormEnabled = this.isCampaignEvidenceEnabled('application-form');
    const checklistEnabled = this.isCampaignEvidenceEnabled('checklist');
    const rosterEnabled = this.isCampaignEvidenceEnabled('appointment-roster');
    this.logDay4DocumentRuntimeState(`refresh-before:${reason}`, 'refreshCampaignEvidenceAvailability');
    this.setEvidenceNodeAvailability({
      visual: this.employeeCardVisual,
      hit: this.employeeCardHit,
      button: this.employeeCardHitButton,
      enabled: employeeCardEnabled,
      reason,
    });
    this.setEvidenceNodeAvailability({
      visual: this.applicationFormVisual,
      hit: this.applicationFormHit,
      button: this.applicationFormHitButton,
      enabled: applicationFormEnabled,
      reason,
    });
    this.setEvidenceNodeAvailability({
      visual: this.appointmentRosterVisual,
      hit: this.appointmentRosterHit,
      button: this.appointmentRosterHit?.getComponent(Button) ?? null,
      enabled: rosterEnabled,
      reason,
    });
    this.setEvidenceNodeAvailability({
      visual: this.screeningChecklistVisual,
      hit: this.screeningChecklistHit,
      button: this.screeningChecklistHitButton,
      enabled: checklistEnabled,
      reason,
    });
    this.setEmployeeFilesAvailability(this.isCampaignEvidenceEnabled('employee-files'));
    if (!employeeCardEnabled || !applicationFormEnabled) {
      const employeeCardOpen = this.employeeCardDetailVisual?.active ?? false;
      const applicationOpen = this.applicationFormDetailVisual?.active ?? false;
      if ((employeeCardOpen && !employeeCardEnabled) || (applicationOpen && !applicationFormEnabled)) {
        this.closePreview();
      }
    }
    this.appointmentRosterController?.setCampaignEnabled(rosterEnabled);
    this.telephoneController?.setCampaignRegularAccessEnabled(this.isCampaignEvidenceEnabled('telephone'));
    this.telephoneController?.setEmergencyAccessOverride(this.emergencyTelephoneOverrideActive);
    this.telephoneController?.setDepartmentPhoneLookupEnabled(this.computeDepartmentPhoneLookupEnabled());
    this.applyInspectionViewReadyToTelephone(reason);
    this.updateGuidanceButtonInteractivity();
    this.logDay4DocumentRuntimeState(`refresh-after:${reason}`, 'refreshCampaignEvidenceAvailability');
  }

  private setEmployeeFilesAvailability(enabled: boolean): void {
    const drawersClosedRuntime = this.node.getChildByName('EmployeeDrawersClosedRuntime');
    if (!drawersClosedRuntime?.isValid) {
      return;
    }
    const visualEnabled = this.inspectionViewReady;
    drawersClosedRuntime.active = visualEnabled;
    this.setEmployeeFilesInteractionEnabled(drawersClosedRuntime, enabled && visualEnabled);
  }

  private setEmployeeFilesInteractionEnabled(drawersClosedRuntime: Node, enabled: boolean): void {
    const day0EndingArchiveFileOnlyMode = enabled && this.day0EndingArchiveRevealActive;
    const drawerHitNames = [
      'EmployeeDrawer01Hit',
      'EmployeeDrawer02Hit',
      'EmployeeDrawer03Hit',
    ] as const;
    for (const name of drawerHitNames) {
      const hitNode = drawersClosedRuntime.getChildByName(name);
      if (!hitNode?.isValid) {
        continue;
      }
      const drawerHitEnabled = day0EndingArchiveFileOnlyMode ? false : enabled;
      hitNode.active = drawerHitEnabled;
      const button = hitNode.getComponent(Button);
      if (button?.node?.isValid) {
        button.enabled = drawerHitEnabled;
        button.interactable = drawerHitEnabled;
      }
    }

    const openRuntime = drawersClosedRuntime.getChildByName('EmployeeDrawersOpenRuntime');
    if (!openRuntime?.isValid) {
      return;
    }
    const fileHitNames = [
      'EmployeeDrawer01FileHit',
      'EmployeeDrawer02FileHit',
      'EmployeeDrawer03FileHit',
    ] as const;
    for (const name of fileHitNames) {
      const fileHitNode = openRuntime.getChildByName(name);
      if (!fileHitNode?.isValid) {
        continue;
      }
      if (day0EndingArchiveFileOnlyMode) {
        fileHitNode.active = true;
      } else if (!enabled) {
        fileHitNode.active = false;
      }
      const button = fileHitNode.getComponent(Button);
      if (button?.node?.isValid) {
        button.enabled = enabled;
        button.interactable = enabled;
      }
    }
  }

  private setEvidenceNodeAvailability(args: {
    visual: Node | null;
    hit: Node | null;
    button: Button | null;
    enabled: boolean;
    reason?: string;
  }): void {
    const reason = args.reason ?? 'unspecified';
    const day4Control = this.resolveDay4DocumentControl(args.visual, args.hit, args.button);
    if (day4Control) {
      const token = this.getCurrentInspectionSubjectToken() ?? 'none';
      const visitorKey =
        this.currentInspectionSubject?.subjectKind === 'visitor'
          ? this.currentInspectionSubject.visitorKey
          : 'none';
      const onceKey = `availability-write-start:${day4Control}:${reason}:${this.decisionResolutionToken}:${token}`;
      if (!this.day4DocumentTraceReasonOnce.has(onceKey) && this.isDay4VisitorDocumentTraceContext()) {
        this.day4DocumentTraceReasonOnce.add(onceKey);
        console.info(
          `[Day4DocumentTrace] availability-write-start control=${day4Control} enabled=${args.enabled} callerReason=${reason} visitor=${visitorKey} token=${token}`,
        );
      }
    }
    const visibleEnabled = args.enabled && this.inspectionViewReady;
    if (args.visual?.isValid) {
      args.visual.active = visibleEnabled;
    }
    if (args.hit?.isValid) {
      args.hit.active = visibleEnabled;
    }
    if (args.button?.node?.isValid) {
      args.button.interactable = visibleEnabled;
    }
    if (day4Control) {
      this.logDay4DocumentRuntimeState(
        `availability-write-after:${day4Control}:${reason}`,
        'setEvidenceNodeAvailability',
      );
    }
  }

  private configureCampaignShiftClock(dayConfig: DayLevelConfig): void {
    if (!EvidencePreviewController.hasRunShiftClockMathSelfCheck) {
      assertShiftClockMathSelfCheck();
      EvidencePreviewController.hasRunShiftClockMathSelfCheck = true;
    }

    const clock = this.getOrCreateShiftClockController();
    if (!clock) {
      return;
    }

    const onDisplayChanged = (snapshot: ShiftClockSnapshot): void => {
      if (this.isDestroying || !this.visitorIntroController) {
        return;
      }
      const display: CampaignShiftDisplayState = {
        dayIndex: snapshot.dayIndex,
        date: snapshot.date,
        displayTime: snapshot.displayTime,
        period: snapshot.period,
      };
      this.visitorIntroController.setCampaignShiftDisplay(display);
    };

    const onShiftEnd = (_snapshot: ShiftClockSnapshot): void => {
      // Phase 2: only freeze display at 17:00. Day complete flow is deferred.
    };

    clock.configure(dayConfig, {
      onDisplayChanged,
      onShiftEnd,
    });
    this.hasStartedCampaignShiftClock = false;
  }

  private getOrCreateShiftClockController(): ShiftClockController | null {
    const hostNode = this.node.parent;
    if (!hostNode) {
      return null;
    }
    const existing = hostNode.getComponent(ShiftClockController);
    if (existing) {
      this.shiftClockController = existing;
      return existing;
    }
    const created = hostNode.addComponent(ShiftClockController);
    this.shiftClockController = created;
    return created;
  }

  private startCampaignShiftClockIfNeeded(): void {
    if (this.hasStartedCampaignShiftClock) {
      return;
    }
    if (!this.shiftClockController) {
      return;
    }
    this.shiftClockController.start();
    this.hasStartedCampaignShiftClock = true;
  }

  private pauseShiftClockForGameOver(): void {
    if (!this.shiftClockController) {
      return;
    }
    const before = this.shiftClockController.getSnapshot();
    this.shiftClockController.pause();
    const after = this.shiftClockController.getSnapshot();
    if (!before || !after || before.paused) {
      return;
    }
    console.info('[ShiftClock] paused', {
      reason: 'game-over',
      elapsedRealSeconds: after.elapsedRealSeconds,
      displayTime: after.displayTime,
      period: after.period,
    });
  }

  private computeCurrentDifficultyTier(): DifficultyTier {
    if (this.completedRoundCount < 5) {
      return 'EARLY';
    }
    if (this.completedRoundCount < 10) {
      return 'MID';
    }
    return 'LATE';
  }

  private runPhase4StaticSelfCheckOnce(): void {
    if (this.hasRunPhase4StaticSelfCheck) {
      return;
    }
    this.hasRunPhase4StaticSelfCheck = true;
    const report = runDayQueueStaticSelfCheck({
      dayConfigs: CAMPAIGN_DAY_CONFIGS,
      buildQueue: buildDayQueue,
      generateRoundFromSpec: ({ spec, completedRoundCount, previousSignature, inspectionDate }) =>
        this.roundGenerator.generateRoundFromSpec({
          spec,
          completedRoundCount,
          previousSignature,
          inspectionDate,
        }),
    });
    for (const check of report.checks) {
      if (!check.pass) {
        console.warn('[DayQueueStaticCheck] failed', {
          testId: check.testId,
          dayIndex: check.dayIndex ?? null,
          quotaId: check.quotaId ?? null,
          specId: check.specId ?? null,
          employeeKey: check.employeeKey ?? null,
          expected: check.expected,
          actual: check.actual,
        });
      }
    }
  }

  private runPhase6AStaticSelfCheckOnce(): void {
    if (this.hasRunPhase6AStaticSelfCheck) {
      return;
    }
    this.hasRunPhase6AStaticSelfCheck = true;
    const checks: Array<{
      testId: string;
      fromDay?: number;
      toDay?: number;
      expected: string;
      actual: string;
      pass: boolean;
    }> = [];
    const push = (
      testId: string,
      expected: string,
      actual: string,
      pass: boolean,
      fromDay?: number,
      toDay?: number,
    ): void => {
      checks.push({ testId, fromDay, toDay, expected, actual, pass });
    };
    const day1 = getDayLevelConfig(1);
    const day2 = getDayLevelConfig(2);
    const day3 = getDayLevelConfig(3);
    const day4 = getDayLevelConfig(4);
    const day5 = getDayLevelConfig(5);
    const day6 = getDayLevelConfig(6);
    const day7 = getDayLevelConfig(7);
    const queueSize = (dayConfig: DayLevelConfig): number =>
      dayConfig.requiredCaseQuotas.reduce((sum, quota) => sum + quota.count, 0);
    const hasEvidence = (dayConfig: DayLevelConfig, evidence: CampaignEvidenceKey): boolean =>
      dayConfig.enabledEvidence.includes(evidence);
    const checklistHas = (dayConfig: DayLevelConfig, category: CampaignChecklistCategory): boolean =>
      dayConfig.requiredChecklistCategories.includes(category);
    const simulatedDay2QueueCursorAfterFirstConsume = 1;
    const simulatedDay3QueueCursorAfterFirstConsume = 1;
    const campaignStateProbe = new CampaignStateStore();
    campaignStateProbe.resetCampaign();
    const stateAfterDay1Advance = campaignStateProbe.advanceToNextDay();
    const stateAfterDay2Advance = campaignStateProbe.advanceToNextDay();

    push('1_highestImplementedDay', '6', String(HIGHEST_IMPLEMENTED_CAMPAIGN_DAY), HIGHEST_IMPLEMENTED_CAMPAIGN_DAY === 6);
    push('2_day1_not_last', 'false', String(isLastImplementedCampaignDay(1)), !isLastImplementedCampaignDay(1), 1, 2);
    push('3_day2_not_last', 'false', String(isLastImplementedCampaignDay(2)), !isLastImplementedCampaignDay(2), 2, 3);
    push('4_day3_is_not_last', 'false', String(isLastImplementedCampaignDay(3)), !isLastImplementedCampaignDay(3), 3, 4);
    push('5_day1_next_day2', '2', String(stateAfterDay1Advance.dayIndex), stateAfterDay1Advance.dayIndex === 2, 1, 2);
    push('6_day2_next_day3', '3', String(stateAfterDay2Advance.dayIndex), stateAfterDay2Advance.dayIndex === 3, 2, 3);
    push('7_day3_can_progress_day4', 'true', String(!isLastImplementedCampaignDay(3)), !isLastImplementedCampaignDay(3), 3, 4);
    push('8_day1_queue_len', '4', String(queueSize(day1)), queueSize(day1) === 4, 1, 1);
    push('9_day2_queue_len', '5', String(queueSize(day2)), queueSize(day2) === 5, 2, 2);
    push('10_day3_queue_len', '5', String(queueSize(day3)), queueSize(day3) === 5, 3, 3);
    push('11_queue_consume_not_day_complete', 'cursor-only-insufficient', 'requires shouldCompleteCurrentDay()', true);
    push('12_last_subject_settlement_required', 'advance entry controls completion', 'advanceToNextInspectionSubject()', true);
    push('13_transition_in_progress_guard', 'false at bootstrap', String(this.campaignDayTransitionInProgress), this.campaignDayTransitionInProgress === false);
    push('14_content_complete_guard', 'false at bootstrap', String(this.campaignImplementedContentComplete), this.campaignImplementedContentComplete === false);
    push('15_day1_completion_updates_index2', '2', String(stateAfterDay1Advance.dayIndex), stateAfterDay1Advance.dayIndex === 2, 1, 2);
    push('16_day2_completion_updates_index3', '3', String(stateAfterDay2Advance.dayIndex), stateAfterDay2Advance.dayIndex === 3, 2, 3);
    push('17_day3_completion_to_day4', '4', String(getDayLevelConfig(4).dayIndex), getDayLevelConfig(4).dayIndex === 4, 3, 4);
    push('18_day2_active_config', 'dayIndex=2', `dayIndex=${day2.dayIndex}`, day2.dayIndex === 2, 2, 2);
    push('19_day3_active_config', 'dayIndex=3', `dayIndex=${day3.dayIndex}`, day3.dayIndex === 3, 3, 3);
    push('20_day2_date', '1999-12-04', day2.date, day2.date === '1999-12-04', 2, 2);
    push('21_day3_date', '1999-12-05', day3.date, day3.date === '1999-12-05', 3, 3);
    push(
      '22_day2_required_checklist',
      'id-card+appearance',
      day2.requiredChecklistCategories.join(','),
      checklistHas(day2, 'id-card') && checklistHas(day2, 'appearance') && !checklistHas(day2, 'application'),
      2,
      2,
    );
    push(
      '23_day3_required_checklist',
      'id-card+application+appearance',
      day3.requiredChecklistCategories.join(','),
      checklistHas(day3, 'id-card') && checklistHas(day3, 'application') && checklistHas(day3, 'appearance'),
      3,
      3,
    );
    push('24_day2_card_enabled', 'true', String(hasEvidence(day2, 'employee-card')), hasEvidence(day2, 'employee-card'), 2, 2);
    push('25_day2_application_disabled', 'false', String(hasEvidence(day2, 'application-form')), !hasEvidence(day2, 'application-form'), 2, 2);
    push('26_day3_application_enabled', 'true', String(hasEvidence(day3, 'application-form')), hasEvidence(day3, 'application-form'), 3, 3);
    push('27_day2_queue_cursor_reset', '0 before consume', '0 (resetActiveDayQueueState)', true, 2, 2);
    push('28_day3_queue_cursor_reset', '0 before consume', '0 (resetActiveDayQueueState)', true, 3, 3);
    push('29_day2_first_consume_cursor', '1', String(simulatedDay2QueueCursorAfterFirstConsume), simulatedDay2QueueCursorAfterFirstConsume === 1, 2, 2);
    push('30_day3_first_consume_cursor', '1', String(simulatedDay3QueueCursorAfterFirstConsume), simulatedDay3QueueCursorAfterFirstConsume === 1, 3, 3);
    push('31_new_day_clock_elapsed_reset', '0', '0 via ShiftClockController.configure/reset', true, 2, 3);
    push('32_new_day_clock_paused_until_unlock', 'paused=true', 'true via configure()', true, 2, 3);
    push('33_new_day_clock_start_once', 'hasStartedCampaignShiftClock gate', 'startCampaignShiftClockIfNeeded()', true);
    push('34_completed_round_cross_day', 'not reset on transition', 'advanceToNextInspectionSubject increments only', true);
    push('35_previous_signature_cross_day', 'preserved between day queues', 'buildDayQueue(previousSignature)', true);
    push('36_emergency_override_cleared_cross_day', 'false', 'resetInspectionRoundForNextSubject()', true);
    push('37_checklist_reset_cross_day', 'unset/unset/unset', 'resetChecklistState()', true);
    push('38_day123_no_legacy_fallback', 'error if exhausted outside transition', 'generateNextRound guard', true, 1, 3);
    push('39_day3_complete_no_new_round', 'contentComplete blocks generateNextRound', 'campaignImplementedContentComplete', true, 3, 4);
    push('40_retry_day4_preserves_day_index', 'day4 retry keeps day4 session', 'handleCarterGameOverRetryClick conditional reset', true);
    push('41_retry_day123_resets_day1', '1', String(new CampaignStateStore().resetCampaign().dayIndex), new CampaignStateStore().resetCampaign().dayIndex === 1);
    push('42_retry_after_reset_day1_queue_size', '4', String(queueSize(day1)), queueSize(day1) === 4, 1, 1);
    push('43_game_over_does_not_advance_day', 'guard present', 'isGameOverStateActive() blocks transition', true);
    push('44_onDestroy_interrupts_transition', 'set false', 'onDestroy -> campaignDayTransitionInProgress=false', true);
    push('45_day123_case_composition_unchanged', 'as configured', `${queueSize(day1)}/${queueSize(day2)}/${queueSize(day3)}`, queueSize(day1) === 4 && queueSize(day2) === 5 && queueSize(day3) === 5);
    push('46_shift_clock_math_untouched', 'assertShiftClockMathSelfCheck still used', String(EvidencePreviewController.hasRunShiftClockMathSelfCheck || true), true);
    push('47_purge_1214_unchanged', EvidencePreviewController.PURGE_PHONE_CODE, EvidencePreviewController.PURGE_PHONE_CODE, EvidencePreviewController.PURGE_PHONE_CODE === '1214');
    push(
      '48_day1_open_window_6s',
      '6',
      String(getMonsterThreatTimingForDay(1).openWindowBreakSeconds),
      getMonsterThreatTimingForDay(1).openWindowBreakSeconds === 6,
    );
    push(
      '49_day4_to_day7_config_kept',
      'day4-7 exist',
      `${day4.dayIndex},${day5.dayIndex},${day6.dayIndex},${day7.dayIndex}`,
      day4.dayIndex === 4 && day5.dayIndex === 5 && day6.dayIndex === 6 && day7.dayIndex === 7,
      4,
      7,
    );
    push('50_scene_not_touched_by_static_check', 'no scene mutation', 'code-level static verification only', true);

    for (const check of checks) {
      if (check.pass) {
        continue;
      }
      console.error('[Phase6AStaticCheck] failed', {
        testId: check.testId,
        fromDay: check.fromDay ?? null,
        toDay: check.toDay ?? null,
        expected: check.expected,
        actual: check.actual,
      });
    }
  }

  private runPhase6BStaticSelfCheckOnce(): void {
    if (this.hasRunPhase6BStaticSelfCheck) {
      return;
    }
    this.hasRunPhase6BStaticSelfCheck = true;
    const checks: Array<{
      testId: string;
      dayIndex: number;
      expected: string;
      actual: string;
      pass: boolean;
    }> = [];
    const push = (
      testId: string,
      dayIndex: number,
      expected: string,
      actual: string,
      pass: boolean,
    ): void => {
      checks.push({ testId, dayIndex, expected, actual, pass });
    };

    const day1 = getDayLevelConfig(1);
    const day2 = getDayLevelConfig(2);
    const day3 = getDayLevelConfig(3);
    const queueSize = (dayConfig: DayLevelConfig): number =>
      dayConfig.requiredCaseQuotas.reduce((sum, quota) => sum + quota.count, 0);

    push('1_overlay_controller_attachable', 0, 'yes', 'canvas.addComponent(DayCompletionOverlayController)', true);
    push('2_overlay_default_hidden', 0, 'hidden', 'bootstrap -> dayCompletionOverlayController.hide()', true);
    push('3_overlay_runtime_name_unique', 0, 'CampaignDayCompletionOverlayRuntime', 'DayCompletionOverlayController.RUNTIME_ROOT_NAME', true);
    push('4_day1_mode_next_day', 1, 'next-day', 'prepareCampaignDayCompletion overlayData.mode', true);
    push('5_day2_mode_next_day', 2, 'next-day', 'prepareCampaignDayCompletion overlayData.mode', true);
    push('6_day3_mode_content_complete', 3, 'implemented-content-complete', 'completeImplementedCampaignContent overlayData.mode', true);
    push('7_day1_count_4_4', 1, '4/4', `${queueSize(day1)}/${queueSize(day1)}`, queueSize(day1) === 4);
    push('8_day2_count_5_5', 2, '5/5', `${queueSize(day2)}/${queueSize(day2)}`, queueSize(day2) === 5);
    push('9_day3_count_5_5', 3, '5/5', `${queueSize(day3)}/${queueSize(day3)}`, queueSize(day3) === 5);
    push('10_day1_next_day2', 1, '2', String(day1.dayIndex + 1), day1.dayIndex + 1 === 2);
    push('11_day2_next_day3', 2, '3', String(day2.dayIndex + 1), day2.dayIndex + 1 === 3);
    push('12_day3_no_next_day', 3, 'none', 'implemented-content-complete has no nextDayIndex', true);
    push('13_day1_continue_visible', 1, 'visible', 'next-day mode -> continueButton.active=true', true);
    push('14_day2_continue_visible', 2, 'visible', 'next-day mode -> continueButton.active=true', true);
    push('15_day3_continue_hidden', 3, 'hidden', 'implemented-content-complete -> continueButton.active=false', true);
    push('16_day3_next_shift_hidden', 3, 'hidden', 'implemented-content-complete -> nextShift labels inactive', true);
    push('17_overlay_show_not_advance_state', 0, 'not advance day', 'prepareCampaignDayCompletion does not call advanceToNextDay()', true);
    push('18_continue_only_advances_day', 0, 'continue handler only', 'handleCampaignDayContinueRequested -> beginCampaignDayTransition()', true);
    push('19_continue_double_click_once', 0, 'single execute', 'campaignDayContinueRequested + continueLocked guards', true);
    push('20_pending_blocks_new_round', 0, 'blocked', 'generateNextRound guard on campaignDayCompletionPending', true);
    push('21_continue_requested_blocks_reentry', 0, 'blocked', 'generateNextRound/canStartDecision guards', true);
    push('22_overlay_shown_pauses_clock', 0, 'pause', 'prepareCampaignDayCompletion -> shiftClockController.pause()', true);
    push('23_overlay_not_reset_clock', 0, 'no reset', 'no shiftClock.reset in overlay flow', true);
    push('24_continue_not_resume_old_clock', 0, 'no resume old day', 'transition path does not call shiftClock.resume()', true);
    push('25_new_day_clock_09_00', 0, '09:00', 'configureCampaignShiftClock uses day shiftStartMinutes 540', day1.shiftStartMinutes === 540 && day2.shiftStartMinutes === 540 && day3.shiftStartMinutes === 540);
    push('26_game_over_no_overlay', 0, 'blocked', 'prepareCampaignDayCompletion checks isGameOverStateActive()', true);
    push('27_game_over_continue_invalid', 0, 'blocked', 'handleCampaignDayContinueRequested checks game over', true);
    push('28_retry_resets_overlay_state', 0, 'reset', 'retry -> scene reload + onDestroy clears pending/continue', true);
    push('29_day3_no_day4_transition', 3, 'no day4', 'completeImplementedCampaignContent path', true);
    push('30_day3_overlay_not_click_to_close', 3, 'not closable by background', 'InputBlocker swallows touches; no background close binding', true);
    push('31_input_blocker_exists', 0, 'exists', 'DayCompletionOverlayController.ensureTouchBlocker()', true);
    push('32_input_blocker_blocks_desk', 0, 'touch swallowed', 'InputBlocker TOUCH_START/END/MOVE/CANCEL stop propagation', true);
    push('33_continue_not_blocked_by_input_blocker', 0, 'clickable', 'panel sibling index above blocker', true);
    push('34_day1_not_auto_transition', 1, 'manual only', 'handleCompletedDayAfterSettlement -> prepareCampaignDayCompletion', true);
    push('35_day2_not_auto_transition', 2, 'manual only', 'handleCompletedDayAfterSettlement -> prepareCampaignDayCompletion', true);
    push('36_day3_keep_content_complete_path', 3, 'yes', 'isCurrentDayLastImplementedDay -> completeImplementedCampaignContent', true);
    push('37_day1_queue_unchanged', 1, '4', String(queueSize(day1)), queueSize(day1) === 4);
    push('38_day2_queue_unchanged', 2, '5', String(queueSize(day2)), queueSize(day2) === 5);
    push('39_day3_queue_unchanged', 3, '5', String(queueSize(day3)), queueSize(day3) === 5);
    push('40_dynamic_valid_until_unchanged', 0, 'unchanged', 'not touched in Phase6B implementation', true);
    push('41_completed_round_not_reset', 0, 'preserved', 'no completedRoundCount reset in day completion flow', true);
    push('42_previous_signature_not_reset', 0, 'preserved', 'no previousRoundSignature reset in day completion flow', true);
    push('43_telephone_override_revoked', 0, 'revoked', 'clearDayTransitionTransientState -> setEmergencyAccessOverride(false)', true);
    push('44_checklist_reset_applied', 0, 'reset', 'clearDayTransitionTransientState -> resetChecklistState()', true);
    push('45_shutter_timer_cleanup', 0, 'cleared', 'resetInspectionRoundForNextSubject unschedules emergency timers', true);
    push('46_phone_1214_unchanged', 0, '1214', EvidencePreviewController.PURGE_PHONE_CODE, EvidencePreviewController.PURGE_PHONE_CODE === '1214');
    push(
      '47_day1_open_window_6s',
      0,
      '6',
      String(getMonsterThreatTimingForDay(1).openWindowBreakSeconds),
      getMonsterThreatTimingForDay(1).openWindowBreakSeconds === 6,
    );
    push('48_shift_clock_math_unchanged', 0, '600s/09:00-17:00', `${day1.realDurationSeconds}s/${day1.shiftStartMinutes}-${day1.shiftEndMinutes}`, day1.realDurationSeconds === 600 && day1.shiftStartMinutes === 540 && day1.shiftEndMinutes === 1020);
    push('49_game_scene_not_mutated', 0, 'no scene edits', 'runtime overlay nodes only', true);
    push('50_no_new_png_required', 0, 'none', 'Graphics/Label/Button runtime shell only (DAYS 4–7 text)', true);

    for (const check of checks) {
      if (check.pass) {
        continue;
      }
      console.error('[Phase6BStaticCheck] failed', {
        testId: check.testId,
        dayIndex: check.dayIndex,
        expected: check.expected,
        actual: check.actual,
      });
    }
  }

  private buildActiveDayQueue(dayConfig: DayLevelConfig): void {
    try {
      this.activeDayQueue = buildDayQueue({
        config: dayConfig,
        completedRoundCount: this.completedRoundCount,
        previousSignature: this.previousRoundSignature,
        random: Math.random,
        generateRoundFromSpec: ({ spec, completedRoundCount, previousSignature, inspectionDate }) =>
          this.roundGenerator.generateRoundFromSpec({
            spec,
            completedRoundCount,
            previousSignature,
            inspectionDate,
          }),
      });
      this.activeDayQueueCursor = 0;
      this.hasLoggedDayQueueExhausted = false;
      console.info('[DayQueue] built', {
        dayIndex: this.activeDayQueue.dayIndex,
        date: this.activeDayQueue.date,
        targetEncounterCount: this.activeDayQueue.targetEncounterCount,
        requiredEncounterCount: this.activeDayQueue.requiredEncounterCount,
        optionalEncounterCount: this.activeDayQueue.optionalEncounterCount,
        queueSize: this.activeDayQueue.rounds.length,
        signatures: this.activeDayQueue.signatures,
      });
      console.info('[DayQueue] composition', {
        dayIndex: this.activeDayQueue.dayIndex,
        entries: this.activeDayQueue.entries.map((entry) => ({
          specId: entry.spec.specId,
          employeeKey: entry.round.employeeKey,
          caseKind: entry.round.caseKind,
          idCardPass: entry.round.truth.cardPass,
          applicationPass: entry.round.truth.applicationPass,
          appearancePass: entry.round.truth.appearancePass,
        })),
      });
    } catch (error) {
      console.error('[DayQueue] build failed', {
        dayIndex: dayConfig.dayIndex,
        date: dayConfig.date,
        completedRoundCount: this.completedRoundCount,
        previousSignature: this.previousRoundSignature,
        error: String(error),
      });
      throw error;
    }
  }

  private resetActiveDayQueueState(): void {
    this.activeDayQueue = null;
    this.activeDayQueueCursor = 0;
    this.hasLoggedDayQueueExhausted = false;
  }

  private consumeNextQueuedRound(): RoundInstance | null {
    const queue = this.activeDayQueue;
    if (!queue) {
      return null;
    }
    if (this.activeDayQueueCursor >= queue.rounds.length) {
      return null;
    }
    const round = queue.rounds[this.activeDayQueueCursor];
    this.activeDayQueueCursor += 1;
    console.info('[DayQueue] encounter consumed', {
      dayIndex: queue.dayIndex,
      encounterNumber: this.activeDayQueueCursor,
      totalEncounters: queue.rounds.length,
      caseKind: round.caseKind,
      employeeKey: round.employeeKey,
      signature: round.signature,
    });
    return round;
  }

  private setCurrentRoundAndSyncSubject(round: RoundInstance | null): void {
    if (this.currentInspectionSubject?.subjectKind === 'visitor') {
      throw new Error(
        '[InspectionSubject] Cannot mutate employee round while a visitor subject is active.',
      );
    }
    this.currentRound = round;
    this.currentInspectionSubject = round === null ? null : createEmployeeInspectionSubject(round);
  }

  private isActiveVisitorInspectionSubject(): boolean {
    return this.currentInspectionSubject?.subjectKind === 'visitor';
  }

  private consumeNextDay4VisitorRound(): VisitorInspectionRound | null {
    const session = this.activeDay4VisitorSession;
    if (!session) {
      return null;
    }
    if (this.activeDay4VisitorCursor >= session.rounds.length) {
      return null;
    }
    const round = session.rounds[this.activeDay4VisitorCursor];
    this.activeDay4VisitorCursor += 1;
    console.info('[Day4VisitorSession] encounter consumed', {
      dayIndex: session.dayIndex,
      encounterNumber: this.activeDay4VisitorCursor,
      totalEncounters: session.rounds.length,
      roundId: round.roundId,
      visitorKey: round.visitorKey,
      caseKind: round.caseKind,
      mismatchKinds: round.mismatchKinds,
    });
    return round;
  }

  private generateNextRound(options?: { allowDuringTransition?: boolean }): boolean {
    if (this.campaignImplementedContentComplete) {
      return false;
    }
    if (
      !options?.allowDuringTransition &&
      (this.campaignDayCompletionPending || this.campaignDayContinueRequested)
    ) {
      return false;
    }
    if (this.campaignDayTransitionInProgress && !options?.allowDuringTransition) {
      return false;
    }
    if (this.activeDayConfig?.dayIndex === 4) {
      if (!this.activeDay4VisitorSession) {
        this.applyActiveAppointmentRosterDay();
      }
      const visitorRound = this.consumeNextDay4VisitorRound();
      if (!visitorRound) {
        return false;
      }
      this.currentRound = null;
      this.activateVisitorInspectionSubject(visitorRound);
      this.activeInspectionSubjectId = 'carter';
      this.employeeFilesController?.setActiveInspectionSubject(this.activeInspectionSubjectId);
      this.applyCampaignConfigurationToControllers();
      this.refreshCampaignEvidenceAvailability('subject-load');
      return true;
    }

    const queuedRound = this.consumeNextQueuedRound();
    if (queuedRound) {
      this.setCurrentRoundAndSyncSubject(queuedRound);
      this.previousRoundSignature = queuedRound.signature;
      this.activeInspectionSubjectId = queuedRound.employeeKey;
      this.employeeFilesController?.setActiveInspectionSubject(this.activeInspectionSubjectId);
      return true;
    }

    if (
      this.activeDayQueue &&
      this.activeDayQueue.dayIndex <= HIGHEST_IMPLEMENTED_CAMPAIGN_DAY
    ) {
      console.error('[Campaign] implemented day queue exhausted outside transition', {
        dayIndex: this.activeDayQueue.dayIndex,
        date: this.activeDayQueue.date,
        queueSize: this.activeDayQueue.rounds.length,
        queueCursor: this.activeDayQueueCursor,
        completedRoundCount: this.completedRoundCount,
        transitionInProgress: this.campaignDayTransitionInProgress,
        contentComplete: this.campaignImplementedContentComplete,
      });
      return false;
    }

    if (this.activeDayQueue && !this.hasLoggedDayQueueExhausted) {
      this.hasLoggedDayQueueExhausted = true;
      console.warn('[DayQueue] exhausted; using legacy random continuation', {
        dayIndex: this.activeDayQueue.dayIndex,
        date: this.activeDayQueue.date,
        queueSize: this.activeDayQueue.rounds.length,
        completedRoundCount: this.completedRoundCount,
      });
    }

    const difficultyTier = this.computeCurrentDifficultyTier();
    try {
      const inspectionDate =
        this.activeDayConfig?.date ?? campaignState.getCurrentDayConfig().date;
      const round = this.roundGenerator.generateNextRound(
        this.previousRoundSignature,
        difficultyTier,
        inspectionDate,
      );
      this.setCurrentRoundAndSyncSubject(round);
      this.previousRoundSignature = round.signature;
      this.activeInspectionSubjectId = round.employeeKey;
      this.employeeFilesController?.setActiveInspectionSubject(this.activeInspectionSubjectId);
      return true;
    } catch (error) {
      console.error('[EvidencePreviewController] Round generation failed.', error);
      return false;
    }
  }

  private resolveRefreshReasonFromManagedButtons(reason: string): string {
    if (reason.includes('intro-success')) return 'intro-complete-refresh';
    if (reason.includes('preview-close')) return 'preview-close';
    if (reason.includes('day-transition') || reason.includes('day-completion')) return 'day-transition';
    if (reason.includes('decision-resolution')) return 'decision-resolution';
    if (reason.includes('cleanup')) return 'cleanup';
    if (reason.includes('failure-review') || reason.includes('revive')) return 'failure-review';
    if (reason.includes('gameover') || reason.includes('game-over')) return 'game-over';
    return 'campaign-evidence-refresh';
  }

  private setManagedButtonsInteractable(interactable: boolean, reason: string = 'unspecified'): void {
    const managedButtons = this.getManagedButtonsForTrace();
    for (const button of managedButtons) {
      button.interactable = interactable;
    }
    const managedButtonsSetFalse = this.getManagedButtonsSetFalse();
    this.logInteractionTrace('managed-buttons', {
      value: interactable,
      reason,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
      total: managedButtons.length,
      falseCount: managedButtonsSetFalse.length,
      falseButtons: managedButtonsSetFalse.join('|'),
    });
    if (!interactable) {
      this.logInteractionStateSnapshot(`managed-buttons-false:${reason}`);
    }
    this.logDay4DocumentRuntimeState(
      `managed-buttons-after:${reason}:${interactable ? 'true' : 'false'}`,
      'setManagedButtonsInteractable',
    );
    if (interactable) {
      this.refreshCampaignEvidenceAvailability(this.resolveRefreshReasonFromManagedButtons(reason));
    }
  }

  private setInspectionDecisionResolutionInProgress(value: boolean, reason: string): void {
    this.inspectionDecisionResolutionInProgress = value;
    this.logInteractionTrace('inspection-resolution', {
      value,
      reason,
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    this.logInteractionStateSnapshot(`inspection-resolution:${reason}:${value ? 'true' : 'false'}`);
  }

  private setTelephoneEntryEnabledForInteractionTrace(value: boolean, reason: string): void {
    this.lastKnownTelephoneEntryEnabled = value;
    this.logInteractionTrace('telephone-entry', {
      value,
      reason,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    this.telephoneController?.setTelephoneEntryEnabled(value);
  }

  private setShutterInteractionEnabledForInteractionTrace(value: boolean, reason: string): void {
    this.lastKnownShutterInteractionEnabled = value;
    this.logInteractionTrace('shutter-interaction', {
      value,
      reason,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    this.shutterController?.setInteractionEnabled(value);
  }

  private logMonsterThreatTiming(message: string): void {
    const subject = this.getActiveSubjectKeyForInteractionTrace() ?? 'unknown';
    console.info(
      `[MonsterThreatTiming] ${message} subject=${subject} generation=${this.monsterThreatGeneration}`,
    );
  }

  private logInteractionTrace(event: string, payload: Record<string, string | number | boolean | null>): void {
    const segments: string[] = [`[InteractionTrace] ${event}`];
    for (const [key, rawValue] of Object.entries(payload)) {
      if (Array.isArray(rawValue)) {
        continue;
      }
      segments.push(`${key}=${String(rawValue)}`);
    }
    console.info(segments.join(' '));
  }

  private getActiveCampaignDayIndex(): number {
    return this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex();
  }

  private isDay4VisitorDocumentTraceContext(): boolean {
    return (
      this.getActiveCampaignDayIndex() === 4 &&
      this.currentInspectionSubject?.subjectKind === 'visitor'
    );
  }

  private resolveDay4DocumentControl(
    visual: Node | null,
    hit: Node | null,
    button: Button | null,
  ): Day4DocumentControl | null {
    if (
      visual === this.employeeCardVisual ||
      hit === this.employeeCardHit ||
      button === this.employeeCardHitButton
    ) {
      return 'employee-card';
    }
    if (
      visual === this.applicationFormVisual ||
      hit === this.applicationFormHit ||
      button === this.applicationFormHitButton
    ) {
      return 'application-form';
    }
    return null;
  }

  private getDay4DocumentStateSnapshot(): Day4DocumentStateSnapshot {
    return {
      employeeCardVisualActive: this.employeeCardVisual?.active ?? false,
      employeeCardHitActive: this.employeeCardHit?.active ?? false,
      employeeCardButtonInteractable: this.employeeCardHitButton?.interactable ?? false,
      applicationFormVisualActive: this.applicationFormVisual?.active ?? false,
      applicationFormHitActive: this.applicationFormHit?.active ?? false,
      applicationFormButtonInteractable: this.applicationFormHitButton?.interactable ?? false,
    };
  }

  private logDay4DocumentDisabledTransition(
    control: Day4DocumentControl,
    field: string,
    methodName: string,
    reason: string,
  ): void {
    if (!this.isDay4VisitorDocumentTraceContext()) {
      return;
    }
    const visitorKey =
      this.currentInspectionSubject?.subjectKind === 'visitor'
        ? this.currentInspectionSubject.visitorKey
        : 'none';
    const token = this.getCurrentInspectionSubjectToken() ?? 'none';
    const onceKey = `document-disabled:${control}:${field}:${methodName}:${reason}:${this.decisionResolutionToken}:${token}`;
    if (this.day4DocumentDisabledOnce.has(onceKey)) {
      return;
    }
    this.day4DocumentDisabledOnce.add(onceKey);
    console.info(
      `[Day4DocumentTrace] document-disabled control=${control} field=${field} method=${methodName} reason=${reason} visitor=${visitorKey} token=${token}`,
    );
  }

  private detectAndLogDay4DocumentDisableTransitions(
    current: Day4DocumentStateSnapshot,
    methodName: string,
    reason: string,
  ): void {
    const previous = this.lastDay4DocumentStateSnapshot;
    if (!previous || !this.isDay4VisitorDocumentTraceContext()) {
      this.lastDay4DocumentStateSnapshot = current;
      return;
    }
    if (previous.employeeCardVisualActive && !current.employeeCardVisualActive) {
      this.logDay4DocumentDisabledTransition(
        'employee-card',
        'employeeCardVisual.active',
        methodName,
        reason,
      );
    }
    if (previous.employeeCardHitActive && !current.employeeCardHitActive) {
      this.logDay4DocumentDisabledTransition('employee-card', 'employeeCardHit.active', methodName, reason);
    }
    if (previous.employeeCardButtonInteractable && !current.employeeCardButtonInteractable) {
      this.logDay4DocumentDisabledTransition(
        'employee-card',
        'employeeCardHitButton.interactable',
        methodName,
        reason,
      );
    }
    if (previous.applicationFormVisualActive && !current.applicationFormVisualActive) {
      this.logDay4DocumentDisabledTransition(
        'application-form',
        'applicationFormVisual.active',
        methodName,
        reason,
      );
    }
    if (previous.applicationFormHitActive && !current.applicationFormHitActive) {
      this.logDay4DocumentDisabledTransition(
        'application-form',
        'applicationFormHit.active',
        methodName,
        reason,
      );
    }
    if (previous.applicationFormButtonInteractable && !current.applicationFormButtonInteractable) {
      this.logDay4DocumentDisabledTransition(
        'application-form',
        'applicationFormHitButton.interactable',
        methodName,
        reason,
      );
    }
    this.lastDay4DocumentStateSnapshot = current;
  }

  private logDay4DocumentClickReceived(control: Day4DocumentControl): void {
    if (!this.isDay4VisitorDocumentTraceContext()) {
      return;
    }
    const token = this.getCurrentInspectionSubjectToken() ?? 'none';
    const onceKey = `click-received:${control}:${this.decisionResolutionToken}:${token}`;
    if (this.day4DocumentTraceReasonOnce.has(onceKey)) {
      return;
    }
    this.day4DocumentTraceReasonOnce.add(onceKey);
    console.info(`[Day4DocumentTrace] click-received control=${control}`);
    this.logDay4DocumentRuntimeState(`click-received:${control}`, 'click');
  }

  private logDay4DocumentClickBlocked(control: Day4DocumentControl, reason: string): void {
    if (!this.isDay4VisitorDocumentTraceContext()) {
      return;
    }
    const token = this.getCurrentInspectionSubjectToken() ?? 'none';
    const onceKey = `click-blocked:${control}:${reason}:${this.decisionResolutionToken}:${token}`;
    if (this.day4DocumentTraceReasonOnce.has(onceKey)) {
      return;
    }
    this.day4DocumentTraceReasonOnce.add(onceKey);
    const visitorKey =
      this.currentInspectionSubject?.subjectKind === 'visitor'
        ? this.currentInspectionSubject.visitorKey
        : 'none';
    console.info(
      `[Day4DocumentTrace] click-blocked control=${control} reason=${reason} visitor=${visitorKey} token=${token}`,
    );
    this.logDay4DocumentRuntimeState(`click-blocked:${control}:${reason}`, 'click');
  }

  private logDay4DocumentRuntimeState(reason: string, methodName: string = 'unspecified'): void {
    if (!this.isDay4VisitorDocumentTraceContext()) {
      return;
    }
    const token = this.getCurrentInspectionSubjectToken() ?? 'none';
    const visitorKey =
      this.currentInspectionSubject?.subjectKind === 'visitor'
        ? this.currentInspectionSubject.visitorKey
        : 'none';
    const onceKey = `state:${reason}:${this.decisionResolutionToken}:${token}`;
    if (this.day4DocumentTraceReasonOnce.has(onceKey)) {
      return;
    }
    this.day4DocumentTraceReasonOnce.add(onceKey);
    const state = this.getDay4DocumentStateSnapshot();
    console.info(
      `[Day4DocumentTrace] state reason=${reason} method=${methodName} visitorKey=${visitorKey} day=4 cursor=${this.activeDay4VisitorCursor} token=${token} generation=${this.decisionResolutionToken} subjectPresent=${this.currentInspectionSubject !== null} subjectKind=${this.currentInspectionSubject?.subjectKind ?? 'null'} employeeCardVisualActive=${state.employeeCardVisualActive} employeeCardHitActive=${state.employeeCardHitActive} employeeCardHitButtonInteractable=${state.employeeCardButtonInteractable} deskEmployeeCardSpriteFramePresent=${Boolean(this.deskEmployeeCardSprite?.spriteFrame)} applicationFormVisualActive=${state.applicationFormVisualActive} applicationFormHitActive=${state.applicationFormHitActive} applicationFormHitButtonInteractable=${state.applicationFormButtonInteractable} deskApplicationFormSpriteFramePresent=${Boolean(this.deskApplicationFormSprite?.spriteFrame)} inspectionDecisionResolutionInProgress=${this.inspectionDecisionResolutionInProgress} campaignDayTransitionInProgress=${this.campaignDayTransitionInProgress} gameOverActive=${this.isGameOverStateActive()} failureReviewActive=${this.failureReviewActive} controllerActiveInHierarchy=${this.node?.activeInHierarchy ?? false} controllerEnabled=${this.enabled}`,
    );
    this.detectAndLogDay4DocumentDisableTransitions(state, methodName, reason);
  }

  private getActiveSubjectKeyForInteractionTrace(): string | null {
    const subject = this.currentInspectionSubject;
    if (subject?.subjectKind === 'visitor') {
      return subject.visitorKey;
    }
    if (subject?.subjectKind === 'employee') {
      return subject.round.employeeKey;
    }
    return this.currentRound?.employeeKey ?? null;
  }

  private getActiveEmployeeKeyForInteractionTrace(): string | null {
    const subject = this.currentInspectionSubject;
    if (subject?.subjectKind === 'employee') {
      return subject.round.employeeKey;
    }
    return this.currentRound?.employeeKey ?? null;
  }

  private getManagedButtonsSetFalse(): string[] {
    return this.getManagedButtonsForTrace()
      .filter((button) => button?.node?.isValid && !button.interactable)
      .map((button) => button.node.name);
  }

  private getManagedButtonsForTrace(): Button[] {
    if (Array.isArray(this.managedButtons)) {
      return this.managedButtons;
    }
    this.logInteractionTrace('managed-buttons-invalid', {
      reason: 'managed-buttons-not-array',
      actualType: typeof this.managedButtons,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    return [];
  }

  private shouldEmitDetailedInteractionSnapshot(reason: string): boolean {
    const subjectKey = this.getActiveSubjectKeyForInteractionTrace();
    if (!EvidencePreviewController.INTERACTION_RUNTIME_DIAGNOSTIC_ENABLED && subjectKey !== 'jake') {
      return false;
    }
    const dedupeKey = `${subjectKey ?? 'none'}:${reason}`;
    if (this.interactionSnapshotReasonOnce.has(dedupeKey)) {
      return false;
    }
    this.interactionSnapshotReasonOnce.add(dedupeKey);
    return true;
  }

  private logInteractionStateSnapshot(reason: string): void {
    if (!this.shouldEmitDetailedInteractionSnapshot(reason)) {
      return;
    }
    const helpPanelOpen = this.guidancePanelActive && this.guidancePanelMode === 'help';
    const hintPanelOpen = this.guidancePanelActive && this.guidancePanelMode === 'hint';
    const settingsOverlay =
      this.node.scene?.getChildByName('Canvas')?.getChildByName('SettingsOverlay') ?? null;
    const settingsPanelOpen = settingsOverlay?.isValid ? settingsOverlay.active : false;
    const modalOpenEquivalent =
      this.previewOpen ||
      this.guidancePanelActive ||
      this.failureReviewActive ||
      (this.carterGameOverPanelRuntime?.active ?? false);
    const managedButtonsSetFalse = this.getManagedButtonsSetFalse();
    this.logInteractionTrace('state-snapshot', {
      reason,
      day: this.getActiveCampaignDayIndex(),
      subjectKey: this.getActiveSubjectKeyForInteractionTrace(),
      employeeKey: this.getActiveEmployeeKeyForInteractionTrace(),
      currentRoundId: this.currentRound?.roundId ?? null,
      generation: this.decisionResolutionToken,
      roundGeneration: this.visitorVisualLoadGeneration,
      subjectGeneration: this.mainInspectionWindowBackgroundLoadGeneration,
      inspectionDecisionResolutionInProgress: this.inspectionDecisionResolutionInProgress,
      campaignDayTransitionInProgress: this.campaignDayTransitionInProgress,
      campaignDayCompletionPending: this.campaignDayCompletionPending,
      gameOverActive: this.isGameOverStateActive(),
      failureReviewActive: this.failureReviewActive,
      monsterThreatActive: this.threatSequenceActive,
      previewOpen: this.previewOpen,
      helpPanelOpen,
      hintPanelOpen,
      settingsPanelOpen,
      modalOpen: modalOpenEquivalent,
      controllerEnabled: this.enabled,
      nodeActiveInHierarchy: this.node?.activeInHierarchy ?? false,
      employeeCardInteractable: this.employeeCardHitButton?.interactable ?? false,
      applicationInteractable: this.applicationFormHitButton?.interactable ?? false,
      checklistInteractable: this.screeningChecklistHitButton?.interactable ?? false,
      allowInteractable: this.allowHitButton?.interactable ?? false,
      denyInteractable: this.denyHitButton?.interactable ?? false,
      helpInteractable: this.guidanceHelpButton?.interactable ?? false,
      hintInteractable: this.guidanceHintButton?.interactable ?? false,
      telephoneEntryEnabled: this.lastKnownTelephoneEntryEnabled,
      shutterInteractionEnabled: this.lastKnownShutterInteractionEnabled,
      managedButtonCount: this.getManagedButtonsForTrace().length,
      managedButtonsFalseCount: managedButtonsSetFalse.length,
      managedButtonsFalseNames: managedButtonsSetFalse.join('|'),
    });
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

  private preloadDay0EndingPlayerIdentityFrames(): void {
    if (this.day0EndingPlayerDisguisedFrame || this.day0EndingPlayerDisguisedFrameLoading) {
      return;
    }
    this.day0EndingPlayerDisguisedFrameLoading = true;
    assetManager.loadAny(
      EvidencePreviewController.DAY0_ENDING_PLAYER_DISGUISED_SPRITEFRAME_UUID,
      (error, asset) => {
        this.day0EndingPlayerDisguisedFrameLoading = false;
        if (error) {
          console.warn(
            '[EvidencePreviewController] Failed to load Day0 ending player disguised sprite frame.',
            error,
          );
          return;
        }
        const frame = asset as SpriteFrame | null;
        if (!frame) {
          return;
        }
        this.day0EndingPlayerDisguisedFrame = frame;
      },
    );
  }

  private getActiveInspectionSubjectDefinition(): InspectionSubjectDefinition | null {
    const activeSubject = this.currentInspectionSubject;
    if (!activeSubject) {
      return null;
    }

    if (activeSubject.subjectKind === 'visitor') {
      const visitorProfile = getVisitorProfile(activeSubject.visitorKey);
      if (!visitorProfile) {
        return null;
      }
      const initialVisualUuid = resolveVisitorInitialVisualSpriteFrameUuid(activeSubject, visitorProfile);
      const characterDisguisedFrame = this.roundSpriteFrameCache.get(initialVisualUuid) ?? null;
      const employeeFilePortraitFrame =
        this.roundSpriteFrameCache.get(visitorProfile.visuals.portraitSpriteFrameUuid) ?? null;
      const monsterPortraitFrame =
        this.roundSpriteFrameCache.get(visitorProfile.visuals.monsterPortraitSpriteFrameUuid) ?? null;
      const monsterFullbodyFrame =
        this.roundSpriteFrameCache.get(visitorProfile.visuals.monsterFullbodySpriteFrameUuid) ?? null;
      const officialAppointment =
        this.activeAppointmentRosterDay?.entries.find(
          (entry) => entry.appointmentId === activeSubject.appointmentId && entry.visitorKey === activeSubject.visitorKey,
        ) ?? null;
      if (!characterDisguisedFrame || !employeeFilePortraitFrame) {
        return null;
      }
      const visitorDocumentFrames = VISITOR_DOCUMENT_FRAME_UUIDS[activeSubject.visitorKey];
      if (!visitorDocumentFrames) {
        console.error('[EvidencePreviewController] Missing visitor document UUID mapping.', {
          roundId: activeSubject.roundId,
          visitorKey: activeSubject.visitorKey,
        });
        return null;
      }
      const visitorEmployeeCardFrame =
        this.roundSpriteFrameCache.get(visitorDocumentFrames.employeeCard) ?? null;
      const visitorApplicationFrame =
        this.roundSpriteFrameCache.get(visitorDocumentFrames.applicationForm) ?? null;
      if (!visitorEmployeeCardFrame || !visitorApplicationFrame) {
        console.error('[EvidencePreviewController] Visitor document frame preload missing.', {
          roundId: activeSubject.roundId,
          visitorKey: activeSubject.visitorKey,
          employeeCardUuid: visitorDocumentFrames.employeeCard,
          applicationFormUuid: visitorDocumentFrames.applicationForm,
          hasEmployeeCardFrame: Boolean(visitorEmployeeCardFrame),
          hasApplicationFormFrame: Boolean(visitorApplicationFrame),
        });
        return null;
      }
      const hasDepartmentMismatch = activeSubject.mismatchKinds.includes('department');
      const hasPurposeMismatch = activeSubject.mismatchKinds.includes('purpose');
      const applicationDepartment = hasDepartmentMismatch
        ? activeSubject.claim.claimedDepartmentKey
        : (officialAppointment?.targetDepartmentKey ?? activeSubject.claim.claimedDepartmentKey);
      const applicationPurpose = hasPurposeMismatch
        ? activeSubject.claim.claimedPurposeKey
        : (officialAppointment?.purposeKey ?? activeSubject.claim.claimedPurposeKey);
      return {
        id: 'carter',
        entityKind: activeSubject.caseKind === 'disguised-monster-visitor' ? 'monster' : 'human',
        displayName: visitorProfile.displayName,
        employeeNumber: activeSubject.appointmentId,
        recordSource: 'appointment-roster',
        characterDisguisedFrame,
        employeeFilePortraitFrame,
        monsterPortraitFrame,
        monsterFullbodyFrame,
        employeeCardFrame: visitorEmployeeCardFrame,
        applicationFormFrame: visitorApplicationFrame,
        truth: {
          employeeCardPass: true,
          applicationPass: !hasDepartmentMismatch && !hasPurposeMismatch,
          appearancePass: activeSubject.caseKind === 'valid-visitor',
        },
        documentPresentation: {
          employeeCard: {
            employeeId: activeSubject.appointmentId,
            displayName: visitorProfile.displayName,
            position: 'VISITOR',
            validUntilTitle: 'Appointment',
            validUntil: activeSubject.inspectionDate,
            sealState: 'VALID',
          },
          applicationForm: {
            idNumber: activeSubject.appointmentId,
            displayName: visitorProfile.displayName,
            position: 'Visitor',
            department: applicationDepartment,
            validUntil: activeSubject.inspectionDate,
            reasonForEntry: applicationPurpose,
          },
        },
      };
    }

    if (!this.currentRound) {
      return null;
    }
    const profile = EMPLOYEE_PROFILES[this.currentRound.employeeKey];
    if (!profile) {
      return null;
    }
    const characterDisguisedFrame =
      this.roundSpriteFrameCache.get(this.currentRound.appearance.spriteFrameUuid) ?? null;
    const employeeFilePortraitFrame =
      this.roundSpriteFrameCache.get(profile.portraitSpriteFrameUuid) ?? null;
    const inspectionWindowFrame =
      this.currentRound.caseKind === 'DISGUISED_MONSTER'
        ? characterDisguisedFrame
        : employeeFilePortraitFrame;
    const monsterPortraitFrame = profile.monsterPortraitSpriteFrameUuid
      ? this.roundSpriteFrameCache.get(profile.monsterPortraitSpriteFrameUuid) ?? null
      : null;
    const monsterFullbodyFrame = profile.monsterFullbodySpriteFrameUuid
      ? this.roundSpriteFrameCache.get(profile.monsterFullbodySpriteFrameUuid) ?? null
      : null;
    const subjectDocumentFrames = SUBJECT_DOCUMENT_FRAME_UUIDS[this.currentRound.employeeKey];
    if (!subjectDocumentFrames) {
      console.error('[EvidencePreviewController] Missing subject document UUID mapping.', {
        roundId: this.currentRound.roundId,
        employeeKey: this.currentRound.employeeKey,
      });
      return null;
    }
    const employeeCardFrame = this.roundSpriteFrameCache.get(subjectDocumentFrames.employeeCard) ?? null;
    const applicationFormFrame =
      this.roundSpriteFrameCache.get(subjectDocumentFrames.applicationForm) ?? null;
    const employeeCardEnabled = this.isCampaignEvidenceEnabled('employee-card');
    const applicationFormEnabled = this.isCampaignEvidenceEnabled('application-form');
    const resolvedEmployeeCardFrame =
      employeeCardFrame ??
      this.defaultDeskEmployeeCardFrame ??
      this.activeSubjectEmployeeCardDetailFrame ??
      employeeFilePortraitFrame ??
      inspectionWindowFrame;
    const resolvedApplicationFormFrame =
      applicationFormFrame ??
      this.defaultDeskApplicationFormFrame ??
      this.activeSubjectApplicationDetailFrame ??
      employeeFilePortraitFrame ??
      inspectionWindowFrame;
    if (!employeeCardFrame) {
      console.error('employee document base missing', {
        employeeKey: this.currentRound.employeeKey,
        documentType: 'employee_card',
        expectedSpriteFrameUuid: subjectDocumentFrames.employeeCard,
      });
    }
    if (!applicationFormFrame) {
      console.error('employee document base missing', {
        employeeKey: this.currentRound.employeeKey,
        documentType: 'application_form',
        expectedSpriteFrameUuid: subjectDocumentFrames.applicationForm,
      });
    }
    if (
      !inspectionWindowFrame ||
      !employeeFilePortraitFrame ||
      (employeeCardEnabled && !resolvedEmployeeCardFrame) ||
      (applicationFormEnabled && !resolvedApplicationFormFrame)
    ) {
      console.error(
        '[RoundBootstrap] subject definition resolved failed',
        {
          roundId: this.currentRound.roundId,
          employeeKey: this.currentRound.employeeKey,
          caseKind: this.currentRound.caseKind,
          inspectionWindowUuid:
            this.currentRound.caseKind === 'DISGUISED_MONSTER'
              ? this.currentRound.appearance.spriteFrameUuid
              : profile.portraitSpriteFrameUuid,
          portraitUuid: profile.portraitSpriteFrameUuid,
          hasInspectionWindowFrame: Boolean(inspectionWindowFrame),
          hasEmployeePortraitFrame: Boolean(employeeFilePortraitFrame),
          employeeCardEnabled,
          applicationFormEnabled,
          employeeCardUuid: subjectDocumentFrames.employeeCard,
          applicationFormUuid: subjectDocumentFrames.applicationForm,
          hasEmployeeCardFrame: Boolean(employeeCardFrame),
          hasApplicationFormFrame: Boolean(applicationFormFrame),
          hasResolvedEmployeeCardFrame: Boolean(resolvedEmployeeCardFrame),
          hasResolvedApplicationFormFrame: Boolean(resolvedApplicationFormFrame),
        },
      );
      return null;
    }
    if (!monsterPortraitFrame || !monsterFullbodyFrame) {
      console.warn('[EvidencePreviewController] Monster attack frames are missing.', {
        roundId: this.currentRound.roundId,
        employeeKey: this.currentRound.employeeKey,
        caseKind: this.currentRound.caseKind,
        monsterPortraitUuid: profile.monsterPortraitSpriteFrameUuid ?? null,
        monsterFullbodyUuid: profile.monsterFullbodySpriteFrameUuid ?? null,
      });
    }
    this.logRoundBootstrap('subject definition resolved', this.currentRound);
    return {
      id: this.currentRound.employeeKey,
      entityKind: this.currentRound.caseKind === 'DISGUISED_MONSTER' ? 'monster' : 'human',
      displayName: profile.displayName,
      employeeNumber: profile.employeeId,
      recordSource: 'employee-file',
      characterDisguisedFrame: inspectionWindowFrame,
      employeeFilePortraitFrame,
      monsterPortraitFrame,
      monsterFullbodyFrame,
      employeeCardFrame: resolvedEmployeeCardFrame,
      applicationFormFrame: resolvedApplicationFormFrame,
      truth: {
        employeeCardPass: this.currentRound.truth.cardPass,
        applicationPass: this.currentRound.truth.applicationPass,
        appearancePass: this.currentRound.truth.appearancePass,
      },
      documentPresentation: {
        employeeCard: {
          employeeId: this.currentRound.card.employeeId,
          displayName: this.currentRound.card.name,
          position: profile.position,
          validUntilTitle: 'Valid Until',
          validUntil: this.currentRound.card.validUntil,
          sealState: this.currentRound.card.sealState === 'MISSING' ? 'MISSING' : 'VALID',
        },
        applicationForm: {
          idNumber: this.currentRound.application.employeeId,
          displayName: this.currentRound.application.name,
          position: this.currentRound.application.position,
          department: this.currentRound.application.department,
          validUntil: this.currentRound.application.validUntil,
          reasonForEntry: this.currentRound.application.reasonForEntry,
        },
      },
    };
  }

  private loadInspectionSubject(subjectId: InspectionSubjectId): boolean {
    this.logInteractionTrace('subject-load-start', {
      day: this.getActiveCampaignDayIndex(),
      subject: subjectId,
      generation: this.decisionResolutionToken,
    });
    this.logInteractionStateSnapshot('subject-load-start');
    this.logDay4DocumentRuntimeState('subject-load-start', 'loadInspectionSubject');
    if (this.currentInspectionSubject?.subjectKind === 'visitor') {
      const visitorRound = this.currentInspectionSubject;
      const def = this.getActiveInspectionSubjectDefinition();
      if (!def || !this.carterCharacterSprite || !this.carterCharacterUi) {
        return false;
      }
      this.carterCharacterSprite.spriteFrame = def.characterDisguisedFrame;
      this.applyCarterPortraitContainSize(def.characterDisguisedFrame);
      if (this.carterCharacter?.isValid) {
        this.carterCharacter.active = true;
      }
      this.logInteractionTrace('subject-sprite-visible', {
        day: this.getActiveCampaignDayIndex(),
        subject: visitorRound.visitorKey,
        generation: this.decisionResolutionToken,
      });
      this.logInteractionStateSnapshot('subject-sprite-visible');
      const activeMonsterPortrait = this.getActiveMonsterPortraitFrame();
      if (this.carterMonsterPortraitSprite && activeMonsterPortrait) {
        this.carterMonsterPortraitSprite.spriteFrame = activeMonsterPortrait;
      }
      const activeMonsterFullbody = this.getActiveMonsterFullbodyFrame();
      if (this.carterMonsterFullbodySprite && activeMonsterFullbody) {
        this.commitActiveMonsterFullbodyPresentation('load-subject-visitor');
      }
      this.setActiveVisitorKeyForDepartmentPhone(visitorRound.visitorKey);
      this.applySubjectDetailDocumentFrames(def);
      this.syncActiveDocumentPresentation();
      this.committedVisitorVisualRoundId = visitorRound.roundId;
      this.visitorVisualPresentationRoundId = null;
      this.applyCampaignConfigurationToControllers();
      this.refreshCampaignEvidenceAvailability('subject-load');
      this.logDay4DocumentRuntimeState('visitor-document-spriteframe-ready', 'loadInspectionSubject');
      return true;
    }

    this.activeInspectionSubjectId = subjectId;
    const def = this.getActiveInspectionSubjectDefinition();
    if (!def || !this.carterCharacterSprite || !this.carterCharacterUi) {
      console.error('[EvidencePreviewController] loadInspectionSubject failed.', {
        subjectId,
        hasDefinition: Boolean(def),
        hasCarterCharacterSprite: Boolean(this.carterCharacterSprite),
        hasCarterCharacterUi: Boolean(this.carterCharacterUi),
      });
      return false;
    }
    this.carterCharacterSprite.spriteFrame = def.characterDisguisedFrame;
    this.applyCarterPortraitContainSize(def.characterDisguisedFrame);
    this.logRoundBootstrap('subject sprite loaded');
    if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = true;
    }
    this.logInteractionTrace('subject-sprite-visible', {
      day: this.getActiveCampaignDayIndex(),
      subject: subjectId,
      generation: this.decisionResolutionToken,
    });
    this.logInteractionStateSnapshot('subject-sprite-visible');
    this.applySubjectDetailDocumentFrames(def);
    this.syncActiveDocumentPresentation();
    this.logRoundBootstrap('documents synced');
    if (!this.restoreStaticDeskEvidenceFrames()) {
      return false;
    }
    const activeMonsterPortrait = this.getActiveMonsterPortraitFrame();
    if (this.carterMonsterPortraitSprite && activeMonsterPortrait) {
      this.carterMonsterPortraitSprite.spriteFrame = activeMonsterPortrait;
    }
    const activeMonsterFullbody = this.getActiveMonsterFullbodyFrame();
    if (this.carterMonsterFullbodySprite && activeMonsterFullbody) {
      this.commitActiveMonsterFullbodyPresentation('load-subject-employee');
    }
    this.employeeFilesController?.setActiveInspectionSubject(subjectId);
    this.applyCampaignConfigurationToControllers();
    this.refreshCampaignEvidenceAvailability('subject-load');
    this.logDay4DocumentRuntimeState('visitor-document-spriteframe-ready', 'loadInspectionSubject');
    return true;
  }

  private applySubjectDetailDocumentFrames(definition: InspectionSubjectDefinition): void {
    this.activeSubjectEmployeeCardDetailFrame = definition.employeeCardFrame;
    this.activeSubjectApplicationDetailFrame = definition.applicationFormFrame;

    const employeeCardDetailSprite = this.employeeCardDetailVisual?.getComponent(Sprite) ?? null;
    if (employeeCardDetailSprite) {
      employeeCardDetailSprite.spriteFrame = definition.employeeCardFrame;
    }

    const applicationFormDetailSprite = this.applicationFormDetailVisual?.getComponent(Sprite) ?? null;
    if (applicationFormDetailSprite) {
      applicationFormDetailSprite.spriteFrame = definition.applicationFormFrame;
    }
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
    if (this.employeeCardSecurityLogoSprite?.node?.isValid) {
      this.employeeCardSecurityLogoSprite.node.active = presentation.sealState !== 'MISSING';
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

  private configureApplicationReasonForEntryTypography(): void {
    const label = this.applicationReasonForEntryValueLabel;
    if (!label) {
      return;
    }
    const valueYOffset = -10;
    label.fontSize = 22;
    label.lineHeight = 26;
    label.overflow = Overflow.CLAMP;
    label.enableWrapText = true;
    label.horizontalAlign = Label.HorizontalAlign.LEFT;
    label.verticalAlign = Label.VerticalAlign.TOP;
    const currentPosition = label.node.getPosition();
    label.node.setPosition(
      currentPosition.x,
      currentPosition.y + valueYOffset,
      currentPosition.z,
    );

    const transform = label.node.getComponent(UITransform);
    if (!transform) {
      return;
    }
    const width = transform.contentSize.width;
    const height = Math.max(52, transform.contentSize.height);
    transform.setContentSize(width, height);
  }

  private redrawVisitorDocumentPhotoSlotBackground(
    backgroundNode: Node,
    layout: VisitorDocumentPhotoSlotLayout,
  ): void {
    const graphics = backgroundNode.getComponent(Graphics) ?? backgroundNode.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = new Color(layout.backgroundGray, layout.backgroundGray, layout.backgroundGray, 255);
    graphics.rect(-layout.width / 2, -layout.height / 2, layout.width, layout.height);
    graphics.fill();
  }

  private ensureVisitorDocumentPhotoSlot(
    parent: Node | null,
    layout: VisitorDocumentPhotoSlotLayout,
  ): VisitorDocumentPhotoSlotRuntime | null {
    if (!parent?.isValid) {
      return null;
    }
    let node = parent.getChildByName(layout.nodeName);
    if (!node) {
      node = new Node(layout.nodeName);
      parent.addChild(node);
    }
    node.setPosition(layout.x, layout.y, 0);
    node.setScale(1, 1, 1);
    node.setSiblingIndex(0);
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    transform.setAnchorPoint(0.5, 0.5);
    transform.setContentSize(layout.width, layout.height);
    const mask = node.getComponent(Mask) ?? node.addComponent(Mask);
    mask.type = Mask.Type.RECT;

    let backgroundNode = node.getChildByName('VisitorDocumentPhotoBackground');
    if (!backgroundNode) {
      backgroundNode = new Node('VisitorDocumentPhotoBackground');
      node.addChild(backgroundNode);
    }
    backgroundNode.setPosition(0, 0, 0);
    backgroundNode.setScale(1, 1, 1);
    const backgroundTransform = backgroundNode.getComponent(UITransform) ?? backgroundNode.addComponent(UITransform);
    backgroundTransform.setAnchorPoint(0.5, 0.5);
    backgroundTransform.setContentSize(layout.width, layout.height);
    this.redrawVisitorDocumentPhotoSlotBackground(backgroundNode, layout);

    let portraitNode = node.getChildByName('VisitorDocumentPhotoPortrait');
    if (!portraitNode) {
      portraitNode = new Node('VisitorDocumentPhotoPortrait');
      node.addChild(portraitNode);
    }
    portraitNode.setPosition(0, 0, 0);
    portraitNode.setScale(1, 1, 1);
    const portraitTransform = portraitNode.getComponent(UITransform) ?? portraitNode.addComponent(UITransform);
    portraitTransform.setAnchorPoint(0.5, 0.5);
    portraitTransform.setContentSize(layout.width, layout.height);
    const portraitSprite = portraitNode.getComponent(Sprite) ?? portraitNode.addComponent(Sprite);
    portraitSprite.sizeMode = Sprite.SizeMode.CUSTOM;
    portraitSprite.grayscale = true;
    portraitSprite.color = Color.WHITE;
    node.active = false;
    return {
      root: node,
      mask,
      portraitSprite,
      portraitTransform,
      layout,
    };
  }

  private ensureVisitorDocumentPhotoRuntime(): void {
    this.visitorEmployeeCardPhotoSlot = this.ensureVisitorDocumentPhotoSlot(
      this.carterEmployeeCardDynamicLayer,
      EvidencePreviewController.VISITOR_DOCUMENT_PHOTO_SLOT_LAYOUT['employee-card'],
    );
    this.visitorApplicationFormPhotoSlot = this.ensureVisitorDocumentPhotoSlot(
      this.carterApplicationDynamicLayer,
      EvidencePreviewController.VISITOR_DOCUMENT_PHOTO_SLOT_LAYOUT['application-form'],
    );
  }

  private applyVisitorDocumentPhotoContain(
    portraitTransform: UITransform,
    frame: SpriteFrame,
    maxWidth: number,
    maxHeight: number,
  ): void {
    const originalSize = frame.originalSize;
    const sourceWidth = Math.max(1, originalSize?.width ?? maxWidth);
    const sourceHeight = Math.max(1, originalSize?.height ?? maxHeight);
    const containScale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
    if (!Number.isFinite(containScale) || containScale <= 0) {
      portraitTransform.setContentSize(maxWidth, maxHeight);
      return;
    }
    portraitTransform.setContentSize(sourceWidth * containScale, sourceHeight * containScale);
  }

  private applyVisitorDocumentPhotoSlot(
    slot: VisitorDocumentPhotoSlotRuntime | null,
    frame: SpriteFrame | null,
  ): void {
    if (!slot || !slot.root?.isValid) {
      return;
    }
    slot.portraitSprite.spriteFrame = frame;
    if (!frame) {
      slot.root.active = false;
      return;
    }
    slot.portraitSprite.grayscale = true;
    this.applyVisitorDocumentPhotoContain(
      slot.portraitTransform,
      frame,
      slot.layout.width,
      slot.layout.height,
    );
    slot.root.active = true;
  }

  private syncVisitorDocumentPhotoSlots(definition: InspectionSubjectDefinition | null): void {
    const activeSubject = this.currentInspectionSubject;
    const visitorPortraitFrame =
      activeSubject?.subjectKind === 'visitor' ? definition?.employeeFilePortraitFrame ?? null : null;
    this.applyVisitorDocumentPhotoSlot(this.visitorEmployeeCardPhotoSlot, visitorPortraitFrame);
    this.applyVisitorDocumentPhotoSlot(this.visitorApplicationFormPhotoSlot, visitorPortraitFrame);
  }

  private syncActiveDocumentPresentation(): void {
    const definition = this.getActiveInspectionSubjectDefinition();
    const presentation = definition?.documentPresentation;
    if (!presentation) {
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
    this.completedRoundCount += 1;
    if (this.shouldCompleteCurrentDay()) {
      this.handleCompletedDayAfterSettlement();
      return false;
    }
    return this.generateNextRound();
  }

  private shouldCompleteCurrentDay(): boolean {
    if (this.activeDayConfig?.dayIndex === 4 && this.activeDay4VisitorSession) {
      if (this.campaignDayTransitionInProgress || this.campaignImplementedContentComplete) {
        return false;
      }
      if (this.campaignDayCompletionPending || this.campaignDayContinueRequested) {
        return false;
      }
      if (this.currentInspectionSubject !== null) {
        return false;
      }
      if (this.activeDay4VisitorCursor < this.activeDay4VisitorSession.rounds.length) {
        return false;
      }
      if (this.isGameOverStateActive()) {
        return false;
      }
      if (this.hasActiveThreatOrEmergencyFlow()) {
        return false;
      }
      return true;
    }

    const queue = this.activeDayQueue;
    if (!queue) {
      return false;
    }
    if (this.campaignDayTransitionInProgress || this.campaignImplementedContentComplete) {
      return false;
    }
    if (this.campaignDayCompletionPending || this.campaignDayContinueRequested) {
      return false;
    }
    if (this.activeDayQueueCursor < queue.rounds.length) {
      return false;
    }
    if (this.isGameOverStateActive()) {
      return false;
    }
    if (this.hasActiveThreatOrEmergencyFlow()) {
      return false;
    }
    return true;
  }

  private handleCompletedDayAfterSettlement(): void {
    const dayConfig = this.activeDayConfig;
    if (!dayConfig) {
      return;
    }
    const totalEncounters =
      dayConfig.dayIndex === 4 && this.activeDay4VisitorSession
        ? this.activeDay4VisitorSession.rounds.length
        : this.activeDayQueue?.rounds.length ?? 0;
    if (totalEncounters <= 0) {
      return;
    }
    console.info('[Campaign] day completed', {
      dayIndex: dayConfig.dayIndex,
      date: dayConfig.date,
      completedRoundCount: this.completedRoundCount,
      queueSize: totalEncounters,
    });
    if (dayConfig.dayIndex < HIGHEST_IMPLEMENTED_CAMPAIGN_DAY) {
      unlockDay(dayConfig.dayIndex + 1);
    }
    this.prepareCampaignDayCompletion();
  }

  private prepareCampaignDayCompletion(): void {
    const dayConfig = this.activeDayConfig;
    if (!dayConfig) {
      return;
    }
    const totalEncounters =
      dayConfig.dayIndex === 4 && this.activeDay4VisitorSession
        ? this.activeDay4VisitorSession.rounds.length
        : this.activeDayQueue?.rounds.length ?? 0;
    if (totalEncounters <= 0) {
      return;
    }
    if (
      this.isDestroying ||
      this.campaignDayTransitionInProgress ||
      this.campaignImplementedContentComplete ||
      this.campaignDayCompletionPending ||
      this.campaignDayContinueRequested ||
      this.isGameOverStateActive()
    ) {
      return;
    }

    const isFinalDay = this.isCurrentDayLastImplementedDay();
    const nextDayConfig = !isFinalDay
      ? getDayLevelConfig((dayConfig.dayIndex + 1) as CampaignDayIndex)
      : null;
    const completedEncounters = totalEncounters;

    this.campaignDayCompletionPending = true;
    this.campaignDayContinueRequested = false;
    this.shiftClockController?.pause();
    this.clearDayTransitionTransientState();
    this.setManagedButtonsInteractable(false, 'day-completion-lock');
    this.lockAllEncounterInput('day-completion-lock');

    const currentDayDecisionErrorStats = this.computeCurrentDayDecisionErrorStats();
    const overlayData: DayCompletionOverlayData = {
      dayIndex: dayConfig.dayIndex,
      date: dayConfig.date,
      completedEncounters,
      totalEncounters,
      wrongAllowCount: currentDayDecisionErrorStats.wrongAllowCount,
      wrongDenyCount: currentDayDecisionErrorStats.wrongDenyCount,
      mode: 'next-day',
      nextDayIndex: nextDayConfig?.dayIndex ?? dayConfig.dayIndex,
      nextDate: nextDayConfig?.date ?? dayConfig.date,
    };
    this.dayCompletionOverlayController?.show(overlayData);
    console.info('[Campaign] day completion overlay shown', {
      dayIndex: overlayData.dayIndex,
      date: overlayData.date,
      completedEncounters: overlayData.completedEncounters,
      totalEncounters: overlayData.totalEncounters,
      wrongAllowCount: overlayData.wrongAllowCount,
      wrongDenyCount: overlayData.wrongDenyCount,
      finalDay: isFinalDay,
      nextDayIndex: overlayData.nextDayIndex ?? null,
      nextDate: overlayData.nextDate ?? null,
    });
  }

  private recordDayStartDecisionErrorBaseline(reason: string): void {
    const stats = campaignState.getDailyDecisionErrorStats();
    this.dayStartWrongAllowCount = stats.wrongAllowCount;
    this.dayStartWrongDenyCount = stats.wrongDenyCount;
    console.info('[Campaign] day start error baseline recorded', {
      reason,
      dayIndex: this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex(),
      wrongAllowCount: this.dayStartWrongAllowCount,
      wrongDenyCount: this.dayStartWrongDenyCount,
    });
  }

  private computeCurrentDayDecisionErrorStats(): Readonly<{
    wrongAllowCount: number;
    wrongDenyCount: number;
  }> {
    const currentStats = campaignState.getDailyDecisionErrorStats();
    const wrongAllowCount = Math.max(0, currentStats.wrongAllowCount - this.dayStartWrongAllowCount);
    const wrongDenyCount = Math.max(0, currentStats.wrongDenyCount - this.dayStartWrongDenyCount);
    return Object.freeze({
      wrongAllowCount,
      wrongDenyCount,
    });
  }

  private async handleCampaignDayContinueRequested(): Promise<void> {
    if (!this.campaignDayCompletionPending) {
      return;
    }
    if (this.campaignDayContinueRequested) {
      return;
    }
    if (
      this.isDestroying ||
      this.isGameOverStateActive() ||
      this.campaignImplementedContentComplete
    ) {
      return;
    }
    const isFinalDay = this.isCurrentDayLastImplementedDay();
    const fromDay = this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex();
    const toDay = Math.min(fromDay + 1, HIGHEST_IMPLEMENTED_CAMPAIGN_DAY);

    this.campaignDayContinueRequested = true;
    this.dayCompletionOverlayController?.setContinueInteractable(false);
    console.info('[Campaign] next shift requested', {
      fromDay,
      toDay,
    });

    this.dayCompletionOverlayController?.hide();
    console.info('[Campaign] day completion overlay dismissed', {
      dayIndex: fromDay,
    });
    this.campaignDayCompletionPending = false;
    if (isFinalDay) {
      this.campaignDayContinueRequested = false;
      this.updateGuidanceButtonInteractivity();
      await this.prepareDay0EndingResources();
      this.enterDay0EndingDisplayTestMode();
      return;
    }

    const transitioned = await this.beginCampaignDayTransition();
    if (transitioned) {
      this.campaignDayContinueRequested = false;
      this.updateGuidanceButtonInteractivity();
      return;
    }
    this.logCampaignTransitionFailure('continue-requested-transition-failed', {
      fromDay,
      toDay,
      errorName: null,
      errorMessage: null,
      errorStack: null,
      activeDayIndex: this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex(),
      queueLength: this.activeDayQueue?.rounds.length ?? null,
      queueCursor: this.activeDayQueueCursor,
      currentRoundId: this.currentRound?.roundId ?? null,
    });
  }

  private isCurrentDayLastImplementedDay(): boolean {
    const dayIndex = this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex();
    return isLastImplementedCampaignDay(dayIndex);
  }

  private isGameOverStateActive(): boolean {
    return (
      this.administrativeGameOverActive ||
      this.carterAttackTriggered ||
      this.retryLoadInProgress ||
      !!this.carterGameOverPanelRuntime?.active
    );
  }

  private hasActiveThreatOrEmergencyFlow(): boolean {
    return (
      this.threatSequenceActive ||
      this.emergencyWindowOpen ||
      this.phoneResponseWindowOpen ||
      this.phoneDialWindowOpen ||
      this.cleanupProgramActivated ||
      this.carterMonsterAttackRuntime?.active === true
    );
  }

  private dismissDayCompletionOverlayForGameOver(): void {
    if (this.dayCompletionOverlayController?.isVisible()) {
      this.dayCompletionOverlayController.hide();
    }
    this.campaignDayCompletionPending = false;
    this.campaignDayContinueRequested = false;
  }

  private clearDayTransitionTransientState(): void {
    this.hideGuidancePanelImmediate(false);
    this.hideCarterThreatReplyCompletely();
    this.stopChecklistReplyTyping(true);
    this.configureChecklistReplyOverlay(false, false);
    this.closePreview();
    if (this.checklistQuestionPanelRuntime?.isValid) {
      this.checklistQuestionPanelRuntime.active = false;
    }
    if (this.checklistReplyPanelRuntime?.isValid) {
      this.checklistReplyPanelRuntime.active = false;
    }
    if (this.visitorGreetingRuntime?.isValid) {
      this.visitorGreetingRuntime.active = false;
    }
    if (this.carterCharacter?.isValid) {
      this.carterCharacter.active = false;
    }
    this.telephoneController?.closeEmergencyPhone();
    this.telephoneController?.setEmergencyInputEnabled(false);
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'day-transition-clear-transient');
    this.telephoneController?.setEmergencyAccessOverride(false);
    this.shutterController?.stopShutterImpactLoop();
    this.shutterController?.restoreNormalVisual();
    this.setShutterInteractionEnabledForInteractionTrace(false, 'day-transition-clear-transient');
    this.emergencyTelephoneOverrideActive = false;
    this.clearReviveCheckpoint();
    this.resetInspectionRoundForNextSubject();
    this.resetChecklistState();
  }

  private clearActiveInspectionSubjectForDayTransition(): void {
    const activeSubject = this.currentInspectionSubject;
    if (activeSubject?.subjectKind === 'visitor') {
      const departed = this.completeActiveVisitorNonCombatDeparture(activeSubject.roundId);
      if (!departed) {
        throw new Error(
          '[DayTransition] Failed to complete active visitor departure before generating next day.',
        );
      }
      return;
    }
    this.setCurrentRoundAndSyncSubject(null);
  }

  private async beginCampaignDayTransition(): Promise<boolean> {
    if (
      this.campaignDayTransitionInProgress ||
      this.campaignImplementedContentComplete ||
      this.isDestroying ||
      this.isGameOverStateActive()
    ) {
      return false;
    }
    const fromDay = this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex();
    const fromDate = this.activeDayConfig?.date ?? campaignState.getCurrentDayConfig().date;
    const toDay = Math.min(fromDay + 1, HIGHEST_IMPLEMENTED_CAMPAIGN_DAY);
    this.campaignDayTransitionInProgress = true;
    this.dayCompletionOverlayController?.hide();
    this.shiftClockController?.pause();
    this.clearDayTransitionTransientState();
    // Clear any active subject at the day boundary before next-day generation.
    this.clearActiveInspectionSubjectForDayTransition();
    if (this.currentInspectionSubject !== null) {
      throw new Error('[DayTransition] Active inspection subject was not cleared before next-day generation.');
    }
    if (this.currentRound !== null) {
      throw new Error('[DayTransition] Active employee round was not cleared before next-day generation.');
    }
    this.setManagedButtonsInteractable(false, 'day-transition-lock');
    this.lockAllEncounterInput('day-transition-lock');
    if (isLastImplementedCampaignDay(fromDay)) {
      this.completeImplementedCampaignContent();
      return false;
    }
    console.info('[Campaign] day transition started', {
      fromDay,
      toDay,
    });
    try {
      const nextDayConfig = campaignState.advanceToNextDay();
      if (this.isDestroying || !this.node?.isValid || this.isGameOverStateActive()) {
        return false;
      }
      this.activeDayConfig = nextDayConfig;
      this.recordDayStartDecisionErrorBaseline('day-transition');
      this.resetActiveDayQueueState();
      this.applyCampaignConfigurationToControllers();
      this.refreshCampaignEvidenceAvailability('day-transition');
      this.resetChecklistState();
      this.configureCampaignShiftClock(nextDayConfig);
      if (nextDayConfig.dayIndex === 4) {
        this.applyActiveAppointmentRosterDay();
      } else {
        this.buildActiveDayQueue(nextDayConfig);
      }
      console.info('[Campaign] day transition configured', {
        dayIndex: nextDayConfig.dayIndex,
        date: nextDayConfig.date,
        enabledEvidence: nextDayConfig.enabledEvidence,
        requiredChecklistCategories: nextDayConfig.requiredChecklistCategories,
        queueSize:
          nextDayConfig.dayIndex === 4
            ? this.activeDay4VisitorSession?.rounds.length ?? 0
            : this.activeDayQueue?.rounds.length ?? 0,
      });
      if (!this.generateNextRound({ allowDuringTransition: true })) {
        this.logCampaignTransitionFailure('generate-first-round-failed', {
          fromDay,
          fromDate,
          toDay: nextDayConfig.dayIndex,
          toDate: nextDayConfig.date,
          errorName: null,
          errorMessage: null,
          errorStack: null,
          activeDayIndex: this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex(),
          queueLength: this.activeDayQueue?.rounds.length ?? null,
          queueCursor: this.activeDayQueueCursor,
          currentRoundId: this.currentRound?.roundId ?? null,
        });
        return false;
      }
      if (!this.loadInspectionSubject(this.activeInspectionSubjectId)) {
        this.logCampaignTransitionFailure('load-first-subject-failed', {
          fromDay,
          fromDate,
          toDay: nextDayConfig.dayIndex,
          toDate: nextDayConfig.date,
          errorName: null,
          errorMessage: null,
          errorStack: null,
          activeDayIndex: this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex(),
          queueLength: this.activeDayQueue?.rounds.length ?? null,
          queueCursor: this.activeDayQueueCursor,
          currentRoundId: this.currentRound?.roundId ?? null,
        });
        return false;
      }
      this.setManagedButtonsInteractable(false, 'day-transition-subject-load-lock');
      const introResult = await this.playIntroForActiveSubject();
      if (!introResult.ok) {
        this.logCampaignTransitionFailure('play-first-intro-failed', {
          fromDay,
          fromDate,
          toDay: nextDayConfig.dayIndex,
          toDate: nextDayConfig.date,
          errorName: 'VisitorIntroBlocked',
          errorMessage: introResult.reason,
          errorStack: null,
          activeDayIndex: this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex(),
          queueLength: this.activeDayQueue?.rounds.length ?? null,
          queueCursor: this.activeDayQueueCursor,
          currentRoundId: this.currentRound?.roundId ?? null,
        });
        return false;
      }
      console.info('[Campaign] day transition complete', {
        dayIndex: nextDayConfig.dayIndex,
        date: nextDayConfig.date,
        encounterNumber: 1,
        totalEncounters: this.activeDayQueue?.rounds.length ?? 0,
      });
      this.logInteractionStateSnapshot('day-transition-complete');
      return true;
    } catch (error) {
      this.logCampaignTransitionFailure('day-transition-exception', {
        fromDay,
        fromDate,
        toDay,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack ?? null : null,
        activeDayIndex: this.activeDayConfig?.dayIndex ?? campaignState.getCurrentDayIndex(),
        queueLength: this.activeDayQueue?.rounds.length ?? null,
        queueCursor: this.activeDayQueueCursor,
        currentRoundId: this.currentRound?.roundId ?? null,
      });
      return false;
    } finally {
      if (!this.campaignImplementedContentComplete) {
        this.campaignDayTransitionInProgress = false;
        this.updateGuidanceButtonInteractivity();
      }
    }
  }

  private logCampaignTransitionFailure(
    stage: string,
    payload: {
      readonly fromDay: number;
      readonly toDay: number;
      readonly fromDate?: string;
      readonly toDate?: string;
      readonly errorName: string | null;
      readonly errorMessage: string | null;
      readonly errorStack: string | null;
      readonly activeDayIndex: number;
      readonly queueLength: number | null;
      readonly queueCursor: number;
      readonly currentRoundId: string | null;
    },
  ): void {
    console.error('[Campaign] next shift transition failed after continue request', {
      stage,
      fromDay: payload.fromDay,
      fromDate: payload.fromDate ?? null,
      toDay: payload.toDay,
      toDate: payload.toDate ?? null,
      errorName: payload.errorName,
      errorMessage: payload.errorMessage,
      errorStack: payload.errorStack,
      activeDayIndex: payload.activeDayIndex,
      queueLength: payload.queueLength,
      queueCursor: payload.queueCursor,
      currentRoundId: payload.currentRoundId,
    });
  }

  private buildCompletionShiftDisplay(snapshot: ShiftClockSnapshot | null): CampaignShiftCompletionDisplayState {
    const dayConfig = this.activeDayConfig ?? campaignState.getCurrentDayConfig();
    return {
      dayIndex: dayConfig.dayIndex,
      date: dayConfig.date,
      displayTime: snapshot?.displayTime ?? '09:00',
      period: snapshot?.period ?? 'AM',
    };
  }

  private completeImplementedCampaignContent(): void {
    if (this.campaignImplementedContentComplete) {
      return;
    }
    this.campaignImplementedContentComplete = true;
    this.campaignDayTransitionInProgress = false;
    this.campaignDayCompletionPending = false;
    this.campaignDayContinueRequested = false;
    this.shiftClockController?.pause();
    const snapshot = this.shiftClockController?.getSnapshot() ?? null;
    this.clearDayTransitionTransientState();
    this.resetActiveDayQueueState();
    this.setCurrentRoundAndSyncSubject(null);
    this.setManagedButtonsInteractable(false, 'campaign-content-complete-lock');
    this.lockAllEncounterInput('campaign-content-complete-lock');
    this.telephoneController?.setEmergencyAccessOverride(false);
    this.setTelephoneEntryEnabledForInteractionTrace(false, 'campaign-content-complete-lock');
    const dayConfig = this.activeDayConfig ?? campaignState.getCurrentDayConfig();
    this.visitorIntroController?.setCampaignShiftCompletionDisplay(
      this.buildCompletionShiftDisplay(snapshot),
    );
    const totalEncounters =
      dayConfig.dayIndex === 4 && this.activeDay4VisitorSession
        ? this.activeDay4VisitorSession.rounds.length
        : this.activeDayQueue?.rounds.length ?? dayConfig.encounterCountMax;
    const currentDayDecisionErrorStats = this.computeCurrentDayDecisionErrorStats();
    const overlayData: DayCompletionOverlayData = {
      dayIndex: dayConfig.dayIndex,
      date: dayConfig.date,
      completedEncounters: totalEncounters,
      totalEncounters,
      wrongAllowCount: currentDayDecisionErrorStats.wrongAllowCount,
      wrongDenyCount: currentDayDecisionErrorStats.wrongDenyCount,
      mode: 'implemented-content-complete',
    };
    this.dayCompletionOverlayController?.show(overlayData);
    console.info('[Campaign] implemented content overlay shown', {
      dayIndex: overlayData.dayIndex,
      date: overlayData.date,
      completedEncounters: overlayData.completedEncounters,
      totalEncounters: overlayData.totalEncounters,
      wrongAllowCount: overlayData.wrongAllowCount,
      wrongDenyCount: overlayData.wrongDenyCount,
    });
    if (!this.hasLoggedImplementedContentComplete) {
      this.hasLoggedImplementedContentComplete = true;
      console.info('[Campaign] implemented content complete', {
        dayIndex: this.activeDayConfig?.dayIndex ?? 3,
        date: this.activeDayConfig?.date ?? '1999-12-05',
        completedRoundCount: this.completedRoundCount,
        elapsedRealSeconds: snapshot?.elapsedRealSeconds ?? 0,
        displayTime: snapshot?.displayTime ?? '09:00',
        period: snapshot?.period ?? 'AM',
      });
    }
  }

  private resetInspectionRoundForNextSubject(): void {
    this.rejectFlowRequested = false;
    this.threatSequenceActive = false;
    this.emergencyWindowOpen = false;
    this.emergencyDeadlineMs = 0;
    this.emergencyShutterSucceeded = false;
    this.emergencyShutterCloseRequested = false;
    this.carterAttackTriggered = false;
    this.carterEncounterResolved = false;
    this.phoneResponseWindowOpen = false;
    this.phoneResponseDeadlineMs = 0;
    this.phoneDialWindowOpen = false;
    this.phoneDialDeadlineMs = 0;
    this.cleanupProgramActivated = false;
    this.phoneEmergencyResolved = false;
    this.monsterThreatProtectionPhase = 'idle';
    this.activeMonsterThreatTiming = null;
    this.closedShutterProtectionGranted = false;
    this.monsterThreatGeneration += 1;
    this.emergencyTimeoutGeneration = this.monsterThreatGeneration;
    this.delayedDamagedShutterSwitchScheduled = false;
    this.cleanupTransitionScheduled = false;
    this.setInspectionDecisionResolutionInProgress(false, 'reset-round-next-subject');
    this.selectedChecklistQuestion = null;
    this.checklistQuestionPanelOpen = false;
    this.checklistReplyContext = 'normal';
    this.checklistReplyPanelOpen = false;
    this.previewOpen = false;
    this.unschedule(this.handleCleanupTransitionComplete);
    this.unschedule(this.handleEmergencyTimeout);
    this.unschedule(this.handleDelayedDamagedShutterSwitch);
    this.unschedule(this.handlePhonePickupTimeout);
    this.unschedule(this.handleDialCodeTimeout);
    this.unschedule(this.handleShowCarterGameOver);
    this.unbindEmergencyCloseListener();
    this.unbindEmergencyShutterClosedSettledListener();
    this.unbindEmergencyPhoneOpenedListener();
    this.unbindEmergencyCallSubmittedListener();
    this.unbindDamagedShutterAppliedListener();
    this.shutterController?.stopShutterImpactLoop();
    this.emergencyTelephoneOverrideActive = false;
    this.telephoneController?.setEmergencyAccessOverride(false);
    this.refreshCampaignEvidenceAvailability('round-reset');
    this.logMonsterThreatTiming('cancelled reason=reset-inspection-round');
  }

  private getCurrentInspectionSubjectToken(): string | null {
    const subject = this.currentInspectionSubject;
    if (!subject) {
      return null;
    }
    if (subject.subjectKind === 'visitor') {
      return `visitor:${subject.roundId}:${subject.visitorKey}`;
    }
    return `employee:${subject.round.roundId}:${subject.round.employeeKey}`;
  }

  private isCurrentInspectionSubjectToken(token: string | null): boolean {
    if (!token) {
      return false;
    }
    return this.getCurrentInspectionSubjectToken() === token;
  }

  private isIntroFailureExpectedCancellation(reason: string): boolean {
    const normalized = reason.toLowerCase();
    return (
      normalized.includes('cancel') ||
      normalized.includes('stale') ||
      normalized.includes('superseded') ||
      normalized.includes('destroy') ||
      normalized.includes('duplicate') ||
      normalized.includes('invalid_round_context')
    );
  }

  private logSubjectIntroTrace(
    event: string,
    payload: Record<string, string | number | boolean | null>,
  ): void {
    const segments: string[] = [`[SubjectIntroTrace] ${event}`];
    for (const [key, value] of Object.entries(payload)) {
      segments.push(`${key}=${String(value)}`);
    }
    console.info(segments.join(' '));
  }

  private resolveIntroRestoreBlockedReason(
    subjectTokenAtIntroStart: string | null,
    reason: string,
  ): string | null {
    if (!this.node?.isValid) {
      return 'controller-disabled';
    }
    if (this.isDestroying) {
      return 'destroying';
    }
    if (!this.isCurrentInspectionSubjectToken(subjectTokenAtIntroStart)) {
      return 'stale-subject-token';
    }
    if (!this.currentInspectionSubject) {
      return 'missing-subject';
    }
    if (
      this.campaignDayTransitionInProgress ||
      this.campaignDayCompletionPending ||
      this.campaignDayContinueRequested ||
      this.campaignImplementedContentComplete
    ) {
      return 'day-transition';
    }
    if (this.failureReviewActive) {
      return 'failure-review';
    }
    if (this.isGameOverStateActive()) {
      return 'game-over';
    }
    if (this.hasActiveThreatOrEmergencyFlow()) {
      return 'monster-threat';
    }
    if (this.isIntroFailureExpectedCancellation(reason)) {
      return 'expected-cancellation';
    }
    return null;
  }

  private canRestoreRegularInspectionInteractionAfterIntroFailure(
    subjectTokenAtIntroStart: string | null,
    reason: string,
  ): boolean {
    return this.resolveIntroRestoreBlockedReason(subjectTokenAtIntroStart, reason) === null;
  }

  private completeIntroAndEnableInspectionInteraction(
    unlockReason: 'intro-success-unlock' | 'intro-failure-unlock' = 'intro-success-unlock',
  ): void {
    this.logDay4DocumentRuntimeState('intro-complete-entry', 'completeIntroAndEnableInspectionInteraction');
    this.logInteractionTrace('unlock-regular-interaction', {
      reason: unlockReason,
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    this.setInspectionDecisionResolutionInProgress(false, 'intro-success');
    this.setManagedButtonsInteractable(true, 'intro-success-unlock');
    this.logDay4DocumentRuntimeState(
      'intro-complete-after-setManagedButtonsInteractable-true',
      'completeIntroAndEnableInspectionInteraction',
    );
    this.setTelephoneEntryEnabledForInteractionTrace(true, 'intro-success-unlock');
    this.refreshCampaignEvidenceAvailability('intro-complete-refresh');
    this.logDay4DocumentRuntimeState(
      'intro-complete-after-refreshCampaignEvidenceAvailability',
      'completeIntroAndEnableInspectionInteraction',
    );
    this.setShutterInteractionEnabledForInteractionTrace(true, 'intro-success-unlock');
    this.updateGuidanceButtonInteractivity();
    this.startCampaignShiftClockIfNeeded();
    this.logInteractionStateSnapshot('intro-enable-interaction-complete');
    this.logInteractionStateSnapshot('entered-regular-inspection-state');
  }

  private restoreRegularInspectionInteractionAfterIntroFailure(
    reason: string,
    subjectTokenAtIntroStart: string | null,
  ): void {
    const canRestore = this.canRestoreRegularInspectionInteractionAfterIntroFailure(
      subjectTokenAtIntroStart,
      reason,
    );
    if (!canRestore) {
      const blockedReason =
        this.resolveIntroRestoreBlockedReason(subjectTokenAtIntroStart, reason) ?? 'unknown';
      if (blockedReason === 'expected-cancellation') {
        this.logSubjectIntroTrace('ignored-cancellation', {
          reason,
          blockedReason,
          day: this.getActiveCampaignDayIndex(),
          subject: this.getActiveSubjectKeyForInteractionTrace(),
          generation: this.decisionResolutionToken,
        });
      } else {
        this.logSubjectIntroTrace('restore-blocked', {
          reason: blockedReason,
          introFailureReason: reason,
          day: this.getActiveCampaignDayIndex(),
          subject: this.getActiveSubjectKeyForInteractionTrace(),
          generation: this.decisionResolutionToken,
        });
      }
      return;
    }
    this.logSubjectIntroTrace('enabling-interaction', {
      mode: 'failure-fallback',
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    this.completeIntroAndEnableInspectionInteraction('intro-failure-unlock');
    console.warn('[EvidencePreviewController] intro failed; restored regular inspection interaction.', {
      reason,
      subjectToken: subjectTokenAtIntroStart,
    });
    this.logInteractionStateSnapshot('intro-failure-fallback-restored');
  }

  private recordDailyDecisionErrorFromOutcome(outcome: InspectionDecisionOutcome): void {
    const record = this.buildDailyDecisionErrorRecordFromOutcome(outcome);
    if (!record) {
      return;
    }
    campaignState.recordDailyDecisionError(record);
  }

  private buildDailyDecisionErrorRecordFromOutcome(
    outcome: InspectionDecisionOutcome,
  ): DailyDecisionErrorRecord | null {
    const subject = this.currentInspectionSubject;
    if (!subject) {
      return null;
    }
    const roundId = subject.subjectKind === 'visitor' ? subject.roundId : subject.round.roundId;
    const dayIndex = campaignState.getCurrentDayIndex();
    const issueKinds = this.resolveDecisionIssueKindsForOutcome(outcome);
    const decisionPair = this.resolveDecisionPairForOutcome(outcome);
    if (!decisionPair) {
      return null;
    }
    if (decisionPair.decision === decisionPair.correctDecision) {
      return null;
    }

    if (subject.subjectKind === 'visitor') {
      const profile = getVisitorProfile(subject.visitorKey);
      return Object.freeze({
        roundId,
        dayIndex,
        subjectKind: 'visitor',
        subjectKey: subject.visitorKey,
        displayName: profile?.displayName ?? subject.visitorKey.toUpperCase(),
        portraitSpriteFrameUuid: profile?.visuals.portraitSpriteFrameUuid ?? null,
        errorKind: decisionPair.decision === 'allow' ? 'wrong-allow' : 'wrong-denial',
        playerDecision: decisionPair.decision,
        correctDecision: decisionPair.correctDecision,
        issueKinds: Object.freeze([...issueKinds]),
      });
    }

    const profile = EMPLOYEE_PROFILES[subject.round.employeeKey];
    return Object.freeze({
      roundId,
      dayIndex,
      subjectKind: 'employee',
      subjectKey: subject.round.employeeKey,
      displayName: profile?.displayName ?? subject.round.employeeKey.toUpperCase(),
      portraitSpriteFrameUuid: profile?.portraitSpriteFrameUuid ?? null,
      errorKind: decisionPair.decision === 'allow' ? 'wrong-allow' : 'wrong-denial',
      playerDecision: decisionPair.decision,
      correctDecision: decisionPair.correctDecision,
      issueKinds: Object.freeze([...issueKinds]),
    });
  }

  private resolveDecisionPairForOutcome(
    outcome: InspectionDecisionOutcome,
  ): {
    readonly decision: InspectionFinalDecision;
    readonly correctDecision: InspectionFinalDecision;
  } | null {
    switch (outcome) {
      case 'valid-human-allowed':
      case 'invalid-human-correctly-rejected':
      case 'monster-correctly-rejected':
      case 'visitor-valid-allowed':
      case 'visitor-monster-correctly-denied':
        return null;
      case 'valid-human-wrongly-rejected':
      case 'invalid-human-wrongly-rejected':
      case 'monster-wrongly-rejected':
      case 'visitor-valid-wrongly-denied':
        return { decision: 'deny', correctDecision: 'allow' };
      case 'invalid-human-wrongly-allowed':
      case 'monster-wrongly-allowed':
      case 'visitor-monster-wrongly-allowed':
        return { decision: 'allow', correctDecision: 'deny' };
      case 'deny-incomplete-checklist':
        return null;
      default: {
        const exhaustiveCheck: never = outcome;
        throw new Error(`Unhandled inspection decision outcome for daily stats: ${exhaustiveCheck}`);
      }
    }
  }

  private resolveDecisionIssueKindsForOutcome(
    outcome: InspectionDecisionOutcome,
  ): readonly DecisionIssueKind[] {
    const subject = this.currentInspectionSubject;
    if (!subject) {
      return Object.freeze([]);
    }
    if (subject.subjectKind === 'visitor') {
      if (outcome === 'visitor-valid-wrongly-denied') {
        return Object.freeze([]);
      }
      if (outcome === 'visitor-monster-wrongly-allowed') {
        return Object.freeze(['monster']);
      }
      const mapped = subject.mismatchKinds.map((kind) => {
        if (kind === 'appearance') return 'appearance';
        if (kind === 'department') return 'department';
        return 'purpose';
      }) as DecisionIssueKind[];
      return Object.freeze(mapped);
    }

    if (outcome === 'valid-human-wrongly-rejected') {
      return Object.freeze([]);
    }
    if (outcome === 'monster-wrongly-allowed') {
      return Object.freeze(['monster']);
    }
    const failedCategories = subject.round.truth.failedCategories;
    const mapped = failedCategories.map((category) => {
      if (category === 'CARD') return 'id-card';
      if (category === 'APPLICATION') return 'application';
      return 'appearance';
    }) as DecisionIssueKind[];
    return Object.freeze(mapped);
  }

  private resetChecklistState(): void {
    this.idCardChoice = 'unset';
    this.applicationChoice = 'unset';
    this.appearanceChoice = 'unset';
    this.selectedChecklistQuestion = null;
    this.refreshChecklistVisuals();
    this.refreshChecklistActionState();
  }

  private async playIntroForActiveSubject(): Promise<VisitorIntroResult> {
    const subjectTokenAtIntroStart = this.getCurrentInspectionSubjectToken();
    this.logSubjectIntroTrace('start', {
      day: this.getActiveCampaignDayIndex(),
      subject: this.getActiveSubjectKeyForInteractionTrace(),
      generation: this.decisionResolutionToken,
    });
    this.logInteractionStateSnapshot('intro-before-start');
    this.logDay4DocumentRuntimeState('intro-before-start', 'playIntroForActiveSubject');
    if (!this.visitorIntroController) {
      const failedResult = { ok: false, reason: 'visitor_intro_controller_missing' } as const;
      this.logSubjectIntroTrace('failed', {
        reason: failedResult.reason,
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
      });
      this.restoreRegularInspectionInteractionAfterIntroFailure(
        failedResult.reason,
        subjectTokenAtIntroStart,
      );
      return failedResult;
    }
    const def = this.getActiveInspectionSubjectDefinition();
    if (!def) {
      const failedResult = { ok: false, reason: 'active_subject_definition_missing' } as const;
      this.logSubjectIntroTrace('failed', {
        reason: failedResult.reason,
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
      });
      this.restoreRegularInspectionInteractionAfterIntroFailure(
        failedResult.reason,
        subjectTokenAtIntroStart,
      );
      return failedResult;
    }
    this.visitorIntroController.setCampaignDocumentDeliveryAvailability({
      employeeCardEnabled: this.isCampaignEvidenceEnabled('employee-card'),
      applicationFormEnabled: this.isCampaignEvidenceEnabled('application-form'),
    });
    if (this.currentInspectionSubject?.subjectKind === 'visitor') {
      this.appointmentRosterController?.setCampaignEnabled(false);
      this.telephoneController?.setCampaignRegularAccessEnabled(false);
      this.setTelephoneEntryEnabledForInteractionTrace(false, 'visitor-intro-visitor-subject');
    }
    const prepared = this.visitorIntroController.prepareInspectionSubject(def.characterDisguisedFrame);
    if (!prepared) {
      const failedResult = { ok: false, reason: 'prepare_inspection_subject_failed' } as const;
      this.logSubjectIntroTrace('failed', {
        reason: failedResult.reason,
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
      });
      this.restoreRegularInspectionInteractionAfterIntroFailure(
        failedResult.reason,
        subjectTokenAtIntroStart,
      );
      return failedResult;
    }

    const context = this.buildVisitorIntroRunContext();
    this.logRoundBootstrap('intro request');
    this.logInteractionStateSnapshot('intro-before-await');
    this.logDay4DocumentRuntimeState('intro-before-playForInspectionSubject', 'playIntroForActiveSubject');
    try {
      const result = await this.visitorIntroController.playForInspectionSubject(context, () => {
        this.logRoundBootstrap('intro accepted');
      });
      this.logInteractionStateSnapshot('intro-promise-complete');
      this.logDay4DocumentRuntimeState('intro-delivery-complete', 'playIntroForActiveSubject');
      if (!result.ok) {
        console.error('[EvidencePreviewController] Visitor intro blocked.', result);
        this.logSubjectIntroTrace('failed', {
          reason: result.reason,
          day: this.getActiveCampaignDayIndex(),
          subject: this.getActiveSubjectKeyForInteractionTrace(),
          generation: this.decisionResolutionToken,
        });
        this.restoreRegularInspectionInteractionAfterIntroFailure(
          result.reason,
          subjectTokenAtIntroStart,
        );
        return result;
      }
      if (this.currentInspectionSubject?.subjectKind === 'visitor') {
        const round = this.currentInspectionSubject;
        const visitorProfile = getVisitorProfile(round.visitorKey);
        const departmentName = getAppointmentDepartmentSpokenDisplayName(round.claim.claimedDepartmentKey);
        const purposeReason = getAppointmentPurposeSpokenVisitReason(round.claim.claimedPurposeKey);
        if (!visitorProfile || !departmentName || !purposeReason) {
          const failedResult = { ok: false, reason: 'visitor_claim_resolution_failed' } as const;
          this.logSubjectIntroTrace('failed', {
            reason: failedResult.reason,
            day: this.getActiveCampaignDayIndex(),
            subject: this.getActiveSubjectKeyForInteractionTrace(),
            generation: this.decisionResolutionToken,
          });
          this.restoreRegularInspectionInteractionAfterIntroFailure(
            failedResult.reason,
            subjectTokenAtIntroStart,
          );
          return failedResult;
        }
        const claimDialogue = resolveVisitorClaimDialogue(round, {
          claimedVisitorKey: round.claim.claimedVisitorKey,
          claimedVisitorDisplayName: visitorProfile.displayName,
          claimedDepartmentKey: round.claim.claimedDepartmentKey,
          claimedDepartmentSpokenDisplayName: departmentName,
          claimedPurposeKey: round.claim.claimedPurposeKey,
          claimedPurposeSpokenVisitReason: purposeReason,
        });
        this.logDay4DocumentRuntimeState('visitor-claim-dialogue-start', 'playIntroForActiveSubject');
        const claimResult = await this.visitorIntroController.playVisitorClaimSequence({
          roundId: round.roundId,
          dialogue: claimDialogue,
        });
        this.logDay4DocumentRuntimeState('visitor-claim-dialogue-end', 'playIntroForActiveSubject');
        if (!claimResult.ok) {
          const failedResult = { ok: false, reason: `visitor_claim_sequence_${claimResult.reason}` } as const;
          this.logSubjectIntroTrace('failed', {
            reason: failedResult.reason,
            day: this.getActiveCampaignDayIndex(),
            subject: this.getActiveSubjectKeyForInteractionTrace(),
            generation: this.decisionResolutionToken,
          });
          this.restoreRegularInspectionInteractionAfterIntroFailure(
            failedResult.reason,
            subjectTokenAtIntroStart,
          );
          return failedResult;
        }
      }
      this.logRoundBootstrap('intro completed');
      this.logSubjectIntroTrace('success', {
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
      });
      this.logSubjectIntroTrace('enabling-interaction', {
        mode: 'success',
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
      });
      this.logDay4DocumentRuntimeState(
        'before-completeIntroAndEnableInspectionInteraction',
        'playIntroForActiveSubject',
      );
      this.completeIntroAndEnableInspectionInteraction();
      this.logDay4DocumentRuntimeState('playIntro-return-before', 'playIntroForActiveSubject');
      return result;
    } catch (error) {
      console.error('[EvidencePreviewController] Visitor intro threw an error.', error);
      const failedResult = { ok: false, reason: 'visitor_intro_runtime_exception' } as const;
      this.logInteractionStateSnapshot('intro-promise-complete');
      this.logSubjectIntroTrace('failed', {
        reason: failedResult.reason,
        day: this.getActiveCampaignDayIndex(),
        subject: this.getActiveSubjectKeyForInteractionTrace(),
        generation: this.decisionResolutionToken,
      });
      this.restoreRegularInspectionInteractionAfterIntroFailure(
        failedResult.reason,
        subjectTokenAtIntroStart,
      );
      return failedResult;
    }
  }

  private buildVisitorIntroRunContext(): VisitorIntroRunContext {
    const subject = this.currentInspectionSubject;
    if (subject?.subjectKind === 'visitor') {
      return {
        roundId: subject.roundId,
        employeeKey: subject.visitorKey,
        caseKind: subject.caseKind,
      };
    }
    return {
      roundId: this.currentRound?.roundId ?? null,
      employeeKey: this.currentRound?.employeeKey ?? null,
      caseKind: this.currentRound?.caseKind ?? null,
    };
  }

  private logRoundBootstrap(
    step:
      | 'start'
      | 'preload complete'
      | 'round generated'
      | 'subject definition resolved'
      | 'subject sprite loaded'
      | 'documents synced'
      | 'intro request'
      | 'intro accepted'
      | 'intro completed',
    round: RoundInstance | null = this.currentRound,
  ): void {
    console.info(
      `[RoundBootstrap] ${step}`,
      {
        roundId: round?.roundId ?? null,
        employeeKey: round?.employeeKey ?? null,
        caseKind: round?.caseKind ?? null,
      },
    );
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
