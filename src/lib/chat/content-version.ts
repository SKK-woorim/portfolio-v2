import { createHash } from "node:crypto";

export type ContentVersionInput = {
  profile: { displayName: string; roleTitle: string; headline: string; bio: string; email: string; skills: string[]; socialLinks: { label: string; href: string }[] };
  projects: { slug: string; updatedAt: string }[];
  posts: { slug: string; updatedAt: string }[];
};

function bySlug(left: { slug: string }, right: { slug: string }) {
  return left.slug < right.slug ? -1 : left.slug > right.slug ? 1 : 0;
}

/**
 * 공개 콘텐츠가 바뀌면 달라지는 짧은 지문. 저장된 챗봇 답변은 만들 때의 지문과
 * 현재 지문이 같을 때만 쓰므로, 콘텐츠를 고치면 저장된 답변은 자동으로 꺼진다.
 */
export function computeContentVersion({ profile, projects, posts }: ContentVersionInput) {
  const canonical = JSON.stringify({
    profile: [profile.displayName, profile.roleTitle, profile.headline, profile.bio, profile.email, profile.skills, profile.socialLinks.map((link) => [link.label, link.href])],
    projects: [...projects].sort(bySlug).map((item) => [item.slug, item.updatedAt]),
    posts: [...posts].sort(bySlug).map((item) => [item.slug, item.updatedAt]),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}
