"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function BlogError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error, { tags: { area: "public-content:post-list" } });
  }, [error]);

  return (
    <section className="section">
      <div className="container">
        <div className="tech-panel grid gap-4 rounded-3xl p-8 sm:p-10" role="alert" aria-labelledby="blog-error-title">
          <p className="eyebrow">Writing unavailable</p>
          <h1 id="blog-error-title" className="display text-3xl sm:text-4xl">글 목록을 불러오지 못했습니다.</h1>
          <p className="max-w-2xl text-[var(--body)]">일시적인 연결 문제일 수 있습니다. 잠시 후 다시 시도해 주세요.</p>
          <div>
            <button type="button" onClick={reset} className="focus-ring inline-flex min-h-11 items-center rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-action)]">다시 시도</button>
          </div>
        </div>
      </div>
    </section>
  );
}
