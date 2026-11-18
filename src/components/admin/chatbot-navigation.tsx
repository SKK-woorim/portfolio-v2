import Link from "next/link";
import { cn } from "@/lib/utils";

const links = [
  { href: "/admin/chatbot", label: "인덱스" },
  { href: "/admin/chatbot/call-logs", label: "호출 기록" },
] as const;

export function ChatbotNavigation({ current }: { current: "인덱스" | "호출 기록" }) {
  return (
    <nav aria-label="챗봇 메뉴" className="mb-8 flex gap-2 border-b border-[var(--border)]">
      {links.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={label === current ? "page" : undefined}
          className={cn(
            "focus-ring rounded-t-xl border-b-2 px-4 py-3 text-sm font-medium text-[var(--body)] hover:bg-[var(--primary-soft)]",
            label === current ? "border-[var(--primary)] font-bold text-[var(--primary)]" : "border-transparent",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
