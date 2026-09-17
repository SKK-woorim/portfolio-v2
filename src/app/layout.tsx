import type { Metadata } from "next";
import "@/app/globals.css";
import { DEFAULT_OG_IMAGE, DEFAULT_OG_IMAGE_PATH, SITE_AUTHOR_NAME, getSiteUrl } from "@/lib/site-metadata";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: `${SITE_AUTHOR_NAME} — AI Engineer Portfolio`,
    template: `%s | ${SITE_AUTHOR_NAME}`,
  },
  description: "AI Agent, RAG, NL2SQL과 ETL 워크플로우를 설계하고 구현하는 AI 엔지니어 송경근의 포트폴리오입니다.",
  applicationName: `${SITE_AUTHOR_NAME} 포트폴리오`,
  authors: [{ name: SITE_AUTHOR_NAME }],
  creator: SITE_AUTHOR_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: `${SITE_AUTHOR_NAME} 포트폴리오`,
    title: `${SITE_AUTHOR_NAME} — AI Engineer Portfolio`,
    description: "AI Agent, RAG, NL2SQL과 ETL 워크플로우를 설계하고 구현하는 AI 엔지니어 송경근의 포트폴리오입니다.",
    images: [DEFAULT_OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_AUTHOR_NAME} — AI Engineer Portfolio`,
    description: "AI Agent, RAG, NL2SQL과 ETL 워크플로우를 설계하고 구현하는 AI 엔지니어 송경근의 포트폴리오입니다.",
    images: [DEFAULT_OG_IMAGE_PATH],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var systemTheme=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";try{var saved=localStorage.getItem("portfolio-color-theme");var preference=saved==="light"||saved==="dark"?saved:"system";document.documentElement.dataset.themePreference=preference;document.documentElement.dataset.siteTheme=preference==="system"?systemTheme:preference}catch(e){document.documentElement.dataset.themePreference="system";document.documentElement.dataset.siteTheme=systemTheme}})()` }} />
        {/* eslint-disable-next-line @next/next/no-css-tags -- self-hosted Pretendard unicode-range subsets are served as a static asset. */}
        <link rel="stylesheet" href="/assets/fonts/pretendard/pretendardvariable-dynamic-subset.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
