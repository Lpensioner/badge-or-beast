import { _decorator, Button, Color, Component, Graphics, Node } from 'cc';
import { AudioManager } from '../audio/AudioManager';

const { ccclass } = _decorator;

@ccclass('AppointmentRosterController')
export class AppointmentRosterController extends Component {
  private rosterPanelOpen = false;

  private appointmentRosterPanelRuntime: Node | null = null;
  private appointmentRosterScrim: Node | null = null;
  private appointmentRosterPanelBody: Node | null = null;
  private appointmentRosterCloseButton: Node | null = null;

  private appointmentRosterHitButton: Button | null = null;
  private appointmentRosterCloseButtonComp: Button | null = null;
  private appointmentRosterScrimGraphics: Graphics | null = null;
  private appointmentRosterCloseButtonGraphics: Graphics | null = null;

  private managedButtons: Button[] = [];

  onLoad(): void {
    if (this.node.name !== 'AppointmentRosterHit') {
      console.error('[AppointmentRosterController] This script must be mounted on AppointmentRosterHit.');
      this.enabled = false;
      return;
    }

    const deskEvidenceRuntime = this.node.parent;
    if (!deskEvidenceRuntime || deskEvidenceRuntime.name !== 'DeskEvidenceRuntime') {
      console.error('[AppointmentRosterController] DeskEvidenceRuntime not found from AppointmentRosterHit parent.');
      this.enabled = false;
      return;
    }

    const canvas = deskEvidenceRuntime.parent;
    if (!canvas || canvas.name !== 'Canvas') {
      console.error('[AppointmentRosterController] Canvas not found from DeskEvidenceRuntime parent.');
      this.enabled = false;
      return;
    }

    this.appointmentRosterPanelRuntime = canvas.getChildByName('AppointmentRosterPanelRuntime');
    const consoleControls = canvas.getChildByName('ConsoleControls');
    this.appointmentRosterScrim =
      this.appointmentRosterPanelRuntime?.getChildByName('AppointmentRosterScrim') ?? null;
    this.appointmentRosterPanelBody =
      this.appointmentRosterPanelRuntime?.getChildByName('AppointmentRosterPanelBody') ?? null;
    this.appointmentRosterCloseButton =
      this.appointmentRosterPanelRuntime?.getChildByName('AppointmentRosterCloseButton') ?? null;

    this.appointmentRosterHitButton = this.node.getComponent(Button);
    this.appointmentRosterCloseButtonComp = this.appointmentRosterCloseButton?.getComponent(Button) ?? null;
    this.appointmentRosterScrimGraphics = this.appointmentRosterScrim?.getComponent(Graphics) ?? null;
    this.appointmentRosterCloseButtonGraphics =
      this.appointmentRosterCloseButton?.getComponent(Graphics) ?? null;

    const employeeCardHit = deskEvidenceRuntime.getChildByName('EmployeeCardHit');
    const applicationFormHit = deskEvidenceRuntime.getChildByName('ApplicationFormHit');
    const screeningChecklistHit = deskEvidenceRuntime.getChildByName('ScreeningChecklistHit');
    const telephoneHit = deskEvidenceRuntime.getChildByName('TelephoneHit');
    const btnShutterHit = consoleControls?.getChildByName('BtnShutterHit') ?? null;
    const btnAllowHit = consoleControls?.getChildByName('BtnAllowHit') ?? null;
    const btnDenyHit = consoleControls?.getChildByName('BtnDenyHit') ?? null;

    const missing = [
      !this.appointmentRosterPanelRuntime && 'AppointmentRosterPanelRuntime',
      !consoleControls && 'ConsoleControls',
      !this.appointmentRosterScrim && 'AppointmentRosterScrim',
      !this.appointmentRosterPanelBody && 'AppointmentRosterPanelBody',
      !this.appointmentRosterCloseButton && 'AppointmentRosterCloseButton',
      !this.appointmentRosterHitButton && 'AppointmentRosterHit(Button)',
      !this.appointmentRosterCloseButtonComp && 'AppointmentRosterCloseButton(Button)',
      !this.appointmentRosterScrimGraphics && 'AppointmentRosterScrim(Graphics)',
      !this.appointmentRosterCloseButtonGraphics && 'AppointmentRosterCloseButton(Graphics)',
      !employeeCardHit && 'EmployeeCardHit',
      !applicationFormHit && 'ApplicationFormHit',
      !screeningChecklistHit && 'ScreeningChecklistHit',
      !telephoneHit && 'TelephoneHit',
      !btnShutterHit && 'BtnShutterHit',
      !btnAllowHit && 'BtnAllowHit',
      !btnDenyHit && 'BtnDenyHit',
    ].filter(Boolean) as string[];

    if (missing.length > 0) {
      console.error(`[AppointmentRosterController] Missing required nodes/components: ${missing.join(', ')}`);
      this.enabled = false;
      return;
    }

    this.managedButtons = [
      employeeCardHit?.getComponent(Button) ?? null,
      applicationFormHit?.getComponent(Button) ?? null,
      screeningChecklistHit?.getComponent(Button) ?? null,
      telephoneHit?.getComponent(Button) ?? null,
      this.appointmentRosterHitButton,
      btnShutterHit?.getComponent(Button) ?? null,
      btnAllowHit?.getComponent(Button) ?? null,
      btnDenyHit?.getComponent(Button) ?? null,
    ].filter((button): button is Button => !!button);

    this.appointmentRosterPanelRuntime!.active = false;
    this.rosterPanelOpen = false;
    this.drawScrim();
    this.drawCloseButton();
  }

  onEnable(): void {
    this.appointmentRosterHitButton?.node.on(Button.EventType.CLICK, this.openAppointmentRoster, this);
    this.appointmentRosterCloseButtonComp?.node.on(Button.EventType.CLICK, this.closeAppointmentRoster, this);
  }

  onDisable(): void {
    this.appointmentRosterHitButton?.node.off(Button.EventType.CLICK, this.openAppointmentRoster, this);
    this.appointmentRosterCloseButtonComp?.node.off(Button.EventType.CLICK, this.closeAppointmentRoster, this);
  }

  private openAppointmentRoster(): void {
    if (this.rosterPanelOpen || !this.appointmentRosterPanelRuntime) {
      return;
    }
    AudioManager.getInstance()?.playCachedDocumentFlip();
    this.appointmentRosterPanelRuntime.active = true;
    this.rosterPanelOpen = true;
    this.setManagedButtonsInteractable(false);
  }

  private closeAppointmentRoster(): void {
    if (!this.appointmentRosterPanelRuntime) {
      return;
    }
    this.appointmentRosterPanelRuntime.active = false;
    this.rosterPanelOpen = false;
    this.setManagedButtonsInteractable(true);
  }

  private setManagedButtonsInteractable(interactable: boolean): void {
    for (const button of this.managedButtons) {
      button.interactable = interactable;
    }
  }

  private drawScrim(): void {
    if (!this.appointmentRosterScrimGraphics) {
      return;
    }
    this.appointmentRosterScrimGraphics.clear();
    this.appointmentRosterScrimGraphics.fillColor = new Color(0, 0, 0, 165);
    this.appointmentRosterScrimGraphics.rect(-360, -640, 720, 1280);
    this.appointmentRosterScrimGraphics.fill();
  }

  private drawCloseButton(): void {
    if (!this.appointmentRosterCloseButtonGraphics) {
      return;
    }
    this.appointmentRosterCloseButtonGraphics.clear();
    this.appointmentRosterCloseButtonGraphics.fillColor = new Color(25, 23, 20, 255);
    this.appointmentRosterCloseButtonGraphics.rect(-36, -36, 72, 72);
    this.appointmentRosterCloseButtonGraphics.fill();
    this.appointmentRosterCloseButtonGraphics.lineWidth = 3;
    this.appointmentRosterCloseButtonGraphics.strokeColor = new Color(230, 220, 195, 255);
    this.appointmentRosterCloseButtonGraphics.rect(-36, -36, 72, 72);
    this.appointmentRosterCloseButtonGraphics.stroke();
  }
}
