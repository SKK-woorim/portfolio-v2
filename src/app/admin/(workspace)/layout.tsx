import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireAdmin } from "@/lib/auth/admin";

export default async function AdminWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdmin();
  return <div className="min-h-screen bg-[var(--canvas)] lg:flex"><AdminSidebar email={user.email ?? ""} /><main className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">{children}</main></div>;
}
