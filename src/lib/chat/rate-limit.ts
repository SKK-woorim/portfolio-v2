import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

export type ChatRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function hmacIdentifier(secret: string, value: string) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function createChatRateLimitHashes(ip: string, sessionId: string, secret: string, now = new Date()) {
  const dailySalt = now.toISOString().slice(0, 10);
  return {
    sessionHash: hmacIdentifier(secret, `${dailySalt}:session:${ip}:${sessionId}`),
    ipHash: hmacIdentifier(secret, `${dailySalt}:ip:${ip}`),
  };
}

export async function consumeChatRateLimit(request: Request, sessionId: string): Promise<ChatRateLimitResult> {
  const secret = process.env.CHAT_RATE_LIMIT_SECRET;
  if (!secret) throw new Error("CHAT_RATE_LIMIT_SECRET is not configured");

  const { url, publishableKey } = getSupabaseConfig();
  const supabase = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const hashes = createChatRateLimitHashes(getClientIp(request), sessionId, secret);
  const { data, error } = await supabase.rpc("consume_chat_rate_limit", {
    p_session_hash: hashes.sessionHash,
    p_ip_hash: hashes.ipHash,
  });
  if (error) throw error;

  const value = data as { allowed?: unknown; retry_after_seconds?: unknown } | null;
  if (!value || typeof value.allowed !== "boolean" || typeof value.retry_after_seconds !== "number") {
    throw new Error("Invalid chat rate-limit response");
  }
  return {
    allowed: value.allowed,
    retryAfterSeconds: Math.max(0, Math.ceil(value.retry_after_seconds)),
  };
}
