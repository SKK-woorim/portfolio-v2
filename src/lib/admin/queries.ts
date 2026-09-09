import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export async function getDashboardData() {
  await requireAdmin();
  const supabase = await createClient();
  const [portfolio, posts, recentPortfolio, recentPosts] = await Promise.all([
    supabase.from("portfolio_items").select("status", { count: "exact" }),
    supabase.from("posts").select("status", { count: "exact" }),
    supabase.from("portfolio_items").select("id, title, status, updated_at").order("updated_at", { ascending: false }).limit(4),
    supabase.from("posts").select("id, title, status, updated_at").order("updated_at", { ascending: false }).limit(4),
  ]);
  return {
    portfolio: portfolio.data ?? [], posts: posts.data ?? [],
    recent: [...(recentPortfolio.data ?? []).map((item) => ({ ...item, kind: "포트폴리오" })), ...(recentPosts.data ?? []).map((item) => ({ ...item, kind: "게시글" }))]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 6),
  };
}

export async function getAdminPortfolioItems() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("portfolio_items").select("*").order("sort_order", { ascending: true }).order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminPortfolioItem(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("portfolio_items").select("*, portfolio_tags(tags(name)), portfolio_item_media(media_id, role)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAdminPosts() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("posts").select("*, categories(name)").order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getAdminPost(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("posts").select("*, post_tags(tags(name))").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAdminCategories() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("categories").select("id, name").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getAdminSiteProfile() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_profile").select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  return data;
}

export type AdminMediaUsage = {
  kind: "site-profile" | "post-cover" | "post-inline" | "portfolio-cover" | "portfolio-gallery" | "portfolio-inline";
  label: string;
  href: string;
};

function relatedContent(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as { id?: unknown; title?: unknown };
  return typeof record.id === "string" && typeof record.title === "string"
    ? { id: record.id, title: record.title }
    : null;
}

export async function getAdminMedia() {
  await requireAdmin();
  const supabase = await createClient();
  const [mediaResult, postCoverResult, postInlineResult, portfolioResult, profileResult] = await Promise.all([
    supabase.from("media").select("id, public_url, alt, storage_key, mime_type, size_bytes, width, height").order("created_at", { ascending: false }),
    supabase.from("posts").select("id, title, cover_media_id").not("cover_media_id", "is", null),
    supabase.from("post_media").select("media_id, posts(id, title)"),
    supabase.from("portfolio_item_media").select("media_id, role, portfolio_items(id, title)"),
    supabase.from("site_profile").select("display_name, avatar_media_id").eq("id", true).maybeSingle(),
  ]);
  const error = mediaResult.error ?? postCoverResult.error ?? postInlineResult.error ?? portfolioResult.error ?? profileResult.error;
  if (error) throw error;

  const usageByMedia = new Map<string, AdminMediaUsage[]>();
  const addUsage = (mediaId: unknown, usage: AdminMediaUsage) => {
    if (typeof mediaId !== "string") return;
    const current = usageByMedia.get(mediaId) ?? [];
    current.push(usage);
    usageByMedia.set(mediaId, current);
  };

  for (const post of postCoverResult.data ?? []) {
    addUsage(post.cover_media_id, { kind: "post-cover", label: `게시글 대표 · ${post.title}`, href: `/admin/posts/${post.id}/edit` });
  }
  for (const relation of postInlineResult.data ?? []) {
    const post = relatedContent(relation.posts);
    if (post) addUsage(relation.media_id, { kind: "post-inline", label: `게시글 본문 · ${post.title}`, href: `/admin/posts/${post.id}/edit` });
  }
  for (const relation of portfolioResult.data ?? []) {
    const item = relatedContent(relation.portfolio_items);
    if (!item || !["cover", "gallery", "inline"].includes(relation.role)) continue;
    const roleLabel = relation.role === "cover" ? "대표" : relation.role === "gallery" ? "갤러리" : "본문";
    addUsage(relation.media_id, {
      kind: `portfolio-${relation.role}` as AdminMediaUsage["kind"],
      label: `포트폴리오 ${roleLabel} · ${item.title}`,
      href: `/admin/portfolio/${item.id}/edit`,
    });
  }
  if (profileResult.data?.avatar_media_id) {
    addUsage(profileResult.data.avatar_media_id, { kind: "site-profile", label: `사이트 프로필 · ${profileResult.data.display_name}`, href: "/admin/profile" });
  }

  return (mediaResult.data ?? []).map((item) => ({
    ...item,
    usages: usageByMedia.get(item.id) ?? [],
    usage_count: usageByMedia.get(item.id)?.length ?? 0,
  }));
}

export type AdminMediaDeletionJob = {
  media_id: string;
  storage_key: string;
  attempt_count: number;
  last_attempt_at: string | null;
  created_at: string;
};

export async function getAdminMediaDeletionJobs() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media_deletion_outbox")
    .select("media_id, storage_key, attempt_count, last_attempt_at, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AdminMediaDeletionJob[];
}

export type KnowledgeIndexStatus = "pending" | "processing" | "ready" | "failed" | "disabled";

export type KnowledgeDocumentRow = {
  id: string;
  source_type: "profile" | "portfolio" | "post";
  source_id: string;
  source_slug: string | null;
  title: string;
  source_url: string;
  source_updated_at: string;
  index_status: KnowledgeIndexStatus;
  attempt_count: number;
  last_error: string | null;
  queued_at: string;
  indexed_at: string | null;
};

export type ChatbotRuntimeStatus = {
  enabled: boolean;
  updatedAt: string | null;
};

function parseChatbotRuntimeStatus(value: unknown): ChatbotRuntimeStatus {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { enabled: false, updatedAt: null };
  }
  const candidate = value as { enabled?: unknown; updated_at?: unknown };
  return {
    enabled: candidate.enabled === true,
    updatedAt: typeof candidate.updated_at === "string" ? candidate.updated_at : null,
  };
}

export async function getChatbotIndexData() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select("id, source_type, source_id, source_slug, title, source_url, source_updated_at, index_status, attempt_count, last_error, queued_at, indexed_at")
    .order("source_updated_at", { ascending: false });
  if (error) throw error;

  const documents = (data ?? []) as KnowledgeDocumentRow[];
  const counts: Record<KnowledgeIndexStatus, number> = {
    ready: 0,
    pending: 0,
    processing: 0,
    failed: 0,
    disabled: 0,
  };
  for (const document of documents) counts[document.index_status] += 1;

  const lastIndexedAt = documents.reduce<string | null>((latest, document) => {
    if (!document.indexed_at) return latest;
    return !latest || document.indexed_at > latest ? document.indexed_at : latest;
  }, null);

  return { documents, counts, total: documents.length, lastIndexedAt };
}

export async function getAdminChatbotRuntimeStatus() {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_chatbot_runtime_status");
  if (error) throw error;
  return parseChatbotRuntimeStatus(data);
}
