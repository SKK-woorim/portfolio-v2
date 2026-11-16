import * as Sentry from "@sentry/nextjs";
import { cachedAnswers } from "@/lib/chat/cached-answers";
import { getPublicContentSnapshot } from "@/lib/chat/public-content-version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 저장된 답변의 상태. 생성 스크립트가 현재 콘텐츠 지문과 고정 질문 목록을 여기서 읽고,
 * 운영자는 `active`로 저장된 답변이 쓰이고 있는지 확인한다.
 */
export async function GET() {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  try {
    const { contentVersion, questions } = await getPublicContentSnapshot();
    const { file } = cachedAnswers;
    return Response.json({
      contentVersion,
      questions,
      cache: { entries: file.entries.length, generatedAt: file.generatedAt, contentVersion: file.contentVersion, active: cachedAnswers.isCurrent(contentVersion) },
    }, { headers });
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "chat-cached-answers-status" } });
    return Response.json({ code: "CONTENT_UNAVAILABLE" }, { status: 503, headers });
  }
}
