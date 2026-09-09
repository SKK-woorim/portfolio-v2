import { z } from "zod";

const slug = z.string().trim().min(3).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "영문 소문자·숫자·하이픈만 사용해 주세요.");
const optionalDate = z.string().trim().optional().transform((value) => value || null);
const optionalTimestamp = z.preprocess(
  (value) => typeof value === "string" && !value.trim() ? undefined : value,
  z.string().datetime({ offset: true }).optional(),
);
const tagNames = z.string().trim().max(500).optional().superRefine((value, context) => {
  const names = [...new Map((value ?? "").split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => [name.toLocaleLowerCase(), name])).values()];
  if (names.length > 50) context.addIssue({ code: "custom", message: "태그는 최대 50개까지 입력할 수 있습니다." });
  if (names.some((name) => name.length > 80)) context.addIssue({ code: "custom", message: "각 태그 이름은 80자 이하여야 합니다." });
});
const inlineMediaIds = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}, z.array(z.string().uuid()).max(200, "본문 이미지는 최대 200개까지 연결할 수 있습니다.").superRefine((ids, context) => {
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "본문 이미지 목록에 중복이 있습니다." });
}).optional());
const skills = z.string().trim().max(1_000, "기술 스택은 1,000자 이하여야 합니다.").transform((value, context) => {
  const items = [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  if (items.length > 50) {
    context.addIssue({ code: "custom", message: "기술 스택은 최대 50개까지 입력할 수 있습니다." });
    return z.NEVER;
  }
  if (items.some((item) => item.length > 80)) {
    context.addIssue({ code: "custom", message: "각 기술 이름은 80자 이하여야 합니다." });
    return z.NEVER;
  }
  return items;
});
const socialLinks = z.string().trim().default("[]").superRefine((value, context) => {
  let links: unknown;
  try {
    links = JSON.parse(value);
  } catch {
    context.addIssue({ code: "custom", message: "외부 링크 JSON 형식이 올바르지 않습니다." });
    return;
  }
  if (!Array.isArray(links)) {
    context.addIssue({ code: "custom", message: "외부 링크는 JSON 배열이어야 합니다." });
    return;
  }
  if (links.length > 20) {
    context.addIssue({ code: "custom", message: "외부 링크는 최대 20개까지 입력할 수 있습니다." });
  }
  for (const link of links) {
    if (!link || typeof link !== "object" || Array.isArray(link)) {
      context.addIssue({ code: "custom", message: "각 외부 링크는 label과 href를 가진 객체여야 합니다." });
      continue;
    }
    const candidate = link as { label?: unknown; href?: unknown };
    const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
    const href = typeof candidate.href === "string" ? candidate.href.trim() : "";
    if (!label || label.length > 60) {
      context.addIssue({ code: "custom", message: "외부 링크 이름은 1~60자로 입력해 주세요." });
    }
    try {
      const url = new URL(href);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe URL");
    } catch {
      context.addIssue({ code: "custom", message: "외부 링크 주소는 인증 정보가 없는 HTTPS URL이어야 합니다." });
    }
  }
});

export const loginSchema = z.object({
  email: z.string().trim().email("올바른 이메일을 입력해 주세요."),
  password: z.string().min(8, "비밀번호를 입력해 주세요."),
});

export const portfolioInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(160),
  slug,
  type: z.string().trim().min(1, "유형을 입력해 주세요.").max(80),
  summary: z.string().trim().min(1, "한 줄 요약을 입력해 주세요.").max(300),
  contentMarkdown: z.string().trim().min(1, "본문을 입력해 주세요.").max(100_000, "본문은 100,000자 이하여야 합니다."),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(["draft", "published", "hidden", "trashed"]),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isFeatured: z.coerce.boolean().default(false),
  tagNames,
  coverMediaId: z.string().uuid().nullable().optional(),
  inlineMediaIds,
  expectedUpdatedAt: optionalTimestamp,
}).superRefine((value, context) => {
  if (value.id && !value.expectedUpdatedAt) {
    context.addIssue({ code: "custom", path: ["expectedUpdatedAt"], message: "편집 버전 정보가 없습니다. 페이지를 새로고침해 주세요." });
  }
});

export const postInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(160),
  slug,
  excerpt: z.string().trim().min(1, "요약을 입력해 주세요.").max(300),
  contentMarkdown: z.string().trim().min(1, "본문을 입력해 주세요.").max(100_000, "본문은 100,000자 이하여야 합니다."),
  categoryId: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "published", "private", "trashed"]),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(160).optional(),
  tagNames,
  coverMediaId: z.string().uuid().nullable().optional(),
  inlineMediaIds,
  expectedUpdatedAt: optionalTimestamp,
}).superRefine((value, context) => {
  if (value.id && !value.expectedUpdatedAt) {
    context.addIssue({ code: "custom", path: ["expectedUpdatedAt"], message: "편집 버전 정보가 없습니다. 페이지를 새로고침해 주세요." });
  }
});

export const siteProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  roleTitle: z.string().trim().min(1).max(120),
  headline: z.string().trim().min(1).max(180),
  bio: z.string().trim().min(1).max(600),
  skills,
  email: z.string().trim().email(),
  socialLinks,
});

export const knowledgeDocumentIdSchema = z.string().uuid("올바른 지식 문서 ID가 아닙니다.");

export const contentCommandSchema = z.object({
  table: z.enum(["portfolio_items", "posts"]),
  id: z.string().uuid("올바른 콘텐츠 ID가 아닙니다."),
});

export const portfolioOrderSchema = z.array(z.string().uuid("올바른 포트폴리오 ID가 아닙니다."))
  .max(500, "한 번에 최대 500개 항목의 순서를 바꿀 수 있습니다.")
  .superRefine((ids, context) => {
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "순서 정보에 중복 항목이 있습니다." });
  });

export const mediaIdSchema = z.string().uuid("올바른 미디어 ID가 아닙니다.");

export type FormState = { error?: string; success?: string };

export type ContentSaveState = FormState & {
  contentId?: string;
  updatedAt?: string;
  slug?: string;
};

export type MediaUploadState = FormState & {
  media?: {
    id: string;
    public_url: string;
    alt: string;
    storage_key: string;
  };
};
