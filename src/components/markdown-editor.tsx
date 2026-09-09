"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Eye, FileCode2, ImagePlus, Search, X } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { contentToMarkdown } from "@/lib/content/markdown";
import { cn } from "@/lib/utils";
import type { ContentSaveState, MediaUploadState } from "@/lib/validation/content";

export type EditorMedia = {
  id: string;
  public_url: string;
  alt: string;
  storage_key: string;
};

type Selection = { start: number; end: number };
type MediaUploadAction = (previousState: MediaUploadState, formData: FormData) => Promise<MediaUploadState>;
type LocalDraft = { markdown: string; savedAt: number; baseUpdatedAt: string | null };

type MarkdownEditorProps = {
  name: string;
  initialValue?: unknown;
  label?: string;
  media?: EditorMedia[];
  uploadAction?: MediaUploadAction;
  draftKey?: string;
  baseUpdatedAt?: string;
  saveState?: ContentSaveState;
  disabled?: boolean;
};

function isLocalDraft(value: unknown): value is LocalDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<LocalDraft>;
  return typeof draft.markdown === "string"
    && typeof draft.savedAt === "number"
    && (draft.baseUpdatedAt === null || typeof draft.baseUpdatedAt === "string");
}

function escapeMarkdownAlt(alt: string) {
  return alt.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

function toImageMarkdown(alt: string, url: string) {
  return `![${escapeMarkdownAlt(alt)}](<${url}>)`;
}

export function findInlineMediaIds(markdown: string, media: EditorMedia[]) {
  const mediaByUrl = new Map(media.map((item) => [item.public_url, item.id]));
  const urls = markdown.matchAll(/!\[(?:\\.|[^\]])*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^)]*["'])?\s*\)/g);
  const ids = new Set<string>();
  for (const match of urls) {
    const mediaId = mediaByUrl.get(match[1] ?? match[2]);
    if (mediaId) ids.add(mediaId);
  }
  return [...ids];
}

export function MarkdownEditor({ name, initialValue, label = "본문", media = [], uploadAction, draftKey, baseUpdatedAt, saveState, disabled = false }: MarkdownEditorProps) {
  const initialMarkdown = contentToMarkdown(initialValue);
  const [markdown, setMarkdown] = useState(initialMarkdown);
  const [baseline, setBaseline] = useState(initialMarkdown);
  const [availableMedia, setAvailableMedia] = useState(media);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [isMediaDialogOpen, setIsMediaDialogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [alt, setAlt] = useState("");
  const [isDecorative, setIsDecorative] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState("");
  const [uploadDecorative, setUploadDecorative] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, startUpload] = useTransition();
  const [selection, setSelection] = useState<Selection>({ start: markdown.length, end: markdown.length });
  const [announcement, setAnnouncement] = useState("");
  const [recoveryDraft, setRecoveryDraft] = useState<LocalDraft | null>(null);
  const [draftReady, setDraftReady] = useState(!draftKey);
  const [localSavedAt, setLocalSavedAt] = useState<number | null>(null);
  const [draftStorageError, setDraftStorageError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageButtonRef = useRef<HTMLButtonElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousStorageKeyRef = useRef<string | null>(null);
  const handledSaveStateRef = useRef<ContentSaveState | undefined>(undefined);

  const storageKey = draftKey ? `portfolio-cms-draft:${draftKey}` : null;
  const dirty = markdown !== baseline;

  const selectedMedia = availableMedia.find((item) => item.id === selectedMediaId) ?? null;
  const inlineMediaIds = useMemo(() => findInlineMediaIds(markdown, availableMedia), [markdown, availableMedia]);
  const visibleMedia = availableMedia.filter((item) => {
    const needle = query.trim().toLocaleLowerCase();
    return !needle || `${item.alt} ${item.storage_key}`.toLocaleLowerCase().includes(needle);
  });

  useEffect(() => {
    if (isMediaDialogOpen) dialogTitleRef.current?.focus();
  }, [isMediaDialogOpen]);

  useEffect(() => {
    if (!storageKey) return;
    const timeout = window.setTimeout(() => {
      setDraftReady(false);
      setRecoveryDraft(null);
      setLocalSavedAt(null);
      try {
        const raw = localStorage.getItem(storageKey);
        const stored = raw ? JSON.parse(raw) : null;
        if (isLocalDraft(stored) && stored.markdown !== baseline) setRecoveryDraft(stored);
        setDraftStorageError(false);
      } catch {
        setDraftStorageError(true);
      } finally {
        setDraftReady(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [baseline, storageKey]);

  useEffect(() => {
    if (!storageKey || !draftReady || recoveryDraft || !dirty) return;
    const timeout = window.setTimeout(() => {
      try {
        const savedAt = Date.now();
        const draft: LocalDraft = { markdown, savedAt, baseUpdatedAt: baseUpdatedAt ?? null };
        localStorage.setItem(storageKey, JSON.stringify(draft));
        setLocalSavedAt(savedAt);
        setDraftStorageError(false);
      } catch {
        setDraftStorageError(true);
      }
    }, 750);
    return () => window.clearTimeout(timeout);
  }, [baseUpdatedAt, dirty, draftReady, markdown, recoveryDraft, storageKey]);

  useEffect(() => {
    if (!saveState?.success || handledSaveStateRef.current === saveState) return;
    handledSaveStateRef.current = saveState;
    const timeout = window.setTimeout(() => {
      setBaseline(markdown);
      setRecoveryDraft(null);
      setLocalSavedAt(null);
      try {
        if (storageKey) localStorage.removeItem(storageKey);
        if (previousStorageKeyRef.current) localStorage.removeItem(previousStorageKeyRef.current);
      } catch {
        setDraftStorageError(true);
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [markdown, saveState, storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    const previous = previousStorageKeyRef.current;
    previousStorageKeyRef.current = storageKey;
    if (previous && previous !== storageKey && saveState?.success) {
      try { localStorage.removeItem(previous); } catch { /* The save effect reports storage failures. */ }
    }
  }, [saveState?.success, storageKey]);

  useEffect(() => {
    if (!dirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const warnBeforeLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target === "_blank" || target.hasAttribute("download")) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.href === window.location.href || destination.hash && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      if (!window.confirm("저장하지 않은 본문 변경이 있습니다. 페이지를 이동할까요?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnBeforeLink, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnBeforeLink, true);
    };
  }, [dirty]);

  function rememberSelection() {
    const textarea = textareaRef.current;
    if (textarea) setSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
  }

  function openMediaDialog() {
    rememberSelection();
    setQuery("");
    setSelectedMediaId(null);
    setAlt("");
    setIsDecorative(false);
    setUploadFile(null);
    setUploadAlt("");
    setUploadDecorative(false);
    setUploadError("");
    setIsMediaDialogOpen(true);
  }

  function closeMediaDialog() {
    setIsMediaDialogOpen(false);
    requestAnimationFrame(() => imageButtonRef.current?.focus());
  }

  function selectMedia(item: EditorMedia) {
    setSelectedMediaId(item.id);
    setAlt(item.alt);
    setIsDecorative(false);
  }

  function insertMedia(item: EditorMedia, imageAlt: string, decorative: boolean, uploaded = false) {
    if (!decorative && !imageAlt.trim()) return;
    const imageMarkdown = toImageMarkdown(decorative ? "" : imageAlt.trim(), item.public_url);
    const nextMarkdown = `${markdown.slice(0, selection.start)}${imageMarkdown}${markdown.slice(selection.end)}`;
    const cursorPosition = selection.start + imageMarkdown.length;
    setMarkdown(nextMarkdown);
    setSelection({ start: cursorPosition, end: cursorPosition });
    setAnnouncement(`${item.alt || item.storage_key} 이미지를 ${uploaded ? "업로드하고 " : ""}본문에 넣었습니다.`);
    closeMediaDialog();
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  function insertImage() {
    if (!selectedMedia) return;
    insertMedia(selectedMedia, alt, isDecorative);
  }

  function uploadAndInsert() {
    if (!uploadAction || !uploadFile || (!uploadDecorative && !uploadAlt.trim())) return;
    setUploadError("");
    const formData = new FormData();
    formData.set("file", uploadFile);
    formData.set("alt", uploadAlt.trim());
    if (uploadDecorative) formData.set("decorative", "true");
    startUpload(async () => {
      const result = await uploadAction({}, formData);
      if (result.error || !result.media) {
        setUploadError(result.error ?? "업로드 결과를 확인하지 못했습니다.");
        return;
      }
      setAvailableMedia((current) => [result.media!, ...current.filter((item) => item.id !== result.media!.id)]);
      insertMedia(result.media, uploadAlt, uploadDecorative, true);
    });
  }

  function onDialogKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMediaDialog();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (disabled) return;
    if ((event.metaKey || event.ctrlKey) && event.key === "i") {
      event.preventDefault();
      openMediaDialog();
    }
  }

  function restoreLocalDraft() {
    if (!recoveryDraft) return;
    setMarkdown(recoveryDraft.markdown);
    setRecoveryDraft(null);
    setLocalSavedAt(recoveryDraft.savedAt);
    setAnnouncement("브라우저에 임시 저장된 본문을 복원했습니다.");
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function discardLocalDraft() {
    try {
      if (storageKey) localStorage.removeItem(storageKey);
      setDraftStorageError(false);
    } catch {
      setDraftStorageError(true);
    }
    setRecoveryDraft(null);
    setLocalSavedAt(null);
    setAnnouncement("브라우저 임시 저장본을 삭제했습니다.");
  }

  return <div>
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <label htmlFor={name} className="text-sm font-semibold text-[var(--ink)]">{label} <span className="font-normal text-[var(--muted)]">(Markdown)</span></label>
      <div className="flex flex-wrap items-center gap-2">
        <button ref={imageButtonRef} type="button" onClick={openMediaDialog} disabled={disabled} className="focus-ring inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-white px-2.5 text-xs font-semibold text-[var(--ink)] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-50"><ImagePlus size={14} /> 이미지 넣기</button>
        <div role="tablist" aria-label="편집 모드" className="inline-flex rounded-lg border border-[var(--border)] bg-white p-1 text-xs font-semibold">
          <button type="button" role="tab" aria-selected={mode === "write"} onClick={() => setMode("write")} className={cn("focus-ring inline-flex min-h-8 items-center gap-1 rounded-md px-2.5", mode === "write" && "bg-[var(--primary-soft)] text-[var(--primary)]")}><FileCode2 size={14} /> 작성</button>
          <button type="button" role="tab" aria-selected={mode === "preview"} onClick={() => setMode("preview")} className={cn("focus-ring inline-flex min-h-8 items-center gap-1 rounded-md px-2.5", mode === "preview" && "bg-[var(--primary-soft)] text-[var(--primary)]")}><Eye size={14} /> 미리보기</button>
        </div>
      </div>
    </div>
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white focus-within:border-2 focus-within:border-[var(--primary-action)]">
      {mode === "write" ? <textarea ref={textareaRef} id={name} name={name} required value={markdown} onChange={(event) => setMarkdown(event.target.value)} onSelect={rememberSelection} onKeyUp={rememberSelection} onClick={rememberSelection} onKeyDown={onEditorKeyDown} disabled={disabled} rows={18} spellCheck className="block min-h-80 w-full resize-y bg-transparent px-4 py-4 font-mono text-sm leading-7 text-[var(--ink)] outline-none disabled:cursor-wait disabled:opacity-60" placeholder={"## 프로젝트 개요\n\n**핵심 성과**를 작성하세요.\n\n- 항목 1\n- 항목 2\n\n```ts\nconst result = '완료';\n```"} /> : <><input type="hidden" name={name} value={markdown} /><div className="min-h-80 px-5 py-4 text-base leading-8 text-[var(--body)]"><MarkdownContent markdown={markdown} /></div></>}
    </div>
    <p className="mt-2 text-xs text-[var(--muted)]">제목(`#`), 굵게(`**텍스트**`), 목록, 인용문(`&gt;`), 코드 블록, 링크, 이미지, 표와 체크 목록을 지원합니다. 이미지 넣기는 Ctrl/Cmd+I로도 열 수 있습니다.</p>
    {storageKey ? <div className="mt-3" aria-live="polite">
      {recoveryDraft ? <div className="rounded-xl border border-[#e5b45b] bg-[#fff8e8] px-4 py-3 text-sm text-[#775017]">
        <p className="font-semibold">브라우저에 임시 저장된 본문이 있습니다.</p>
        <p className="mt-1 text-xs leading-5">{recoveryDraft.baseUpdatedAt && baseUpdatedAt && recoveryDraft.baseUpdatedAt !== baseUpdatedAt ? "서버 글이 바뀐 뒤 남은 임시본입니다. 복원 후 차이를 확인해 주세요." : "현재 서버본과 비교한 뒤 복원하거나 삭제할 수 있습니다."}</p>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={restoreLocalDraft} disabled={disabled} className="focus-ring min-h-9 rounded-full bg-[var(--primary)] px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">임시본 복원</button><button type="button" onClick={discardLocalDraft} disabled={disabled} className="focus-ring min-h-9 rounded-full border border-current disabled:cursor-not-allowed disabled:opacity-50">임시본 삭제</button></div>
      </div> : <p className="text-xs text-[var(--muted)]">{dirty ? localSavedAt ? `저장되지 않은 변경 · ${new Date(localSavedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 브라우저 임시 저장` : "저장되지 않은 변경 · 잠시 후 브라우저에 임시 저장" : "서버에 저장된 본문과 동일"}</p>}
      {draftStorageError ? <p role="alert" className="mt-1 text-xs text-[#a22b38]">이 브라우저에서는 임시 저장을 사용할 수 없습니다.</p> : null}
    </div> : null}
    <input type="hidden" name="inlineMediaIds" value={JSON.stringify(inlineMediaIds)} />
    <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
    {isMediaDialogOpen ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeMediaDialog(); }}>
      <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${name}-media-dialog-title`} className="max-h-[min(46rem,calc(100vh-2rem))] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-6" onKeyDown={onDialogKeyDown}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 ref={dialogTitleRef} id={`${name}-media-dialog-title`} tabIndex={-1} className="text-xl font-semibold outline-none">본문 이미지 넣기</h2><p className="mt-1 text-sm text-[var(--body)]">자산을 고른 뒤 대체 텍스트를 확인해 본문 커서 위치에 삽입합니다.</p></div>
          <button type="button" onClick={closeMediaDialog} className="focus-ring inline-grid size-10 shrink-0 place-items-center rounded-full text-[var(--body)] hover:bg-[#f2f5f9]" aria-label="이미지 선택 닫기"><X size={18} /></button>
        </div>
        {uploadAction ? <div className="mt-5 grid gap-3 rounded-2xl border border-[var(--border)] bg-[#f8fbff] p-4">
          <div><h3 className="text-sm font-semibold text-[var(--ink)]">새 이미지 바로 올리기</h3><p className="mt-1 text-xs leading-5 text-[var(--muted)]">실제 파일 형식을 검사하고 WebP로 최적화한 뒤 현재 커서에 바로 넣습니다.</p></div>
          <label className="grid gap-2 text-sm font-semibold">새 이미지 파일<input aria-label="새 이미지 파일" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={disabled} onChange={(event) => { setUploadFile(event.target.files?.[0] ?? null); setUploadError(""); }} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-normal disabled:cursor-not-allowed disabled:opacity-60" /></label>
          <label className="grid gap-2 text-sm font-semibold">새 이미지 대체 텍스트<input aria-label="새 이미지 대체 텍스트" value={uploadAlt} onChange={(event) => setUploadAlt(event.target.value)} maxLength={200} disabled={disabled || uploadDecorative} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)] disabled:cursor-not-allowed disabled:bg-[#eef1f5]" placeholder="이미지를 설명하는 문장" /></label>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={uploadDecorative} disabled={disabled} onChange={(event) => setUploadDecorative(event.target.checked)} /> 새 이미지는 장식용입니다 (빈 alt 허용)</label>
          {uploadError ? <p role="alert" className="rounded-xl bg-[#fff0f1] px-3 py-2 text-sm text-[#a22b38]">{uploadError}</p> : null}
          <div><button type="button" onClick={uploadAndInsert} disabled={disabled || isUploading || !uploadFile || (!uploadDecorative && !uploadAlt.trim())} className="focus-ring min-h-10 rounded-full bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{isUploading ? "검사·최적화 중…" : "업로드하고 본문에 넣기"}</button></div>
        </div> : null}
        <label className="mt-5 flex min-h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3"><Search size={16} aria-hidden="true" className="text-[var(--muted)]" /><span className="sr-only">미디어 검색</span><input autoFocus value={query} disabled={disabled} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60" placeholder="파일명 또는 대체 텍스트로 검색" /></label>
        <div className="mt-4 grid max-h-72 gap-3 overflow-y-auto sm:grid-cols-2">
          {visibleMedia.map((item) => <button key={item.id} type="button" aria-pressed={item.id === selectedMediaId} disabled={disabled} onClick={() => selectMedia(item)} className={cn("focus-ring grid grid-cols-[88px_1fr] gap-3 rounded-2xl border p-2 text-left disabled:cursor-not-allowed disabled:opacity-60", item.id === selectedMediaId ? "border-[var(--primary-action)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:bg-[#f8fbff]")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.public_url} alt="" className="aspect-square w-full rounded-xl object-cover" />
            <span className="min-w-0 self-center"><span className="block truncate text-sm font-semibold text-[var(--ink)]">{item.alt || item.storage_key}</span><span className="mt-1 block truncate text-xs text-[var(--muted)]">{item.storage_key}</span><span className="mt-2 block text-xs font-semibold text-[var(--primary)]">{item.id === selectedMediaId ? "선택됨" : "선택"}</span></span>
          </button>)}
          {!visibleMedia.length ? <p className="sm:col-span-2 rounded-2xl border border-dashed border-[var(--border)] p-7 text-center text-sm text-[var(--body)]">조건에 맞는 기존 미디어가 없습니다.{uploadAction ? " 위에서 새 이미지를 바로 올릴 수 있습니다." : " 미디어 페이지에서 먼저 업로드해 주세요."}</p> : null}
        </div>
        {selectedMedia ? <div className="mt-5 grid gap-3 rounded-2xl bg-[#f8fbff] p-4"><p className="text-sm font-semibold">선택한 이미지: <span className="font-normal">{selectedMedia.storage_key}</span></p><label className="grid gap-2 text-sm font-semibold">대체 텍스트 <input value={alt} onChange={(event) => setAlt(event.target.value)} maxLength={200} disabled={disabled || isDecorative} aria-describedby={`${name}-alt-help`} className="min-h-11 rounded-xl border border-[var(--border)] bg-white px-3 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)] disabled:cursor-not-allowed disabled:bg-[#eef1f5]" placeholder="이미지를 설명하는 문장" /></label><p id={`${name}-alt-help`} className="text-xs text-[var(--muted)]">이미지의 의미와 내용을 설명하세요. 장식용이 아닌 이미지는 필수입니다.</p><label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={isDecorative} disabled={disabled} onChange={(event) => setIsDecorative(event.target.checked)} /> 장식용 이미지입니다 (빈 alt 허용)</label></div> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" onClick={closeMediaDialog} className="focus-ring min-h-11 rounded-full border border-[var(--border)] px-5 text-sm font-semibold">취소</button><button type="button" onClick={insertImage} disabled={disabled || !selectedMedia || (!isDecorative && !alt.trim())} className="focus-ring min-h-11 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">본문에 넣기</button></div>
      </section>
    </div> : null}
  </div>;
}
