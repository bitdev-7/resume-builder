import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getUserIdOrNull } from "@/lib/supabase/get-user-id";
import { loadProfileBundleById } from "@/lib/supabase/load-profile-bundle";
import {
  ensureDefaultResumeProfile,
  listResumeProfiles,
} from "@/lib/supabase/services/resume-profiles";
import type { ProfileBundle, ResumeProfile } from "@/lib/supabase/database.types";
import {
  isProfileBundlePopulated,
  profileBundleToLegacyAnalyzeProfile,
  profileBundleToResumeText,
  type LegacyAnalyzeProfile,
} from "@/lib/mappers/profile-to-resume";
import { createEmptyProfileBundle } from "@/lib/supabase/empty-profile-bundle";
import {
  formatSupabaseConnectionError,
  isSupabaseNetworkError,
} from "@/lib/supabase/network";
import { readProfileCache, writeProfileCache } from "@/lib/supabase/profile-cache";

export interface LoadProfileForAppOptions {
  email?: string | null;
  userId?: string;
  /** Which resume profile to load; defaults to the account's default profile. */
  profileId?: string;
}

export interface LoadedProfileForApp {
  bundle: ProfileBundle;
  /** All resume profiles for the account (for the profile selector). */
  profiles: ResumeProfile[];
  activeProfileId: string;
  legacyAnalyzeProfile: LegacyAnalyzeProfile;
  resumeText: string;
  source: "normalized" | "empty" | "cache";
}

function buildLoadedResult(
  bundle: ProfileBundle,
  profiles: ResumeProfile[],
  activeProfileId: string,
  options: LoadProfileForAppOptions,
  source: LoadedProfileForApp["source"]
): LoadedProfileForApp {
  return {
    bundle,
    profiles,
    activeProfileId,
    legacyAnalyzeProfile: profileBundleToLegacyAnalyzeProfile(bundle, options.email),
    resumeText: profileBundleToResumeText(bundle, options.email),
    source,
  };
}

async function loadProfileForAppInternal(
  client: SupabaseClient,
  options: LoadProfileForAppOptions
): Promise<LoadedProfileForApp> {
  const userId = options.userId ?? (await getUserIdOrNull(client));
  if (!userId) {
    throw new Error("Authentication required");
  }

  let profiles = await listResumeProfiles(userId, client);
  if (profiles.length === 0) {
    profiles = [await ensureDefaultResumeProfile(userId, client)];
  }

  const active =
    profiles.find((p) => p.id === options.profileId) ??
    profiles.find((p) => p.is_default) ??
    profiles[0];

  const bundle = await loadProfileBundleById(userId, active, client);
  const source: LoadedProfileForApp["source"] = isProfileBundlePopulated(bundle)
    ? "normalized"
    : "empty";

  const result = buildLoadedResult(bundle, profiles, active.id, options, source);
  writeProfileCache(userId, result);
  return result;
}

/**
 * Loads a resume profile for the app (the requested one, or the default).
 * On network failure returns cached or empty profile instead of throwing.
 */
export async function loadProfileForApp(
  client: SupabaseClient = supabase,
  options: LoadProfileForAppOptions = {}
): Promise<LoadedProfileForApp> {
  try {
    return await loadProfileForAppInternal(client, options);
  } catch (error) {
    if (!isSupabaseNetworkError(error)) {
      throw error;
    }

    const userId = options.userId ?? (await getUserIdOrNull(client).catch(() => null));
    const message = formatSupabaseConnectionError(error);

    if (userId) {
      const cached = readProfileCache<LoadedProfileForApp>(userId);
      if (cached) {
        return { ...cached, source: "cache" as const };
      }

      const emptyBundle = createEmptyProfileBundle(userId);
      return buildLoadedResult(emptyBundle, [emptyBundle.resumeProfile], "", options, "empty");
    }

    throw new Error(message);
  }
}
