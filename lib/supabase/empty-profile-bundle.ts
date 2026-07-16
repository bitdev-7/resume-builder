import type { ProfileBundle } from "@/lib/supabase/database.types";

export function createEmptyProfileBundle(userId: string): ProfileBundle {
  const timestamp = new Date(0).toISOString();

  return {
    profile: {
      id: userId,
      full_name: null,
      email: null,
      phone: null,
      role: "user",
      default_settings: {},
      created_at: timestamp,
      updated_at: timestamp,
    },
    resumeProfile: {
      id: "",
      user_id: userId,
      label: "My Profile",
      full_name: null,
      email: null,
      headline: null,
      phone: null,
      linkedin_url: null,
      summary: null,
      location: null,
      resume_template: null,
      photo_url: null,
      languages: [],
      prompt_overrides: null,
      is_default: true,
      display_order: 0,
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
