import type { MetadataRoute } from "next";
import { getPublishedPortfolioItems, getPublishedPosts } from "@/lib/content/repository";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";
  const [portfolio, posts] = await Promise.all([getPublishedPortfolioItems(), getPublishedPosts()]);
  return ["", "/portfolio", "/blog", "/about", "/contact"].map((path) => ({ url: `${siteUrl}${path}`, lastModified: new Date() })).concat(
    portfolio.map((item) => ({ url: `${siteUrl}/portfolio/${item.slug}`, lastModified: new Date() })),
    posts.map((post) => ({ url: `${siteUrl}/blog/${post.slug}`, lastModified: new Date(post.publishedAt) })),
  );
}
