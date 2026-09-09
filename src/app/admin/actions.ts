"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import {
  contentCommandSchema,
  knowledgeDocumentIdSchema,
  mediaIdSchema,
  portfolioInputSchema,
  portfolioOrderSchema,
  postInputSchema,
  siteProfileInputSchema,
  type ContentSaveState,
  type FormState,
  type MediaUploadState,
} from "@/lib/validation/content";
import { markdownToPlainText, toMarkdownDocument } from "@/lib/content/markdown";
import { CONTENT_CACHE_TAGS } from "@/lib/content/types";
import { InvalidImageUploadError, normalizeImageUpload } from "@/lib/media/image-upload";

type ContentTable = "portfolio_items" | "posts";
type ContentRecord = {
  id: string;
  slug: string;
  status: string;
  status_before_trash?: string | null;
};
type RegisteredMedia = NonNullable<MediaUploadState["media"]>;

function asBoolean(value: FormDataEntryValue | null) {
  return value === "true" || value === "on";
}

function normalizedTagNames(rawTags: string | undefined) {
  const seen = new Set<string>();
  return (rawTags ?? "").split(",").map((tag) => tag.trim()).filter((tag) => {
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contentType(table: ContentTable) {
  return table === "portfolio_items" ? "portfolio" : "post";
}

function isConflict(error: { code?: string; message?: string } | null) {
  return error?.code === "40001" || error?.message?.includes("conflict") === true;
}

function parseRegisteredMedia(value: unknown): RegisteredMedia | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const media = value as Record<string, unknown>;
  return typeof media.id === "string"
    && typeof media.public_url === "string"
    && typeof media.alt === "string"
    && typeof media.storage_key === "string"
    ? {
        id: media.id,
        public_url: media.public_url,
        alt: media.alt,
        storage_key: media.storage_key,
      }
    : null;
}

function completedMediaUpload(media: RegisteredMedia): MediaUploadState {
  return {
    success: "이미지를 검사하고 최적화해 업로드했습니다.",
    media,
  };
}

function revalidateContent(table: ContentTable, slug?: string) {
  revalidatePath("/");
  if (table === "portfolio_items") {
    updateTag(CONTENT_CACHE_TAGS.portfolio);
    revalidatePath("/portfolio");
    revalidatePath("/portfolio/[slug]", "page");
    revalidatePath("/admin/portfolio");
    if (slug) revalidatePath(`/portfolio/${slug}`);
    return;
  }
  updateTag(CONTENT_CACHE_TAGS.posts);
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
  const command = contentCommandSchema.safeParse({ table, id });
  if (!command.success) return { error: command.error.issues[0]?.message ?? "콘텐츠 정보를 확인해 주세요." };
  await requireAdmin();
  const { data: content, error: lookupError } = await getContentRecord(command.data.table, command.data.id);
  if (lookupError || !content) return { error: "콘텐츠를 찾을 수 없습니다." };
  if (content.status === "trashed") return { error: "휴지통의 콘텐츠는 먼저 복구해 주세요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transition_content_status_atomic", {
    p_content_type: contentType(command.data.table),
    p_content_id: command.data.id,
    p_expected_status: content.status,
    p_transition: "publish",
  });
  if (isConflict(error)) return { error: "다른 요청에서 상태가 변경되었습니다. 목록을 새로고침해 주세요." };
  if (error) return { error: "발행하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };

  const result = data as { slug?: unknown } | null;
  revalidateContent(command.data.table, typeof result?.slug === "string" ? result.slug : content.slug);
  return { success: command.data.table === "posts" ? "게시글을 발행했습니다. 챗봇 반영을 준비하고 있습니다." : "포트폴리오 항목을 발행했습니다. 챗봇 반영을 준비하고 있습니다." };
}

export async function unpublishContent(table: ContentTable, id: string): Promise<FormState> {
  const command = contentCommandSchema.safeParse({ table, id });
  if (!command.success) return { error: command.error.issues[0]?.message ?? "콘텐츠 정보를 확인해 주세요." };
  await requireAdmin();
  const { data: content, error: lookupError } = await getContentRecord(command.data.table, command.data.id);
  if (lookupError || !content) return { error: "콘텐츠를 찾을 수 없습니다." };
  if (content.status === "trashed") return { error: "휴지통의 콘텐츠는 먼저 복구해 주세요." };
  if (content.status !== "published") return { error: "발행 중인 콘텐츠만 초안으로 전환할 수 있습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transition_content_status_atomic", {
    p_content_type: contentType(command.data.table),
    p_content_id: command.data.id,
    p_expected_status: content.status,
    p_transition: "unpublish",
  });
  if (isConflict(error)) return { error: "다른 요청에서 상태가 변경되었습니다. 목록을 새로고침해 주세요." };
  if (error) return { error: "발행을 중단하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };

  const result = data as { slug?: unknown } | null;
  revalidateContent(command.data.table, typeof result?.slug === "string" ? result.slug : content.slug);
  return { success: "초안으로 전환했습니다." };
}

export async function savePortfolio(_previousState: ContentSaveState, formData: FormData): Promise<ContentSaveState> {
  const raw = {
    id: formData.get("id") || undefined,
    title: formData.get("title"), slug: formData.get("slug"), type: formData.get("type"), summary: formData.get("summary"),
    contentMarkdown: formData.get("contentMarkdown"), startDate: formData.get("startDate"), endDate: formData.get("endDate"),
    status: formData.get("intent") === "publish" ? "published" : formData.get("status"), sortOrder: formData.get("sortOrder"), isFeatured: asBoolean(formData.get("isFeatured")), tagNames: formData.get("tagNames") || undefined, coverMediaId: formData.get("coverMediaId") || null,
    inlineMediaIds: formData.has("inlineMediaIds") ? formData.get("inlineMediaIds") : undefined,
    expectedUpdatedAt: formData.get("expectedUpdatedAt") || undefined,
  };
  const parsed = portfolioInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  if (parsed.data.status === "trashed") return { error: "휴지통은 목록에서만 관리할 수 있습니다." };
  await requireAdmin();
  const supabase = await createClient();
  const input = parsed.data;
  const payload = {
    id: input.id, title: input.title, slug: input.slug, type: input.type, summary: input.summary,
    content_json: toMarkdownDocument(input.contentMarkdown), content_text: markdownToPlainText(input.contentMarkdown),
    start_date: input.startDate, end_date: input.endDate, status: input.status,
    sort_order: input.sortOrder, is_featured: input.isFeatured,
    tag_names: normalizedTagNames(input.tagNames), cover_media_id: input.coverMediaId ?? null,
    ...(input.inlineMediaIds === undefined ? {} : { inline_media_ids: input.inlineMediaIds }),
  };
  const { data, error } = await supabase.rpc("save_portfolio_atomic", {
    p_payload: payload,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  });
  if (isConflict(error)) return { error: "다른 곳에서 수정된 항목입니다. 최신 내용을 다시 불러온 뒤 다시 저장해 주세요." };
  if (error) {
    if (error.code === "23505") return { error: "이미 사용 중인 slug 또는 태그입니다." };
    if (error.code === "23503") return { error: "카테고리 또는 미디어 연결 정보를 확인해 주세요." };
    return { error: "저장하지 못했습니다. 기존 내용은 변경되지 않았습니다." };
  }
  revalidateContent("portfolio_items", input.slug);
  const saved = data as { id?: unknown; updated_at?: unknown; slug?: unknown } | null;
  const savedIdentity = typeof saved?.id === "string" && typeof saved.updated_at === "string" && typeof saved.slug === "string"
    ? { contentId: saved.id, updatedAt: saved.updated_at, slug: saved.slug }
    : {};
  return { success: input.status === "published" ? "포트폴리오 항목을 발행했습니다. 챗봇 반영을 준비하고 있습니다." : "포트폴리오 항목을 저장했습니다.", ...savedIdentity };
}

export async function savePost(_previousState: ContentSaveState, formData: FormData): Promise<ContentSaveState> {
  const raw = {
    id: formData.get("id") || undefined, title: formData.get("title"), slug: formData.get("slug"), excerpt: formData.get("excerpt"),
    contentMarkdown: formData.get("contentMarkdown"), categoryId: formData.get("categoryId") || null, status: formData.get("intent") === "publish" ? "published" : formData.get("status"), seoTitle: formData.get("seoTitle") || undefined, seoDescription: formData.get("seoDescription") || undefined, tagNames: formData.get("tagNames") || undefined, coverMediaId: formData.get("coverMediaId") || null,
    inlineMediaIds: formData.has("inlineMediaIds") ? formData.get("inlineMediaIds") : undefined,
    expectedUpdatedAt: formData.get("expectedUpdatedAt") || undefined,
  };
  const parsed = postInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  if (parsed.data.status === "trashed") return { error: "휴지통은 목록에서만 관리할 수 있습니다." };
  await requireAdmin();
  const supabase = await createClient();
  const input = parsed.data;
  const payload = {
    id: input.id, title: input.title, slug: input.slug, excerpt: input.excerpt,
    content_json: toMarkdownDocument(input.contentMarkdown), content_text: markdownToPlainText(input.contentMarkdown),
    category_id: input.categoryId ?? null, cover_media_id: input.coverMediaId ?? null,
    status: input.status, seo_title: input.seoTitle || input.title, seo_description: input.seoDescription || input.excerpt,
    tag_names: normalizedTagNames(input.tagNames),
    ...(input.inlineMediaIds === undefined ? {} : { inline_media_ids: input.inlineMediaIds }),
  };
  const { data, error } = await supabase.rpc("save_post_atomic", {
    p_payload: payload,
    p_expected_updated_at: input.expectedUpdatedAt ?? null,
  });
  if (isConflict(error)) return { error: "다른 곳에서 수정된 글입니다. 최신 내용을 다시 불러온 뒤 다시 저장해 주세요." };
  if (error) {
    if (error.code === "23505") return { error: "이미 사용 중인 slug 또는 태그입니다." };
    if (error.code === "23503") return { error: "카테고리 또는 미디어 연결 정보를 확인해 주세요." };
    return { error: "저장하지 못했습니다. 기존 글은 변경되지 않았습니다." };
  }
  revalidateContent("posts", input.slug);
  const saved = data as { id?: unknown; updated_at?: unknown; slug?: unknown } | null;
  const savedIdentity = typeof saved?.id === "string" && typeof saved.updated_at === "string" && typeof saved.slug === "string"
    ? { contentId: saved.id, updatedAt: saved.updated_at, slug: saved.slug }
    : {};
  return { success: input.status === "published" ? "게시글을 발행했습니다. 챗봇 반영을 준비하고 있습니다." : "게시글을 저장했습니다.", ...savedIdentity };
}

export async function updateSiteProfile(_previousState: FormState, formData: FormData): Promise<FormState> {
  const parsed = siteProfileInputSchema.safeParse({ displayName: formData.get("displayName"), roleTitle: formData.get("roleTitle"), headline: formData.get("headline"), bio: formData.get("bio"), skills: formData.get("skills") ?? "", email: formData.get("email"), socialLinks: formData.get("socialLinks") || "[]" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." };
  await requireAdmin();
  const supabase = await createClient();
  const input = parsed.data;
  const { error } = await supabase.rpc("update_site_profile_atomic", {
    p_payload: {
      display_name: input.displayName,
      role_title: input.roleTitle,
      headline: input.headline,
      bio: input.bio,
      skills: input.skills,
      email: input.email,
      social_links: JSON.parse(input.socialLinks),
    },
  });
  if (error) return { error: "프로필을 저장하지 못했습니다." };
  updateTag(CONTENT_CACHE_TAGS.profile);
  revalidatePath("/"); revalidatePath("/about"); revalidatePath("/contact"); revalidatePath("/admin/profile");
  revalidatePath("/admin/chatbot");
  return { success: "사이트 프로필을 저장했습니다. 챗봇 반영을 준비하고 있습니다." };
}

export async function reindexKnowledgeDocument(_previousState: FormState, formData: FormData): Promise<FormState> {
  const parsed = knowledgeDocumentIdSchema.safeParse(formData.get("documentId"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "문서 ID를 확인해 주세요." };
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reindex_knowledge_document", { p_document_id: parsed.data });
  if (error) return { error: "재인덱싱 작업을 요청하지 못했습니다." };
  revalidatePath("/admin/chatbot");
  return { success: "재인덱싱 작업을 요청했습니다." };
}

export async function reindexAllKnowledgeDocuments(_previousState: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("confirmed") !== "true") return { error: "전체 재인덱싱 확인이 필요합니다." };
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reindex_all_knowledge_documents");
  if (error) return { error: "전체 재인덱싱 작업을 요청하지 못했습니다." };
  revalidatePath("/admin/chatbot");
  const count = typeof data === "number" ? data : 0;
  return { success: `${count}개 문서의 재인덱싱 작업을 요청했습니다.` };
}

export async function setChatbotRuntimeEnabled(_previousState: FormState, formData: FormData): Promise<FormState> {
  const rawEnabled = formData.get("enabled");
  if (rawEnabled !== "true" && rawEnabled !== "false") return { error: "챗봇 연결 상태를 확인해 주세요." };

  const enabled = rawEnabled === "true";
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chatbot_runtime_enabled", { p_enabled: enabled });
  if (error) return { error: "챗봇 연결 상태를 변경하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };

  revalidatePath("/admin/chatbot");
  return { success: enabled ? "챗봇 연결을 활성화했습니다." : "챗봇 연결을 비활성화했습니다." };
}

export async function moveToTrash(table: ContentTable, id: string): Promise<FormState> {
  const command = contentCommandSchema.safeParse({ table, id });
  if (!command.success) return { error: command.error.issues[0]?.message ?? "콘텐츠 정보를 확인해 주세요." };
  await requireAdmin();
  const { data: content, error: lookupError } = await getContentRecord(command.data.table, command.data.id);
  if (lookupError || !content) return { error: "콘텐츠를 찾을 수 없습니다." };
  if (content.status === "trashed") return { success: "이미 휴지통에 있습니다." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transition_content_status_atomic", {
    p_content_type: contentType(command.data.table),
    p_content_id: command.data.id,
    p_expected_status: content.status,
    p_transition: "trash",
  });
  if (isConflict(error)) return { error: "다른 요청에서 상태가 변경되었습니다. 목록을 새로고침해 주세요." };
  if (error) return { error: "휴지통으로 옮기지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  const result = data as { slug?: unknown } | null;
  revalidateContent(command.data.table, typeof result?.slug === "string" ? result.slug : content.slug);
  return { success: "휴지통으로 옮겼습니다. 언제든 복구할 수 있습니다." };
}

export async function restoreContent(table: ContentTable, id: string): Promise<FormState> {
  const command = contentCommandSchema.safeParse({ table, id });
  if (!command.success) return { error: command.error.issues[0]?.message ?? "콘텐츠 정보를 확인해 주세요." };
  await requireAdmin();
  const { data: content, error: lookupError } = await getContentRecord(command.data.table, command.data.id);
  if (lookupError || !content) return { error: "콘텐츠를 찾을 수 없습니다." };
  if (content.status !== "trashed") return { error: "휴지통에 있는 콘텐츠만 복구할 수 있습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transition_content_status_atomic", {
    p_content_type: contentType(command.data.table),
    p_content_id: command.data.id,
    p_expected_status: content.status,
    p_transition: "restore",
  });
  if (isConflict(error)) return { error: "다른 요청에서 상태가 변경되었습니다. 목록을 새로고침해 주세요." };
  if (error) return { error: "복구하지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
  const result = data as { slug?: unknown; status?: unknown } | null;
  const restoredStatus = typeof result?.status === "string" ? result.status : "draft";
  revalidateContent(command.data.table, typeof result?.slug === "string" ? result.slug : content.slug);
  const restoredStatusLabel = restoredStatus === "published"
    ? "발행"
    : restoredStatus === "hidden"
      ? "숨김"
      : restoredStatus === "private"
        ? "비공개"
        : "초안";
  return { success: `${restoredStatusLabel} 상태로 복구했습니다.` };
}

export async function reorderPortfolioItems(orderedIds: string[]) {
  const parsed = portfolioOrderSchema.safeParse(orderedIds);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "순서 정보가 올바르지 않습니다." };
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reorder_portfolio_items_atomic", { p_ordered_ids: parsed.data });
  if (isConflict(error)) return { error: "항목 목록이 변경되었습니다. 새로고침한 뒤 다시 정렬해 주세요." };
  if (error) return { error: "순서를 저장하지 못했습니다. 기존 순서는 유지됩니다." };
  updateTag(CONTENT_CACHE_TAGS.portfolio);
  revalidatePath("/"); revalidatePath("/portfolio"); revalidatePath("/admin/portfolio");
  return { success: "노출 순서를 저장했습니다." };
}

export async function updateMediaAlt(_previousState: FormState, formData: FormData): Promise<FormState> {
  const id = mediaIdSchema.safeParse(formData.get("id"));
  const decorative = asBoolean(formData.get("decorative"));
  const alt = decorative ? "" : String(formData.get("alt") ?? "").trim();
  if (!id.success) return { error: id.error.issues[0]?.message ?? "미디어 정보를 확인해 주세요." };
  if (!decorative && !alt) return { error: "이미지를 설명하는 대체 텍스트를 입력하거나 장식용으로 표시해 주세요." };
  if (alt.length > 200) return { error: "대체 텍스트는 200자 이하여야 합니다." };

  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_media_alt_atomic", {
    p_media_id: id.data,
    p_alt: alt,
  });
  if (error) return { error: "대체 텍스트를 저장하지 못했습니다." };

  updateTag(CONTENT_CACHE_TAGS.portfolio);
  updateTag(CONTENT_CACHE_TAGS.posts);
  updateTag(CONTENT_CACHE_TAGS.profile);
  revalidatePath("/");
  revalidatePath("/portfolio");
  revalidatePath("/blog");
  revalidatePath("/admin/media");
  return { success: decorative ? "장식용 이미지로 저장했습니다." : "대체 텍스트를 저장했습니다." };
}

export async function uploadMedia(_previousState: MediaUploadState, formData: FormData): Promise<MediaUploadState> {
  await requireAdmin();
  const file = formData.get("file");
  const alt = String(formData.get("alt") ?? "").trim();
  const decorative = asBoolean(formData.get("decorative"));
  if (!(file instanceof File) || file.size === 0) return { error: "업로드할 이미지를 선택해 주세요." };
  if (file.size > 5 * 1024 * 1024) return { error: "이미지 크기는 5MB 이하여야 합니다." };
  if (alt.length > 200) return { error: "대체 텍스트는 200자 이하여야 합니다." };
  if (!decorative && !alt) return { error: "이미지를 설명하는 대체 텍스트를 입력해 주세요." };

  let normalized;
  try {
    normalized = await normalizeImageUpload(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof InvalidImageUploadError) return { error: error.message };
    return { error: "이미지를 검사하지 못했습니다." };
  }

  const supabase = await createClient();
  const storageKey = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${normalized.extension}`;
  const { error: uploadError } = await supabase.storage.from("media").upload(storageKey, normalized.bytes, { contentType: normalized.mimeType, upsert: false });
  if (uploadError) return { error: "스토리지에 이미지를 업로드하지 못했습니다." };
  const { data: urlData } = supabase.storage.from("media").getPublicUrl(storageKey);
  const registrationPayload = {
    storage_key: storageKey,
    public_url: urlData.publicUrl,
    alt: decorative ? "" : alt,
    mime_type: normalized.mimeType,
    size_bytes: normalized.bytes.length,
    width: normalized.width,
    height: normalized.height,
    checksum_sha256: normalized.checksumSha256,
  };
  const { data, error: insertError } = await supabase.rpc("register_media_atomic", {
    p_payload: registrationPayload,
  });
  let createdMedia = parseRegisteredMedia(data);

  // A network failure can be reported after PostgreSQL committed the RPC. Read
  // by the immutable storage key before considering object cleanup so a valid
  // metadata row can never be left pointing at a deleted blob.
  if (insertError || !createdMedia) {
    const { data: existingData, error: lookupError } = await supabase
      .from("media")
      .select("id, public_url, alt, storage_key")
      .eq("storage_key", storageKey)
      .maybeSingle();
    createdMedia = parseRegisteredMedia(existingData);
    if (!createdMedia) {
      const databaseRejectedBeforeCommit = Boolean(insertError?.code && /^[0-9A-Z]{5}$/.test(insertError.code));
      if (insertError && !lookupError && databaseRejectedBeforeCommit) {
        const { error: cleanupError } = await supabase.storage.from("media").remove([storageKey]);
        return cleanupError
          ? { error: "미디어 정보 저장과 업로드 파일 정리를 완료하지 못했습니다. 관리자에게 확인해 주세요." }
          : { error: "미디어 정보를 저장하지 못했습니다." };
      }
      return { error: "업로드 상태를 확정하지 못했습니다. 파일을 다시 올리지 말고 미디어 화면을 새로고침해 확인해 주세요." };
    }
  }
  revalidatePath("/admin/media");
  return completedMediaUpload(createdMedia);
}

export async function deleteMedia(_previousState: FormState, formData: FormData): Promise<FormState> {
  const parsed = mediaIdSchema.safeParse(formData.get("id"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "미디어 정보를 확인해 주세요." };
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_media_atomic", { p_media_id: parsed.data });
  if (error) {
    return {
      error: error.code === "23503"
        ? "사용 중인 이미지는 삭제할 수 없습니다. 사용처를 먼저 해제해 주세요."
        : "이미지 삭제를 시작하지 못했습니다.",
    };
  }

  const result = data as { storage_key?: unknown } | null;
  if (typeof result?.storage_key !== "string") {
    revalidatePath("/admin/media");
    return { error: "삭제 대기 정보를 확인하지 못했습니다. 미디어 화면에서 다시 시도해 주세요." };
  }
  const { error: storageError } = await supabase.storage.from("media").remove([result.storage_key]);
  if (storageError) {
    await supabase.rpc("record_media_deletion_failure", { p_media_id: parsed.data });
    revalidatePath("/admin/media");
    return { error: "파일 삭제가 완료되지 않아 재시도 목록에 보관했습니다." };
  }

  const { error: completionError } = await supabase.rpc("complete_media_deletion", { p_media_id: parsed.data });
  if (completionError) {
    revalidatePath("/admin/media");
    return { error: "파일은 삭제했지만 완료 기록을 남기지 못했습니다. 재시도하면 정리됩니다." };
  }
  revalidatePath("/admin/media");
  return { success: "이미지를 삭제했습니다." };
}
