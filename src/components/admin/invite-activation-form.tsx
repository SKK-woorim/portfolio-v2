"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function InviteActivationForm() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready" | "expired">("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const updateStatus = (hasSession: boolean) => {
      if (active) setStatus(hasSession ? "ready" : "expired");
    };

    void supabase.auth.getSession().then(({ data }) => updateStatus(Boolean(data.session)));
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
    setMessage("");
    if (password.length < 8) {
      setMessage("비밀번호는 8자 이상으로 설정해 주세요.");
      return;
    }
    if (password !== confirmation) {
      setMessage("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setPending(true);
    const { error } = await createClient().auth.updateUser({ password });
    setPending(false);
    if (error) {
      setMessage("비밀번호를 설정하지 못했습니다. 새 초대 링크로 다시 시도해 주세요.");
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  if (status === "checking") {
    return <p className="mt-6 text-sm leading-6 text-[var(--muted)]">초대 링크를 확인하고 있습니다…</p>;
  }

  if (status === "expired") {
    return <p role="alert" className="mt-6 rounded-2xl bg-[#fff0f1] p-4 text-sm leading-6 text-[#a22b38]">이 초대 링크는 만료되었거나 이미 사용되었습니다. 새 초대 이메일의 링크를 한 번만 열어 다시 시도해 주세요.</p>;
  }

  return <form onSubmit={setAdminPassword} className="mt-7 grid gap-5">
    <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
      새 비밀번호
      <input required minLength={8} autoComplete="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-12 rounded-xl border border-[var(--border)] px-4 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" />
    </label>
    <label className="grid gap-2 text-sm font-semibold text-[var(--ink)]">
      비밀번호 확인
      <input required minLength={8} autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-12 rounded-xl border border-[var(--border)] px-4 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" />
    </label>
    {message ? <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">{message}</p> : null}
    <Button type="submit" size="large" disabled={pending}>{pending ? "설정 중…" : "비밀번호 설정하고 시작하기"}</Button>
  </form>;
}
