import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  applyAlertSettingsToDefaultSettings,
  parseApplyAlertSettings,
  type ApplyAlertSettings,
} from "@/lib/apply-alert-settings";
import {
  aiSettingsToDefaultSettings,
  parseAiSettings,
  type AiSettings,
} from "@/lib/ai-settings";
import { loadProfileBundleForUser } from "@/lib/supabase/load-profile-bundle";
import { updateProfile } from "@/lib/supabase/services/profiles";

export async function loadGeneralSettings(
  userId: string,
  client: SupabaseClient = supabase
): Promise<{ alerts: ApplyAlertSettings; ai: AiSettings; fullName: string }> {
  const bundle = await loadProfileBundleForUser(userId, client);
  const settings = bundle.profile.default_settings ?? {};
  return {
    alerts: parseApplyAlertSettings(settings),
    ai: parseAiSettings(settings),
    fullName: bundle.profile.full_name?.trim() || "",
  };
}

export async function saveGeneralSettings(
  userId: string,
  alerts: ApplyAlertSettings,
  ai: AiSettings,
  fullName: string,
  client: SupabaseClient = supabase
): Promise<{ alerts: ApplyAlertSettings; ai: AiSettings; fullName: string }> {
  const bundle = await loadProfileBundleForUser(userId, client);
  const current = bundle.profile.default_settings ?? {};
  const nextSettings = applyAlertSettingsToDefaultSettings(
    aiSettingsToDefaultSettings(current, ai),
    alerts
  );

  const updated = await updateProfile(
    userId,
    {
      default_settings: nextSettings,
      full_name: fullName.trim() || null,
    },
    client
  );

  return {
    alerts: parseApplyAlertSettings(updated.default_settings ?? {}),
    ai: parseAiSettings(updated.default_settings ?? {}),
    fullName: updated.full_name?.trim() || "",
  };
}
