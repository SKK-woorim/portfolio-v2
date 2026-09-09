import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

export type ChatbotRuntimeStatus = {
  enabled: boolean;
  updatedAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isChatbotMasterEnabled() {
  return process.env.CHATBOT_ENABLED === "true";
}

export async function getChatbotRuntimeStatus(signal?: AbortSignal): Promise<ChatbotRuntimeStatus> {
  if (!isChatbotMasterEnabled()) return { enabled: false, updatedAt: null };

  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const query = supabase.rpc("get_chatbot_runtime_status");
  if (signal) query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  if (!isRecord(data) || typeof data.enabled !== "boolean") throw new Error("Invalid chatbot runtime status response");

  return {
    enabled: data.enabled,
    updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
  };
}
