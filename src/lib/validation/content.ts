import { z } from "zod";

const slug = z.string().trim().min(3).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "영문 소문자·숫자·하이픈만 사용해 주세요.");
const optionalDate = z.string().trim().optional().transform((value) => value || null);

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
  contentJson: z.string().trim().min(1, "본문을 입력해 주세요.").refine((value) => {
    try { JSON.parse(value); return true; } catch { return false; }
  }, "올바른 본문 형식이 아닙니다."),
  startDate: optionalDate,
  endDate: optionalDate,
  status: z.enum(["draft", "published", "hidden", "trashed"]),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isFeatured: z.coerce.boolean().default(false),
  tagNames: z.string().trim().max(500).optional(),
});

export const postInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(160),
  slug,
  excerpt: z.string().trim().min(1, "요약을 입력해 주세요.").max(300),
  contentJson: z.string().trim().min(1, "본문을 입력해 주세요.").refine((value) => {
    try { JSON.parse(value); return true; } catch { return false; }
  }, "올바른 본문 형식이 아닙니다."),
  categoryId: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "published", "private", "trashed"]),
  seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(160).optional(),
  tagNames: z.string().trim().max(500).optional(),
});

export const siteProfileInputSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  roleTitle: z.string().trim().min(1).max(120),
  headline: z.string().trim().min(1).max(180),
  bio: z.string().trim().min(1).max(600),
  email: z.string().trim().email(),
  socialLinks: z.string().trim().default("[]").refine((value) => {
    try { return Array.isArray(JSON.parse(value)); } catch { return false; }
  }, "외부 링크 형식이 올바르지 않습니다."),
});

export type FormState = { error?: string; success?: string };
