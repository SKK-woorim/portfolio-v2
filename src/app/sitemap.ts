import type { MetadataRoute } from "next";
import { getPublishedPortfolioItems, getPublishedPosts } from "@/lib/content/repository";
import { absoluteUrl } from "@/lib/site-metadata";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [portfolio, posts] = await Promise.all([getPublishedPortfolioItems(), getPublishedPosts()]);
  const staticRoutes: MetadataRoute.Sitemap = ["/", "/portfolio", "/blog", "/about", "/contact"].map((path) => ({ url: absoluteUrl(path) }));
  const portfolioRoutes: MetadataRoute.Sitemap = portfolio.map((item) => ({ url: absoluteUrl(`/portfolio/${item.slug}`), lastModified: new Date(item.updatedAt) }));
  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({ url: absoluteUrl(`/blog/${post.slug}`), lastModified: new Date(post.updatedAt) }));
  return [...staticRoutes, ...portfolioRoutes, ...postRoutes];
}
