import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile, ProfileUpdate } from "@/lib/supabase/database.types";

export async function updateProfile(
  userId: string,
  updates: ProfileUpdate,
  client: SupabaseClient = supabase
): Promise<Profile> {
  // Never allow clients to set role via this helper (DB trigger is the backstop).
  const { role: _role, ...safeUpdates } = updates;
  const { data, error } = await client
    .from("profiles")
    .update({ ...safeUpdates, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data as Profile;
}
