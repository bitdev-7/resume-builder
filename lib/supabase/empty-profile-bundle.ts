import type { ProfileBundle } from "@/lib/supabase/database.types";

export function createEmptyProfileBundle(userId: string): ProfileBundle {
  const timestamp = new Date(0).toISOString();

  return {
    profile: {
      id: userId,
      full_name: null,
      phone: null,
      linkedin_url: null,
      summary: null,
      location: null,
      default_settings: {},
      created_at: timestamp,
      updated_at: timestamp,
    },
    educations: [],
    skills: [],
    certifications: [],
    projects: [],
    companies: [],
  };
}
