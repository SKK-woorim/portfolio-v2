"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { portfolioInputSchema, postInputSchema, siteProfileInputSchema, type FormState } from "@/lib/validation/content";

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

export async function savePortfolio(_previousState: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    id: formData.get("id") || undefined,
    title: formData.get("title"), slug: formData.get("slug"), type: formData.get("type"), summary: formData.get("summary"),
    contentJson: formData.get("contentJson"), startDate: formData.get("startDate"), endDate: formData.get("endDate"),
    status: formData.get("status"), sortOrder: formData.get("sortOrder"), isFeatured: asBoolean(formData.get("isFeatured")), tagNames: formData.get("tagNames") || undefined,
  };
  const parsed = portfolioInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  const user = await requireAdmin();
  const supabase = await createClient();
  const input = parsed.data;
  const payload = {
    title: input.title, slug: input.slug, type: input.type, summary: input.summary, content_json: JSON.parse(input.contentJson),
    start_date: input.startDate, end_date: input.endDate, status: input.status, sort_order: input.sortOrder, is_featured: input.isFeatured, created_by: user.id,
  };
  const result = input.id ? await supabase.from("portfolio_items").update(payload).eq("id", input.id).select("id").single() : await supabase.from("portfolio_items").insert(payload).select("id").single();
  if (result.error) return { error: result.error.code === "23505" ? "이미 사용 중인 slug입니다." : "저장하지 못했습니다." };
  try { await syncTags("portfolio", result.data.id, input.tagNames); } catch { return { error: "항목은 저장됐지만 태그를 저장하지 못했습니다." }; }
  await logAction(input.id ? "update" : "create", "portfolio_item", result.data.id, { title: input.title });
  revalidatePath("/"); revalidatePath("/portfolio"); revalidatePath(`/portfolio/${input.slug}`); revalidatePath("/admin/portfolio");
  return { success: "포트폴리오 항목을 저장했습니다." };
}

export async function savePost(_previousState: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    id: formData.get("id") || undefined, title: formData.get("title"), slug: formData.get("slug"), excerpt: formData.get("excerpt"),
    contentJson: formData.get("contentJson"), categoryId: formData.get("categoryId") || null, status: formData.get("status"), seoTitle: formData.get("seoTitle") || undefined, seoDescription: formData.get("seoDescription") || undefined, tagNames: formData.get("tagNames") || undefined,
  };
  const parsed = postInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  const user = await requireAdmin();
  const supabase = await createClient();
  const input = parsed.data;
  const payload = {
    title: input.title, slug: input.slug, excerpt: input.excerpt, content_json: JSON.parse(input.contentJson), content_text: "",
    category_id: input.categoryId ?? null, status: input.status, seo_title: input.seoTitle || input.title, seo_description: input.seoDescription || input.excerpt,
    published_at: input.status === "published" ? new Date().toISOString() : null, created_by: user.id,
  };
  const result = input.id ? await supabase.from("posts").update(payload).eq("id", input.id).select("id").single() : await supabase.from("posts").insert(payload).select("id").single();
  if (result.error) return { error: result.error.code === "23505" ? "이미 사용 중인 slug입니다." : "저장하지 못했습니다." };
  try { await syncTags("post", result.data.id, input.tagNames); } catch { return { error: "글은 저장됐지만 태그를 저장하지 못했습니다." }; }
  await logAction(input.id ? "update" : "create", "post", result.data.id, { title: input.title });
  revalidatePath("/"); revalidatePath("/blog"); revalidatePath(`/blog/${input.slug}`); revalidatePath("/admin/posts");
  return { success: "게시글을 저장했습니다." };
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

export async function moveToTrash(table: "portfolio_items" | "posts", id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from(table).update({ status: "trashed" }).eq("id", id);
  if (error) return;
  await logAction("trash", table, id);
  revalidatePath("/"); revalidatePath("/portfolio"); revalidatePath("/blog"); revalidatePath(`/admin/${table === "posts" ? "posts" : "portfolio"}`);
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
