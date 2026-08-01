export const CURRENT_DATE = '1999-12-03';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface InspectionDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getMonthLength(year: number, month: number): number {
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

export function parseInspectionDate(dateText: string): InspectionDateParts | null {
  if (!ISO_DATE_RE.test(dateText)) {
    return null;
  }
  const [yearText, monthText, dayText] = dateText.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12) {
    return null;
  }
  const monthLength = getMonthLength(year, month);
  if (day < 1 || day > monthLength) {
    return null;
  }
  return {
    year,
    month,
    day,
  };
}

export function validateInspectionDateString(value: string): boolean {
  return parseInspectionDate(value) !== null;
}

export function compareInspectionDateStrings(left: string, right: string): number {
  const leftDate = parseInspectionDate(left);
  const rightDate = parseInspectionDate(right);
  if (!leftDate || !rightDate) {
    throw new Error(
      `[InspectionDateRules] compare requires valid YYYY-MM-DD dates. left=${left} right=${right}`,
    );
  }
  if (leftDate.year !== rightDate.year) {
    return leftDate.year - rightDate.year;
  }
  if (leftDate.month !== rightDate.month) {
    return leftDate.month - rightDate.month;
  }
  return leftDate.day - rightDate.day;
}

export function isValidUntilPass(validUntil: string, inspectionDate: string): boolean {
  if (!validateInspectionDateString(validUntil) || !validateInspectionDateString(inspectionDate)) {
    return false;
  }
  return compareInspectionDateStrings(validUntil, inspectionDate) >= 0;
}

export function isValidUntilAccepted(validUntil: string): boolean {
  // Legacy/default compatibility path. Campaign flow must pass inspectionDate explicitly.
  return isValidUntilPass(validUntil, CURRENT_DATE);
}

function formatIsoDate(year: number, month: number, day: number): string {
  const mm = month.toString().padStart(2, '0');
  const dd = day.toString().padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function generateValidUntil(): string {
  const choices = ['1999-12-03', '1999-12-04', '1999-12-05', '2000-01-01', '2000-03-31'];
  return choices[Math.floor(Math.random() * choices.length)];
}

export function generateExpiredUntil(): string {
  const choices = ['1999-12-02', '1999-12-01', '1999-11-30', '1999-10-15'];
  return choices[Math.floor(Math.random() * choices.length)];
}

export function generateAdjacentExpiredDate(): string {
  return '1999-12-02';
}

export function addDaysToCurrentDate(dayDelta: number): string {
  const baseline = parseInspectionDate(CURRENT_DATE);
  if (!baseline) {
    return CURRENT_DATE;
  }
  let year = baseline.year;
  let month = baseline.month;
  let day = baseline.day;
  let remaining = Math.abs(dayDelta);
  const step = dayDelta >= 0 ? 1 : -1;
  while (remaining > 0) {
    day += step;
    if (step > 0) {
      const monthLength = getMonthLength(year, month);
      if (day > monthLength) {
        day = 1;
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    } else if (day < 1) {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = getMonthLength(year, month);
    }
    remaining -= 1;
  }
  return formatIsoDate(year, month, day);
}
