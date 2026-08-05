import { cn } from "@/lib/utils";

export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary)]", className)}>
      {children}
    </span>
  );
}
