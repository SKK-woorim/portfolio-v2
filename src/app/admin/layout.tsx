import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};

// 관리자 화면은 라이트 전용이라 다크 OS에서도 CSS 적용 전 캔버스가 어둡게 칠해지지 않게 한다.
export const viewport: Viewport = {
  colorScheme: "light",
};

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
