import { describe, expect, it } from "vitest";
import { jdAnalysisAiOutputSchema } from "@/lib/tailoring/schemas";

const baseOutput = {
  normalizedTitle: "Senior Backend Engineer",
  requirements: [
    { text: "Strong Go experience", type: "must_have", category: "technology", canonicalTerm: "Go" },
  ],
};

describe("jdAnalysisAiOutputSchema — tolerant of model enum mistakes", () => {
  it("coerces an invalid category (e.g. a type value like 'contextual') instead of failing", () => {
    const parsed = jdAnalysisAiOutputSchema.safeParse({
      normalizedTitle: "Senior Backend Engineer",
      requirements: [
        { text: "Strong Go experience", type: "must_have", category: "contextual", canonicalTerm: "Go" },
        { text: "Nice to have: Kafka", type: "weird_type", category: "technology", canonicalTerm: "Kafka" },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // Invalid category -> falls back to "responsibility"; invalid type -> "contextual".
    expect(parsed.data.requirements[0].category).toBe("responsibility");
    expect(parsed.data.requirements[1].type).toBe("contextual");
    // Valid values are preserved.
    expect(parsed.data.requirements[0].type).toBe("must_have");
    expect(parsed.data.requirements[1].category).toBe("technology");
  });
});

describe("jdAnalysisAiOutputSchema — clearance fields", () => {
  it("defaults missing clearance fields to no clearance", () => {
    const parsed = jdAnalysisAiOutputSchema.safeParse(baseOutput);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.clearanceRequired).toBe(false);
    expect(parsed.data.clearanceType).toBeNull();
    expect(parsed.data.clearanceStatus).toBeNull();
    expect(parsed.data.clearanceRequirementText).toBeNull();
  });

  it("accepts required and preferred clearance outputs", () => {
    const required = jdAnalysisAiOutputSchema.safeParse({
      ...baseOutput,
      clearanceRequired: true,
      clearanceType: "Secret",
      clearanceStatus: "active_required",
      clearanceRequirementText: "Must have an active Secret clearance.",
    });
    expect(required.success).toBe(true);
    if (required.success) {
      expect(required.data.clearanceStatus).toBe("active_required");
      expect(required.data.clearanceRequired).toBe(true);
    }

    const preferred = jdAnalysisAiOutputSchema.safeParse({
      ...baseOutput,
      clearanceRequired: false,
      clearanceType: "Public Trust",
      clearanceStatus: "preferred",
      clearanceRequirementText: "Public Trust clearance preferred.",
    });
    expect(preferred.success).toBe(true);
    if (preferred.success) {
      expect(preferred.data.clearanceStatus).toBe("preferred");
      expect(preferred.data.clearanceRequired).toBe(false);
    }
  });

  it("rejects an invalid clearanceStatus", () => {
    const parsed = jdAnalysisAiOutputSchema.safeParse({
      ...baseOutput,
      clearanceStatus: "maybe_required",
    });
    expect(parsed.success).toBe(false);
  });
});
