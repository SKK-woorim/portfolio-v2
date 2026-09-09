/* eslint-disable @next/next/no-img-element -- Markdown allows external user-provided image URLs. */
import { Fragment, type ReactNode } from "react";

type ListEntry = { text: string; children: ListGroup[] };
type ListGroup = { ordered: boolean; entries: ListEntry[] };
export type MarkdownHeading = { level: number; text: string; id: string };

function plainHeadingText(value: string) {
  return value.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[\\`*_~]/g, "").trim();
}

function headingBaseId(value: string) {
  const normalized = plainHeadingText(value).normalize("NFKC").toLocaleLowerCase();
  return normalized.replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-+|-+$/g, "") || "section";
}

export function getMarkdownHeadings(markdown: string): MarkdownHeading[] {
  const used = new Map<string, number>();
  let inCodeFence = false;
  return markdown.replace(/\r\n?/g, "\n").split("\n").flatMap((line) => {
    if (/^```/.test(line)) {
      inCodeFence = !inCodeFence;
      return [];
    }
    if (inCodeFence) return [];
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (!match) return [];
    const baseId = headingBaseId(match[2]);
    const count = (used.get(baseId) ?? 0) + 1;
    used.set(baseId, count);
    return [{ level: match[1].length, text: plainHeadingText(match[2]), id: count === 1 ? baseId : `${baseId}-${count}` }];
  });
}

function safeUrl(value: string, image = false) {
  try {
    const destination = value.trim().replace(/^<([^>]+)>$/, "$1");
    const url = new URL(destination, "https://portfolio.local");
    if (image) return url.protocol === "http:" || url.protocol === "https:" ? destination : null;
    return ["http:", "https:", "mailto:"].includes(url.protocol) || destination.startsWith("/") ? destination : null;
  } catch { return null; }
}

function unescapeMarkdownLabel(value: string) {
  return value.replace(/\\([\\[\]])/g, "$1");
}

function renderInline(value: string): ReactNode[] {
  const pattern = /(!?\[(?:\\.|[^\]])*\]\([^)]*\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
  const result: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) result.push(value.slice(cursor, match.index));
    const token = match[0];
    const key = `${match.index}-${index++}`;
    const image = token.match(/^!\[((?:\\.|[^\]])*)\]\(([^)]*)\)$/);
    const link = token.match(/^\[((?:\\.|[^\]])*)\]\(([^)]*)\)$/);
    if (image) {
      const src = safeUrl(image[2], true);
      result.push(src ? <img key={key} src={src} alt={unescapeMarkdownLabel(image[1])} className="my-5 max-h-[32rem] rounded-xl border border-[var(--border)] object-contain" loading="lazy" decoding="async" /> : unescapeMarkdownLabel(image[1]));
    } else if (link) {
      const href = safeUrl(link[2]);
      result.push(href ? <a key={key} href={href} className="font-medium text-[var(--primary)] underline decoration-[var(--primary)]/30 underline-offset-4 hover:decoration-[var(--primary)]" {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>{unescapeMarkdownLabel(link[1])}</a> : unescapeMarkdownLabel(link[1]));
    } else if (token.startsWith("**") || token.startsWith("__")) result.push(<strong key={key} className="font-semibold text-[var(--ink)]">{token.slice(2, -2)}</strong>);
    else if (token.startsWith("~~")) result.push(<del key={key}>{token.slice(2, -2)}</del>);
    else if (token.startsWith("`")) result.push(<code key={key} className="rounded bg-[var(--primary-soft)] px-1.5 py-0.5 font-mono text-[.9em] text-[var(--ink)]">{token.slice(1, -1)}</code>);
    else result.push(<em key={key}>{token.slice(1, -1)}</em>);
    cursor = match.index + token.length;
  }
  if (cursor < value.length) result.push(value.slice(cursor));
  return result;
}

function listToken(line: string) {
  const match = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.*)$/);
  return match ? { indent: match[1].replace(/\t/g, "  ").length, ordered: /^\d/.test(match[2]), text: match[3] } : null;
}

function parseList(lines: string[]): ListGroup[] {
  const roots: ListGroup[] = [];
  const stack: { indent: number; group: ListGroup; entry?: ListEntry }[] = [];
  for (const line of lines) {
    const token = listToken(line);
    if (!token) continue;
    while (stack.length && token.indent < stack[stack.length - 1].indent) stack.pop();
    let current = stack[stack.length - 1];
    if (!current || token.indent > current.indent || current.group.ordered !== token.ordered) {
      const group: ListGroup = { ordered: token.ordered, entries: [] };
      if (current?.entry && token.indent > current.indent) current.entry.children.push(group);
      else roots.push(group);
      current = { indent: token.indent, group };
      stack.push(current);
    }
    const entry = { text: token.text, children: [] };
    current.group.entries.push(entry);
    current.entry = entry;
  }
  return roots;
}

function RenderList({ group }: { group: ListGroup }) {
  const ListTag = group.ordered ? "ol" : "ul";
  return <ListTag className={group.ordered ? "my-4 list-decimal space-y-1 pl-6" : "my-4 list-disc space-y-1 pl-6"}>{group.entries.map((entry, index) => {
    const task = entry.text.match(/^\[([ xX])\]\s+(.*)$/);
    return <li key={`${entry.text}-${index}`} className="pl-1">{task ? <><input aria-label="완료 상태" type="checkbox" disabled checked={task[1].toLowerCase() === "x"} className="mr-2 accent-[var(--primary)]" />{renderInline(task[2])}</> : renderInline(entry.text)}{entry.children.map((child, childIndex) => <RenderList key={childIndex} group={child} />)}</li>;
  })}</ListTag>;
}

function tableCells(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function isBlockStart(line: string, next?: string) {
  return /^#{1,6}\s+|^>|^```|^---\s*$|^\s*(?:[-+*]|\d+[.)])\s+/.test(line) || (line.includes("|") && Boolean(next?.match(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/)));
}

function renderBlocks(lines: string[], headings: MarkdownHeading[] = []): ReactNode[] {
  const blocks: ReactNode[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const key = `block-${index}`;
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const Tag = `h${heading[1].length}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const styles = ["text-4xl", "text-3xl", "text-2xl", "text-xl", "text-lg", "text-base"];
      const headingId = headings.shift()?.id;
      blocks.push(<Tag key={key} id={headingId} className={`display scroll-mt-28 mt-9 first:mt-0 ${styles[heading[1].length - 1]} leading-tight text-[var(--ink)]`}>{renderInline(heading[2])}</Tag>);
      index++; continue;
    }
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<pre key={key} className="my-6 overflow-x-auto rounded-xl bg-slate-950 p-4 text-sm leading-6 text-slate-100"><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    if (/^>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={key} className="my-6 border-l-4 border-[var(--primary)] bg-[var(--primary-soft)] px-5 py-1 text-[var(--ink)]">{renderBlocks(quote)}</blockquote>);
      continue;
    }
    if (/^---\s*$/.test(line)) { blocks.push(<hr key={key} className="my-8 border-[var(--border)]" />); index++; continue; }
    if (listToken(line)) {
      const listLines: string[] = [];
      while (index < lines.length && (listToken(lines[index]) || !lines[index].trim())) {
        if (listToken(lines[index])) listLines.push(lines[index]);
        index++;
      }
      blocks.push(<Fragment key={key}>{parseList(listLines).map((group, groupIndex) => <RenderList key={groupIndex} group={group} />)}</Fragment>);
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && lines[index + 1].match(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/)) {
      const header = tableCells(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(tableCells(lines[index++]));
      blocks.push(<div key={key} className="my-6 overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead className="bg-[var(--primary-soft)] text-[var(--ink)]"><tr>{header.map((cell, cellIndex) => <th key={cellIndex} className="border border-[var(--border)] px-3 py-2 font-semibold">{renderInline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{header.map((_, cellIndex) => <td key={cellIndex} className="border border-[var(--border)] px-3 py-2 align-top">{renderInline(row[cellIndex] ?? "")}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index], lines[index + 1])) paragraph.push(lines[index++]);
    blocks.push(<p key={key} className="my-5">{renderInline(paragraph.join(" "))}</p>);
  }
  return blocks;
}

export function MarkdownContent({ markdown, className = "" }: { markdown: string; className?: string }) {
  if (!markdown.trim()) return null;
  const headings = getMarkdownHeadings(markdown);
  return <div className={`markdown-content ${className}`.trim()}>{renderBlocks(markdown.replace(/\r\n?/g, "\n").split("\n"), headings)}</div>;
}
