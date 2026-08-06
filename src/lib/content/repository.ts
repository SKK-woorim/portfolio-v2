import { demoPortfolioItems, demoPosts, demoProfile } from "@/lib/content/demo-data";
import type { BlogPost, PortfolioItem, SiteProfile } from "@/lib/content/types";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { contentToMarkdown } from "@/lib/content/markdown";

type TaggedRelation = { tags?: { name?: string } | null };
type PortfolioLinkRow = { label: string; url: string };
type PortfolioRow = {
  id: string; slug: string; title: string; type: string; summary: string; content_json: unknown;
  start_date: string | null; end_date: string | null; is_featured: boolean;
  portfolio_tags?: TaggedRelation[] | null; portfolio_links?: PortfolioLinkRow[] | null;
};
type PostRow = {
  id: string; slug: string; title: string; excerpt: string; content_json: unknown; content_text: string | null;
  categories?: { name?: string } | null; post_tags?: TaggedRelation[] | null; published_at: string;
};

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

function toPortfolioItem(row: PortfolioRow, index: number): PortfolioItem {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    type: row.type,
    period: toPeriod(row.start_date, row.end_date),
    summary: row.summary,
    body: extractText(row.content_json),
    contentMarkdown: contentToMarkdown(row.content_json),
    tags: (row.portfolio_tags ?? []).flatMap((relation) => relation.tags?.name ? [relation.tags.name] : []),
    links: (row.portfolio_links ?? []).map((link) => ({ label: link.label, href: link.url })),
    featured: row.is_featured,
    accent: (["navy", "blue", "sky"] as const)[index % 3],
  };
}

function toBlogPost(row: PostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: extractText(row.content_json),
    contentMarkdown: contentToMarkdown(row.content_json),
    category: row.categories?.name ?? "Uncategorized",
    tags: (row.post_tags ?? []).flatMap((relation) => relation.tags?.name ? [relation.tags.name] : []),
    publishedAt: row.published_at,
    readingMinutes: Math.max(1, Math.ceil((row.content_text?.length ?? 0) / 450)),
  };
}

export async function getSiteProfile(): Promise<SiteProfile> {
  if (!hasSupabaseConfig()) return demoProfile;
  const supabase = await createClient();
  const { data, error } = await supabase.from("site_profile").select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  if (!data) return demoProfile;
  const contact = (data.contact ?? {}) as { email?: string };
  const socialLinks: unknown[] = Array.isArray(data.social_links) ? data.social_links : [];
  return {
    displayName: data.display_name,
    roleTitle: data.role_title,
    headline: data.headline,
    bio: data.bio,
    email: contact.email ?? demoProfile.email,
    socialLinks: socialLinks.filter((link): link is { label: string; href: string } => {
      if (!link || typeof link !== "object") return false;
      const candidate = link as { label?: unknown; href?: unknown };
      return typeof candidate.label === "string" && typeof candidate.href === "string";
    }),
    skills: demoProfile.skills,
  } satisfies SiteProfile;
}

export async function getPublishedPortfolioItems() {
  if (!hasSupabaseConfig()) return demoPortfolioItems;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolio_items")
    .select("*, portfolio_tags(tags(name)), portfolio_links(label, url, sort_order)")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("start_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PortfolioRow[]).map(toPortfolioItem);
}

export async function getPublishedPortfolioItem(slug: string) {
  const items = await getPublishedPortfolioItems();
  return items.find((item) => item.slug === slug);
}

export async function getPublishedPosts() {
  if (!hasSupabaseConfig()) return demoPosts;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("*, categories(name), post_tags(tags(name))")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PostRow[]).map(toBlogPost);
}

export async function getPublishedPost(slug: string) {
  const posts = await getPublishedPosts();
  return posts.find((post) => post.slug === slug);
}
