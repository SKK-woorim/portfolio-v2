import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ChatSource, ChatSourceType } from "./chatbot-types";

const SOURCE_ID_PATTERN = /^S[1-9]\d?$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSourceType(value: unknown): value is ChatSourceType {
  return value === "profile" || value === "portfolio" || value === "post" || value === "blog";
}

export function getVerifiedSourceUrl(type: ChatSourceType, url: string): string | null {
  if (type === "profile") return url === "/about" ? url : null;

  const prefix = type === "portfolio" ? "/portfolio/" : "/blog/";
  if (!url.startsWith(prefix)) return null;
  const slug = url.slice(prefix.length);
  return SLUG_PATTERN.test(slug) ? url : null;
}

export function sanitizeChatSources(value: unknown): ChatSource[] {
  if (!Array.isArray(value)) return [];

  const sources: ChatSource[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || !SOURCE_ID_PATTERN.test(String(item.id ?? "")) || !isSourceType(item.type)) continue;

    const title = typeof item.title === "string" ? item.title.trim() : "";
    const url = typeof item.url === "string" ? getVerifiedSourceUrl(item.type, item.url) : null;
    const id = String(item.id);
    if (!title || title.length > 160 || !url || seenIds.has(id) || seenUrls.has(url)) continue;

    sources.push({ id, title, type: item.type, url });
    seenIds.add(id);
    seenUrls.add(url);
    if (sources.length === 3) break;
  }

  return sources;
}

function sourceTypeLabel(type: ChatSourceType) {
  if (type === "profile") return "소개";
  if (type === "portfolio") return "포트폴리오";
  return "블로그";
}

export function ChatbotSources({ sources, onNavigate }: { sources: ChatSource[]; onNavigate?: () => void }) {
  const verifiedSources = sanitizeChatSources(sources);
  if (verifiedSources.length === 0) return null;

  return (
    <nav className="chatbot-sources" aria-label="답변 출처">
      <p className="chatbot-sources-title">관련 공개 자료</p>
      <ul>
        {verifiedSources.map((source) => (
          <li key={`${source.id}-${source.url}`}>
            <Link className="chatbot-source-link focus-ring" href={source.url} onClick={onNavigate}>
              <span className="chatbot-source-id">{source.id}</span>
              <span className="chatbot-source-copy">
                <span>{source.title}</span>
                <small>{sourceTypeLabel(source.type)}</small>
              </span>
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
