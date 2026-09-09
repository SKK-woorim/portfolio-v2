import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createLoginRateLimitHashes, getLoginClientIpPrefix } from "@/lib/auth/login-rate-limit-identifiers";

type HeaderReader = Pick<Headers, "get">;

export type LoginRateLimitContext = {
  emailHash: string;
  ipHash: string;
};

export type LoginRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
  reservationToken: string | null;
};

export type LoginAttemptOutcome = "success" | "failure" | "abandoned";

function getSecrets() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey || serviceRoleKey.length < 16) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  const rateLimitSecret = process.env.LOGIN_RATE_LIMIT_SECRET?.trim();
  if (!rateLimitSecret || rateLimitSecret.length < 32) {
    throw new Error("LOGIN_RATE_LIMIT_SECRET is not configured");
  }
  return { serviceRoleKey, rateLimitSecret };
}

function createTrustedRateLimitClient(serviceRoleKey: string) {
  const { url } = getSupabaseConfig();
  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function parseRateLimitResult(value: unknown): LoginRateLimitResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid login rate-limit response");
  }
  const result = value as {
    allowed?: unknown;
    retry_after_seconds?: unknown;
    reservation_token?: unknown;
  };
  const reservationToken = result.reservation_token;
  if (
    typeof result.allowed !== "boolean"
    || typeof result.retry_after_seconds !== "number"
    || !(reservationToken === null || typeof reservationToken === "string")
    || (result.allowed && (
      typeof reservationToken !== "string"
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservationToken)
    ))
    || (!result.allowed && reservationToken !== null)
  ) {
    throw new Error("Invalid login rate-limit response");
  }
  return {
    allowed: result.allowed,
    retryAfterSeconds: Math.max(0, Math.ceil(result.retry_after_seconds)),
    reservationToken,
  };
}

export function createLoginRateLimitContext(email: string, headers: HeaderReader): LoginRateLimitContext {
  const { rateLimitSecret } = getSecrets();
  return createLoginRateLimitHashes(email, getLoginClientIpPrefix(headers), rateLimitSecret);
}

export async function reserveLoginAttempt(context: LoginRateLimitContext) {
  const { serviceRoleKey } = getSecrets();
  const { data, error } = await createTrustedRateLimitClient(serviceRoleKey).rpc(
    "reserve_login_attempt_trusted",
    { p_email_hash: context.emailHash, p_ip_hash: context.ipHash },
  );
  if (error) throw error;
  return parseRateLimitResult(data);
}

export async function finalizeLoginAttempt(
  reservationToken: string,
  outcome: LoginAttemptOutcome,
) {
  const { serviceRoleKey } = getSecrets();
  const { error } = await createTrustedRateLimitClient(serviceRoleKey).rpc(
    "finalize_login_attempt_trusted",
    { p_reservation_token: reservationToken, p_outcome: outcome },
  );
  if (error) throw error;
}
