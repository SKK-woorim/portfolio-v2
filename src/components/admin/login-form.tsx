"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { login } from "@/app/admin/login/actions";
import type { FormState } from "@/lib/validation/content";

const initialState: FormState = {};
export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  return <form action={formAction} className="mt-7 grid gap-5"><label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">이메일<input required autoComplete="email" name="email" type="email" className="min-h-12 rounded-xl border border-[var(--border)] px-4 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" /></label><label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">비밀번호<input required autoComplete="current-password" name="password" type="password" className="min-h-12 rounded-xl border border-[var(--border)] px-4 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" /></label>{state.error ? <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">{state.error}</p> : null}<Button type="submit" size="large" disabled={pending}>{pending ? "로그인 중…" : "로그인"}</Button></form>;
}
