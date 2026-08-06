"use client";

import { useActionState } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { savePortfolio } from "@/app/admin/actions";
import type { FormState } from "@/lib/validation/content";

type PortfolioFormItem = {
  id?: string; title?: string; slug?: string; type?: string; summary?: string; content_json?: unknown;
  start_date?: string | null; end_date?: string | null; status?: string; sort_order?: number; is_featured?: boolean;
  portfolio_tags?: { tags?: { name?: string } }[];
};

const initialState: FormState = {};

export function PortfolioForm({ item }: { item?: PortfolioFormItem }) {
  const [state, formAction, pending] = useActionState(savePortfolio, initialState);
  const inputClass = "min-h-12 rounded-xl border border-[var(--border)] px-4 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]";
  return <form action={formAction} className="grid gap-6">
    <input type="hidden" name="id" value={item?.id ?? ""} />
    <div className="grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">제목<input name="title" required defaultValue={item?.title} className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">Slug<input name="slug" required defaultValue={item?.slug} placeholder="portfolio-v2" className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">유형<input name="type" required defaultValue={item?.type} placeholder="프로젝트" className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">노출 순서<input name="sortOrder" required type="number" min="0" defaultValue={item?.sort_order ?? 0} className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">시작일<input name="startDate" type="date" defaultValue={item?.start_date ?? ""} className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">종료일<input name="endDate" type="date" defaultValue={item?.end_date ?? ""} className={inputClass} /></label>
    </div>
    <label className="grid gap-2 text-sm font-semibold">한 줄 요약<textarea name="summary" required defaultValue={item?.summary} rows={3} className="rounded-xl border border-[var(--border)] px-4 py-3 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" /></label>
    <label className="grid gap-2 text-sm font-semibold">태그<input name="tagNames" defaultValue={item?.portfolio_tags?.flatMap((relation) => relation.tags?.name ? [relation.tags.name] : []).join(", ")} placeholder="Next.js, TypeScript" className={inputClass} /><span className="text-xs font-normal text-[var(--muted)]">쉼표로 구분해 입력합니다.</span></label>
    <MarkdownEditor name="contentMarkdown" initialValue={item?.content_json} />
    <div className="flex flex-wrap items-center gap-5">
      <label className="inline-flex items-center gap-2 text-sm font-semibold"><input name="isFeatured" type="checkbox" value="true" defaultChecked={item?.is_featured} /> 홈 대표 이력</label>
      <label className="inline-flex items-center gap-2 text-sm font-semibold">상태<select name="status" defaultValue={item?.status ?? "draft"} className="min-h-10 rounded-xl border border-[var(--border)] bg-white px-3 font-normal"><option value="draft">초안</option><option value="published">발행</option><option value="hidden">숨김</option><option value="trashed">휴지통</option></select></label>
    </div>
    {state.error ? <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">{state.error}</p> : null}
    {state.success ? <p className="rounded-xl bg-[#eaf8f4] px-4 py-3 text-sm text-[#146b58]">{state.success}</p> : null}
    <div><Button type="submit" size="large" disabled={pending}>{pending ? "저장 중…" : "저장하기"}</Button></div>
  </form>;
}
