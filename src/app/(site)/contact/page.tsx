import type { Metadata } from "next";
import { ArrowUpRight, Mail } from "lucide-react";
import { getSiteProfile } from "@/lib/content/repository";

export const metadata: Metadata = { title: "연락처", description: "협업과 프로젝트 제안을 위한 연락처입니다." };
export default async function ContactPage() {
  const profile = await getSiteProfile();
  return <section className="section"><div className="container"><div className="overflow-hidden rounded-[32px] bg-[var(--dark)] px-7 py-16 text-white sm:px-12 sm:py-24"><p className="eyebrow text-[#9fc4f5]">Contact</p><h1 className="display mt-4 max-w-3xl text-5xl leading-[1.05] sm:text-6xl">새로운 문제를<br />함께 풀어볼까요?</h1><p className="mt-6 max-w-xl text-lg leading-8 text-[#bfd0e6]">프로젝트 협업, 제품 개선, 기술적인 대화 모두 환영합니다. 아래 이메일로 편하게 연락해 주세요.</p><a className="on-light-cta focus-ring mt-10 inline-flex min-h-14 items-center gap-3 rounded-full bg-white px-7 text-base font-semibold hover:bg-[#e8f2ff]" href={`mailto:${profile.email}`}><Mail size={19} /> {profile.email}</a><div className="mt-12 flex flex-wrap gap-5 text-sm text-[#c7d8ed]">{profile.socialLinks.map((link) => <a className="focus-ring inline-flex items-center gap-1 hover:text-white" href={link.href} key={link.label} target="_blank" rel="noreferrer">{link.label} <ArrowUpRight size={15} /></a>)}</div></div></div></section>;
}
