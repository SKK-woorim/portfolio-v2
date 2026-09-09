import { getPublishedPosts } from "@/lib/content/repository";
import { absoluteUrl } from "@/lib/site-metadata";

function escapeXml(value: string) { return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] ?? character); }

export async function GET() {
  const posts = await getPublishedPosts();
  const items = posts.map((post) => { const url = absoluteUrl(`/blog/${post.slug}`); return `<item><title>${escapeXml(post.title)}</title><link>${url}</link><guid>${url}</guid><description>${escapeXml(post.excerpt)}</description><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate></item>`; }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>송경근의 AI 엔지니어링 노트</title><link>${absoluteUrl("/")}</link><description>AI Agent, RAG, 데이터 엔지니어링과 협업에 관한 글</description>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
