import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { SiteProfile } from "@/lib/content/types";

export function SiteFooter({ profile }: { profile: SiteProfile }) {
  return (
    <footer className="theme-footer border-t border-[var(--border)]">
      <div className="container grid gap-10 py-14 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <p className="inline-flex items-center gap-3 text-lg font-bold tracking-[-.04em] text-[var(--ink)]"><span className="signal-dot size-2 rounded-full bg-[var(--primary)]" aria-hidden="true" />{profile.displayName}</p>
          <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--body)]">{profile.headline}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.08em] text-[var(--muted)]">Navigate</p>
          <div className="mt-4 grid gap-3 text-sm text-[var(--body)]">
            <Link href="/portfolio" className="focus-ring hover:text-[var(--primary)]">포트폴리오</Link>
            <Link href="/blog" className="focus-ring hover:text-[var(--primary)]">블로그</Link>
            <Link href="/about" className="focus-ring hover:text-[var(--primary)]">소개</Link>
          </div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[.08em] text-[var(--muted)]">Contact</p>
          <a className="focus-ring mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]" href={`mailto:${profile.email}`}>{profile.email} <ArrowUpRight size={15} /></a>
          <div className="mt-4 flex gap-4 text-sm text-[var(--body)]">
            {profile.socialLinks.map((link) => <a className="focus-ring hover:text-[var(--primary)]" href={link.href} key={link.label} target="_blank" rel="noreferrer">{link.label}</a>)}
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        <div className="container flex flex-wrap items-center justify-between gap-4 py-5 text-xs text-[var(--muted)]">
          <span>© {new Date().getFullYear()} {profile.displayName}. All rights reserved.</span>
          <Link className="focus-ring hover:text-[var(--primary)]" href="/admin/login">관리자 로그인</Link>
        </div>
      </div>
    </footer>
  );
}
