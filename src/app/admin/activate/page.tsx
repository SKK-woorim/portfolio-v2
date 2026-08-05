import type { Metadata } from "next";
import Link from "next/link";
import { InviteActivationForm } from "@/components/admin/invite-activation-form";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "관리자 계정 활성화", robots: { index: false, follow: false } };

export default function AdminActivatePage() {
  const configured = hasSupabaseConfig();
  return <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5"><div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-white p-7 shadow-[0_4px_12px_rgba(10,25,48,.04)] sm:p-9"><Link href="/" className="focus-ring text-sm font-bold text-[var(--primary)]">← 공개 사이트</Link><p className="eyebrow mt-9">Portfolio CMS</p><h1 className="display mt-3 text-4xl">관리자 계정 활성화</h1><p className="mt-4 text-sm leading-6 text-[var(--muted)]">초대 이메일을 통해 처음 접속하셨습니다. 사용할 비밀번호를 설정해 주세요.</p>{configured ? <InviteActivationForm /> : <p className="mt-5 rounded-2xl bg-[#fff8e8] p-4 text-sm leading-6 text-[#7a5700]">Supabase 환경 변수가 아직 설정되지 않았습니다.</p>}<Link href="/admin/login" className="focus-ring mt-6 inline-block text-sm font-semibold text-[var(--primary)]">이미 비밀번호가 있나요? 로그인하기 →</Link></div></main>;
}
