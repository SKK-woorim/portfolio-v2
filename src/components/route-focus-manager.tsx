"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/** Return focus to the page landmark after client-side route changes. */
export function RouteFocusManager() {
  const pathname = usePathname();
  const initialPathRef = useRef(pathname);

  useEffect(() => {
    if (pathname === initialPathRef.current) return;
    initialPathRef.current = pathname;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("main-content")?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
