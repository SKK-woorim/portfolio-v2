import "server-only";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { getSupabaseConfig } from "@/lib/supabase/config";

const timestamp = z.iso.datetime({ offset: true });
const count = z.number().int().nonnegative();

const attemptSchema = z.object({
  attempt_order: count,
  provider: z.enum(["openai", "gemini", "local"]),
  model: z.string().nullable(),
  started_at: timestamp,
  duration_ms: count,
  status: z.enum(["success", "error", "timeout", "cancelled"]),
  http_status: count.nullable(),
  error_class: z.string().nullable(),
  input_tokens: count.nullable(),
  output_tokens: count.nullable(),
  total_tokens: count.nullable(),
});

const historySchema = z.object({
  requests: z.array(z.object({
    request_id: z.uuid(),
    started_at: timestamp,
    key_lookup_status: z.enum(["failed", "missing_openai", "missing_gemini", "missing_both"]).nullable(),
    attempts: z.array(attemptSchema),
  })),
  total_count: count,
});

export type ChatbotCallAttempt = z.infer<typeof attemptSchema>;

export const CHATBOT_CALL_LOG_PAGE_SIZE = 20;

export function parseChatbotCallLogPage(value: string | string[] | undefined) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  const maxPage = Math.floor(2_147_483_647 / CHATBOT_CALL_LOG_PAGE_SIZE) + 1;
  return page >= 1 && page <= maxPage ? page : 1;
}

export async function getAdminChatbotCallLogs(page: number) {
  await requireAdmin();
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (!serviceRoleKey) return null;

    const { url } = getSupabaseConfig();
    const supabase = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { data, error } = await supabase.rpc("list_chatbot_call_logs", {
      p_limit: CHATBOT_CALL_LOG_PAGE_SIZE,
      p_offset: (page - 1) * CHATBOT_CALL_LOG_PAGE_SIZE,
    });
    if (error) return null;

    const result = historySchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
