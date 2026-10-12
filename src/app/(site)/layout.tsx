import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ChatbotProvider } from "@/components/chatbot/chatbot-context";
import { ChatbotWidget } from "@/components/chatbot/chatbot-widget";
import { CommandPalette } from "@/components/command-palette";
import { RouteFocusManager } from "@/components/route-focus-manager";
import { getPublishedPortfolioItems, getPublishedPosts, getSiteProfile } from "@/lib/content/repository";

function isChatbotEnabled() {
  const value = process.env.NEXT_PUBLIC_CHATBOT_ENABLED?.trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [profile, projects, posts] = await Promise.all([getSiteProfile(), getPublishedPortfolioItems(), getPublishedPosts()]);
  const chatbotEnabled = isChatbotEnabled();
  return (
    <ChatbotProvider checkOnMount={chatbotEnabled} disabled={!chatbotEnabled}>
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
        {chatbotEnabled ? <ChatbotWidget /> : null}
        <CommandPalette
          email={profile.email}
          projects={projects.map(({ slug, title, period }) => ({ slug, title, period }))}
          posts={posts.map(({ slug, title, category }) => ({ slug, title, category }))}
        />
      </div>
    </ChatbotProvider>
  );
}
