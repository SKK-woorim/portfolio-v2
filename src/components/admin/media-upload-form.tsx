"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { uploadMedia } from "@/app/admin/actions";
import { fileFieldClass, inputFieldMediumClass } from "@/components/ui/field-classes";
import type { MediaUploadState } from "@/lib/validation/content";
import { FormStatus } from "./form-status";

const initialState: MediaUploadState = {};
export function MediaUploadForm() {
  const [state, formAction, pending] = useActionState(uploadMedia, initialState);
  return <form action={formAction} className="grid gap-4 rounded-3xl border border-[var(--border)] bg-[#f8fbff] p-6"><label className="grid gap-2 text-sm font-semibold">이미지 파일<input name="file" required type="file" accept="image/jpeg,image/png,image/webp,image/avif" className={fileFieldClass} /></label><label className="grid gap-2 text-sm font-semibold">대체 텍스트<input name="alt" maxLength={200} placeholder="이미지를 설명하는 문장" className={inputFieldMediumClass} /></label><label className="inline-flex items-center gap-2 text-sm"><input name="decorative" type="checkbox" value="true" /> 장식용 이미지입니다 (빈 대체 텍스트 허용)</label><p className="text-xs leading-5 text-[var(--muted)]">JPG, PNG, WebP, AVIF · 최대 5MB · 실제 형식을 검사한 뒤 WebP로 최적화합니다.</p><FormStatus result={state} error={state.error} success={state.success} /><div><Button type="submit" disabled={pending}>{pending ? "검사·최적화 중…" : "업로드"}</Button></div></form>;
}
