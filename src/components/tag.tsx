import { cn } from "@/lib/utils";

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full border border-[var(--border)] bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--tag-text)]", className)}>
      {children}
    </span>
  );
}
