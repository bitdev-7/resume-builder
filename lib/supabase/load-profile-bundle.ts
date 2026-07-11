import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { createEmptyProfileBundle } from "@/lib/supabase/empty-profile-bundle";
import { getUserId } from "@/lib/supabase/get-user-id";
import {
  ensureDefaultResumeProfile,
} from "@/lib/supabase/services/resume-profiles";
import type {
  Profile,
  ProfileBundle,
  ResumeProfile,
  UserCertification,
  UserCompany,
  UserEducation,
  UserProject,
  UserSkill,
} from "@/lib/supabase/database.types";

function normalizeProfile(row: Profile): Profile {
  return {
    ...row,
    default_settings: row.default_settings ?? {},
  };
}

/** Fetch a resume profile's content rows, scoped by profile_id. */
async function fetchProfileContent(
  profileId: string,
  client: SupabaseClient
): Promise<Omit<ProfileBundle, "profile" | "resumeProfile">> {
  const [educations, skills, certifications, projects, companies] = await Promise.all([
    client
      .from("user_educations")
      .select("*")
      .eq("profile_id", profileId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("user_skills")
      .select("*")
      .eq("profile_id", profileId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("user_certifications")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: true }),
    client
      .from("user_projects")
      .select("*")
      .eq("profile_id", profileId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("user_companies")
      .select("*")
      .eq("profile_id", profileId)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  const firstError = [educations.error, skills.error, certifications.error, projects.error, companies.error].find(
    Boolean
  );
  if (firstError) throw firstError;

  return {
    educations: (educations.data ?? []) as UserEducation[],
    skills: (skills.data ?? []) as UserSkill[],
    certifications: (certifications.data ?? []) as UserCertification[],
    projects: (projects.data ?? []) as UserProject[],
    companies: (companies.data ?? []) as UserCompany[],
  };
}

/** Loads a specific resume profile (persona) + its content for a user. */
export async function loadProfileBundleById(
  userId: string,
  resumeProfile: ResumeProfile,
  client: SupabaseClient = supabase
): Promise<ProfileBundle> {
  const account = (await ensureProfile(userId, client)) ?? createEmptyProfileBundle(userId).profile;
  const content = await fetchProfileContent(resumeProfile.id, client);
  return { profile: normalizeProfile(account), resumeProfile, ...content };
}

/** Loads the default resume profile bundle for the current session. */
export async function loadProfileBundle(
  client: SupabaseClient = supabase
): Promise<ProfileBundle> {
  const userId = await getUserId(client);
  return loadProfileBundleForUser(userId, client);
}

/** Loads the default resume profile bundle for a specific user id. */
export async function loadProfileBundleForUser(
  userId: string,
  client: SupabaseClient = supabase
): Promise<ProfileBundle> {
  const account = normalizeProfile(
    (await ensureProfile(userId, client)) ?? createEmptyProfileBundle(userId).profile
  );
  const resumeProfile = await ensureDefaultResumeProfile(userId, client);
  const content = await fetchProfileContent(resumeProfile.id, client);
  return { profile: account, resumeProfile, ...content };
}
