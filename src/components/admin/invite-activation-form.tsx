"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { inputFieldClass } from "@/components/ui/field-classes";
import { createClient } from "@/lib/supabase/client";
import type { FormState } from "@/lib/validation/content";
import { FormStatus } from "./form-status";
import { PasswordField } from "./password-field";

const labelClass = "text-sm font-semibold text-[var(--ink)]";
const PASSWORD_MIN_LENGTH = 8;

export function InviteActivationForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "expired">("checking");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<FormState>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const updateStatus = (hasSession: boolean) => {
      if (active) setStatus(hasSession ? "ready" : "expired");
    };

    async function restoreRecoverySession() {
      const code = new URLSearchParams(window.location.search).get("code");
      const result = code
        ? await supabase.auth.exchangeCodeForSession(code)
        : await supabase.auth.getSession();

      if (!active) return;

      if (result.error) {
        setStatus("expired");
        return;
      }

      if (code) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete("code");
        window.history.replaceState({}, "", `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      }

      updateStatus(Boolean(result.data.session));
    }

    void restoreRecoverySession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      updateStatus(Boolean(session));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function setAdminPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback({});
    // 확인 입력을 두 번 받지 않는다(표시 토글로 직접 확인). minLength가 막지 못한 경우만 여기서 안내한다.
    if (password.length < PASSWORD_MIN_LENGTH) {
      setFeedback({ error: "비밀번호는 8자 이상으로 설정해 주세요." });
      return;
    }

    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (error) {
      setFeedback({ error: "비밀번호를 설정하지 못했습니다. 새 초대 링크로 다시 시도해 주세요." });
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  async function requestNewLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback({});
    setPending(true);
    const redirectTo = new URL("/admin/activate", window.location.origin).toString();
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    setPending(false);
    if (error) {
      setFeedback({ error: "이메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." });
      return;
    }
    setFeedback({ success: "비밀번호 설정 이메일을 보냈습니다. 메일의 최신 링크를 한 번만 열어 주세요." });
  }

  if (status === "checking") {
    return <p className="mt-6 text-sm leading-6 text-[var(--muted)]">초대 링크를 확인하고 있습니다…</p>;
  }

  if (status === "expired") {
    return <section className="mt-6">
      <p role="alert" className="rounded-2xl bg-[#fff0f1] p-4 text-sm leading-6 text-[#a22b38]">이 초대 링크는 만료되었거나 이미 사용되었습니다. 아래에서 새 비밀번호 설정 링크를 받을 수 있습니다.</p>
      <form onSubmit={requestNewLink} className="mt-5 grid gap-5">
        <div className="grid gap-2">
          <label htmlFor="admin-activate-email" className={labelClass}>관리자 이메일</label>
          <input id="admin-activate-email" name="email" required autoComplete="email" type="email" spellCheck={false} enterKeyHint="send" value={email} onChange={(event) => setEmail(event.target.value)} className={inputFieldClass} />
        </div>
        <FormStatus result={feedback} error={feedback.error} success={feedback.success} />
        <Button type="submit" size="large" disabled={pending}>{pending ? "보내는 중…" : "비밀번호 설정 이메일 보내기"}</Button>
      </form>
    </section>;
  }

  return <form onSubmit={setAdminPassword} className="mt-7 grid gap-5">
    <div className="grid gap-2">
      <label htmlFor="admin-new-password" className={labelClass}>새 비밀번호</label>
      {/* 규칙은 입력 위에 늘 보이게 두고 aria-describedby로 연결한다. placeholder나 오류 메시지에만 두지 않는다. */}
      <p id="admin-new-password-hint" className="text-xs leading-5 text-[var(--muted)]">8자 이상으로 입력해 주세요.</p>
      <PasswordField id="admin-new-password" name="new-password" required minLength={PASSWORD_MIN_LENGTH} autoComplete="new-password" enterKeyHint="done" aria-describedby="admin-new-password-hint" value={password} onChange={(event) => setPassword(event.target.value)} />
    </div>
    <FormStatus result={feedback} error={feedback.error} />
    <Button type="submit" size="large" disabled={pending}>{pending ? "설정 중…" : "비밀번호 설정하고 시작하기"}</Button>
  </form>;
}
