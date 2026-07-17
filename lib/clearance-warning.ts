import type { ClearanceStatus } from "@/lib/types/tailoring";

/** Clearance fields returned by JD Analyzer / analyze job response. */
export interface ClearanceAnalysis {
  clearanceRequired: boolean;
  clearanceType: string | null;
  clearanceStatus: ClearanceStatus;
  clearanceRequirementText: string | null;
}

export const NO_CLEARANCE: ClearanceAnalysis = {
  clearanceRequired: false,
  clearanceType: null,
  clearanceStatus: null,
  clearanceRequirementText: null,
};

export type ClearanceWarningLevel = "none" | "preferred" | "required";

export interface ClearanceWarningView {
  level: ClearanceWarningLevel;
  badgeLabel: string;
  typeLabel: string | null;
  requirementText: string | null;
}

const NONE_VIEW: ClearanceWarningView = {
  level: "none",
  badgeLabel: "",
  typeLabel: null,
  requirementText: null,
};

/**
 * Map JD Analyzer clearance fields to UI warning level.
 * Preferred is amber; active/obtain/eligibility (or clearanceRequired) is red.
 */
export function getClearanceWarning(
  clearance: ClearanceAnalysis | null | undefined
): ClearanceWarningView {
  if (!clearance) return NONE_VIEW;

  const typeLabel = clearance.clearanceType?.trim() || null;
  const requirementText = clearance.clearanceRequirementText?.trim() || null;

  if (clearance.clearanceStatus === "preferred") {
    return {
      level: "preferred",
      badgeLabel: "Clearance preferred",
      typeLabel,
      requirementText,
    };
  }

  if (
    clearance.clearanceRequired ||
    clearance.clearanceStatus === "active_required" ||
    clearance.clearanceStatus === "obtain_required" ||
    clearance.clearanceStatus === "eligibility_required"
  ) {
    return {
      level: "required",
      badgeLabel: "Clearance required",
      typeLabel,
      requirementText,
    };
  }

  return NONE_VIEW;
}

export function formatClearanceToastMessage(clearance: ClearanceAnalysis): string | null {
  const warning = getClearanceWarning(clearance);
  if (warning.level === "none") return null;

  const bits = [warning.badgeLabel];
  if (warning.typeLabel) bits.push(warning.typeLabel);
  if (warning.requirementText) bits.push(warning.requirementText);
  return bits.join(" — ");
}
