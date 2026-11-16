/**
 * 고정 문구 질문(홈 추천 질문, 사례별 질문)의 챗봇 답변을 미리 만들어
 * data/chatbot/cached-answers.json에 저장한다.
 *
 * 사용: pnpm chat:cache [--base <사이트 주소>] [--version-base <지문을 읽을 주소>] [--dry-run]
 *
 * - 질문 목록과 현재 콘텐츠 지문은 <version-base>/api/chat/cached-answers에서 읽는다.
 * - 답변은 <base>/api/chat에 캐시 우회 헤더를 붙여 실제 모델로 만든다.
 * - 완료되지 않았거나 근거가 없는 답변은 저장하지 않는다.
 * 저장한 파일은 검토한 뒤 커밋·배포해야 운영에 반영된다.
 */
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { cachedAnswersFileSchema, type CachedAnswer } from "../src/lib/chat/cached-answers";
import { chatSourceSchema } from "../src/lib/chat/contracts";

const DEFAULT_BASE = "https://portfolio-three-chi-dgdi7wj28c.vercel.app";
// pnpm 스크립트는 저장소 루트에서 실행된다.
const OUTPUT = path.resolve(process.cwd(), "data/chatbot/cached-answers.json");
const REQUEST_TIMEOUT_MS = 240_000;
const PAUSE_BETWEEN_QUESTIONS_MS = 13_000; // 세션당 분당 5회 제한 안에서 차례로 보낸다.

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const base = (option("--base") ?? DEFAULT_BASE).replace(/\/$/, "");
const versionBase = (option("--version-base") ?? base).replace(/\/$/, "");
const dryRun = process.argv.includes("--dry-run");

type Snapshot = { contentVersion: string; questions: string[] };
type AskResult = { ok: true; entry: CachedAnswer; seconds: number } | { ok: false; reason: string; retryAfterSeconds?: number };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readSnapshot(): Promise<Snapshot> {
  const response = await fetch(`${versionBase}/api/chat/cached-answers`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${versionBase}/api/chat/cached-answers 응답 ${response.status}`);
  const value = await response.json() as Partial<Snapshot>;
  if (typeof value.contentVersion !== "string" || !Array.isArray(value.questions) || !value.questions.every((item) => typeof item === "string")) {
    throw new Error("콘텐츠 지문 응답 형식이 올바르지 않습니다.");
  }
  return { contentVersion: value.contentVersion, questions: [...new Set(value.questions)] };
}

async function ask(question: string): Promise<AskResult> {
  const startedAt = performance.now();
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", "X-Chat-Cache": "bypass" },
    body: JSON.stringify({ sessionId: randomUUID(), message: question, history: [] }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 429) return { ok: false, reason: "RATE_LIMITED", retryAfterSeconds: Number(response.headers.get("retry-after") ?? 60) };
  if (!response.ok || !response.body) return { ok: false, reason: `HTTP ${response.status}` };

  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let sources: unknown = [];
  let finishReason: string | undefined;
  let cached = false;
  let errorCode: string | undefined;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = /^event: (\S+)$/m.exec(frame)?.[1];
      const data = /^data: (.*)$/m.exec(frame)?.[1];
      if (!event || !data) continue;
      const value = JSON.parse(data) as Record<string, unknown>;
      if (event === "token" && typeof value.delta === "string") answer += value.delta;
      if (event === "sources") sources = value.items;
      if (event === "done") { finishReason = String(value.finishReason); cached = value.cached === true; }
      if (event === "error") errorCode = String(value.code);
    }
  }
  if (errorCode) return { ok: false, reason: errorCode };
  if (cached) return { ok: false, reason: "캐시 우회가 적용되지 않아 저장된 답변이 돌아왔습니다." };
  if (finishReason !== "stop") return { ok: false, reason: `finishReason=${finishReason ?? "없음"}` };
  const parsedSources = chatSourceSchema.array().min(1).max(5).safeParse(sources);
  if (!parsedSources.success) return { ok: false, reason: "근거가 없거나 형식이 올바르지 않습니다." };
  const text = answer.trim();
  if (text.length < 20) return { ok: false, reason: "답변이 너무 짧습니다." };
  return { ok: true, entry: { question, answer: text, sources: parsedSources.data }, seconds: (performance.now() - startedAt) / 1000 };
}

async function main() {
  const before = await readSnapshot();
  console.log(`콘텐츠 지문 ${before.contentVersion} · 질문 ${before.questions.length}개 · 답변 생성 ${base}`);
  const entries: CachedAnswer[] = [];
  const failures: { question: string; reason: string }[] = [];

  for (const [index, question] of before.questions.entries()) {
    if (index > 0) await sleep(PAUSE_BETWEEN_QUESTIONS_MS);
    let result = await ask(question).catch((error: unknown): AskResult => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }));
    if (!result.ok && result.reason === "RATE_LIMITED") {
      const wait = Math.min(Math.max(result.retryAfterSeconds ?? 60, 5), 3_600);
      console.log(`  요청 제한. ${wait}초 뒤 다시 시도합니다.`);
      await sleep(wait * 1000);
      result = await ask(question).catch((error: unknown): AskResult => ({ ok: false, reason: error instanceof Error ? error.message : String(error) }));
    }
    if (result.ok) {
      entries.push(result.entry);
      console.log(`\n[${index + 1}/${before.questions.length}] ${question} (${result.seconds.toFixed(1)}초)\n${result.entry.answer}\n근거: ${result.entry.sources.map((source) => `${source.id} ${source.title} ${source.url}`).join(" | ")}`);
    } else {
      failures.push({ question, reason: result.reason });
      console.log(`\n[${index + 1}/${before.questions.length}] ${question}\n  저장하지 않음: ${result.reason}`);
    }
  }

  const after = await readSnapshot();
  if (after.contentVersion !== before.contentVersion) throw new Error("생성하는 동안 공개 콘텐츠가 바뀌었습니다. 다시 실행해 주세요.");

  const file = cachedAnswersFileSchema.parse({ version: 1, generatedAt: new Date().toISOString(), contentVersion: before.contentVersion, entries });
  console.log(`\n저장 ${entries.length}개, 제외 ${failures.length}개${failures.length ? `: ${failures.map((failure) => `${failure.question} (${failure.reason})`).join("; ")}` : ""}`);
  if (dryRun) return console.log("--dry-run이라 파일을 쓰지 않았습니다.");
  writeFileSync(OUTPUT, `${JSON.stringify(file, null, 2)}\n`);
  console.log(`${path.relative(process.cwd(), OUTPUT)}에 저장했습니다. 답변을 검토한 뒤 커밋·배포하세요.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
