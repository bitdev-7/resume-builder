export const RESUME_TEMPLATES = [
  {
    id: "standard",
    label: "Standard",
    description: "Centered single column with section rules. Clean ATS-friendly layout.",
  },
  {
    id: "folio",
    label: "Folio",
    description: "Left-aligned single column. Serif headings, small-caps labels, thin rules.",
  },
  {
    id: "modern",
    label: "Modern",
    description: "Sans-serif with a subtle accent color on the name and section headers.",
  },
  {
    id: "classic",
    label: "Classic",
    description: "Traditional serif (Georgia), centered header, conservative and formal.",
  },
  {
    id: "compact",
    label: "Compact",
    description: "Dense single column with tighter spacing to fit more on one page.",
  },
  {
    id: "minimal",
    label: "Minimal",
    description: "Lots of whitespace, light rules, understated typography.",
  },
  {
    id: "sidebar",
    label: "Sidebar (visual)",
    description: "Two-column with a colored sidebar, icons, optional photo and language bars. Eye-catching, but less ATS-friendly than single-column templates.",
  },
] as const;

export type ResumeTemplateId = (typeof RESUME_TEMPLATES)[number]["id"];

export const DEFAULT_RESUME_TEMPLATE: ResumeTemplateId = "standard";

export function isValidResumeTemplate(id: string): id is ResumeTemplateId {
  return RESUME_TEMPLATES.some((t) => t.id === id);
}

/** Resolve saved template; migrates retired "ledger" picks to "folio". */
export function resolveResumeTemplate(saved: string | undefined): ResumeTemplateId {
  if (saved === "folio" || saved === "ledger") return "folio";
  if (saved && isValidResumeTemplate(saved)) return saved;
  return DEFAULT_RESUME_TEMPLATE;
}
