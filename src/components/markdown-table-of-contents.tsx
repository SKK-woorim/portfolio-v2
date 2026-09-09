import { List } from "lucide-react";
import { getMarkdownHeadings } from "@/components/markdown-content";

export function MarkdownTableOfContents({ markdown }: { markdown: string }) {
  const headings = getMarkdownHeadings(markdown).filter((heading) => heading.level === 2);
  if (headings.length < 3) return null;
  return <nav aria-label="이 글의 내용" className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 lg:sticky lg:top-28"><h2 className="inline-flex items-center gap-2 font-semibold text-[var(--ink)]"><List size={17} /> 이 글의 내용</h2><ol className="mt-4 grid gap-3 border-l border-[var(--border)] pl-4 text-sm">{headings.map((heading) => <li key={heading.id}><a href={`#${heading.id}`} className="focus-ring text-[var(--body)] hover:text-[var(--primary)]">{heading.text}</a></li>)}</ol></nav>;
}
