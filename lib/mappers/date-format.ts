/** Month name/abbreviation -> month number, for tolerant parsing of resume dates. */
const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function pad2(month: number): string {
  return String(month).padStart(2, "0");
}

/** Parse a variety of human date formats into { year, month }. Returns null if unrecognized. */
function parseFlexibleDate(input: string): { year: string; month: number } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // MM/YYYY, M/YYYY, MM-YYYY, MM.YYYY
  let m = trimmed.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    if (month >= 1 && month <= 12) return { year: m[2], month };
  }

  // YYYY-MM, YYYY/MM, YYYY-MM-DD, YYYY.MM
  m = trimmed.match(/^(\d{4})[/\-.](\d{1,2})(?:[/\-.]\d{1,2})?$/);
  if (m) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year: m[1], month };
  }

  // Month name + year: "May 2020", "Jan 2020", "September 2020", "Sept. 2020"
  m = trimmed.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (m) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    if (month) return { year: m[2], month };
  }

  // Year only: "2020" -> treat as January of that year.
  m = trimmed.match(/^(\d{4})$/);
  if (m) return { year: m[1], month: 1 };

  return null;
}

/** Convert a stored/entered date to MM/YYYY for display and AI prompts. Tolerant of many formats. */
export function isoDateToDisplay(date: string | null | undefined): string {
  if (!date?.trim()) return "";

  const trimmed = date.trim();
  if (trimmed.toLowerCase() === "present") return "Present";

  // Already MM/YYYY (normalize zero-padding).
  const slash = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const month = Number(slash[1]);
    if (month >= 1 && month <= 12) return `${pad2(month)}/${slash[2]}`;
  }

  const parsed = parseFlexibleDate(trimmed);
  if (parsed) return `${pad2(parsed.month)}/${parsed.year}`;

  return trimmed;
}

/** Convert an entered display date (MM/YYYY, year, month name, ISO, …) to ISO (YYYY-MM-01) for Postgres date columns. */
export function displayDateToIso(date: string | null | undefined): string | null {
  if (!date?.trim()) return null;

  const trimmed = date.trim();
  if (trimmed.toLowerCase() === "present") return null;

  const parsed = parseFlexibleDate(trimmed);
  if (parsed) return `${parsed.year}-${pad2(parsed.month)}-01`;

  return null;
}

export function formatCompanyEndDate(
  endDate: string | null | undefined,
  isCurrent: boolean
): string {
  if (isCurrent) return "Present";
  return isoDateToDisplay(endDate) || "Present";
}

export function formatGpa(gpa: number | null | undefined): string | undefined {
  if (gpa == null || Number.isNaN(gpa)) return undefined;
  return String(gpa);
}
