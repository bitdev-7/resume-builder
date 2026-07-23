Base: 7147ea5994c621c826cf3361952ca5549ff62f49
Head: c44d584b6c82dfbce626f0101ccac4cb21e7c50b

## Commits
c44d584 feat: add canonical skill category normalizer

## Stat
 lib/tailoring/skill-categories.test.ts | 86 +++++++++++++++++++++++++++++++++
 lib/tailoring/skill-categories.ts      | 87 ++++++++++++++++++++++++++++++++++
 2 files changed, 173 insertions(+)

## Diff
diff --git a/lib/tailoring/skill-categories.test.ts b/lib/tailoring/skill-categories.test.ts
new file mode 100644
index 0000000..2a64be1
--- /dev/null
+++ b/lib/tailoring/skill-categories.test.ts
@@ -0,0 +1,86 @@
+import { describe, expect, it } from "vitest";
+import {
+  CANONICAL_SKILL_CATEGORIES,
+  FALLBACK_SKILL_CATEGORY,
+  normalizeSkillCategories,
+  resolveCanonicalSkillCategory,
+} from "@/lib/tailoring/skill-categories";
+
+describe("CANONICAL_SKILL_CATEGORIES", () => {
+  it("is exactly the seven approved labels in order", () => {
+    expect([...CANONICAL_SKILL_CATEGORIES]).toEqual([
+      "Languages",
+      "Backend",
+      "Frontend",
+      "Database",
+      "Cloud & DevOps",
+      "Tools & Protocols",
+      "Testing",
+    ]);
+  });
+
+  it("uses Tools & Protocols as the must-keep fallback label", () => {
+    expect(FALLBACK_SKILL_CATEGORY).toBe("Tools & Protocols");
+  });
+});
+
+describe("resolveCanonicalSkillCategory", () => {
+  it("returns exact canonical labels", () => {
+    expect(resolveCanonicalSkillCategory("Backend")).toBe("Backend");
+    expect(resolveCanonicalSkillCategory("cloud & devops")).toBe("Cloud & DevOps");
+  });
+
+  it("remaps known aliases", () => {
+    expect(resolveCanonicalSkillCategory("Cloud")).toBe("Cloud & DevOps");
+    expect(resolveCanonicalSkillCategory("DevOps")).toBe("Cloud & DevOps");
+    expect(resolveCanonicalSkillCategory("Cloud and DevOps")).toBe("Cloud & DevOps");
+    expect(resolveCanonicalSkillCategory("Testing & Tools")).toBe("Testing");
+    expect(resolveCanonicalSkillCategory("Data")).toBe("Database");
+    expect(resolveCanonicalSkillCategory("Databases")).toBe("Database");
+    expect(resolveCanonicalSkillCategory("Tools & Technologies")).toBe("Tools & Protocols");
+    expect(resolveCanonicalSkillCategory("Tools")).toBe("Tools & Protocols");
+  });
+
+  it("returns null for unknown or empty names", () => {
+    expect(resolveCanonicalSkillCategory("Streaming")).toBeNull();
+    expect(resolveCanonicalSkillCategory("AI/ML")).toBeNull();
+    expect(resolveCanonicalSkillCategory("")).toBeNull();
+    expect(resolveCanonicalSkillCategory(null)).toBeNull();
+    expect(resolveCanonicalSkillCategory(undefined)).toBeNull();
+    expect(resolveCanonicalSkillCategory("   ")).toBeNull();
+  });
+});
+
+describe("normalizeSkillCategories", () => {
+  it("remaps aliases, drops unknown buckets, orders, and omits empty", () => {
+    const out = normalizeSkillCategories({
+      Streaming: ["Kafka"],
+      Cloud: ["AWS", "Docker"],
+      Backend: ["Python"],
+      Frontend: [],
+      Data: ["PostgreSQL"],
+      "Tools & Technologies": ["Git"],
+    });
+    expect(Object.keys(out)).toEqual([
+      "Backend",
+      "Database",
+      "Cloud & DevOps",
+      "Tools & Protocols",
+    ]);
+    expect(out.Backend).toEqual(["Python"]);
+    expect(out.Database).toEqual(["PostgreSQL"]);
+    expect(out["Cloud & DevOps"]).toEqual(["AWS", "Docker"]);
+    expect(out["Tools & Protocols"]).toEqual(["Git"]);
+    expect(out).not.toHaveProperty("Streaming");
+    expect(out).not.toHaveProperty("Frontend");
+  });
+
+  it("dedupes the same skill across categories ΓÇö earlier canonical category wins", () => {
+    const out = normalizeSkillCategories({
+      Testing: ["Jest"],
+      Backend: ["Jest", "Python"],
+    });
+    expect(out.Backend).toEqual(["Jest", "Python"]);
+    expect(out).not.toHaveProperty("Testing");
+  });
+});
diff --git a/lib/tailoring/skill-categories.ts b/lib/tailoring/skill-categories.ts
new file mode 100644
index 0000000..6a0ebab
--- /dev/null
+++ b/lib/tailoring/skill-categories.ts
@@ -0,0 +1,87 @@
+import { skillKey } from "@/lib/tailoring/skill-ontology";
+
+export const CANONICAL_SKILL_CATEGORIES = [
+  "Languages",
+  "Backend",
+  "Frontend",
+  "Database",
+  "Cloud & DevOps",
+  "Tools & Protocols",
+  "Testing",
+] as const;
+
+export type CanonicalSkillCategory = (typeof CANONICAL_SKILL_CATEGORIES)[number];
+
+export const FALLBACK_SKILL_CATEGORY: CanonicalSkillCategory = "Tools & Protocols";
+
+/** Lowercase alias / exact label ΓåÆ canonical label */
+const CATEGORY_ALIASES: Record<string, CanonicalSkillCategory> = {
+  languages: "Languages",
+  backend: "Backend",
+  frontend: "Frontend",
+  database: "Database",
+  databases: "Database",
+  data: "Database",
+  "cloud & devops": "Cloud & DevOps",
+  "cloud and devops": "Cloud & DevOps",
+  cloud: "Cloud & DevOps",
+  devops: "Cloud & DevOps",
+  "tools & protocols": "Tools & Protocols",
+  "tools & technologies": "Tools & Protocols",
+  tools: "Tools & Protocols",
+  testing: "Testing",
+  "testing & tools": "Testing",
+};
+
+export function resolveCanonicalSkillCategory(
+  raw: string | null | undefined
+): CanonicalSkillCategory | null {
+  const trimmed = typeof raw === "string" ? raw.trim() : "";
+  if (!trimmed) return null;
+  return CATEGORY_ALIASES[trimmed.toLowerCase()] ?? null;
+}
+
+/**
+ * Remap known aliases, drop skills under unknown headings, dedupe by skill key
+ * (earlier canonical category wins), emit only non-empty categories in fixed order.
+ */
+export function normalizeSkillCategories(
+  skillCategories: Record<string, string[]>
+): Record<string, string[]> {
+  const buckets: Record<CanonicalSkillCategory, string[]> = {
+    Languages: [],
+    Backend: [],
+    Frontend: [],
+    Database: [],
+    "Cloud & DevOps": [],
+    "Tools & Protocols": [],
+    Testing: [],
+  };
+  const seen = new Set<string>();
+
+  const pending: { category: CanonicalSkillCategory; skill: string }[] = [];
+  for (const [rawCategory, skills] of Object.entries(skillCategories)) {
+    const canonical = resolveCanonicalSkillCategory(rawCategory);
+    if (!canonical) continue;
+    for (const skill of skills) {
+      if (!skillKey(skill)) continue;
+      pending.push({ category: canonical, skill });
+    }
+  }
+
+  for (const label of CANONICAL_SKILL_CATEGORIES) {
+    for (const item of pending) {
+      if (item.category !== label) continue;
+      const key = skillKey(item.skill);
+      if (seen.has(key)) continue;
+      seen.add(key);
+      buckets[label].push(item.skill);
+    }
+  }
+
+  const out: Record<string, string[]> = {};
+  for (const label of CANONICAL_SKILL_CATEGORIES) {
+    if (buckets[label].length > 0) out[label] = buckets[label];
+  }
+  return out;
+}
