"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

const themeScript = `(function(){var dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;try{var saved=localStorage.getItem("portfolio-color-theme");document.documentElement.dataset.siteTheme=saved==="light"||saved==="dark"?saved:(dark?"dark":"light")}catch(e){document.documentElement.dataset.siteTheme=dark?"dark":"light"}})()`;

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <title>문제가 발생했습니다 | 송경근</title>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {/* eslint-disable-next-line @next/next/no-css-tags -- this document replaces the root layout and must load the self-hosted font itself. */}
        <link rel="stylesheet" href="/assets/fonts/pretendard/pretendardvariable-dynamic-subset.css" />
        <style>{`
          :root { color-scheme: dark; --error-bg: #061426; --error-card: #0b203b; --error-ink: #f5f9ff; --error-copy: #adc2dd; --error-border: #1b416e; --error-primary: #75b6ff; --error-action: #1463c3; }
          :root[data-site-theme="light"] { color-scheme: light; --error-bg: #f7faff; --error-card: #ffffff; --error-ink: #0b1d35; --error-copy: #465d78; --error-border: #c9daef; --error-primary: #0c5fbd; --error-action: #1463c3; }
          * { box-sizing: border-box; }
          body { margin: 0; background: var(--error-bg); color: var(--error-ink); font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
          .error-shell { display: grid; min-height: 100vh; place-items: center; padding: 24px; }
          .error-card { width: min(100%, 620px); padding: clamp(32px, 7vw, 64px); border: 1px solid var(--error-border); border-radius: 28px; background: var(--error-card); text-align: center; }
          .error-eyebrow { margin: 0; color: var(--error-primary); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
          .error-title { margin: 12px 0 0; font-size: clamp(32px, 7vw, 52px); font-weight: 500; letter-spacing: -.04em; line-height: 1.12; }
          .error-copy { margin: 20px 0 0; color: var(--error-copy); line-height: 1.7; }
          .error-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 32px; }
          .error-action { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0 20px; border: 0; border-radius: 999px; background: var(--error-action); color: #fff; font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
          .error-action.secondary { border: 1px solid var(--error-border); background: transparent; color: var(--error-ink); }
          .error-action:focus-visible { outline: 3px solid #78b5ff; outline-offset: 3px; }
        `}</style>
      </head>
      <body>
        <main className="error-shell">
          <section className="error-card" aria-labelledby="global-error-title">
            <p className="error-eyebrow">Something went wrong</p>
            <h1 className="error-title" id="global-error-title">잠시 문제가 발생했습니다.</h1>
            <p className="error-copy">일시적인 오류일 수 있습니다. 다시 시도하거나 홈으로 돌아가 주세요.</p>
            <div className="error-actions">
              <button className="error-action" type="button" onClick={retry}>다시 시도</button>
              <Link className="error-action secondary" href="/">홈으로</Link>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
