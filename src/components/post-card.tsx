import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { Tag } from "@/components/tag";
import type { BlogPost } from "@/lib/content/types";
import { formatDate } from "@/lib/utils";

export function PostCard({ post }: { post: BlogPost }) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-[var(--border)] bg-white p-6 transition-shadow hover:shadow-[0_4px_12px_rgba(10,25,48,.08)] sm:p-8">
      <div className="flex items-center justify-between text-sm text-[var(--body)]">
        <span>{post.category}</span>
        <span className="inline-flex items-center gap-1"><Clock3 size={14} /> {post.readingMinutes}분</span>
      </div>
      <h3 className="mt-5 text-xl font-semibold tracking-[-.02em] text-[var(--ink)]">{post.title}</h3>
      <p className="mt-3 flex-1 text-sm leading-6 text-[var(--body)]">{post.excerpt}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {post.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
      </div>
      <div className="mt-7 flex items-center justify-between gap-4 border-t border-[var(--border)] pt-5">
        <span className="text-xs text-[var(--muted)]">{formatDate(post.publishedAt)}</span>
        <Link href={`/blog/${post.slug}`} className="focus-ring inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">
          읽기 <ArrowUpRight size={16} />
        </Link>
      </div>
    </article>
  );
}
