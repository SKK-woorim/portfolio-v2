"use client";

import { useActionState } from "react";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { savePost } from "@/app/admin/actions";
import type { FormState } from "@/lib/validation/content";

type PostFormItem = {
  id?: string; title?: string; slug?: string; excerpt?: string; content_json?: unknown; category_id?: string | null;
  status?: string; seo_title?: string | null; seo_description?: string | null; post_tags?: { tags?: { name?: string } }[];
};
type Category = { id: string; name: string };
const initialState: FormState = {};

export function PostForm({ post, categories }: { post?: PostFormItem; categories: Category[] }) {
  const [state, formAction, pending] = useActionState(savePost, initialState);
  const inputClass = "min-h-12 rounded-xl border border-[var(--border)] px-4 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]";
  return <form action={formAction} className="grid gap-6">
    <input type="hidden" name="id" value={post?.id ?? ""} />
    <div className="grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">제목<input name="title" required defaultValue={post?.title} className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">Slug<input name="slug" required defaultValue={post?.slug} placeholder="my-post" className={inputClass} /></label>
      <label className="grid gap-2 text-sm font-semibold">카테고리<select name="categoryId" defaultValue={post?.category_id ?? ""} className={`${inputClass} bg-white`}><option value="">미분류</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-semibold">저장 상태<select name="status" defaultValue={post?.status === "trashed" ? "draft" : post?.status ?? "draft"} className={`${inputClass} bg-white`}><option value="draft">초안</option><option value="published">발행</option><option value="private">비공개</option></select></label>
    </div>
    <label className="grid gap-2 text-sm font-semibold">요약<textarea name="excerpt" required defaultValue={post?.excerpt} rows={3} className="rounded-xl border border-[var(--border)] px-4 py-3 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" /></label>
    <label className="grid gap-2 text-sm font-semibold">태그<input name="tagNames" defaultValue={post?.post_tags?.flatMap((relation) => relation.tags?.name ? [relation.tags.name] : []).join(", ")} placeholder="Next.js, Architecture" className={inputClass} /><span className="text-xs font-normal text-[var(--muted)]">쉼표로 구분해 입력합니다.</span></label>
    <MarkdownEditor name="contentMarkdown" initialValue={post?.content_json} />
    <details className="rounded-2xl border border-[var(--border)] p-5"><summary className="cursor-pointer text-sm font-semibold">SEO 설정</summary><div className="mt-5 grid gap-5"><label className="grid gap-2 text-sm font-semibold">SEO 제목<input name="seoTitle" defaultValue={post?.seo_title ?? ""} maxLength={70} className={inputClass} /></label><label className="grid gap-2 text-sm font-semibold">SEO 설명<textarea name="seoDescription" defaultValue={post?.seo_description ?? ""} maxLength={160} rows={3} className="rounded-xl border border-[var(--border)] px-4 py-3 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)]" /></label></div></details>
    {state.error ? <p role="alert" className="rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">{state.error}</p> : null}
    {state.success ? <p className="rounded-xl bg-[#eaf8f4] px-4 py-3 text-sm text-[#146b58]">{state.success}</p> : null}
    <div className="flex flex-wrap gap-3"><Button type="submit" name="intent" value="save" size="large" disabled={pending}>{pending ? "저장 중…" : "변경 사항 저장"}</Button><Button type="submit" name="intent" value="publish" variant="secondary" size="large" disabled={pending}>{pending ? "저장 중…" : "즉시 발행"}</Button></div>
  </form>;
}
