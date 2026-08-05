"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/about", label: "소개" },
  { href: "/portfolio", label: "포트폴리오" },
  { href: "/blog", label: "블로그" },
  { href: "/contact", label: "연락처" },
];

export function SiteHeader({ name }: { name: string }) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)]/80 bg-white/90 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="focus-ring text-base font-bold tracking-[-.04em] text-[var(--primary)]">{name}</Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="주요 메뉴">
          {navigation.map((item) => <Link className="focus-ring text-sm font-medium text-[var(--body)] hover:text-[var(--ink)]" href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
        <Link href="/contact" className="focus-ring hidden min-h-10 items-center rounded-full bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-action)] md:inline-flex">협업 문의</Link>
        <button type="button" className="focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[#edf3fb] text-[var(--ink)] md:hidden" onClick={() => setOpen((value) => !value)} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open}>
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      <div className={cn("overflow-hidden border-t border-[var(--border)] bg-white transition-[max-height] duration-200 md:hidden", open ? "max-h-80" : "max-h-0 border-t-0")}>
        <nav className="container flex flex-col py-3" aria-label="모바일 주요 메뉴">
          {navigation.map((item) => <Link onClick={() => setOpen(false)} className="focus-ring rounded-xl px-3 py-3 text-sm font-medium text-[var(--body)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]" href={item.href} key={item.href}>{item.label}</Link>)}
        </nav>
      </div>
    </header>
  );
}
