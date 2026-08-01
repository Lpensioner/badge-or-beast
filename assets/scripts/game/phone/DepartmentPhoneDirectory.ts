import { getAppointmentDepartmentByPhoneNumber } from '../appointments/AppointmentDepartmentCatalog';
import type { AppointmentRosterDay } from '../appointments/AppointmentTypes';
import type { VisitorKey } from '../visitors/VisitorTypes';
import type { DepartmentPhoneLookupResult } from './DepartmentPhoneTypes';

const DAY4_INDEX = 4;
const DAY4_INSPECTION_DATE = '1999-12-06';

export function resolveDepartmentPhoneLookup(
  dialedNumber: string,
  rosterDay: AppointmentRosterDay | null,
  activeVisitorKey: VisitorKey | null,
): DepartmentPhoneLookupResult {
  const department = getAppointmentDepartmentByPhoneNumber(dialedNumber);
  if (!department) {
    return {
      kind: 'unknown-number',
      dialedNumber,
    };
  }

  if (rosterDay === null) {
    return {
      kind: 'records-unavailable',
      dialedNumber,
      departmentKey: department.departmentKey,
      reason: 'roster-missing',
    };
  }

  if (rosterDay.dayIndex !== DAY4_INDEX) {
    return {
      kind: 'records-unavailable',
      dialedNumber,
      departmentKey: department.departmentKey,
      reason: 'wrong-campaign-day',
    };
  }

  if (rosterDay.inspectionDate !== DAY4_INSPECTION_DATE) {
    return {
      kind: 'records-unavailable',
      dialedNumber,
      departmentKey: department.departmentKey,
      reason: 'wrong-inspection-date',
    };
  }

  if (activeVisitorKey === null) {
    return {
      kind: 'records-unavailable',
      dialedNumber,
      departmentKey: department.departmentKey,
      reason: 'active-visitor-missing',
    };
  }

  const activeVisitorAppointments = rosterDay.entries.filter(
    (entry) => entry.listed && entry.visitorKey === activeVisitorKey,
  );

  if (activeVisitorAppointments.length === 0) {
    return {
      kind: 'records-unavailable',
      dialedNumber,
      departmentKey: department.departmentKey,
      reason: 'active-visitor-appointment-missing',
    };
  }

  if (activeVisitorAppointments.length > 1) {
    return {
      kind: 'multiple-appointments',
      dialedNumber,
      activeVisitorKey,
      appointments: Object.freeze([...activeVisitorAppointments]),
    };
  }

  const activeAppointment = activeVisitorAppointments[0];
  if (activeAppointment.targetDepartmentKey === department.departmentKey) {
    return {
      kind: 'appointment-confirmed',
      dialedNumber,
      departmentKey: department.departmentKey,
      appointment: activeAppointment,
    };
  }

  return {
    kind: 'no-answer',
    dialedNumber,
    departmentKey: department.departmentKey,
    activeVisitorKey,
  };
}
