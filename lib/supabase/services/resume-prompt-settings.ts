import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  parseResumePromptPreferences,
  resumePromptPreferencesToDefaultSettings,
  type ResumePromptPreferences,
} from "@/lib/resume-prompt-settings";
import { loadProfileBundleForUser } from "@/lib/supabase/load-profile-bundle";
import { mergeAndSaveProfileDefaultSettings } from "@/lib/supabase/services/profile-default-settings";

export async function loadResumePromptPreferences(
  userId: string,
  client: SupabaseClient = supabase
): Promise<ResumePromptPreferences> {
  const bundle = await loadProfileBundleForUser(userId, client);
  return parseResumePromptPreferences(bundle.profile.default_settings);
}

export async function saveResumePromptPreferences(
  userId: string,
  prefs: ResumePromptPreferences,
  client: SupabaseClient = supabase
): Promise<ResumePromptPreferences> {
  const updated = await mergeAndSaveProfileDefaultSettings(
    userId,
    (current) => resumePromptPreferencesToDefaultSettings(current, prefs),
    client
  );
  return parseResumePromptPreferences(updated);
}
