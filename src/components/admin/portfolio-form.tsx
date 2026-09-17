"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MarkdownEditor, type EditorMedia, type LocalDraftFields } from "@/components/markdown-editor";
import { MediaCoverSelect } from "@/components/admin/media-cover-select";
import { Button } from "@/components/ui/button";
import { savePortfolio, uploadMedia } from "@/app/admin/actions";
import type { ContentSaveState } from "@/lib/validation/content";

type PortfolioFormItem = {
  id?: string; title?: string; slug?: string; type?: string; summary?: string; content_json?: unknown;
  start_date?: string | null; end_date?: string | null; status?: string; sort_order?: number; is_featured?: boolean; updated_at?: string;
  portfolio_tags?: { tags?: { name?: string } }[];
  portfolio_item_media?: { media_id?: string; role?: string }[];
};

const initialState: ContentSaveState = {};

type PortfolioFormValues = {
  title: string;
  slug: string;
  type: string;
  sortOrder: string;
  startDate: string;
  endDate: string;
  summary: string;
  tagNames: string;
  status: "draft" | "published" | "hidden";
  isFeatured: boolean;
  coverMediaId: string;
};

function initialValues(item?: PortfolioFormItem): PortfolioFormValues {
  return {
    title: item?.title ?? "",
    slug: item?.slug ?? "",
    type: item?.type ?? "",
    sortOrder: String(item?.sort_order ?? 0),
    startDate: item?.start_date ?? "",
    endDate: item?.end_date ?? "",
    summary: item?.summary ?? "",
    tagNames: item?.portfolio_tags?.flatMap((relation) => relation.tags?.name ? [relation.tags.name] : []).join(", ") ?? "",
    status: item?.status === "published" || item?.status === "hidden" ? item.status : "draft",
    isFeatured: item?.is_featured ?? false,
    coverMediaId: item?.portfolio_item_media?.find((relation) => relation.role === "cover")?.media_id ?? "",
  };
}

function restorePortfolioValues(fields: LocalDraftFields, current: PortfolioFormValues): PortfolioFormValues {
  const status = fields.status;
  return {
    ...current,
    title: typeof fields.title === "string" ? fields.title : current.title,
    slug: typeof fields.slug === "string" ? fields.slug : current.slug,
    type: typeof fields.type === "string" ? fields.type : current.type,
    sortOrder: typeof fields.sortOrder === "string" ? fields.sortOrder : current.sortOrder,
    startDate: typeof fields.startDate === "string" ? fields.startDate : current.startDate,
    endDate: typeof fields.endDate === "string" ? fields.endDate : current.endDate,
    summary: typeof fields.summary === "string" ? fields.summary : current.summary,
    tagNames: typeof fields.tagNames === "string" ? fields.tagNames : current.tagNames,
    status: status === "draft" || status === "published" || status === "hidden" ? status : current.status,
    isFeatured: typeof fields.isFeatured === "boolean" ? fields.isFeatured : current.isFeatured,
    coverMediaId: typeof fields.coverMediaId === "string" ? fields.coverMediaId : current.coverMediaId,
  };
}

export function PortfolioForm({ item, media }: { item?: PortfolioFormItem; media: EditorMedia[] }) {
  const [state, formAction, pending] = useActionState(savePortfolio, initialState);
  const [values, setValues] = useState(() => initialValues(item));
  const lastIntentRef = useRef<"save" | "publish">("save");
  const handledStateRef = useRef<ContentSaveState | undefined>(undefined);
  const inputClass = "min-h-12 rounded-xl border border-[var(--border)] px-4 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]";
  useEffect(() => {
    if ((!state.success && !state.error) || handledStateRef.current === state) return;
    handledStateRef.current = state;
    if (lastIntentRef.current === "publish") setValues((current) => ({ ...current, status: "published" }));
    if (state.error) {
      const timeout = window.setTimeout(() => setValues((current) => ({ ...current })), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [state]);

  function updateValue<Key extends keyof PortfolioFormValues>(key: Key, value: PortfolioFormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return <form action={formAction} onSubmit={(event) => { const submitter = (event.nativeEvent as SubmitEvent).submitter; lastIntentRef.current = submitter instanceof HTMLButtonElement && submitter.value === "publish" ? "publish" : "save"; }} className="grid gap-6">
    <input type="hidden" name="id" value={state.contentId ?? item?.id ?? ""} />
    <input type="hidden" name="expectedUpdatedAt" value={state.updatedAt ?? item?.updated_at ?? ""} />
    <div className="grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">제목<input name="title" required value={values.title} onChange={(event) => updateValue("title", event.target.value)} className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">Slug<input name="slug" required value={values.slug} onChange={(event) => updateValue("slug", event.target.value)} placeholder="portfolio-v2" className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">유형<input name="type" required value={values.type} onChange={(event) => updateValue("type", event.target.value)} placeholder="프로젝트" className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">노출 순서<input name="sortOrder" required type="number" min="0" value={values.sortOrder} onChange={(event) => updateValue("sortOrder", event.target.value)} className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">시작일<input name="startDate" type="date" value={values.startDate} onChange={(event) => updateValue("startDate", event.target.value)} className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">종료일<input name="endDate" type="date" value={values.endDate} onChange={(event) => updateValue("endDate", event.target.value)} className={inputClass} /></label>
      <div className="md:col-span-2"><MediaCoverSelect media={media} value={values.coverMediaId} onChange={(value) => updateValue("coverMediaId", value)} helpText="미디어 라이브러리에 업로드한 이미지를 카드와 상세 페이지에 사용합니다." /></div>
    </div>
    <label className="grid gap-2 text-sm font-semibold">한 줄 요약<textarea name="summary" required value={values.summary} onChange={(event) => updateValue("summary", event.target.value)} rows={3} className="rounded-xl border border-[var(--border)] px-4 py-3 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" /></label>
    <label className="grid gap-2 text-sm font-semibold">태그<input name="tagNames" value={values.tagNames} onChange={(event) => updateValue("tagNames", event.target.value)} placeholder="Next.js, TypeScript" className={inputClass} /><span className="text-xs font-normal text-[var(--muted)]">쉼표로 구분해 입력합니다.</span></label>
    <MarkdownEditor name="contentMarkdown" initialValue={item?.content_json} media={media} uploadAction={uploadMedia} draftKey={`portfolio:${state.contentId ?? item?.id ?? "new"}`} baseUpdatedAt={state.updatedAt ?? item?.updated_at} saveState={state} disabled={pending} draftFields={values} onDraftRestore={(fields) => setValues((current) => restorePortfolioValues(fields, current))} />
    <div className="flex flex-wrap items-center gap-5">
      <label className="inline-flex items-center gap-2 text-sm font-semibold"><input name="isFeatured" type="checkbox" value="true" checked={values.isFeatured} onChange={(event) => updateValue("isFeatured", event.target.checked)} /> 홈 대표 이력</label>
      <label className="inline-flex items-center gap-2 text-sm font-semibold">저장 상태<select name="status" value={values.status} onChange={(event) => updateValue("status", event.target.value as PortfolioFormValues["status"])} className="min-h-10 rounded-xl border border-[var(--border)] bg-white px-3 font-normal"><option value="draft">초안</option><option value="published">발행</option><option value="hidden">숨김</option></select></label>
    </div>
    {state.error ? <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">{state.error}</p> : null}
    {state.success ? <p className="rounded-xl bg-[#eaf8f4] px-4 py-3 text-sm text-[#146b58]">{state.success}</p> : null}
    <div className="flex flex-wrap gap-3"><Button type="submit" name="intent" value="save" size="large" disabled={pending}>{pending ? "저장 중…" : "변경 사항 저장"}</Button><Button type="submit" name="intent" value="publish" variant="secondary" size="large" disabled={pending}>{pending ? "저장 중…" : "즉시 발행"}</Button></div>
  </form>;
}
