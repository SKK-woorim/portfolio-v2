/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import type { EditorMedia } from "@/components/markdown-editor";

type MediaCoverSelectProps = {
  media: EditorMedia[];
  defaultValue?: string | null;
  helpText: string;
};

export function MediaCoverSelect({ media, defaultValue = "", helpText }: MediaCoverSelectProps) {
  const [selectedId, setSelectedId] = useState(defaultValue ?? "");
  const selectedMedia = media.find((item) => item.id === selectedId);

  return <div className="grid gap-3">
    <label className="grid gap-2 text-sm font-semibold">대표 이미지
      <select name="coverMediaId" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="min-h-12 rounded-xl border border-[var(--border)] bg-white px-4 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]">
        <option value="">대표 이미지 없음</option>
        {media.map((item) => <option key={item.id} value={item.id}>{item.alt || item.storage_key}</option>)}
      </select>
    </label>
    {selectedMedia ? <div className="grid grid-cols-[96px_1fr] gap-3 rounded-2xl border border-[var(--border)] bg-[#f8fbff] p-3"><img src={selectedMedia.public_url} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" /><div className="min-w-0 self-center"><p className="truncate text-sm font-semibold text-[var(--ink)]">{selectedMedia.alt || selectedMedia.storage_key}</p><p className="mt-1 truncate text-xs text-[var(--muted)]">{selectedMedia.storage_key}</p></div></div> : <p className="text-xs font-normal text-[var(--muted)]">대표 이미지가 선택되지 않았습니다.</p>}
    <span className="text-xs font-normal text-[var(--muted)]">{helpText}</span>
  </div>;
}
