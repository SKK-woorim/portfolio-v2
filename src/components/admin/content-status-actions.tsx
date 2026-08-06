"use client";

import { useState, useTransition } from "react";
import { moveToTrash, publishContent, restoreContent, unpublishContent } from "@/app/admin/actions";

type ContentTable = "portfolio_items" | "posts";
type Result = { error?: string; success?: string };

export function ContentStatusActions({ table, id, status }: { table: ContentTable; id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<Result>({});
  const run = (task: () => Promise<Result>) => startTransition(async () => setMessage(await task()));
  const isTrashed = status === "trashed";

  return <div className="flex flex-col items-end gap-2"><div className="inline-flex flex-wrap justify-end gap-3">{isTrashed ? <button type="button" className="focus-ring font-semibold text-[var(--primary)] disabled:opacity-50" disabled={pending} onClick={() => run(() => restoreContent(table, id))}>{pending ? "복구 중…" : "복구"}</button> : <>{status === "published" ? <button type="button" className="focus-ring font-semibold text-[var(--body)] disabled:opacity-50" disabled={pending} onClick={() => run(() => unpublishContent(table, id))}>{pending ? "처리 중…" : "발행 중단"}</button> : <button type="button" className="focus-ring font-semibold text-[var(--primary)] disabled:opacity-50" disabled={pending} onClick={() => run(() => publishContent(table, id))}>{pending ? "발행 중…" : "발행"}</button>}<button type="button" className="focus-ring font-semibold text-[#b33d4a] disabled:opacity-50" disabled={pending} onClick={() => { if (window.confirm("이 콘텐츠를 휴지통으로 옮길까요? 언제든 복구할 수 있습니다.")) run(() => moveToTrash(table, id)); }}>{pending ? "처리 중…" : "휴지통"}</button></>}</div>{message.error ? <span role="alert" className="max-w-55 text-right text-xs text-[#b33d4a]">{message.error}</span> : null}{message.success ? <span className="max-w-55 text-right text-xs text-[#146b58]">{message.success}</span> : null}</div>;
}
