"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { uploadMedia } from "@/app/admin/actions";
import type { MediaUploadState } from "@/lib/validation/content";

const initialState: MediaUploadState = {};
export function MediaUploadForm() {
  const [state, formAction, pending] = useActionState(uploadMedia, initialState);
  return <form action={formAction} className="grid gap-4 rounded-3xl border border-[var(--border)] bg-[#f8fbff] p-6"><label className="grid gap-2 text-sm font-semibold">이미지 파일<input name="file" required type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal" /></label><label className="grid gap-2 text-sm font-semibold">대체 텍스트<input name="alt" maxLength={200} placeholder="이미지를 설명하는 문장" className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" /></label><label className="inline-flex items-center gap-2 text-sm"><input name="decorative" type="checkbox" value="true" /> 장식용 이미지입니다 (빈 대체 텍스트 허용)</label><p className="text-xs leading-5 text-[var(--muted)]">JPG, PNG, WebP, AVIF · 최대 5MB · 실제 형식을 검사한 뒤 WebP로 최적화합니다.</p>{state.error ? <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">{state.error}</p> : null}{state.success ? <p className="rounded-xl bg-[#eaf8f4] px-4 py-3 text-sm text-[#146b58]">{state.success}</p> : null}<div><Button type="submit" disabled={pending}>{pending ? "검사·최적화 중…" : "업로드"}</Button></div></form>;
}
