import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { EducationFormRow } from "@/lib/mappers/profile-form";
import { educationFormRowToDbPayload } from "@/lib/mappers/profile-form";

export async function syncEducations(
  userId: string,
  profileId: string,
  rows: EducationFormRow[],
  client: SupabaseClient = supabase
): Promise<void> {
  // Upsert FIRST, delete LAST. If a write fails (e.g. a schema/migration issue),
  // we throw before deleting anything, so existing education is never wiped.
  const keepIds = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const payload = educationFormRowToDbPayload(rows[i], userId, profileId, i);
    const { id, ...insertFields } = payload;

    if (rows[i].id) {
      keepIds.add(rows[i].id!);
      const { error } = await client
        .from("user_educations")
        .update({ ...insertFields, updated_at: new Date().toISOString() })
        .eq("id", rows[i].id!);
      if (error) throw error;
    } else {
      keepIds.add(id);
      const { error } = await client.from("user_educations").insert(payload);
      if (error) throw error;
    }
  }

  const { data: existing, error: fetchError } = await client
    .from("user_educations")
    .select("id")
    .eq("profile_id", profileId);
  if (fetchError) throw fetchError;

  const deleteIds = (existing ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keepIds.has(id));

  if (deleteIds.length > 0) {
    const { error } = await client.from("user_educations").delete().in("id", deleteIds);
    if (error) throw error;
  }
}
