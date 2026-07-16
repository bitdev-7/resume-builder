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

  it("LangChain and LlamaIndex conservatively entail Python", () => {
    const entailed = resolveAutoEntailedSkills(["LangChain", "LlamaIndex"]);
    expect(entailed.has("Python")).toBe(true);
  });

  it("RAG strongly implies Embeddings but does not entail a specific vector DB", () => {
    const entailed = resolveAutoEntailedSkills(["RAG"]);
    expect(entailed.has("Embeddings")).toBe(true);
    expect(entailed.has("Pinecone")).toBe(false);
  });

  it("Pinecone strongly implies Vector Database", () => {
    const entailed = resolveAutoEntailedSkills(["Pinecone"]);
    expect(entailed.has("Vector Database")).toBe(true);
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

  it("normalizes LLM-era aliases to canonical names", () => {
    expect(normalizeSkillName("llms")).toBe("LLM");
    expect(normalizeSkillName("large language models")).toBe("LLM");
    expect(normalizeSkillName("ai agent")).toBe("AI Agents");
    expect(normalizeSkillName("retrieval augmented generation")).toBe("RAG");
    expect(normalizeSkillName("openai")).toBe("OpenAI API");
    expect(normalizeSkillName("vector db")).toBe("Vector Database");
  });

  it("detects LLM/AI skill mentions in free text", () => {
    const mentions = detectSkillMentions(
      "Built RAG pipelines with LangChain and Pinecone for LLM-powered AI agents using the OpenAI API"
    );
    expect(mentions).toEqual(
      expect.arrayContaining(["RAG", "LangChain", "Pinecone", "LLM", "AI Agents", "OpenAI API"])
    );
  });
});
