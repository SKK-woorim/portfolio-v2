import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

export type ChatbotIndexStats = { documents: number; profile: number; portfolio: number; post: number };

const CACHE_MS = 60_000;
let cached: { at: number; value: ChatbotIndexStats | null } | null = null;

function count(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function parseChatbotIndexStats(value: unknown): ChatbotIndexStats | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const documents = count(record.documents);
  if (documents === null) return null;
  return { documents, profile: count(record.profile) ?? 0, portfolio: count(record.portfolio) ?? 0, post: count(record.post) ?? 0 };
}

/**
 * 챗봇 진행 표시에 쓰는 인덱스 통계. 실패하면 숫자 없이 동작하도록 null을 돌려주고 1분 캐시한다.
 * 통계는 부가 정보라 연결 상태 판단과 오류 보고에는 영향을 주지 않는다.
 */
export async function getChatbotIndexStats(now = Date.now()): Promise<ChatbotIndexStats | null> {
  if (cached && now - cached.at < CACHE_MS) return cached.value;
  let value: ChatbotIndexStats | null = null;
  try {
    const { url, publishableKey } = getSupabaseConfig();
    const supabase = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    });
    const { data, error } = await supabase.rpc("get_chatbot_index_stats");
    if (!error) value = parseChatbotIndexStats(data);
  } catch {
    value = null;
  }
  cached = { at: now, value };
  return value;
}
