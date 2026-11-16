/**
 * 포트폴리오·게시글의 발행 상태 머신.
 *
 * 전이를 실제로 확정하는 곳은 DB 함수 `transition_content_status_atomic`
 * (supabase/migrations/202609070002_atomic_content_mutations.sql)이다. 이 파일은 같은 규칙을
 * TypeScript로 옮겨, 서버 액션의 사전 확인과 관리자 화면의 버튼·라벨이 한 표를 보게 한다.
 * DB 규칙을 바꾸면 이 표도 함께 바꾼다.
 *
 *   draft | hidden | private ─publish→ published
 *   published ─unpublish→ draft
 *   휴지통이 아닌 모든 상태 ─trash→ trashed   (직전 상태를 status_before_trash에 남긴다)
 *   trashed ─restore→ 직전 상태 (없으면 draft)
 */
import type { ContentStatus } from "@/lib/content/types";

export const CONTENT_STATUSES = ["draft", "published", "hidden", "private", "trashed"] as const satisfies readonly ContentStatus[];

export const CONTENT_TRANSITIONS = ["publish", "unpublish", "trash", "restore"] as const;
export type ContentTransition = (typeof CONTENT_TRANSITIONS)[number];

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "초안",
  published: "발행",
  hidden: "숨김",
  private: "비공개",
  trashed: "휴지통",
};

const TRANSITION_SOURCES: Record<ContentTransition, readonly ContentStatus[]> = {
  publish: ["draft", "hidden", "private"],
  unpublish: ["published"],
  trash: ["draft", "published", "hidden", "private"],
  restore: ["trashed"],
};

export function isContentStatus(value: unknown): value is ContentStatus {
  return typeof value === "string" && (CONTENT_STATUSES as readonly string[]).includes(value);
}

/** 화면에 보여 줄 상태 이름. 모르는 값은 그대로 보여 준다. */
export function contentStatusLabel(status: string) {
  return isContentStatus(status) ? CONTENT_STATUS_LABELS[status] : status;
}

export function canTransitionContent(status: string, transition: ContentTransition) {
  return isContentStatus(status) && TRANSITION_SOURCES[transition].includes(status);
}

/** 현재 상태에서 실행할 수 있는 전이. 관리자 목록의 버튼 순서와 같다. */
export function availableContentTransitions(status: string): ContentTransition[] {
  return CONTENT_TRANSITIONS.filter((transition) => canTransitionContent(status, transition));
}
