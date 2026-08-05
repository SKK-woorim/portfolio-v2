import Link from "next/link";
import { ArrowRight, ArrowUpRight, CheckCircle2, Mail } from "lucide-react";
import { PostCard } from "@/components/post-card";
import { ProjectCard } from "@/components/project-card";
import { SectionHeading } from "@/components/section-heading";
import { getPublishedPortfolioItems, getPublishedPosts, getSiteProfile } from "@/lib/content/repository";

export default async function HomePage() {
  const [profile, portfolioItems, posts] = await Promise.all([
    getSiteProfile(),
    getPublishedPortfolioItems(),
    getPublishedPosts(),
  ]);
  const featuredItems = portfolioItems.filter((item) => item.featured);

  return (
    <>
      <section className="overflow-hidden bg-[var(--dark)] text-white">
        <div className="container grid gap-12 py-20 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-28">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.1em] text-[#9fc4f5]">{profile.roleTitle}</p>
            <h1 className="display mt-5 max-w-3xl text-5xl leading-[1.03] sm:text-6xl lg:text-7xl">{profile.headline}</h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#b8c9df] sm:text-lg">{profile.bio}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link className="on-light-cta focus-ring inline-flex min-h-14 items-center gap-2 rounded-full bg-white px-8 text-base font-semibold hover:bg-[#e8f2ff]" href="/portfolio">포트폴리오 보기 <ArrowRight size={18} /></Link>
              <Link className="focus-ring inline-flex min-h-14 items-center gap-2 rounded-full border border-white/60 px-8 text-base font-semibold text-white hover:bg-white/10" href="/contact">연락하기 <ArrowUpRight size={18} /></Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-2">
              {profile.skills.map((skill) => <span className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-[#c9d7e8]" key={skill}>{skill}</span>)}
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-lg pb-10 lg:pb-0">
            <div className="rounded-3xl border border-white/10 bg-[var(--dark-elevated)] p-6 shadow-2xl shadow-black/20 sm:p-8">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <span className="text-sm font-semibold">Selected work</span>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-[#bed3ee]">2024 — 2026</span>
              </div>
              <div className="mt-6 grid gap-3">
                {featuredItems.slice(0, 3).map((item, index) => (
                  <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4" key={item.id}>
                    <span className="flex size-9 items-center justify-center rounded-full bg-[#27578f] font-mono text-xs text-white">0{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 text-xs text-[#a9c0dc]">{item.type}</p>
                    </div>
                    <ArrowUpRight size={17} className="text-[#9fc4f5]" />
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -bottom-1 -left-5 hidden w-52 rounded-3xl border border-white/10 bg-[#12345d] p-5 shadow-xl shadow-black/20 sm:block">
              <p className="text-xs text-[#b7cce8]">Approach</p>
              <p className="mt-2 text-lg font-medium tracking-[-.03em]">Clear, useful, lasting.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section bg-white">
        <div className="container grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
          <SectionHeading eyebrow="How I work" title="문제를 제품의 언어로 정리하고, 끝까지 구현합니다." description="기획과 구현을 분리하지 않고, 사용자가 실제로 마주하는 흐름을 기준으로 더 나은 결정을 만듭니다." />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["01", "맥락을 읽습니다", "사용자와 비즈니스의 제약을 먼저 이해합니다."],
              ["02", "구조를 만듭니다", "정보와 인터랙션을 가장 단순한 흐름으로 정리합니다."],
              ["03", "품질을 확인합니다", "성능과 접근성까지 고려해 운영 가능한 결과를 만듭니다."],
            ].map(([number, title, copy]) => (
              <article className="rounded-3xl border border-[var(--border)] p-6" key={number}>
                <span className="font-mono text-xs text-[var(--primary)]">{number}</span>
                <h3 className="mt-6 text-lg font-semibold tracking-[-.02em]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--body)]">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading eyebrow="Selected portfolio" title="최근 작업과 탐색의 기록" description="결과뿐 아니라 문제를 이해하고 풀어낸 과정을 함께 기록합니다." />
            <Link href="/portfolio" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">전체 포트폴리오 <ArrowRight size={16} /></Link>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {featuredItems.map((item) => <ProjectCard item={item} key={item.id} priority />)}
          </div>
        </div>
      </section>

      <section className="section bg-white">
        <div className="container">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading eyebrow="Latest writing" title="만들며 배우는 것들" description="제품과 기술, 일하는 방식에 관한 생각을 정리합니다." />
            <Link href="/blog" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">모든 글 보기 <ArrowRight size={16} /></Link>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {posts.slice(0, 3).map((post) => <PostCard post={post} key={post.id} />)}
          </div>
        </div>
      </section>

      <section className="section bg-[var(--dark)] text-white">
        <div className="container text-center">
          <p className="eyebrow text-[#9fc4f5]">Let&apos;s work together</p>
          <h2 className="display mx-auto mt-4 max-w-3xl text-4xl leading-[1.08] sm:text-5xl">좋은 문제를 함께 풀어볼까요?</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#b8c9df]">새로운 제품, 기존 경험의 개선, 또는 협업 제안이 있다면 편하게 연락해 주세요.</p>
          <Link href="/contact" className="on-light-cta focus-ring mt-8 inline-flex min-h-14 items-center gap-2 rounded-full bg-white px-8 text-base font-semibold hover:bg-[#e8f2ff]">이야기 시작하기 <Mail size={18} /></Link>
          <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-[#c7d8ed]">
            {profile.skills.slice(0, 3).map((skill) => <span className="inline-flex items-center gap-2" key={skill}><CheckCircle2 size={15} className="text-[#75b6ff]" /> {skill}</span>)}
          </div>
        </div>
      </section>
    </>
  );
}
