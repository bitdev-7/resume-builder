import { describe, expect, it } from "vitest";
import { jdAnalysisAiOutputSchema } from "@/lib/tailoring/schemas";

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
