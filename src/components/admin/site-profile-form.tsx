"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateSiteProfile } from "@/app/admin/actions";
import { inputFieldClass, textareaFieldClass } from "@/components/ui/field-classes";
import type { FormState } from "@/lib/validation/content";
import { FormStatus } from "./form-status";

type SiteProfileValues = { display_name?: string; role_title?: string; headline?: string; bio?: string; skills?: unknown; contact?: { email?: string }; social_links?: unknown };
const initialState: FormState = {};
function skillText(value: unknown) {
  return Array.isArray(value) ? value.filter((skill): skill is string => typeof skill === "string").join(", ") : "";
}

export function SiteProfileForm({ profile }: { profile?: SiteProfileValues | null }) {
  const [state, formAction, pending] = useActionState(updateSiteProfile, initialState);
  return <form action={formAction} className="grid gap-6"><div className="grid gap-5 md:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">이름<input name="displayName" required defaultValue={profile?.display_name} className={inputFieldClass} /></label><label className="grid gap-2 text-sm font-semibold">직무<input name="roleTitle" required defaultValue={profile?.role_title} className={inputFieldClass} /></label></div><label className="grid gap-2 text-sm font-semibold">핵심 한 줄 소개<textarea name="headline" required defaultValue={profile?.headline} rows={2} className={textareaFieldClass(2)} /></label><label className="grid gap-2 text-sm font-semibold">소개<textarea name="bio" required defaultValue={profile?.bio} rows={5} className={textareaFieldClass(5)} /></label><label className="grid gap-2 text-sm font-semibold">기술 스택<input name="skills" defaultValue={skillText(profile?.skills)} placeholder="Python, RAG, PostgreSQL" className={inputFieldClass} /><span className="text-xs font-normal text-[var(--muted)]">쉼표로 구분해 입력합니다. 공개 프로필과 챗봇 지식에 함께 반영됩니다.</span></label><label className="grid gap-2 text-sm font-semibold">공개 이메일<input name="email" required type="email" defaultValue={profile?.contact?.email} className={inputFieldClass} /></label><label className="grid gap-2 text-sm font-semibold">외부 링크 JSON<textarea name="socialLinks" defaultValue={JSON.stringify(profile?.social_links ?? [], null, 2)} rows={5} className={`${textareaFieldClass(5)} font-mono`} /><span className="text-xs font-normal text-[var(--muted)]">{"예: [{\"label\":\"GitHub\",\"href\":\"https://github.com\"}]"}</span></label><FormStatus result={state} error={state.error} success={state.success} /><div><Button type="submit" size="large" disabled={pending}>{pending ? "저장 중…" : "사이트 정보 저장"}</Button></div></form>;
}
