import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

// React 19는 ref를 일반 prop으로 넘기므로 ComponentPropsWithRef로 ref까지 받는다(확인 창의 초기 포커스 등).
type ButtonProps = ComponentPropsWithRef<"button"> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "dark" | "outline" | "danger";
  size?: "default" | "large";
};

const variants = {
  primary: "bg-[var(--primary)] text-white hover:bg-[var(--primary-action)]",
  secondary: "bg-[#eaf0f8] text-[var(--ink)] hover:bg-[#dfe9f5]",
  dark: "bg-[var(--dark-elevated)] text-white hover:bg-[#1c385d]",
  outline: "border border-white/70 text-white hover:bg-white/10",
  danger: "bg-[#b33d4a] text-white hover:bg-[#9a2f3b]",
};

const sizes = {
  default: "min-h-11 px-5 text-sm",
  large: "min-h-14 px-8 text-base",
};

export function Button({ className, variant = "primary", size = "default", children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
