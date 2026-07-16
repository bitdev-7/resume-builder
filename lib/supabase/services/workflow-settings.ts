import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  parseWorkflowSettings,
  workflowSettingsToDefaultSettings,
  type WorkflowSettings,
} from "@/lib/workflow-settings";
import { loadProfileBundleForUser } from "@/lib/supabase/load-profile-bundle";
import { mergeAndSaveProfileDefaultSettings } from "@/lib/supabase/services/profile-default-settings";

export async function loadWorkflowSettings(
  userId: string,
  client: SupabaseClient = supabase
): Promise<WorkflowSettings> {
  const bundle = await loadProfileBundleForUser(userId, client);
  return parseWorkflowSettings(bundle.profile.default_settings);
}

export async function saveWorkflowSettings(
  userId: string,
  workflow: WorkflowSettings,
  client: SupabaseClient = supabase
): Promise<WorkflowSettings> {
  const updated = await mergeAndSaveProfileDefaultSettings(
    userId,
    (current) => workflowSettingsToDefaultSettings(current, workflow),
    client
  );
  return parseWorkflowSettings(updated);
}
