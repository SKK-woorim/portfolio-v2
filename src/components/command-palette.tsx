"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useChatbot } from "@/components/chatbot/chatbot-context";

const OPEN_EVENT = "portfolio:open-command-palette";

type PaletteEntry = { group: string; title: string; hint: string; run: () => void };

export function CommandPaletteTrigger() {
  return (
    <button type="button" className="cmdk-trigger focus-ring" aria-label="검색 열기" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      <Search size={15} aria-hidden="true" />
      <span className="cmdk-label">검색</span>
      <kbd>⌘K</kbd>
    </button>
  );
}

type CommandPaletteProps = {
  projects: { slug: string; title: string; period: string }[];
  posts: { slug: string; title: string; category: string }[];
  email: string;
};

/** ⌘K로 여는 페이지·프로젝트·글 이동과 챗봇 질문 팔레트. */
export function CommandPalette({ projects, posts, email }: CommandPaletteProps) {
  const router = useRouter();
  const chatbot = useChatbot();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const openPalette = useCallback(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuery("");
    setSelected(0);
    setOpen(true);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    window.requestAnimationFrame(() => restoreFocusRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) closePalette(); else openPalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_EVENT, openPalette);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_EVENT, openPalette);
    };
  }, [closePalette, open, openPalette]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const chatAvailable = Boolean(chatbot && chatbot.runtimeAvailability !== "disabled" && chatbot.runtimeAvailability !== "unavailable");

  const entries = useMemo<PaletteEntry[]>(() => {
    const go = (href: string) => () => router.push(href);
    const base: PaletteEntry[] = [
      ...projects.map((project) => ({ group: "프로젝트", title: project.title, hint: project.period, run: go(`/portfolio/${project.slug}`) })),
      ...posts.map((post) => ({ group: "글", title: post.title, hint: post.category, run: go(`/blog/${post.slug}`) })),
      { group: "페이지", title: "소개", hint: "/about", run: go("/about") },
      { group: "페이지", title: "포트폴리오", hint: "/portfolio", run: go("/portfolio") },
      { group: "페이지", title: "블로그", hint: "/blog", run: go("/blog") },
      { group: "페이지", title: "연락처", hint: "/contact", run: go("/contact") },
      { group: "바로가기", title: "이메일 주소 복사", hint: email, run: () => void navigator.clipboard?.writeText(email).catch(() => undefined) },
    ];
    if (chatbot) base.push({ group: "바로가기", title: "포트폴리오 도우미 열기", hint: "챗봇", run: () => chatbot.openPanel() });
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = normalized ? base.filter((entry) => `${entry.title} ${entry.hint} ${entry.group}`.toLocaleLowerCase().includes(normalized)) : base;
    if (normalized && chatbot && chatAvailable) {
      const question = query.trim().slice(0, 500);
      filtered.push({ group: "챗봇", title: `“${question}” 물어보기`, hint: "포트폴리오 도우미", run: () => chatbot.openPanel(question) });
    }
    return filtered;
  }, [chatAvailable, chatbot, email, posts, projects, query, router]);

  if (!open) return null;
  const activeIndex = Math.min(selected, Math.max(0, entries.length - 1));

  function choose(entry: PaletteEntry | undefined) {
    if (!entry) return;
    setOpen(false);
    entry.run();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); closePalette(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setSelected((activeIndex + 1) % Math.max(1, entries.length)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setSelected((activeIndex - 1 + entries.length) % Math.max(1, entries.length)); }
    else if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); choose(entries[activeIndex]); }
  }

  let lastGroup = "";
  return (
    <div className="cmdk-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) closePalette(); }}>
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="검색" onKeyDown={handleKeyDown}>
        <div className="cmdk-input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            placeholder="프로젝트, 글, 페이지 검색"
            aria-label="검색어"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={entries.length ? `${listId}-${activeIndex}` : undefined}
            autoComplete="off"
            onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
          />
        </div>
        <ul id={listId} role="listbox" aria-label="검색 결과">
          {entries.length === 0 ? <li className="cmdk-empty">결과가 없어요.</li> : null}
          {entries.map((entry, index) => {
            const heading = entry.group !== lastGroup ? entry.group : null;
            lastGroup = entry.group;
            return [
              heading ? <li key={`group-${heading}`} className="cmdk-group" role="presentation">{heading}</li> : null,
              <li
                key={`${entry.group}-${entry.title}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className="cmdk-item"
                onMouseEnter={() => setSelected(index)}
                onClick={() => choose(entry)}
              >
                <span>{entry.title}</span>
                <small>{entry.hint}</small>
              </li>,
            ];
          })}
        </ul>
        <div className="cmdk-foot" aria-hidden="true"><span>↑↓ 이동</span><span>↵ 열기</span><span>esc 닫기</span></div>
      </div>
    </div>
  );
}
