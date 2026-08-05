import { SiteProfileForm } from "@/components/admin/site-profile-form";
import { getAdminSiteProfile } from "@/lib/admin/queries";

export default async function AdminProfilePage() { const profile = await getAdminSiteProfile(); return <div className="mx-auto max-w-4xl"><p className="eyebrow">Site content</p><h1 className="display mt-3 text-4xl">사이트 프로필</h1><p className="mt-3 text-sm text-[var(--body)]">홈, 소개, 연락처에 공통으로 표시되는 정보를 관리합니다.</p><div className="mt-8 rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8"><SiteProfileForm profile={profile} /></div></div>; }
