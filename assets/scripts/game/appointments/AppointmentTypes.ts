import type { VisitorKey } from '../visitors/VisitorTypes';
import type { AppointmentPurposeKey } from './AppointmentPurposeCatalog';

export type AppointmentId = string;

export type AppointmentDepartmentKey = 'research' | 'production' | 'sales';
export type AppointmentArrivalStatus = 'arrived' | 'not_arrived';

export interface AppointmentRosterEntry {
  readonly appointmentId: AppointmentId;
  readonly visitorKey: VisitorKey;
  readonly inspectionDate: string;
  readonly targetDepartmentKey: AppointmentDepartmentKey;
  readonly purposeKey: AppointmentPurposeKey;
  readonly listed: boolean;
  readonly arrivalStatus: AppointmentArrivalStatus;
}

export interface AppointmentRosterDay {
  readonly dayIndex: number;
  readonly inspectionDate: string;
  readonly entries: readonly AppointmentRosterEntry[];
}
