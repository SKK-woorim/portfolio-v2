"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-6 text-center"><div><p className="eyebrow">Something went wrong</p><h1 className="display mt-3 text-4xl">잠시 문제가 발생했습니다.</h1><p className="mt-5 text-[var(--body)]">다시 시도하거나 홈으로 돌아가 주세요.</p><div className="mt-8 flex justify-center gap-3"><button onClick={reset} className="focus-ring min-h-11 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-action)]">다시 시도</button><Link href="/" className="focus-ring inline-flex min-h-11 items-center rounded-full bg-[#eaf0f8] px-5 text-sm font-semibold text-[var(--ink)]">홈으로</Link></div></div></main>;
}
