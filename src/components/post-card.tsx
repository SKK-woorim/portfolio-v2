import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { Tag } from "@/components/tag";
import type { BlogPost } from "@/lib/content/types";
import { formatDate } from "@/lib/utils";

export function PostCard({ post }: { post: BlogPost }) {
  return (
    <article className="post-card flex h-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-[#367fc9] hover:shadow-[0_20px_55px_rgba(0,8,22,.34)]">
      {post.coverImage ? <Link href={`/blog/${post.slug}`} aria-label={`${post.title} 글 보기`} className="focus-ring block"><div className="relative aspect-[16/9] overflow-hidden bg-[var(--primary-soft)]"><Image src={post.coverImage.src} alt={post.coverImage.alt} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition-transform duration-500 hover:scale-[1.02]" /></div></Link> : null}
      <div className="flex flex-1 flex-col p-6 sm:p-8">
      <div className="flex items-center justify-between text-sm text-[var(--body)]">
        <span>{post.category}</span>
        <span className="inline-flex items-center gap-1"><Clock3 size={14} /> {post.readingMinutes}분</span>
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-[-.02em] text-[var(--ink)]"><Link href={`/blog/${post.slug}`} className="focus-ring rounded-sm">{post.title}</Link></h3>
      <p className="mt-3 flex-1 text-sm leading-6 text-[var(--body)]">{post.excerpt}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {post.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </div>
      <div className="mt-7 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-5">
        <span className="text-xs text-[var(--muted)]">{formatDate(post.publishedAt)}</span>
        <Link href={`/blog/${post.slug}`} aria-label={`${post.title} 읽기`} className="focus-ring inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">
          읽기 <ArrowUpRight size={16} />
        </Link>
      </div>
      </div>
    </article>
  );
}
