import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdmin } from "@/lib/auth/admin";

export default async function AdminWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdmin();
  // 사이드바(메뉴와 로그아웃)를 건너뛰는 링크. 공개 사이트의 .skip-link를 재사용하고, 대상 <main>은 tabIndex=-1로 포커스를 받는다.
  return <div className="min-h-screen bg-[var(--canvas)] lg:flex">
    <a className="skip-link" href="#admin-main">본문으로 건너뛰기</a>
    <AdminSidebar email={user.email ?? ""} />
    <main id="admin-main" tabIndex={-1} className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">{children}</main>
  </div>;
}
