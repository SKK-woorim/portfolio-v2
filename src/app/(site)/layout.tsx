import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ChatbotWidget } from "@/components/chatbot/chatbot-widget";
import { RouteFocusManager } from "@/components/route-focus-manager";
import { getSiteProfile } from "@/lib/content/repository";

function isChatbotEnabled() {
  const value = process.env.NEXT_PUBLIC_CHATBOT_ENABLED?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const profile = await getSiteProfile();
  return (
    <div className="site-theme page-shell">
      <a className="skip-link" href="#main-content">
        본문으로 건너뛰기
      </a>
      <SiteHeader name={profile.displayName} />
      <RouteFocusManager />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter profile={profile} />
      {isChatbotEnabled() ? <ChatbotWidget /> : null}
    </div>
  );
}
