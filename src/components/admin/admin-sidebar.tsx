"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, FileText, FolderKanban, Image, LayoutDashboard, LogOut, Settings, UserRound } from "lucide-react";
import { logout } from "@/app/admin/login/actions";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/portfolio", label: "포트폴리오", icon: FolderKanban },
  { href: "/admin/posts", label: "게시글", icon: FileText },
  { href: "/admin/profile", label: "사이트 프로필", icon: UserRound },
  { href: "/admin/media", label: "미디어", icon: Image },
  { href: "/admin/chatbot", label: "챗봇 인덱스", icon: Bot },
  { href: "/admin/settings", label: "설정", icon: Settings },
];

export function AdminSidebar({ email }: { email: string }) {
  const pathname = usePathname();
  return <aside className="border-b border-[var(--border)] bg-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r"><div className="flex h-16 items-center px-6 text-base font-bold tracking-[-.03em] text-[var(--primary)]">Portfolio CMS</div><nav className="flex overflow-x-auto px-3 pb-3 lg:flex-col lg:gap-1" aria-label="관리자 메뉴">{links.map(({ href, label, icon: Icon }) => { const active = href === "/admin" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={cn("focus-ring flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium", active ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--body)] hover:bg-[#f3f7fc]")}><Icon size={17} />{label}</Link>; })}</nav><div className="hidden px-6 py-6 lg:block"><p className="truncate text-xs text-[var(--muted)]">{email}</p><form action={logout}><button className="focus-ring mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--body)] hover:text-[var(--primary)]"><LogOut size={16} /> 로그아웃</button></form></div></aside>;
}
