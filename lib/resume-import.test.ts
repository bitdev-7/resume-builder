import { describe, expect, it } from "vitest";
import { salvageTruncatedJson, parsedResumeSchema, cleanParsedResume } from "@/lib/resume-import";

describe("cleanParsedResume — company description should not duplicate a bullet", () => {
  const base = () => parsedResumeSchema.parse({});

  it("blanks a description that just repeats the first bullet", () => {
    const input = parsedResumeSchema.parse({
      ...base(),
      companies: [
        {
          company: "YouTube",
          description: "Built scalable streaming services.",
          achievements: ["Built scalable streaming services.", "Led a team of 5"],
        },
      ],
    });
    const out = cleanParsedResume(input);
    expect(out.companies[0].description).toBe("");
    expect(out.companies[0].achievements).toHaveLength(2);
  });

  it("keeps a genuine, distinct description", () => {
    const input = parsedResumeSchema.parse({
      ...base(),
      companies: [
        {
          company: "YouTube",
          description: "Global video platform serving billions of users.",
          achievements: ["Built scalable streaming services."],
        },
      ],
    });
    expect(cleanParsedResume(input).companies[0].description).toBe(
      "Global video platform serving billions of users."
    );
  });

  it("leaves an already-blank description blank", () => {
    const input = parsedResumeSchema.parse({
      ...base(),
      companies: [{ company: "Acme", description: "", achievements: ["Did things"] }],
    });
    expect(cleanParsedResume(input).companies[0].description).toBe("");
  });
});

describe("salvageTruncatedJson — recover cut-off resume JSON", () => {
  it("recovers earlier fields when the output is truncated mid-array", () => {
    // Simulates the model output being cut off partway through the companies array.
    const truncated = `{
      "fullName": "Roger Lee",
      "email": "roger@example.com",
      "headline": "Senior Software Engineer",
      "companies": [
        { "title": "Engineer", "company": "YouTube", "achievements": ["Built streaming"] },
        { "title": "Engineer", "company": "Acme", "achi`;

    const salvaged = salvageTruncatedJson(truncated);
    expect(salvaged).toBeTruthy();

    const parsed = parsedResumeSchema.safeParse(salvaged);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.fullName).toBe("Roger Lee");
    expect(parsed.data.email).toBe("roger@example.com");
    expect(parsed.data.headline).toBe("Senior Software Engineer");
    // At least the first, fully-formed company survives.
    expect(parsed.data.companies[0].company).toBe("YouTube");
  });

  it("recovers a truncated string value", () => {
    const truncated = `{ "fullName": "Roger", "summary": "A long summary that got cut o`;
    const salvaged = salvageTruncatedJson(truncated) as { fullName?: string } | null;
    expect(salvaged).toBeTruthy();
    expect(salvaged?.fullName).toBe("Roger");
  });

  it("returns null when there is no JSON object", () => {
    expect(salvageTruncatedJson("not json at all")).toBeNull();
  });
});
