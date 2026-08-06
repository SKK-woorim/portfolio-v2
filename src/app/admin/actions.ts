"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { portfolioInputSchema, postInputSchema, siteProfileInputSchema, type FormState } from "@/lib/validation/content";
import { markdownToPlainText, toMarkdownDocument } from "@/lib/content/markdown";

type ContentTable = "portfolio_items" | "posts";
type ContentRecord = {
  id: string;
  slug: string;
  status: string;
  status_before_trash?: string | null;
};

function asBoolean(value: FormDataEntryValue | null) {
  return value === "true" || value === "on";
}

async function logAction(action: string, targetType: string, targetId: string | null, metadata: Record<string, unknown> = {}) {
  const user = await requireAdmin();
  const supabase = await createClient();
  await supabase.from("audit_logs").insert({ actor_id: user.id, action, target_type: targetType, target_id: targetId, metadata });
}

function tagSlug(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "") || `tag-${crypto.randomUUID().slice(0, 8)}`;
}

async function syncTags(itemType: "portfolio" | "post", itemId: string, rawTags: string | undefined) {
  const supabase = await createClient();
  const names = [...new Set((rawTags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean))];
  const relationTable = itemType === "portfolio" ? "portfolio_tags" : "post_tags";
  const foreignKey = itemType === "portfolio" ? "portfolio_item_id" : "post_id";
  await supabase.from(relationTable).delete().eq(foreignKey, itemId);
  if (!names.length) return;
  const tagRows = await Promise.all(names.map(async (name) => {
    const { data, error } = await supabase.from("tags").upsert({ name, slug: tagSlug(name) }, { onConflict: "name" }).select("id").single();
    if (error) throw error;
    return data;
  }));
  const relations = tagRows.map((tag) => itemType === "portfolio" ? { portfolio_item_id: itemId, tag_id: tag.id } : { post_id: itemId, tag_id: tag.id });
  const { error } = await supabase.from(relationTable).insert(relations);
  if (error) throw error;
}

function revalidateContent(table: ContentTable, slug?: string) {
  revalidatePath("/");
  if (table === "portfolio_items") {
    revalidatePath("/portfolio");
    revalidatePath("/portfolio/[slug]", "page");
    revalidatePath("/admin/portfolio");
    if (slug) revalidatePath(`/portfolio/${slug}`);
    return;
  }
  revalidatePath("/blog");
  revalidatePath("/blog/[slug]", "page");
  revalidatePath("/admin/posts");
  if (slug) revalidatePath(`/blog/${slug}`);
}

async function getContentRecord(table: ContentTable, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table)
    .select("id, slug, status, status_before_trash")
    .eq("id", id)
    .maybeSingle();
  return { data: data as ContentRecord | null, error };
}

export async function publishContent(table: ContentTable, id: string): Promise<FormState> {
  await requireAdmin();
  const { data: content, error: lookupError } = await getContentRecord(table, id);
  if (lookupError || !content) return { error: "콘텐츠를 찾을 수 없습니다." };
  if (content.status === "trashed") return { error: "휴지통의 콘텐츠는 먼저 복구해 주세요." };

  const supabase = await createClient();
  const payload = table === "posts" ? { status: "published", published_at: new Date().toISOString() } : { status: "published" };
  const { error } = await supabase.from(table).update(payload).eq("id", id);
  if (error) return { error: "발행하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };

  await logAction("publish", table, id, { slug: content.slug });
  revalidateContent(table, content.slug);
  return { success: "발행했습니다." };
}

export async function unpublishContent(table: ContentTable, id: string): Promise<FormState> {
  await requireAdmin();
  const { data: content, error: lookupError } = await getContentRecord(table, id);
  if (lookupError || !content) return { error: "콘텐츠를 찾을 수 없습니다." };
  if (content.status === "trashed") return { error: "휴지통의 콘텐츠는 먼저 복구해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ status: "draft" }).eq("id", id);
  if (error) return { error: "발행을 중단하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };

  await logAction("unpublish", table, id, { slug: content.slug });
  revalidateContent(table, content.slug);
  return { success: "초안으로 전환했습니다." };
}

export async function savePortfolio(_previousState: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    id: formData.get("id") || undefined,
    title: formData.get("title"), slug: formData.get("slug"), type: formData.get("type"), summary: formData.get("summary"),
    contentMarkdown: formData.get("contentMarkdown"), startDate: formData.get("startDate"), endDate: formData.get("endDate"),
    status: formData.get("intent") === "publish" ? "published" : formData.get("status"), sortOrder: formData.get("sortOrder"), isFeatured: asBoolean(formData.get("isFeatured")), tagNames: formData.get("tagNames") || undefined,
  };
  const parsed = portfolioInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  if (parsed.data.status === "trashed") return { error: "휴지통은 목록에서만 관리할 수 있습니다." };
  const user = await requireAdmin();
  const supabase = await createClient();
  const input = parsed.data;
  const payload = {
    title: input.title, slug: input.slug, type: input.type, summary: input.summary, content_json: toMarkdownDocument(input.contentMarkdown),
    start_date: input.startDate, end_date: input.endDate, status: input.status, status_before_trash: null, sort_order: input.sortOrder, is_featured: input.isFeatured, created_by: user.id,
  };
  const result = input.id ? await supabase.from("portfolio_items").update(payload).eq("id", input.id).select("id").single() : await supabase.from("portfolio_items").insert(payload).select("id").single();
  if (result.error) return { error: result.error.code === "23505" ? "이미 사용 중인 slug입니다." : "저장하지 못했습니다." };
  try { await syncTags("portfolio", result.data.id, input.tagNames); } catch { return { error: "항목은 저장됐지만 태그를 저장하지 못했습니다." }; }
  await logAction(input.id ? "update" : "create", "portfolio_item", result.data.id, { title: input.title });
  revalidateContent("portfolio_items", input.slug);
  return { success: input.status === "published" ? "포트폴리오 항목을 발행했습니다." : "포트폴리오 항목을 저장했습니다." };
}

export async function savePost(_previousState: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    id: formData.get("id") || undefined, title: formData.get("title"), slug: formData.get("slug"), excerpt: formData.get("excerpt"),
    contentMarkdown: formData.get("contentMarkdown"), categoryId: formData.get("categoryId") || null, status: formData.get("intent") === "publish" ? "published" : formData.get("status"), seoTitle: formData.get("seoTitle") || undefined, seoDescription: formData.get("seoDescription") || undefined, tagNames: formData.get("tagNames") || undefined,
  };
  const parsed = postInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  if (parsed.data.status === "trashed") return { error: "휴지통은 목록에서만 관리할 수 있습니다." };
  const user = await requireAdmin();
  const supabase = await createClient();
  const input = parsed.data;
  const payload = {
    title: input.title, slug: input.slug, excerpt: input.excerpt, content_json: toMarkdownDocument(input.contentMarkdown), content_text: markdownToPlainText(input.contentMarkdown),
    category_id: input.categoryId ?? null, status: input.status, status_before_trash: null, seo_title: input.seoTitle || input.title, seo_description: input.seoDescription || input.excerpt,
    published_at: input.status === "published" ? new Date().toISOString() : null, created_by: user.id,
  };
  const result = input.id ? await supabase.from("posts").update(payload).eq("id", input.id).select("id").single() : await supabase.from("posts").insert(payload).select("id").single();
  if (result.error) return { error: result.error.code === "23505" ? "이미 사용 중인 slug입니다." : "저장하지 못했습니다." };
  try { await syncTags("post", result.data.id, input.tagNames); } catch { return { error: "글은 저장됐지만 태그를 저장하지 못했습니다." }; }
  await logAction(input.id ? "update" : "create", "post", result.data.id, { title: input.title });
  revalidateContent("posts", input.slug);
  return { success: input.status === "published" ? "게시글을 발행했습니다." : "게시글을 저장했습니다." };
}

export async function updateSiteProfile(_previousState: FormState, formData: FormData): Promise<FormState> {
  const parsed = siteProfileInputSchema.safeParse({ displayName: formData.get("displayName"), roleTitle: formData.get("roleTitle"), headline: formData.get("headline"), bio: formData.get("bio"), email: formData.get("email"), socialLinks: formData.get("socialLinks") || "[]" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  await requireAdmin();
  const supabase = await createClient();
  const input = parsed.data;
  const { error } = await supabase.from("site_profile").upsert({ id: true, display_name: input.displayName, role_title: input.roleTitle, headline: input.headline, bio: input.bio, contact: { email: input.email }, social_links: JSON.parse(input.socialLinks) });
  if (error) return { error: "프로필을 저장하지 못했습니다." };
  await logAction("update", "site_profile", null);
  revalidatePath("/"); revalidatePath("/about"); revalidatePath("/contact"); revalidatePath("/admin/profile");
  return { success: "사이트 프로필을 저장했습니다." };
}

export async function moveToTrash(table: ContentTable, id: string): Promise<FormState> {
  await requireAdmin();
  const { data: content, error: lookupError } = await getContentRecord(table, id);
  if (lookupError || !content) return { error: "콘텐츠를 찾을 수 없습니다." };
  if (content.status === "trashed") return { success: "이미 휴지통에 있습니다." };
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ status: "trashed", status_before_trash: content.status }).eq("id", id);
  if (error) return { error: "휴지통으로 옮기지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  await logAction("trash", table, id, { slug: content.slug, previousStatus: content.status });
  revalidateContent(table, content.slug);
  return { success: "휴지통으로 옮겼습니다. 언제든 복구할 수 있습니다." };
}

export async function restoreContent(table: ContentTable, id: string): Promise<FormState> {
  await requireAdmin();
  const { data: content, error: lookupError } = await getContentRecord(table, id);
  if (lookupError || !content) return { error: "콘텐츠를 찾을 수 없습니다." };
  if (content.status !== "trashed") return { error: "휴지통에 있는 콘텐츠만 복구할 수 있습니다." };

  const restoredStatus = content.status_before_trash && content.status_before_trash !== "trashed" ? content.status_before_trash : "draft";
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ status: restoredStatus, status_before_trash: null }).eq("id", id);
  if (error) return { error: "복구하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  await logAction("restore", table, id, { slug: content.slug, status: restoredStatus });
  revalidateContent(table, content.slug);
  return { success: restoredStatus === "published" ? "발행 상태로 복구했습니다." : "초안으로 복구했습니다." };
}

export async function reorderPortfolioItems(orderedIds: string[]) {
  await requireAdmin();
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) return { error: "순서 정보가 올바르지 않습니다." };
  const supabase = await createClient();
  const results = await Promise.all(orderedIds.map((id, index) => supabase.from("portfolio_items").update({ sort_order: index }).eq("id", id)));
  if (results.some((result) => result.error)) return { error: "순서를 저장하지 못했습니다." };
  await logAction("reorder", "portfolio_item", null, { orderedIds });
  revalidatePath("/"); revalidatePath("/portfolio"); revalidatePath("/admin/portfolio");
  return { success: "노출 순서를 저장했습니다." };
}

export async function uploadMedia(_previousState: FormState, formData: FormData): Promise<FormState> {
  const file = formData.get("file");
  const alt = String(formData.get("alt") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return { error: "업로드할 이미지를 선택해 주세요." };
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
  if (!allowedTypes.has(file.type)) return { error: "JPG, PNG, WebP, AVIF 이미지만 업로드할 수 있습니다." };
  if (file.size > 5 * 1024 * 1024) return { error: "이미지 크기는 5MB 이하여야 합니다." };

  const user = await requireAdmin();
  const supabase = await createClient();
  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const storageKey = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("media").upload(storageKey, file, { contentType: file.type, upsert: false });
  if (uploadError) return { error: "스토리지에 이미지를 업로드하지 못했습니다." };
  const { data: urlData } = supabase.storage.from("media").getPublicUrl(storageKey);
  const { error: insertError } = await supabase.from("media").insert({ storage_key: storageKey, public_url: urlData.publicUrl, alt, mime_type: file.type, size_bytes: file.size, created_by: user.id });
  if (insertError) {
    await supabase.storage.from("media").remove([storageKey]);
    return { error: "미디어 정보를 저장하지 못했습니다." };
  }
  await logAction("upload", "media", null, { storageKey, mimeType: file.type, size: file.size });
  revalidatePath("/admin/media");
  return { success: "이미지를 업로드했습니다." };
}

export async function deleteMedia(id: string, storageKey: string) {
  await requireAdmin();
  const supabase = await createClient();
  const [portfolioUse, postUse] = await Promise.all([
    supabase.from("portfolio_item_media").select("portfolio_item_id", { count: "exact", head: true }).eq("media_id", id),
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("cover_media_id", id),
  ]);
  if ((portfolioUse.count ?? 0) > 0 || (postUse.count ?? 0) > 0) return;
  const { error: storageError } = await supabase.storage.from("media").remove([storageKey]);
  if (storageError) return;
  const { error } = await supabase.from("media").delete().eq("id", id);
  if (error) return;
  await logAction("delete", "media", id, { storageKey });
  revalidatePath("/admin/media");
}
