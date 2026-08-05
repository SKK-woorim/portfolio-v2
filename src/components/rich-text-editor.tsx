"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Bold, Code2, ImagePlus, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const emptyDocument = { type: "doc", content: [{ type: "paragraph" }] };

function parseContent(value?: string) {
  try { return value ? JSON.parse(value) : emptyDocument; } catch { return emptyDocument; }
}

function ToolButton({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onMouseDown={(event) => event.preventDefault()} onClick={onClick} className={cn("focus-ring inline-flex size-9 items-center justify-center rounded-lg text-[var(--body)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]", active && "bg-[var(--primary-soft)] text-[var(--primary)]")}>{children}</button>;
}

export function RichTextEditor({ name, initialValue, label = "본문" }: { name: string; initialValue?: string; label?: string }) {
  const [value, setValue] = useState(() => JSON.stringify(parseContent(initialValue)));
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [StarterKit, Link.configure({ openOnClick: false }), Image],
    content: parseContent(initialValue),
    editorProps: { attributes: { class: "min-h-72 px-4 py-4 outline-none prose prose-slate max-w-none" } },
    onUpdate: ({ editor: currentEditor }) => setValue(JSON.stringify(currentEditor.getJSON())),
  });

  useEffect(() => {
    if (editor) editor.commands.setContent(parseContent(initialValue));
  }, [editor, initialValue]);

  const setLink = () => {
    const url = window.prompt("링크 주소를 입력해 주세요.", editor?.getAttributes("link").href || "");
    if (url === null) return;
    if (!url) editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const addImage = () => {
    const url = window.prompt("미디어 URL을 입력해 주세요.");
    if (url) editor?.chain().focus().setImage({ src: url, alt: "" }).run();
  };

  return <div>
    <label className="mb-2 block text-sm font-semibold text-[var(--ink)]">{label}</label>
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white focus-within:border-2 focus-within:border-[var(--primary-action)]">
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] bg-[#f8fbff] p-2">
        <ToolButton label="굵게" active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={17} /></ToolButton>
        <ToolButton label="기울임" active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={17} /></ToolButton>
        <ToolButton label="링크" active={editor?.isActive("link")} onClick={setLink}><Link2 size={17} /></ToolButton>
        <ToolButton label="이미지 URL 추가" onClick={addImage}><ImagePlus size={17} /></ToolButton>
        <ToolButton label="글머리 목록" active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={17} /></ToolButton>
        <ToolButton label="번호 목록" active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} /></ToolButton>
        <ToolButton label="인용문" active={editor?.isActive("blockquote")} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quote size={17} /></ToolButton>
        <ToolButton label="코드 블록" active={editor?.isActive("codeBlock")} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code2 size={17} /></ToolButton>
      </div>
      <EditorContent editor={editor} />
    </div>
    <input type="hidden" name={name} value={value} />
  </div>;
}
