import { getPublishedPosts } from "@/lib/content/repository";

function escapeXml(value: string) { return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] ?? character); }

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";
  const posts = await getPublishedPosts();
  const items = posts.map((post) => `<item><title>${escapeXml(post.title)}</title><link>${siteUrl}/blog/${post.slug}</link><guid>${siteUrl}/blog/${post.slug}</guid><description>${escapeXml(post.excerpt)}</description><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate></item>`).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Portfolio V2</title><link>${siteUrl}</link><description>제품과 기술, 일하는 방식에 관한 글</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
