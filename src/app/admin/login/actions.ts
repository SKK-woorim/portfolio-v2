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
  const { data: allowed, error: limitError } = await supabase.rpc("consume_login_attempt", { p_identifier: email });
  if (limitError || !allowed) return { error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." };

  const { error } = await supabase.auth.signInWithPassword({ email, password: parsed.data.password });
  if (error) return { error: "이메일 또는 비밀번호를 확인해 주세요." };
  redirect("/admin");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
