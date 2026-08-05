import Link from "next/link";

export default function NotFound() { return <main className="grid min-h-screen place-items-center bg-[var(--canvas)] p-6 text-center"><div><p className="eyebrow">404</p><h1 className="display mt-3 text-5xl">페이지를 찾을 수 없습니다.</h1><p className="mt-5 text-[var(--body)]">주소를 다시 확인하거나 홈으로 돌아가 주세요.</p><Link href="/" className="focus-ring mt-8 inline-flex min-h-11 items-center rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-action)]">홈으로 돌아가기</Link></div></main>; }
