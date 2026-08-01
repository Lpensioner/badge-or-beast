import type { AppointmentDepartmentKey, AppointmentRosterEntry } from '../appointments/AppointmentTypes';
import type { VisitorKey } from '../visitors/VisitorTypes';

export type DepartmentPhoneRecordsUnavailableReason =
  | 'roster-missing'
  | 'wrong-campaign-day'
  | 'wrong-inspection-date'
  | 'active-visitor-missing'
  | 'active-visitor-appointment-missing';

export interface DepartmentPhoneUnknownNumberResult {
  readonly kind: 'unknown-number';
  readonly dialedNumber: string;
}

export interface DepartmentPhoneRecordsUnavailableResult {
  readonly kind: 'records-unavailable';
  readonly dialedNumber: string;
  readonly departmentKey: AppointmentDepartmentKey;
  readonly reason: DepartmentPhoneRecordsUnavailableReason;
}

export interface DepartmentPhoneNoAnswerResult {
  readonly kind: 'no-answer';
  readonly dialedNumber: string;
  readonly departmentKey: AppointmentDepartmentKey;
  readonly activeVisitorKey: VisitorKey;
}

export interface DepartmentPhoneAppointmentConfirmedResult {
  readonly kind: 'appointment-confirmed';
  readonly dialedNumber: string;
  readonly departmentKey: AppointmentDepartmentKey;
  readonly appointment: AppointmentRosterEntry;
}

export interface DepartmentPhoneMultipleAppointmentsResult {
  readonly kind: 'multiple-appointments';
  readonly dialedNumber: string;
  readonly activeVisitorKey: VisitorKey;
  readonly appointments: readonly AppointmentRosterEntry[];
}

export type DepartmentPhoneLookupResult =
  | DepartmentPhoneUnknownNumberResult
  | DepartmentPhoneRecordsUnavailableResult
  | DepartmentPhoneNoAnswerResult
  | DepartmentPhoneAppointmentConfirmedResult
  | DepartmentPhoneMultipleAppointmentsResult;
