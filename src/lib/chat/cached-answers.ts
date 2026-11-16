import { z } from "zod";
import rawCachedAnswers from "../../../data/chatbot/cached-answers.json";
import { chatSourceSchema } from "@/lib/chat/contracts";

const cachedAnswerSchema = z.object({
  question: z.string().trim().min(1).max(500),
  answer: z.string().trim().min(1).max(4_000),
  sources: z.array(chatSourceSchema).min(1).max(5),
}).strict();

export const cachedAnswersFileSchema = z.object({
  version: z.literal(1),
  generatedAt: z.string().datetime().nullable(),
  contentVersion: z.string().regex(/^[0-9a-f]{16}$/).nullable(),
  entries: z.array(cachedAnswerSchema).max(100),
}).strict();

export type CachedAnswer = z.infer<typeof cachedAnswerSchema>;
export type CachedAnswersFile = z.infer<typeof cachedAnswersFileSchema>;

const EMPTY: CachedAnswersFile = { version: 1, generatedAt: null, contentVersion: null, entries: [] };

/** 버튼이 보내는 고정 문구를 찾기 위한 정규화. 뜻이 비슷한 질문을 묶지는 않는다. */
export function normalizeChatQuestion(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function createCachedAnswerLookup(value: unknown) {
  const parsed = cachedAnswersFileSchema.safeParse(value);
  const file = parsed.success ? parsed.data : EMPTY;
  const byQuestion = new Map(file.entries.map((entry) => [normalizeChatQuestion(entry.question), entry]));
  return {
    file,
    /** 질문 문구만으로 후보를 찾는다. 지문 비교는 호출하는 쪽에서 `isCurrent`로 한다. */
    find(message: string): CachedAnswer | undefined {
      return byQuestion.get(normalizeChatQuestion(message));
    },
    isCurrent(contentVersion: string) {
      return file.contentVersion !== null && file.contentVersion === contentVersion;
    },
  };
}

export const cachedAnswers = createCachedAnswerLookup(rawCachedAnswers);

/** 저장된 답변을 실제 스트리밍처럼 나눠 보낼 조각. 코드 포인트 단위라 한글·이모지가 깨지지 않는다. */
export function chunkCachedAnswer(answer: string, size = 24) {
  const points = Array.from(answer);
  const chunks: string[] = [];
  for (let index = 0; index < points.length; index += size) chunks.push(points.slice(index, index + size).join(""));
  return chunks;
}
