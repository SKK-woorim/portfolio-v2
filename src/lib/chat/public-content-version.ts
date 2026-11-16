import { caseAskQuestions } from "@/lib/chat/case-questions";
import { computeContentVersion } from "@/lib/chat/content-version";
import { chatSuggestions } from "@/lib/content/presentation";
import { getPublishedPortfolioItems, getPublishedPosts, getSiteProfile } from "@/lib/content/repository";

/** 캐시된 공개 콘텐츠 조회로 현재 콘텐츠 지문과 고정 질문 목록을 만든다. */
export async function getPublicContentSnapshot() {
  const [profile, projects, posts] = await Promise.all([getSiteProfile(), getPublishedPortfolioItems(), getPublishedPosts()]);
  return {
    contentVersion: computeContentVersion({ profile, projects, posts }),
    questions: [...chatSuggestions, ...projects.flatMap((project) => caseAskQuestions(project.title))],
  };
}

export async function getPublicContentVersion() {
  return (await getPublicContentSnapshot()).contentVersion;
}
