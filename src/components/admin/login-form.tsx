"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { inputFieldClass } from "@/components/ui/field-classes";
import { login } from "@/app/admin/login/actions";
import type { FormState } from "@/lib/validation/content";
import { FormStatus } from "./form-status";
import { PasswordField } from "./password-field";

const initialState: FormState = {};
const labelClass = "text-sm font-semibold text-[var(--ink)]";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);
  return <form action={formAction} className="mt-7 grid gap-5">
    <div className="grid gap-2">
      <label htmlFor="admin-login-email" className={labelClass}>이메일</label>
      {/* 비밀번호 관리자가 계정 식별자로 인식하도록 autocomplete는 username, 형식 검사·키보드는 type=email로 둔다. */}
      <input id="admin-login-email" name="email" type="email" required autoComplete="username" spellCheck={false} enterKeyHint="next" className={inputFieldClass} />
    </div>
    <div className="grid gap-2">
      <label htmlFor="admin-login-password" className={labelClass}>비밀번호</label>
      <PasswordField id="admin-login-password" name="password" required autoComplete="current-password" enterKeyHint="done" />
    </div>
    <FormStatus result={state} error={state.error} />
    <Button type="submit" size="large" disabled={pending}>{pending ? "로그인 중…" : "로그인"}</Button>
  </form>;
}
