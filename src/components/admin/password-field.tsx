"use client";

import { useState, type ComponentPropsWithoutRef } from "react";
import { Eye, EyeOff } from "lucide-react";
import { inputFieldClass } from "@/components/ui/field-classes";
import { cn } from "@/lib/utils";

type PasswordFieldProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
};

/**
 * 비밀번호 입력 + 표시 토글.
 * - 토글은 `<button type="button" aria-pressed>`이고 이름("비밀번호 표시")은 고정한다. 켜짐·꺼짐은 aria-pressed가 전한다.
 * - 붙여넣기를 막지 않는다. 보이는 상태에서도 맞춤법 검사·자동 수정이 비밀번호를 외부로 보내거나 바꾸지 않게 끈다.
 */
export function PasswordField({ id, className, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return <div className="relative">
    <input
      {...inputProps}
      id={id}
      type={visible ? "text" : "password"}
      spellCheck={false}
      autoCapitalize="none"
      autoCorrect="off"
      className={cn(inputFieldClass, "w-full pr-14", className)}
    />
    <button
      type="button"
      aria-pressed={visible}
      aria-controls={id}
      aria-label="비밀번호 표시"
      onClick={() => setVisible((current) => !current)}
      className="focus-ring absolute top-1/2 right-1 inline-grid size-10 -translate-y-1/2 place-items-center rounded-lg text-[var(--body)] hover:bg-[#f2f5f9] hover:text-[var(--ink)]"
    >
      {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
    </button>
  </div>;
}
