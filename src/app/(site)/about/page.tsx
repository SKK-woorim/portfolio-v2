import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Tag } from "@/components/tag";
import { getSiteProfile } from "@/lib/content/repository";

export const metadata: Metadata = { title: "소개", description: "개발자 Woorim Kim의 일하는 방식과 기술 스택입니다." };
export default async function AboutPage() {
  const profile = await getSiteProfile();
  return <><section className="bg-white py-20 sm:py-28"><div className="container grid gap-10 lg:grid-cols-[1fr_.9fr] lg:items-end"><SectionHeading eyebrow="About" title="사용자의 맥락과 구현의 균형을 찾습니다." description={profile.bio} /><div className="rounded-3xl bg-[var(--primary-soft)] p-8"><p className="text-sm leading-7 text-[var(--primary)]">&ldquo;좋은 제품은 눈에 띄는 기능보다, 사용자가 망설이지 않게 하는 구조에서 시작된다고 믿습니다.&rdquo;</p></div></div></section><section className="section"><div className="container grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><p className="eyebrow">Strengths</p><h2 className="display mt-3 text-4xl leading-[1.1]">함께 일할 때<br />중요하게 생각하는 것</h2></div><div className="grid gap-5">{["문제를 충분히 이해한 뒤 만들기", "작은 단위로 검증하며 품질 높이기", "운영하는 사람까지 고려해 구조 만들기"].map((item) => <div className="flex gap-4 rounded-3xl border border-[var(--border)] bg-white p-6" key={item}><CheckCircle2 className="mt-0.5 shrink-0 text-[var(--primary)]" size={20} /><p className="font-semibold tracking-[-.02em]">{item}</p></div>)}</div></div></section><section className="section bg-white"><div className="container"><SectionHeading eyebrow="Skills" title="기술은 문제를 푸는 도구입니다." /><div className="mt-10 flex max-w-3xl flex-wrap gap-3">{profile.skills.map((skill) => <Tag className="px-4 py-2 text-sm" key={skill}>{skill}</Tag>)}</div></div></section></>;
}
