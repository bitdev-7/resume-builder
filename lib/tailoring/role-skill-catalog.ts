import type { RoleSkillCatalogEntry } from "@/lib/types/tailoring";

/**
 * Versioned role-skill catalog. Membership means "relevant to the role" —
 * it does NOT mean the candidate knows it, has used it professionally, or
 * that it may be inserted into experience bullets without evidence.
 *
 * Extend by adding a new entry; nothing else needs to change (role archetype
 * detection, skill expansion, and enrichment all read from this catalog).
 */
export const ROLE_SKILL_CATALOG_VERSION = "2026-07-16.1";

export const ROLE_SKILL_CATALOG: Record<string, RoleSkillCatalogEntry> = {
  full_stack_python_engineer: {
    id: "full_stack_python_engineer",
    label: "Full Stack Python Engineer",
    titleKeywords: ["full stack python", "full-stack python", "python full stack"],
    core: ["Python", "REST APIs", "SQL", "Git"],
    ecosystem: {
      backendEcosystem: ["Django", "FastAPI", "Flask", "Pydantic", "OpenAPI", "PostgreSQL", "Redis"],
      frontendEcosystem: ["JavaScript", "TypeScript", "React", "HTML", "CSS"],
      deliveryEcosystem: ["Docker", "CI/CD", "Testing", "Pytest"],
    },
    marketRelevant: ["GraphQL", "MongoDB", "Kubernetes"],
    skillCategoryHints: ["Languages", "Backend", "Frontend", "Data", "Cloud & DevOps", "Testing & Tools"],
  },
  python_backend_engineer: {
    id: "python_backend_engineer",
    label: "Python Backend Engineer",
    titleKeywords: ["python backend", "python developer", "python engineer"],
    core: ["Python", "REST APIs", "SQL", "Git"],
    ecosystem: {
      backendEcosystem: ["Django", "FastAPI", "Flask", "Pydantic", "PostgreSQL", "Redis", "MongoDB"],
      deliveryEcosystem: ["Docker", "CI/CD", "Testing", "Pytest"],
    },
    marketRelevant: ["Kubernetes", "GraphQL", "Kafka"],
    skillCategoryHints: ["Languages", "Backend", "Data", "Cloud & DevOps", "Testing & Tools"],
  },
  backend_engineer: {
    id: "backend_engineer",
    label: "Backend Engineer",
    titleKeywords: ["backend", "back-end", "back end"],
    core: ["REST APIs", "SQL", "Git", "Testing"],
    ecosystem: {
      dataStores: ["PostgreSQL", "MySQL", "Redis", "MongoDB"],
      delivery: ["Docker", "CI/CD"],
    },
    marketRelevant: ["Kubernetes", "Kafka", "GraphQL"],
    skillCategoryHints: ["Languages", "Backend", "Data", "Cloud & DevOps", "Testing & Tools"],
  },
  frontend_engineer: {
    id: "frontend_engineer",
    label: "Frontend Engineer",
    titleKeywords: ["frontend", "front-end", "front end", "ui engineer"],
    core: ["JavaScript", "HTML", "CSS", "Git"],
    ecosystem: {
      frameworks: ["React", "Vue.js", "Angular"],
      typing: ["TypeScript"],
      tooling: ["Testing", "Jest", "CI/CD"],
    },
    marketRelevant: ["GraphQL", "Node.js"],
    skillCategoryHints: ["Languages", "Frontend", "Testing & Tools", "Cloud & DevOps"],
  },
  full_stack_engineer: {
    id: "full_stack_engineer",
    label: "Full Stack Engineer",
    titleKeywords: ["full stack", "full-stack", "fullstack"],
    core: ["JavaScript", "REST APIs", "SQL", "Git"],
    ecosystem: {
      frontendEcosystem: ["TypeScript", "React", "Vue.js", "Angular", "HTML", "CSS"],
      backendEcosystem: ["Node.js", "PostgreSQL", "MongoDB", "Redis"],
      deliveryEcosystem: ["Docker", "CI/CD", "Testing"],
    },
    marketRelevant: ["GraphQL", "Kubernetes"],
    skillCategoryHints: ["Languages", "Frontend", "Backend", "Cloud & DevOps", "Testing & Tools"],
  },
  java_backend_engineer: {
    id: "java_backend_engineer",
    label: "Java Backend Engineer",
    titleKeywords: ["java developer", "java engineer", "java backend"],
    core: ["Java", "SQL", "Git", "REST APIs"],
    ecosystem: {
      framework: ["Spring", "Spring Boot"],
      dataStores: ["PostgreSQL", "MySQL", "Redis"],
      delivery: ["Docker", "CI/CD", "Testing"],
    },
    marketRelevant: ["Kafka", "Kubernetes"],
    skillCategoryHints: ["Languages", "Backend", "Data", "Cloud & DevOps", "Testing & Tools"],
  },
  dotnet_engineer: {
    id: "dotnet_engineer",
    label: ".NET Engineer",
    titleKeywords: [".net", "dotnet", "c# developer", "c# engineer"],
    core: ["C#", ".NET", "SQL", "Git"],
    ecosystem: {
      dataStores: ["PostgreSQL", "MySQL", "Redis"],
      delivery: ["Docker", "CI/CD", "Testing"],
    },
    marketRelevant: ["Azure", "Kubernetes"],
    skillCategoryHints: ["Languages", "Backend", "Data", "Cloud & DevOps", "Testing & Tools"],
  },
  devops_engineer: {
    id: "devops_engineer",
    label: "DevOps Engineer",
    titleKeywords: ["devops", "site reliability", "sre", "platform engineer"],
    core: ["Linux", "Git", "CI/CD", "Scripting", "Bash"],
    ecosystem: {
      cloudPlatforms: ["AWS", "Azure", "GCP"],
      containers: ["Docker", "Kubernetes"],
      infrastructureAsCode: ["Terraform", "CloudFormation", "Pulumi"],
      observability: ["Prometheus", "Grafana"],
    },
    marketRelevant: ["Python", "GitHub Actions", "GitLab CI", "Jenkins"],
    skillCategoryHints: [
      "Cloud Platforms",
      "Containers & Orchestration",
      "Infrastructure as Code",
      "CI/CD",
      "Observability",
      "Scripting & Systems",
    ],
  },
  data_engineer: {
    id: "data_engineer",
    label: "Data Engineer",
    titleKeywords: ["data engineer", "data engineering"],
    core: ["Python", "SQL", "Git"],
    ecosystem: {
      dataProcessing: ["Pandas", "NumPy"],
      warehousing: ["PostgreSQL", "MySQL"],
      orchestration: ["CI/CD"],
      cloud: ["AWS", "Azure", "GCP"],
    },
    marketRelevant: ["Kafka", "Docker", "Kubernetes"],
    skillCategoryHints: ["Languages", "Data Processing", "Warehousing", "Orchestration", "Cloud", "Databases"],
  },
  machine_learning_engineer: {
    id: "machine_learning_engineer",
    label: "Machine Learning Engineer",
    titleKeywords: ["machine learning", "ml engineer"],
    core: ["Python", "Machine Learning", "Git"],
    ecosystem: {
      frameworks: ["PyTorch", "TensorFlow", "Pandas", "NumPy"],
      delivery: ["Docker", "CI/CD", "Testing"],
      cloud: ["AWS", "Azure", "GCP"],
    },
    marketRelevant: ["Kubernetes"],
    skillCategoryHints: ["Languages", "ML Frameworks", "Data", "Cloud & DevOps", "Testing & Tools"],
  },
  ai_engineer: {
    id: "ai_engineer",
    label: "AI Engineer",
    titleKeywords: [
      "ai engineer",
      "ai lead",
      "llm engineer",
      "genai engineer",
      "gen ai engineer",
      "ai agent engineer",
      "applied ai engineer",
      "ai solutions engineer",
    ],
    core: ["Python", "LLM", "AI Agents", "Prompt Engineering", "REST APIs", "Git"],
    ecosystem: {
      orchestration: ["LangChain", "LlamaIndex"],
      retrieval: ["RAG", "Vector Database", "Pinecone", "Weaviate", "pgvector", "Embeddings"],
      modelProviders: ["OpenAI API", "Anthropic API", "Hugging Face"],
      delivery: ["Docker", "CI/CD", "Testing"],
      cloud: ["AWS", "Azure", "GCP"],
    },
    marketRelevant: ["Model Context Protocol", "Kubernetes", "FastAPI"],
    skillCategoryHints: [
      "Languages",
      "LLMs & Prompt Engineering",
      "AI Agents & Orchestration",
      "Retrieval & Vector DBs",
      "Cloud & DevOps",
      "Testing & Tools",
    ],
  },
  mobile_engineer: {
    id: "mobile_engineer",
    label: "Mobile Engineer",
    titleKeywords: ["mobile engineer", "mobile developer"],
    core: ["Git", "Testing"],
    ecosystem: {
      ios: ["Swift", "iOS", "Objective-C"],
      android: ["Kotlin", "Android"],
      delivery: ["CI/CD"],
    },
    marketRelevant: [],
    skillCategoryHints: ["Languages", "Mobile", "Testing & Tools", "Cloud & DevOps"],
  },
  ios_engineer: {
    id: "ios_engineer",
    label: "iOS Engineer",
    titleKeywords: ["ios engineer", "ios developer"],
    core: ["Swift", "iOS", "Git"],
    ecosystem: { legacy: ["Objective-C"], delivery: ["CI/CD", "Testing"] },
    marketRelevant: [],
    skillCategoryHints: ["Languages", "Mobile", "Testing & Tools"],
  },
  android_engineer: {
    id: "android_engineer",
    label: "Android Engineer",
    titleKeywords: ["android engineer", "android developer"],
    core: ["Kotlin", "Android", "Git"],
    ecosystem: { delivery: ["CI/CD", "Testing"] },
    marketRelevant: [],
    skillCategoryHints: ["Languages", "Mobile", "Testing & Tools"],
  },
  qa_automation_engineer: {
    id: "qa_automation_engineer",
    label: "QA Automation Engineer",
    titleKeywords: ["qa automation", "test automation", "sdet"],
    core: ["Testing", "Git", "CI/CD"],
    ecosystem: {
      languages: ["Python", "JavaScript"],
      tooling: ["Pytest", "Jest"],
    },
    marketRelevant: ["Docker"],
    skillCategoryHints: ["Languages", "Testing & Tools", "Cloud & DevOps"],
  },
};

export function getRoleCatalogEntry(archetypeId: string): RoleSkillCatalogEntry | undefined {
  return ROLE_SKILL_CATALOG[archetypeId];
}

export function listRoleArchetypeIds(): string[] {
  return Object.keys(ROLE_SKILL_CATALOG);
}

/** All skills mentioned in an archetype's core + ecosystem groups (not marketRelevant). */
export function getArchetypeRoleSkills(archetypeId: string): {
  core: string[];
  ecosystem: string[];
} {
  const entry = ROLE_SKILL_CATALOG[archetypeId];
  if (!entry) return { core: [], ecosystem: [] };
  const ecosystem = Object.values(entry.ecosystem).flat();
  return { core: entry.core, ecosystem };
}

// ──────────────────────────────────────────────────────────────────────────
// Mutator — used by the skill registry to layer user-supplied custom
// archetypes on top of the built-in defaults. Defaults are never removed.
// ──────────────────────────────────────────────────────────────────────────

/** Snapshot of the built-in archetype ids at module load — used to reject shadowing. */
const BUILTIN_ARCHETYPE_IDS = new Set<string>(Object.keys(ROLE_SKILL_CATALOG));

/** True if `id` is one of the built-in (read-only) archetype ids. */
export function isBuiltinArchetypeId(id: string): boolean {
  return BUILTIN_ARCHETYPE_IDS.has(id);
}

/**
 * Register a custom archetype. Overwrites an existing custom archetype with
 * the same id, but never a built-in one (callers must reject reserved ids
 * before reaching here). Returns true if registered.
 */
export function registerArchetype(entry: RoleSkillCatalogEntry): boolean {
  if (!entry || !entry.id || BUILTIN_ARCHETYPE_IDS.has(entry.id)) return false;
  ROLE_SKILL_CATALOG[entry.id] = entry;
  return true;
}

/** Remove a custom archetype. Returns true if it existed and was removed. */
export function unregisterArchetype(id: string): boolean {
  if (!id || BUILTIN_ARCHETYPE_IDS.has(id)) return false;
  return delete ROLE_SKILL_CATALOG[id];
}
