"use client";

import { useEffect, useState } from "react";
import { Eye, FileCode2 } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { contentToMarkdown } from "@/lib/content/markdown";
import { cn } from "@/lib/utils";

export function MarkdownEditor({ name, initialValue, label = "본문" }: { name: string; initialValue?: unknown; label?: string }) {
  const [markdown, setMarkdown] = useState(() => contentToMarkdown(initialValue));
  const [mode, setMode] = useState<"write" | "preview">("write");

  useEffect(() => setMarkdown(contentToMarkdown(initialValue)), [initialValue]);

  return <div>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={name} className="text-sm font-semibold text-[var(--ink)]">{label} <span className="font-normal text-[var(--muted)]">(Markdown)</span></label>
      <div className="inline-flex rounded-lg border border-[var(--border)] bg-white p-1 text-xs font-semibold">
        <button type="button" onClick={() => setMode("write")} className={cn("focus-ring inline-flex min-h-8 items-center gap-1 rounded-md px-2.5", mode === "write" && "bg-[var(--primary-soft)] text-[var(--primary)]")}><FileCode2 size={14} /> 작성</button>
        <button type="button" onClick={() => setMode("preview")} className={cn("focus-ring inline-flex min-h-8 items-center gap-1 rounded-md px-2.5", mode === "preview" && "bg-[var(--primary-soft)] text-[var(--primary)]")}><Eye size={14} /> 미리보기</button>
      </div>
    </div>
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white focus-within:border-2 focus-within:border-[var(--primary-action)]">
      {mode === "write" ? <textarea id={name} name={name} required value={markdown} onChange={(event) => setMarkdown(event.target.value)} rows={18} spellCheck className="block min-h-80 w-full resize-y bg-transparent px-4 py-4 font-mono text-sm leading-7 text-[var(--ink)] outline-none" placeholder={"## 프로젝트 개요\n\n**핵심 성과**를 작성하세요.\n\n- 항목 1\n- 항목 2\n\n```ts\nconst result = '완료';\n```"} /> : <><input type="hidden" name={name} value={markdown} /><div className="min-h-80 px-5 py-4 text-base leading-8 text-[var(--body)]"><MarkdownContent markdown={markdown} /></div></>}
    </div>
    <p className="mt-2 text-xs text-[var(--muted)]">제목(`#`), 굵게(`**텍스트**`), 목록, 인용문(`&gt;`), 코드 블록, 링크, 이미지, 표와 체크 목록을 지원합니다.</p>
  </div>;
}
