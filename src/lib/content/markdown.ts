type ContentNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type?: string; attrs?: Record<string, unknown> }[];
  content?: ContentNode[];
};

export type MarkdownDocument = { type: "markdown"; markdown: string };

const blankDocument: MarkdownDocument = { type: "markdown", markdown: "" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function inlineMarkdown(node: ContentNode): string {
  if (node.type === "hardBreak") return "\n";
  if (node.type !== "text") return (node.content ?? []).map(inlineMarkdown).join("");

  return (node.marks ?? []).reduce((value, mark) => {
    switch (mark.type) {
      case "bold": return `**${value}**`;
      case "italic": return `_${value}_`;
      case "strike": return `~~${value}~~`;
      case "code": return `\`${value}\``;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        return href ? `[${value}](${href})` : value;
      }
      default: return value;
    }
  }, node.text ?? "");
}

function blockMarkdown(node: ContentNode, depth = 0): string {
  const children = node.content ?? [];
  const text = () => children.map(inlineMarkdown).join("");
  switch (node.type) {
    case "paragraph": return text();
    case "heading": {
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      return `${"#".repeat(Math.min(Math.max(level, 1), 6))} ${text()}`;
    }
    case "blockquote": return children.map((child) => blockMarkdown(child, depth)).join("\n\n").split("\n").map((line) => `> ${line}`).join("\n");
    case "codeBlock": {
      const language = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      return `\`\`\`${language}\n${text()}\n\`\`\``;
    }
    case "bulletList": return listMarkdown(children, "-", depth);
    case "orderedList": return listMarkdown(children, "1.", depth);
    case "image": {
      const src = typeof node.attrs?.src === "string" ? node.attrs.src : "";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      return src ? `![${alt}](${src})` : "";
    }
    case "horizontalRule": return "---";
    default: return children.map((child) => blockMarkdown(child, depth)).filter(Boolean).join("\n\n");
  }
}

function listMarkdown(items: ContentNode[], marker: "-" | "1.", depth: number): string {
  return items.map((item, index) => {
    const itemChildren = item.content ?? [];
    const content = itemChildren.filter((child) => child.type !== "bulletList" && child.type !== "orderedList")
      .map((child) => blockMarkdown(child, depth + 1)).filter(Boolean).join("\n");
    const nested = itemChildren.filter((child) => child.type === "bulletList" || child.type === "orderedList")
      .map((child) => blockMarkdown(child, depth + 1)).filter(Boolean).join("\n");
    const prefix = marker === "1." ? `${index + 1}.` : marker;
    const indent = "  ".repeat(depth);
    return `${indent}${prefix} ${content}${nested ? `\n${nested}` : ""}`.trimEnd();
  }).join("\n");
}

/** Converts the legacy Tiptap document as well as the current markdown shape. */
export function contentToMarkdown(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    try { return contentToMarkdown(JSON.parse(trimmed)); } catch { return value; }
  }
  if (!isRecord(value)) return "";
  if (value.type === "markdown" && typeof value.markdown === "string") return value.markdown;
  const root = value as ContentNode;
  return (root.content ?? []).map((node) => blockMarkdown(node)).filter(Boolean).join("\n\n");
}

export function toMarkdownDocument(markdown: string): MarkdownDocument {
  return { type: "markdown", markdown: markdown.trim() };
}

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[\s>*#+-]+|^\s*\d+[.)]\s*/gm, "")
    .replace(/[\`*_~]/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export { blankDocument };
