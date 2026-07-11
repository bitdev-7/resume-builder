import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type {
  ResumeProfile,
  ResumeProfileUpdate,
} from "@/lib/supabase/database.types";

/** All resume profiles for a user, default first, then by display order. */
export async function listResumeProfiles(
  userId: string,
  client: SupabaseClient = supabase
): Promise<ResumeProfile[]> {
  const { data, error } = await client
    .from("resume_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ResumeProfile[];
}

/**
 * Ensures the account has at least one resume profile. Returns the default
 * (or first) profile. Called by the loaders so the app always has a profile.
 */
export async function ensureDefaultResumeProfile(
  userId: string,
  client: SupabaseClient = supabase
): Promise<ResumeProfile> {
  const existing = await listResumeProfiles(userId, client);
  if (existing.length > 0) {
    return existing.find((p) => p.is_default) ?? existing[0];
  }

  const { data, error } = await client
    .from("resume_profiles")
    .insert({
      user_id: userId,
      label: "My Profile",
      resume_template: "standard",
      is_default: true,
      display_order: 0,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ResumeProfile;
}

export async function createResumeProfile(
  userId: string,
  label: string,
  client: SupabaseClient = supabase
): Promise<ResumeProfile> {
  const existing = await listResumeProfiles(userId, client);
  const nextOrder = existing.reduce((max, p) => Math.max(max, p.display_order), -1) + 1;

  const { data, error } = await client
    .from("resume_profiles")
    .insert({
      user_id: userId,
      label: label.trim() || "New Profile",
      resume_template: "standard",
      is_default: existing.length === 0,
      display_order: nextOrder,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as ResumeProfile;
}

export async function updateResumeProfile(
  profileId: string,
  updates: ResumeProfileUpdate,
  client: SupabaseClient = supabase
): Promise<ResumeProfile> {
  const { data, error } = await client
    .from("resume_profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", profileId)
    .select("*")
    .single();

  if (error) throw error;
  return data as ResumeProfile;
}

export async function deleteResumeProfile(
  userId: string,
  profileId: string,
  client: SupabaseClient = supabase
): Promise<void> {
  const { error } = await client.from("resume_profiles").delete().eq("id", profileId);
  if (error) throw error;

  // If we removed the default, promote another profile to default.
  const remaining = await listResumeProfiles(userId, client);
  if (remaining.length > 0 && !remaining.some((p) => p.is_default)) {
    await setDefaultResumeProfile(userId, remaining[0].id, client);
  }
}

export async function setDefaultResumeProfile(
  userId: string,
  profileId: string,
  client: SupabaseClient = supabase
): Promise<void> {
  const { error: clearError } = await client
    .from("resume_profiles")
    .update({ is_default: false })
    .eq("user_id", userId)
    .neq("id", profileId);
  if (clearError) throw clearError;

  const { error } = await client
    .from("resume_profiles")
    .update({ is_default: true })
    .eq("id", profileId);
  if (error) throw error;
}
