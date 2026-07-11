import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { ProfileFormState } from "@/lib/mappers/profile-form";
import { updateResumeProfile } from "@/lib/supabase/services/resume-profiles";
import { syncEducations } from "@/lib/supabase/services/user-educations";
import { syncCertifications } from "@/lib/supabase/services/user-certifications";
import { syncProjects } from "@/lib/supabase/services/user-projects";
import { syncCompanies } from "@/lib/supabase/services/user-companies";
import { syncSkills } from "@/lib/supabase/services/user-skills";

/**
 * Saves one resume profile: its persona fields (resume_profiles) plus its
 * content rows (education / certifications / projects / companies / skills),
 * all scoped to profileId.
 */
export async function saveProfileForm(
  userId: string,
  profileId: string,
  form: ProfileFormState,
  client: SupabaseClient = supabase
): Promise<void> {
  await updateResumeProfile(
    profileId,
    {
      label: form.label.trim() || "My Profile",
      full_name: form.fullName.trim() || null,
      email: form.email.trim() || null,
      headline: form.headline.trim() || null,
      photo_url: form.photoUrl.trim() || null,
      phone: form.phone.trim() || null,
      location: form.location.trim() || null,
      linkedin_url: form.linkedin.trim() || null,
      summary: form.summary.trim() || null,
      resume_template: form.resumeTemplate,
      languages: form.languages
        .filter((l) => l.name.trim())
        .map((l) => ({ name: l.name.trim(), level: l.level.trim() || "Fluent" })),
    },
    client
  );

  await syncEducations(userId, profileId, form.educations, client);
  await syncCertifications(
    userId,
    profileId,
    form.certifications.map((cert) => ({ id: cert.id, name: cert.name })),
    client
  );
  await syncProjects(userId, profileId, form.projects, client);
  await syncCompanies(userId, profileId, form.companies, client);
  await syncSkills(userId, profileId, form.skills, client);
}
