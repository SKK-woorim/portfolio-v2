import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/admin/login-form";
import { hasSupabaseConfig } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "관리자 로그인", robots: { index: false, follow: false } };
type PageProps = { searchParams: Promise<{ setup?: string; reason?: string }> };
export default async function AdminLoginPage({ searchParams }: PageProps) {
  const { setup, reason } = await searchParams;
  const configured = hasSupabaseConfig();
  return <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-5"><div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-white p-7 shadow-[0_4px_12px_rgba(10,25,48,.04)] sm:p-9"><Link href="/" className="focus-ring text-sm font-bold text-[var(--primary)]">← 공개 사이트</Link><p className="eyebrow mt-9">Portfolio CMS</p><h1 className="display mt-3 text-4xl">관리자 로그인</h1>{setup || !configured ? <p className="mt-5 rounded-2xl bg-[#fff8e8] p-4 text-sm leading-6 text-[#7a5700]">Supabase 환경 변수가 아직 설정되지 않았습니다. <code>.env.example</code>과 운영 안내를 확인해 주세요.</p> : null}{reason === "unauthorized" ? <p className="mt-5 rounded-2xl bg-[#fff0f1] p-4 text-sm leading-6 text-[#a22b38]">관리자 권한이 없는 계정입니다.</p> : null}{configured ? <LoginForm /> : null}<Link href="/admin/activate" className="focus-ring mt-6 inline-block text-sm font-semibold text-[var(--primary)]">초대 링크로 비밀번호 설정하기 →</Link></div></main>;
}
