import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { SkillFormRow } from "@/lib/mappers/profile-form";
import { skillFormRowToDbPayload } from "@/lib/mappers/profile-form";

/**
 * Diff-and-sync the user's skills against the user_skills table.
 * Mirrors syncCompanies/syncEducations, except user_skills has no updated_at
 * column, so updates omit it. Blank skill rows are dropped.
 */
export async function syncSkills(
  userId: string,
  profileId: string,
  rows: SkillFormRow[],
  client: SupabaseClient = supabase
): Promise<void> {
  const cleanRows = rows.filter((row) => row.skillName.trim());

  const { data: existing, error: fetchError } = await client
    .from("user_skills")
    .select("id")
    .eq("profile_id", profileId);

  if (fetchError) throw fetchError;

  const keepIds = new Set(cleanRows.filter((row) => row.id).map((row) => row.id!));
  const deleteIds = (existing ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keepIds.has(id));

  if (deleteIds.length > 0) {
    const { error } = await client.from("user_skills").delete().in("id", deleteIds);
    if (error) throw error;
  }

  for (let i = 0; i < cleanRows.length; i++) {
    const payload = skillFormRowToDbPayload(cleanRows[i], userId, profileId, i);

    if (cleanRows[i].id) {
      const { id, ...updateFields } = payload;
      const { error } = await client.from("user_skills").update(updateFields).eq("id", cleanRows[i].id!);
      if (error) throw error;
    } else {
      const { error } = await client.from("user_skills").insert(payload);
      if (error) throw error;
    }
  }
}
