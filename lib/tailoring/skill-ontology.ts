/**
 * Skill ontology: canonical names/aliases, relationships between skills, and a
 * conservative auto-entailment policy.
 *
 * IMPORTANT: "related" is not "candidate knows." Only `requires` relationships
 * and a small curated allow-list of `strongly_implies` relationships
 * (AUTO_ENTAILABLE_TYPES below) may auto-create supported evidence.
 * `commonly_used_with` / `alternative_to` / `same_ecosystem` / `market_adjacent`
 * relationships are relevance signals only and NEVER auto-claim possession
 * (e.g. AWS → Terraform, Docker → Kubernetes, RabbitMQ → Kafka, React → TypeScript).
 */

export type SkillRelationshipType =
  | "requires"
  | "strongly_implies"
  | "commonly_used_with"
  | "alternative_to"
  | "same_ecosystem"
  | "market_adjacent";

export interface SkillRelationship {
  from: string;
  to: string;
  type: SkillRelationshipType;
  confidence: number;
}

export interface AlternativeGroup {
  group: string;
  relationship: "alternatives";
  skills: string[];
}

/** Canonical skill name -> aliases (case/format variants seen in resumes and JDs). */
const SKILL_ALIASES: Record<string, string[]> = {
  Python: ["py"],
  JavaScript: ["js", "java script", "ecmascript"],
  TypeScript: ["ts"],
  "Node.js": ["node", "nodejs"],
  React: ["react.js", "reactjs"],
  "Vue.js": ["vue", "vuejs"],
  Angular: ["angularjs", "angular2+"],
  Django: [],
  FastAPI: ["fast api"],
  Flask: [],
  Pydantic: [],
  PostgreSQL: ["postgres", "psql"],
  MySQL: [],
  SQL: ["structured query language"],
  Redis: [],
  MongoDB: ["mongo"],
  "REST APIs": ["rest", "restful", "restful apis", "rest api"],
  OpenAPI: ["swagger"],
  GraphQL: [],
  Docker: [],
  Kubernetes: ["k8s"],
  "CI/CD": ["ci-cd", "continuous integration", "continuous deployment", "continuous delivery"],
  "GitHub Actions": ["github action"],
  "GitLab CI": ["gitlab ci/cd"],
  Jenkins: [],
  Git: ["git version control"],
  Pytest: ["py.test"],
  Testing: ["test automation", "automated testing"],
  Jest: [],
  AWS: ["amazon web services"],
  Azure: ["microsoft azure"],
  GCP: ["google cloud", "google cloud platform"],
  Terraform: [],
  CloudFormation: ["aws cloudformation"],
  Pulumi: [],
  Prometheus: [],
  Grafana: [],
  Linux: ["unix"],
  Bash: ["shell scripting", "shell"],
  Scripting: [],
  Kafka: ["apache kafka"],
  RabbitMQ: ["amqp"],
  ActiveMQ: [],
  Java: [],
  Spring: ["spring framework"],
  "Spring Boot": [],
  "C#": ["csharp", "c sharp"],
  ".NET": ["dotnet", "asp.net", "asp.net core"],
  HTML: ["html5"],
  CSS: ["css3"],
  Pandas: [],
  NumPy: [],
  PyTorch: [],
  TensorFlow: [],
  "Machine Learning": ["ml"],
  Swift: [],
  Kotlin: [],
  "Objective-C": ["objective c", "objc"],
  Android: [],
  iOS: [],
};

const ALIAS_TO_CANONICAL: Map<string, string> = new Map();
for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
  ALIAS_TO_CANONICAL.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(alias.toLowerCase(), canonical);
  }
}

/** Normalize a raw skill/technology string to its canonical name (best-effort). */
export function normalizeSkillName(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  return ALIAS_TO_CANONICAL.get(lower) || trimmed;
}

export function skillKey(name: string): string {
  return normalizeSkillName(name).toLowerCase();
}

/** Canonical, stable SkillCandidate.id for a skill name — use everywhere a candidate id is created or resolved. */
export function skillCandidateIdFor(name: string): string {
  return `skill_${skillKey(name)}`;
}

export function skillKeyFromCandidateId(id: string): string {
  return id.replace(/^skill_/, "");
}

/** requires: strict prerequisite. strongly_implies (curated subset): conservative auto-entailment. */
const RELATIONSHIPS: SkillRelationship[] = [
  { from: "Django", to: "Python", type: "requires", confidence: 0.98 },
  { from: "FastAPI", to: "Python", type: "requires", confidence: 0.98 },
  { from: "Flask", to: "Python", type: "requires", confidence: 0.95 },
  { from: "Pydantic", to: "Python", type: "requires", confidence: 0.95 },
  { from: "Pandas", to: "Python", type: "requires", confidence: 0.95 },
  { from: "NumPy", to: "Python", type: "requires", confidence: 0.95 },
  { from: "PyTorch", to: "Python", type: "requires", confidence: 0.9 },
  { from: "TensorFlow", to: "Python", type: "requires", confidence: 0.85 },
  { from: "Pytest", to: "Python", type: "requires", confidence: 0.95 },
  { from: "Spring", to: "Java", type: "requires", confidence: 0.95 },
  { from: "Spring Boot", to: "Java", type: "requires", confidence: 0.95 },
  { from: ".NET", to: "C#", type: "requires", confidence: 0.85 },
  { from: "Node.js", to: "JavaScript", type: "requires", confidence: 0.9 },
  { from: "Angular", to: "TypeScript", type: "requires", confidence: 0.85 },
  { from: "React", to: "JavaScript", type: "strongly_implies", confidence: 0.85 },
  { from: "Vue.js", to: "JavaScript", type: "strongly_implies", confidence: 0.85 },
  { from: "Jest", to: "JavaScript", type: "requires", confidence: 0.85 },

  // Relevance-only signals — NEVER auto-entailed.
  { from: "React", to: "TypeScript", type: "commonly_used_with", confidence: 0.5 },
  { from: "AWS", to: "Terraform", type: "commonly_used_with", confidence: 0.45 },
  { from: "AWS", to: "Azure", type: "market_adjacent", confidence: 0.3 },
  { from: "AWS", to: "GCP", type: "market_adjacent", confidence: 0.3 },
  { from: "Azure", to: "GCP", type: "market_adjacent", confidence: 0.3 },
  { from: "Docker", to: "Kubernetes", type: "same_ecosystem", confidence: 0.5 },
  { from: "RabbitMQ", to: "Kafka", type: "alternative_to", confidence: 0.3 },
  { from: "RabbitMQ", to: "ActiveMQ", type: "same_ecosystem", confidence: 0.4 },
  { from: "Terraform", to: "CloudFormation", type: "alternative_to", confidence: 0.3 },
  { from: "Terraform", to: "Pulumi", type: "alternative_to", confidence: 0.3 },
  { from: "Jenkins", to: "GitHub Actions", type: "alternative_to", confidence: 0.3 },
  { from: "Jenkins", to: "GitLab CI", type: "alternative_to", confidence: 0.3 },
  { from: "Prometheus", to: "Grafana", type: "commonly_used_with", confidence: 0.6 },
];

/** Only these relationship types may ever auto-create supported ("entailed") evidence. */
const AUTO_ENTAILABLE_TYPES: SkillRelationshipType[] = ["requires", "strongly_implies"];
const AUTO_ENTAILMENT_MIN_CONFIDENCE = 0.8;

export function getRelationshipsFrom(skillName: string): SkillRelationship[] {
  const canonical = normalizeSkillName(skillName);
  return RELATIONSHIPS.filter((r) => r.from === canonical);
}

export interface EntailmentResult {
  /** canonical skill name that is auto-supported */
  target: string;
  /** canonical skill name of the possessed skill that implies it */
  via: string;
  confidence: number;
}

/**
 * Conservative auto-entailment: given the set of skills the candidate actually
 * possesses (any evidence status other than "unsupported"), return the skills
 * that may be automatically marked "entailed" through requires/strongly_implies.
 * Never traverses commonly_used_with / alternative_to / same_ecosystem / market_adjacent.
 */
export function resolveAutoEntailedSkills(
  possessedSkillNames: Iterable<string>
): Map<string, EntailmentResult> {
  const possessed = new Set(
    Array.from(possessedSkillNames, (name) => normalizeSkillName(name))
  );
  const entailed = new Map<string, EntailmentResult>();

  for (const skill of possessed) {
    for (const rel of getRelationshipsFrom(skill)) {
      if (!AUTO_ENTAILABLE_TYPES.includes(rel.type)) continue;
      if (rel.confidence < AUTO_ENTAILMENT_MIN_CONFIDENCE) continue;
      if (possessed.has(rel.to)) continue; // already directly possessed

      const existing = entailed.get(rel.to);
      if (!existing || rel.confidence > existing.confidence) {
        entailed.set(rel.to, { target: rel.to, via: skill, confidence: rel.confidence });
      }
    }
  }

  return entailed;
}

const ALTERNATIVE_GROUPS: AlternativeGroup[] = [
  { group: "cloud_platform", relationship: "alternatives", skills: ["AWS", "Azure", "GCP"] },
  { group: "message_queue", relationship: "alternatives", skills: ["Kafka", "RabbitMQ", "ActiveMQ"] },
  {
    group: "infrastructure_as_code",
    relationship: "alternatives",
    skills: ["Terraform", "Pulumi", "CloudFormation"],
  },
  {
    group: "frontend_framework",
    relationship: "alternatives",
    skills: ["React", "Vue.js", "Angular"],
  },
  { group: "ci_cd_platform", relationship: "alternatives", skills: ["Jenkins", "GitHub Actions", "GitLab CI"] },
];

export function findAlternativeGroup(skillName: string): AlternativeGroup | undefined {
  const canonical = normalizeSkillName(skillName);
  return ALTERNATIVE_GROUPS.find((g) => g.skills.includes(canonical));
}

export function getAlternativeGroups(): AlternativeGroup[] {
  return ALTERNATIVE_GROUPS;
}

export function getAllCanonicalSkillNames(): string[] {
  return Object.keys(SKILL_ALIASES);
}

let mentionMatchers: { canonical: string; regex: RegExp }[] | null = null;

function buildMentionMatchers(): { canonical: string; regex: RegExp }[] {
  const entries: { canonical: string; term: string }[] = [];
  for (const [canonical, aliases] of Object.entries(SKILL_ALIASES)) {
    entries.push({ canonical, term: canonical });
    for (const alias of aliases) entries.push({ canonical, term: alias });
  }
  // Longest terms first so e.g. "Spring Boot" matches before "Spring".
  entries.sort((a, b) => b.term.length - a.term.length);

  return entries.map(({ canonical, term }) => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Word-boundary match; \b doesn't work well around "." or "#" so we use lookaround instead.
    const regex = new RegExp(`(?<![a-zA-Z0-9])${escaped}(?![a-zA-Z0-9])`, "i");
    return { canonical, regex };
  });
}

/** Scan free text (e.g. a résumé bullet) for mentions of known canonical skills/tools. */
export function detectSkillMentions(text: string): string[] {
  if (!text) return [];
  if (!mentionMatchers) mentionMatchers = buildMentionMatchers();

  const found = new Set<string>();
  for (const { canonical, regex } of mentionMatchers) {
    if (regex.test(text)) found.add(canonical);
  }
  return Array.from(found);
}
