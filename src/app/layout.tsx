import type { Metadata } from "next";
import "@/app/globals.css";
import { AuthRecoveryRedirect } from "@/components/admin/auth-recovery-redirect";

export const metadata: Metadata = {
  title: {
    default: "Woorim Kim — Portfolio",
    template: "%s | Woorim Kim",
  },
  description: "복잡한 문제를 이해하기 쉬운 디지털 경험으로 바꾸는 개발자의 포트폴리오입니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" crossOrigin="anonymous" />
      </head>
      <body><AuthRecoveryRedirect />{children}</body>
    </html>
  );
}
