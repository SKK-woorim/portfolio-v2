"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MarkdownEditor, type EditorMedia, type LocalDraftFields } from "@/components/markdown-editor";
import { MediaCoverSelect } from "@/components/admin/media-cover-select";
import { Button } from "@/components/ui/button";
import { savePost, uploadMedia } from "@/app/admin/actions";
import type { ContentSaveState } from "@/lib/validation/content";

type PostFormItem = {
  id?: string; title?: string; slug?: string; excerpt?: string; content_json?: unknown; category_id?: string | null;
  status?: string; seo_title?: string | null; seo_description?: string | null; cover_media_id?: string | null; updated_at?: string; post_tags?: { tags?: { name?: string } }[];
};
type Category = { id: string; name: string };
const initialState: ContentSaveState = {};

type PostFormValues = {
  title: string;
  slug: string;
  categoryId: string;
  status: "draft" | "published" | "private";
  excerpt: string;
  tagNames: string;
  seoTitle: string;
  seoDescription: string;
  coverMediaId: string;
};

function initialValues(post?: PostFormItem): PostFormValues {
  return {
    title: post?.title ?? "",
    slug: post?.slug ?? "",
    categoryId: post?.category_id ?? "",
    status: post?.status === "published" || post?.status === "private" ? post.status : "draft",
    excerpt: post?.excerpt ?? "",
    tagNames: post?.post_tags?.flatMap((relation) => relation.tags?.name ? [relation.tags.name] : []).join(", ") ?? "",
    seoTitle: post?.seo_title ?? "",
    seoDescription: post?.seo_description ?? "",
    coverMediaId: post?.cover_media_id ?? "",
  };
}

function restorePostValues(fields: LocalDraftFields, current: PostFormValues): PostFormValues {
  const status = fields.status;
  return {
    ...current,
    title: typeof fields.title === "string" ? fields.title : current.title,
    slug: typeof fields.slug === "string" ? fields.slug : current.slug,
    categoryId: typeof fields.categoryId === "string" ? fields.categoryId : current.categoryId,
    status: status === "draft" || status === "published" || status === "private" ? status : current.status,
    excerpt: typeof fields.excerpt === "string" ? fields.excerpt : current.excerpt,
    tagNames: typeof fields.tagNames === "string" ? fields.tagNames : current.tagNames,
    seoTitle: typeof fields.seoTitle === "string" ? fields.seoTitle : current.seoTitle,
    seoDescription: typeof fields.seoDescription === "string" ? fields.seoDescription : current.seoDescription,
    coverMediaId: typeof fields.coverMediaId === "string" ? fields.coverMediaId : current.coverMediaId,
  };
}

export function PostForm({ post, categories, media }: { post?: PostFormItem; categories: Category[]; media: EditorMedia[] }) {
  const [state, formAction, pending] = useActionState(savePost, initialState);
  const [values, setValues] = useState(() => initialValues(post));
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

  function updateValue<Key extends keyof PostFormValues>(key: Key, value: PostFormValues[Key]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return <form action={formAction} onSubmit={(event) => { const submitter = (event.nativeEvent as SubmitEvent).submitter; lastIntentRef.current = submitter instanceof HTMLButtonElement && submitter.value === "publish" ? "publish" : "save"; }} className="grid gap-6">
    <input type="hidden" name="id" value={state.contentId ?? post?.id ?? ""} />
    <input type="hidden" name="expectedUpdatedAt" value={state.updatedAt ?? post?.updated_at ?? ""} />
    <div className="grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">제목<input name="title" required value={values.title} onChange={(event) => updateValue("title", event.target.value)} className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">Slug<input name="slug" required value={values.slug} onChange={(event) => updateValue("slug", event.target.value)} placeholder="my-post" className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">카테고리<select name="categoryId" value={values.categoryId} onChange={(event) => updateValue("categoryId", event.target.value)} className={`${inputClass} bg-white`}><option value="">미분류</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-semibold">저장 상태<select name="status" value={values.status} onChange={(event) => updateValue("status", event.target.value as PostFormValues["status"])} className={`${inputClass} bg-white`}><option value="draft">초안</option><option value="published">발행</option><option value="private">비공개</option></select></label>
      <div className="md:col-span-2"><MediaCoverSelect media={media} value={values.coverMediaId} onChange={(value) => updateValue("coverMediaId", value)} helpText="블로그 카드, 본문 상단, 공유 미리보기에 사용합니다." /></div>
    </div>
    <label className="grid gap-2 text-sm font-semibold">요약<textarea name="excerpt" required value={values.excerpt} onChange={(event) => updateValue("excerpt", event.target.value)} rows={3} className="rounded-xl border border-[var(--border)] px-4 py-3 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" /></label>
    <label className="grid gap-2 text-sm font-semibold">태그<input name="tagNames" value={values.tagNames} onChange={(event) => updateValue("tagNames", event.target.value)} placeholder="Next.js, Architecture" className={inputClass} /><span className="text-xs font-normal text-[var(--muted)]">쉼표로 구분해 입력합니다.</span></label>
    <MarkdownEditor name="contentMarkdown" initialValue={post?.content_json} media={media} uploadAction={uploadMedia} draftKey={`post:${state.contentId ?? post?.id ?? "new"}`} baseUpdatedAt={state.updatedAt ?? post?.updated_at} saveState={state} disabled={pending} draftFields={values} onDraftRestore={(fields) => setValues((current) => restorePostValues(fields, current))} />
    <details className="rounded-2xl border border-[var(--border)] p-5"><summary className="cursor-pointer text-sm font-semibold">SEO 설정</summary><div className="mt-5 grid gap-5"><label className="grid gap-2 text-sm font-semibold">SEO 제목<input name="seoTitle" value={values.seoTitle} onChange={(event) => updateValue("seoTitle", event.target.value)} maxLength={70} className={inputClass} /></label><label className="grid gap-2 text-sm font-semibold">SEO 설명<textarea name="seoDescription" value={values.seoDescription} onChange={(event) => updateValue("seoDescription", event.target.value)} maxLength={160} rows={3} className="rounded-xl border border-[var(--border)] px-4 py-3 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" /></label></div></details>
    {state.error ? <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">{state.error}</p> : null}
    {state.success ? <p className="rounded-xl bg-[#eaf8f4] px-4 py-3 text-sm text-[#146b58]">{state.success}</p> : null}
    <div className="flex flex-wrap gap-3"><Button type="submit" name="intent" value="save" size="large" disabled={pending}>{pending ? "저장 중…" : "변경 사항 저장"}</Button><Button type="submit" name="intent" value="publish" variant="secondary" size="large" disabled={pending}>{pending ? "저장 중…" : "즉시 발행"}</Button></div>
  </form>;
}
