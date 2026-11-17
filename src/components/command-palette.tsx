"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useChatbot } from "@/components/chatbot/chatbot-context";
import { isChatOffline } from "@/components/chatbot/runtime-availability";
import { useDialogLightDismiss } from "@/components/use-dialog-light-dismiss";

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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  useDialogLightDismiss(dialogRef);

  const openPalette = useCallback(() => {
    setQuery("");
    setSelected(0);
    setOpen(true);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const closePalette = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    else setOpen(false);
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

  const chatAvailable = Boolean(chatbot && !isChatOffline(chatbot.runtimeAvailability));

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

  const activeIndex = Math.min(selected, Math.max(0, entries.length - 1));

  function choose(entry: PaletteEntry | undefined) {
    if (!entry) return;
    closePalette();
    entry.run();
  }

  // 검색어 입력에서만 목록을 조작한다. 닫기 버튼에 초점이 있을 때 Enter는 버튼 기본 동작(닫기)을 따른다.
  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setSelected((activeIndex + 1) % Math.max(1, entries.length)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setSelected((activeIndex - 1 + entries.length) % Math.max(1, entries.length)); }
    else if (event.key === "Enter") {
      event.preventDefault();
      // Safari는 IME 확정 Enter보다 compositionend를 먼저 전달해 isComposing이 false일 수 있어 keyCode 229도 함께 본다.
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      choose(entries[activeIndex]);
    }
  }

  let lastGroup = "";
  return (
    <dialog
      ref={dialogRef}
      className="cmdk"
      aria-label="검색"
      onClose={() => setOpen(false)}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      {open ? (
        <>
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
              autoFocus
              onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
              onKeyDown={handleInputKeyDown}
            />
            {/* 터치·음성 제어 사용자도 배경 탭 없이 닫을 수 있게 보이는 닫기 버튼을 둔다. */}
            <button type="button" className="cmdk-close focus-ring" aria-label="검색 닫기" onClick={closePalette}>
              <X size={18} aria-hidden="true" />
            </button>
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
        </>
      ) : null}
    </dialog>
  );
}
