import { describe, expect, it } from "vitest";
import {
  formatClearanceToastMessage,
  getClearanceWarning,
  NO_CLEARANCE,
  type ClearanceAnalysis,
} from "@/lib/clearance-warning";

describe("getClearanceWarning", () => {
  it("returns none when clearance is absent or empty", () => {
    expect(getClearanceWarning(undefined).level).toBe("none");
    expect(getClearanceWarning(null).level).toBe("none");
    expect(getClearanceWarning(NO_CLEARANCE).level).toBe("none");
  });

  it("returns preferred for preferred status without setting required", () => {
    const clearance: ClearanceAnalysis = {
      clearanceRequired: false,
      clearanceType: "Secret",
      clearanceStatus: "preferred",
      clearanceRequirementText: "Secret clearance preferred",
    };
    const view = getClearanceWarning(clearance);
    expect(view.level).toBe("preferred");
    expect(view.badgeLabel).toBe("Clearance preferred");
    expect(view.typeLabel).toBe("Secret");
    expect(view.requirementText).toBe("Secret clearance preferred");
  });

  it("returns required for active/obtain/eligibility statuses", () => {
    for (const clearanceStatus of [
      "active_required",
      "obtain_required",
      "eligibility_required",
    ] as const) {
      const view = getClearanceWarning({
        clearanceRequired: true,
        clearanceType: "Top Secret",
        clearanceStatus,
        clearanceRequirementText: "Must hold or be eligible for Top Secret",
      });
      expect(view.level).toBe("required");
      expect(view.badgeLabel).toBe("Clearance required");
    }
  });

  it("treats clearanceRequired true as required even if status is null", () => {
    expect(
      getClearanceWarning({
        clearanceRequired: true,
        clearanceType: null,
        clearanceStatus: null,
        clearanceRequirementText: "Security clearance required",
      }).level
    ).toBe("required");
  });
});

describe("formatClearanceToastMessage", () => {
  it("returns null when there is no warning", () => {
    expect(formatClearanceToastMessage(NO_CLEARANCE)).toBeNull();
  });

  it("includes badge, type, and phrase for required clearance", () => {
    expect(
      formatClearanceToastMessage({
        clearanceRequired: true,
        clearanceType: "Secret",
        clearanceStatus: "active_required",
        clearanceRequirementText: "Must have an active Secret clearance.",
      })
    ).toBe(
      "Clearance required — Secret — Must have an active Secret clearance."
    );
  });
});
