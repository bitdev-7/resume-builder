import { describe, expect, it } from "vitest";
import {
  detectSkillMentions,
  findAlternativeGroup,
  normalizeSkillName,
  resolveAutoEntailedSkills,
} from "@/lib/tailoring/skill-ontology";

describe("skill ontology — conservative auto-entailment", () => {
  it("Case 2: Django professional experience conservatively entails Python", () => {
    const entailed = resolveAutoEntailedSkills(["Django"]);
    expect(entailed.has("Python")).toBe(true);
    expect(entailed.get("Python")?.via).toBe("Django");
  });

  it("Case 3: AWS does not entail Azure or GCP", () => {
    const entailed = resolveAutoEntailedSkills(["AWS"]);
    expect(entailed.has("Azure")).toBe(false);
    expect(entailed.has("GCP")).toBe(false);
  });

  it("Case 4: Docker does not entail Kubernetes", () => {
    const entailed = resolveAutoEntailedSkills(["Docker"]);
    expect(entailed.has("Kubernetes")).toBe(false);
  });

  it("Case 5: RabbitMQ does not entail Kafka", () => {
    const entailed = resolveAutoEntailedSkills(["RabbitMQ"]);
    expect(entailed.has("Kafka")).toBe(false);
  });

  it("Case 6: React does not entail TypeScript (only JavaScript, via strongly_implies)", () => {
    const entailed = resolveAutoEntailedSkills(["React"]);
    expect(entailed.has("TypeScript")).toBe(false);
    expect(entailed.has("JavaScript")).toBe(true);
  });

  it("FastAPI entails Python", () => {
    const entailed = resolveAutoEntailedSkills(["FastAPI"]);
    expect(entailed.has("Python")).toBe(true);
  });
});

describe("skill ontology — alternative groups are relevance-only", () => {
  it("groups AWS/Azure/GCP as alternatives, not cumulative requirements", () => {
    const group = findAlternativeGroup("AWS");
    expect(group?.group).toBe("cloud_platform");
    expect(group?.skills).toEqual(expect.arrayContaining(["AWS", "Azure", "GCP"]));
  });

  it("groups Kafka/RabbitMQ/ActiveMQ as alternatives", () => {
    const group = findAlternativeGroup("Kafka");
    expect(group?.group).toBe("message_queue");
  });
});

describe("normalizeSkillName / detectSkillMentions", () => {
  it("normalizes common aliases to canonical names", () => {
    expect(normalizeSkillName("k8s")).toBe("Kubernetes");
    expect(normalizeSkillName("postgres")).toBe("PostgreSQL");
    expect(normalizeSkillName("py")).toBe("Python");
  });

  it("detects multiple distinct skill mentions in free text", () => {
    const mentions = detectSkillMentions("Built FastAPI services backed by PostgreSQL and deployed via Docker");
    expect(mentions).toEqual(expect.arrayContaining(["FastAPI", "PostgreSQL", "Docker"]));
  });

  it("does not spuriously match unrelated substrings", () => {
    const mentions = detectSkillMentions("Wrote documentation for the onboarding process");
    expect(mentions).not.toContain("Go");
  });
});
