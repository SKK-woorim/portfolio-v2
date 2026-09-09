"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  createLoginRateLimitContext,
  finalizeLoginAttempt,
  reserveLoginAttempt,
} from "@/lib/auth/login-rate-limit";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, type FormState } from "@/lib/validation/content";

const LOGIN_REJECTED_MESSAGE = "이메일 또는 비밀번호를 확인하거나 잠시 후 다시 시도해 주세요.";
const LOGIN_TEMPORARY_FAILURE_MESSAGE = "로그인 요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";

export async function login(_previousState: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };

  const email = parsed.data.email.toLowerCase();
  let reservationToken: string;
  try {
    const rateLimitContext = createLoginRateLimitContext(email, await headers());
    const admission = await reserveLoginAttempt(rateLimitContext);
    if (!admission.allowed || !admission.reservationToken) return { error: LOGIN_REJECTED_MESSAGE };
    reservationToken = admission.reservationToken;
  } catch {
    return { error: LOGIN_TEMPORARY_FAILURE_MESSAGE };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  let error: { code?: string } | null;
  try {
    supabase = await createClient();
    ({ error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password }));
  } catch {
    try { await finalizeLoginAttempt(reservationToken, "abandoned"); } catch { /* The reservation expires automatically. */ }
    return { error: LOGIN_TEMPORARY_FAILURE_MESSAGE };
  }

  if (error) {
    try {
      await finalizeLoginAttempt(
        reservationToken,
        error.code === "invalid_credentials" ? "failure" : "abandoned",
      );
    } catch {
      return { error: LOGIN_TEMPORARY_FAILURE_MESSAGE };
    }
    return { error: error.code === "invalid_credentials" ? LOGIN_REJECTED_MESSAGE : LOGIN_TEMPORARY_FAILURE_MESSAGE };
  }

  try {
    await finalizeLoginAttempt(reservationToken, "success");
  } catch {
    // Authentication succeeded, but the trusted limiter did not. Do not leave
    // a usable session behind on a fail-closed response.
    await supabase.auth.signOut({ scope: "local" });
    return { error: LOGIN_TEMPORARY_FAILURE_MESSAGE };
  }
  redirect("/admin");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
