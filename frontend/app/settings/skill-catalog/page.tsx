import { redirect } from "next/navigation";

/** Skill catalog editing moved to admin-only LLM research flow. */
export default function SkillCatalogSettingsPage() {
  redirect("/settings");
}
