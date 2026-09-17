"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/about", label: "소개" },
  { href: "/portfolio", label: "포트폴리오" },
  { href: "/blog", label: "블로그" },
  { href: "/contact", label: "연락처" },
];

export function SiteHeader({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstMobileLinkRef = useRef<HTMLAnchorElement>(null);

  function isCurrentPath(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function closeMenu() {
    setOpen(false);
    menuButtonRef.current?.focus();
  }

  useEffect(() => {
    if (open) {
      firstMobileLinkRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <header className="theme-header sticky top-0 z-40 border-b border-[var(--border)]/70 backdrop-blur-xl">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="focus-ring inline-flex items-center gap-3 text-base font-bold tracking-[-.04em] text-[var(--ink)]"><span className="signal-dot size-2 rounded-full bg-[var(--primary)]" aria-hidden="true" />{name}</Link>
        <nav className="hidden items-center gap-7 md:flex" aria-label="주요 메뉴">
          {navigation.map((item) => { const active = isCurrentPath(item.href); return <Link aria-current={active ? "page" : undefined} className={cn("focus-ring rounded-sm text-sm font-medium transition-colors hover:text-[var(--ink)]", active ? "font-bold text-[var(--primary)] underline decoration-2 underline-offset-8" : "text-[var(--body)]")} href={item.href} key={item.href}>{item.label}</Link>; })}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/contact" className="focus-ring hidden min-h-10 items-center rounded-full bg-[#2f83e7] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4c9cf4] md:inline-flex">협업 문의</Link>
          <button ref={menuButtonRef} type="button" className="theme-control focus-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border md:hidden" onClick={() => open ? closeMenu() : setOpen(true)} aria-label={open ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={open} aria-controls="mobile-menu">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      <div id="mobile-menu" aria-hidden={!open} className={cn("overflow-hidden border-t border-[var(--border)] bg-[var(--surface)] transition-[max-height] duration-200 md:hidden", open ? "max-h-80" : "max-h-0 border-t-0")}>
        <nav className="container flex flex-col py-3" aria-label="모바일 주요 메뉴">
          {navigation.map((item, index) => { const active = isCurrentPath(item.href); return <Link ref={index === 0 ? firstMobileLinkRef : undefined} aria-current={active ? "page" : undefined} tabIndex={open ? 0 : -1} onClick={closeMenu} className={cn("focus-ring rounded-xl px-3 py-3 text-sm font-medium hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]", active ? "bg-[var(--primary-soft)] font-bold text-[var(--primary)]" : "text-[var(--body)]")} href={item.href} key={item.href}>{item.label}</Link>; })}
        </nav>
      </div>
    </header>
  );
}
