"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, type FormState } from "@/lib/validation/content";

export async function login(_previousState: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };

  const supabase = await createClient();
  const email = parsed.data.email.toLowerCase();
  const { data: locked, error: limitError } = await supabase.rpc("is_login_locked", { p_identifier: email });
  if (limitError) return { error: "로그인 제한을 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요." };
  if (locked) return { error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요." };

  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) {
    if (error.code === "invalid_credentials") {
      await supabase.rpc("record_failed_login_attempt", { p_identifier: email });
      return { error: "이메일 또는 비밀번호를 확인해 주세요." };
    }
    return { error: "로그인 요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  }

  await supabase.rpc("clear_failed_login_attempt", { p_identifier: email });
  redirect("/admin");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
