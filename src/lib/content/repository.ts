import "server-only";

import * as Sentry from "@sentry/nextjs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { contentToMarkdown } from "@/lib/content/markdown";
import { demoProfile } from "@/lib/content/demo-data";
import { CONTENT_CACHE_TAGS, type BlogPost, type ContentImage, type PortfolioItem, type SiteProfile } from "@/lib/content/types";
import { getSupabaseConfig, hasSupabaseConfig } from "@/lib/supabase/config";

const PUBLIC_CONTENT_REVALIDATE_SECONDS = 3600;

function createPublicClient() {
  const { url, publishableKey } = getSupabaseConfig();
  return createSupabaseClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

type TaggedRelation = { tags?: { name?: string } | null };
type PortfolioLinkRow = { label: string; url: string };
type MediaRow = { public_url?: string | null; alt?: string | null };
type PortfolioMediaRow = { role?: string; sort_order?: number; media?: MediaRow | MediaRow[] | null };
type PortfolioRow = {
  id: string;
  slug: string;
  title: string;
  type: string;
  summary: string;
  content_json?: unknown;
  content_text?: string | null;
  start_date: string | null;
  end_date: string | null;
  is_featured: boolean;
  sort_order: number;
  updated_at: string;
  portfolio_tags?: TaggedRelation[] | null;
  portfolio_links?: PortfolioLinkRow[] | null;
  portfolio_item_media?: PortfolioMediaRow[] | null;
};
type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content_json?: unknown;
  content_text: string | null;
  categories?: { name?: string } | null;
  post_tags?: TaggedRelation[] | null;
  published_at: string;
  updated_at: string;
  seo_title?: string | null;
  seo_description?: string | null;
  media?: MediaRow | MediaRow[] | null;
};

function reportContentError(area: string, error: unknown) {
  Sentry.captureException(error, { tags: { area: `public-content:${area}` } });
}

function extractText(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const node = value as { type?: string; text?: string; content?: unknown[] };
  if (typeof node.text === "string") return [node.text];
  const children = Array.isArray(node.content) ? node.content.flatMap(extractText) : [];
  return node.type === "paragraph" && children.length ? [children.join("")] : children;
}

function toPeriod(startDate: string | null, endDate: string | null) {
  const start = startDate?.slice(0, 4);
  const end = endDate?.slice(0, 4);
  if (!start) return "기간 미정";
  return end && end !== start ? `${start} — ${end}` : start;
}

function firstMedia(value: MediaRow | MediaRow[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toContentImage(value: MediaRow | MediaRow[] | null | undefined, fallbackAlt: string): ContentImage | undefined {
  const media = firstMedia(value);
  return media?.public_url ? { src: media.public_url, alt: media.alt?.trim() || fallbackAlt } : undefined;
}

function toPortfolioItem(row: PortfolioRow, includeContent: boolean): PortfolioItem {
  const cover = (row.portfolio_item_media ?? [])
    .filter((relation) => relation.role === "cover")
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    period: toPeriod(row.start_date, row.end_date),
    summary: row.summary,
    body: includeContent ? (row.content_text?.trim() ? [row.content_text.trim()] : extractText(row.content_json)) : [],
    contentMarkdown: includeContent ? contentToMarkdown(row.content_json) : undefined,
    tags: (row.portfolio_tags ?? []).flatMap((relation) => relation.tags?.name ? [relation.tags.name] : []),
    links: (row.portfolio_links ?? []).map((link) => ({ label: link.label, href: link.url })),
    featured: row.is_featured,
    accent: (["navy", "blue", "sky"] as const)[row.sort_order % 3],
    updatedAt: row.updated_at,
    coverImage: toContentImage(cover?.media, `${row.title} 대표 이미지`),
  };
}

function toBlogPost(row: PostRow, includeContent: boolean): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: includeContent ? extractText(row.content_json) : [],
    contentMarkdown: includeContent ? contentToMarkdown(row.content_json) : undefined,
    category: row.categories?.name ?? "Uncategorized",
    tags: (row.post_tags ?? []).flatMap((relation) => relation.tags?.name ? [relation.tags.name] : []),
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    readingMinutes: Math.max(1, Math.ceil((row.content_text?.length ?? 0) / 450)),
    seoTitle: row.seo_title || undefined,
    seoDescription: row.seo_description || undefined,
    coverImage: toContentImage(row.media, `${row.title} 대표 이미지`),
  };
}

function normalizeDisplayName(value: string | null | undefined) {
  const oldAliases = new Set(["woorim kim", "skk-woorim"]);
  return value && !oldAliases.has(value.trim().toLowerCase()) ? value : demoProfile.displayName;
}

function normalizeContactEmail(value: string | null | undefined) {
  const oldPlaceholders = new Set(["hello@example.com"]);
  return value && !oldPlaceholders.has(value.trim().toLowerCase()) ? value : demoProfile.email;
}

const getCachedSiteProfile = unstable_cache(async (): Promise<SiteProfile> => {
  if (!hasSupabaseConfig()) return demoProfile;
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("site_profile")
      .select("display_name, role_title, headline, bio, skills, contact, social_links")
      .eq("id", true)
      .maybeSingle();
    if (error) throw error;
    if (!data) return demoProfile;
    const contact = (data.contact ?? {}) as { email?: string };
    const socialLinks: unknown[] = Array.isArray(data.social_links) ? data.social_links : [];
    return {
      displayName: normalizeDisplayName(data.display_name),
      roleTitle: data.role_title === "Product-minded Developer" ? demoProfile.roleTitle : data.role_title,
      headline: data.headline === "복잡한 문제를 이해하기 쉬운 디지털 경험으로 바꿉니다." ? demoProfile.headline : data.headline,
      bio: data.bio === "사용자 맥락과 구현의 균형을 바탕으로, 오래 사용할 수 있는 웹 제품을 설계하고 만듭니다." ? demoProfile.bio : data.bio,
      email: normalizeContactEmail(contact.email),
      socialLinks: socialLinks.filter((link): link is { label: string; href: string } => {
        if (!link || typeof link !== "object") return false;
        const candidate = link as { label?: unknown; href?: unknown };
        return typeof candidate.label === "string" && typeof candidate.href === "string";
      }),
      skills: Array.isArray(data.skills) ? data.skills.filter((skill): skill is string => typeof skill === "string" && Boolean(skill.trim())).map((skill) => skill.trim()) : [],
    } satisfies SiteProfile;
  } catch (error) {
    reportContentError("profile", error);
    return demoProfile;
  }
}, ["site-profile-v5"], {
  tags: [CONTENT_CACHE_TAGS.profile],
  revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
});

export async function getSiteProfile() {
  return getCachedSiteProfile();
}

const getCachedPortfolioItems = unstable_cache(async () => {
  if (!hasSupabaseConfig()) return [];
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("portfolio_items")
      .select("id, slug, title, type, summary, start_date, end_date, is_featured, sort_order, updated_at, portfolio_tags(tags(name)), portfolio_item_media(role, sort_order, media(public_url, alt))")
      .eq("status", "published")
      .order("sort_order", { ascending: true })
      .order("start_date", { ascending: false });
    if (error) throw error;
    const items = ((data ?? []) as PortfolioRow[]).map((row) => toPortfolioItem(row, false));
    return items;
  } catch (error) {
    reportContentError("portfolio-list", error);
    return [];
  }
}, ["published-portfolio-v4"], {
  tags: [CONTENT_CACHE_TAGS.portfolio],
  revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
});

export async function getPublishedPortfolioItems() {
  return getCachedPortfolioItems();
}

export const getPublishedPortfolioItem = cache(async (slug: string) => unstable_cache(async () => {
  if (!hasSupabaseConfig()) return undefined;
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("portfolio_items")
      .select("id, slug, title, type, summary, content_json, content_text, start_date, end_date, is_featured, sort_order, updated_at, portfolio_tags(tags(name)), portfolio_links(label, url, sort_order), portfolio_item_media(role, sort_order, media(public_url, alt))")
      .eq("status", "published")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return data ? toPortfolioItem(data as PortfolioRow, true) : undefined;
  } catch (error) {
    reportContentError("portfolio-detail", error);
    return undefined;
  }
}, ["published-portfolio-item-v5", slug], {
  tags: [CONTENT_CACHE_TAGS.portfolio],
  revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
})());

const getCachedPosts = unstable_cache(async () => {
  if (!hasSupabaseConfig()) return [];
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("posts")
      .select("id, slug, title, excerpt, content_text, published_at, updated_at, seo_title, seo_description, categories(name), post_tags(tags(name)), media(public_url, alt)")
      .eq("status", "published")
      .order("published_at", { ascending: false });
    if (error) throw error;
    const posts = ((data ?? []) as PostRow[]).map((row) => toBlogPost(row, false));
    return posts;
  } catch (error) {
    reportContentError("post-list", error);
    return [];
  }
}, ["published-posts-v4"], {
  tags: [CONTENT_CACHE_TAGS.posts],
  revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
});

export async function getPublishedPosts() {
  return getCachedPosts();
}

export const getPublishedPost = cache(async (slug: string) => unstable_cache(async () => {
  if (!hasSupabaseConfig()) return undefined;
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("posts")
      .select("id, slug, title, excerpt, content_json, content_text, published_at, updated_at, seo_title, seo_description, categories(name), post_tags(tags(name)), media(public_url, alt)")
      .eq("status", "published")
      .eq("slug", slug)
      .maybeSingle();
    if (error) throw error;
    return data ? toBlogPost(data as PostRow, true) : undefined;
  } catch (error) {
    reportContentError("post-detail", error);
    return undefined;
  }
}, ["published-post-item-v4", slug], {
  tags: [CONTENT_CACHE_TAGS.posts],
  revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS,
})());
