import type {
  CandidateProfile,
  ComposerResult,
  ExperienceGenerationResult,
} from "@/lib/types/tailoring";
import type { UpdatedResume } from "@/lib/types/resume";
import { parseEndDateForSort } from "@/lib/tailoring/tailoring-planner";

/** Strips noisy repeated separators occasionally present in imported/legacy titles (e.g. "|||", "///"). */
function sanitizeJobTitle(rawTitle: string): string {
  const original = String(rawTitle || "").trim().replace(/\s+/g, " ");
  if (!original) return "";

  let cleaned = original;
  cleaned = cleaned.replace(/\s*[|/\\]{2,}\s*/g, " ");
  cleaned = cleaned.replace(/[|/\\,:;\-]+$/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned || original;
}

/**
 * Stage 11 — final assembly. Contact info, company names, titles, dates, and
 * education always come from the candidate profile. Skills come from the
 * composer output (the pipeline falls back to profile hard skills when the
 * composer succeeds but returns none). Summary, bullets, and project
 * descriptions come from the generation stages.
 */
export function assembleFinalResume(
  profile: CandidateProfile,
  experienceResults: ExperienceGenerationResult[],
  composerResult: ComposerResult
): UpdatedResume {
  const bulletsByExperienceId = new Map(experienceResults.map((r) => [r.experienceId, r.bullets]));

  const experience = [...profile.experiences]
    .sort((a, b) => parseEndDateForSort(b.endDate) - parseEndDateForSort(a.endDate))
    .map((exp) => {
      const bullets = bulletsByExperienceId.get(exp.id);
      const achievements = bullets && bullets.length > 0
        ? bullets.map((b) => b.text)
        : exp.facts.map((f) => f.text);

      return {
        title: sanitizeJobTitle(exp.title),
        company: exp.company,
        startDate: exp.startDate,
        endDate: exp.endDate,
        achievements,
      };
    });

  const projectsById = new Map(profile.projects.map((p) => [p.id, p]));
  const projects = composerResult.projects
    .map((generated) => {
      const original = projectsById.get(generated.id);
      if (!original) return null;
      return {
        name: original.name,
        description: generated.description,
        technologies: generated.technologies,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  return {
    name: profile.contact.name,
    headline: profile.contact.headline,
    photo: profile.contact.photo,
    languages: profile.contact.languages,
    email: profile.contact.email,
    phone: profile.contact.phone,
    location: profile.contact.location,
    // Never surface a linkedin URL the AI/pipeline invented — only what the candidate actually has on file.
    linkedin: profile.contact.linkedin || "",
    summary: composerResult.summary,
    experience,
    hardSkills: composerResult.skillCategories,
    softSkills: composerResult.softSkills,
    education: profile.education,
    certifications: profile.certifications,
    projects,
  };
}
