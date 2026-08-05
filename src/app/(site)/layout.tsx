import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSiteProfile } from "@/lib/content/repository";

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await getSiteProfile();
  return (
    <div className="page-shell">
      <SiteHeader name={profile.displayName} />
      <main>{children}</main>
      <SiteFooter profile={profile} />
    </div>
  );
}
