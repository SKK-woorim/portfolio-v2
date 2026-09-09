"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "portfolio-color-theme";
const COLOR_SCHEME_QUERY = "(prefers-color-scheme: dark)";
type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

function getSystemTheme(mediaQuery?: MediaQueryList): Theme {
  const query = mediaQuery ?? window.matchMedia(COLOR_SCHEME_QUERY);
  return query.matches ? "dark" : "light";
}

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyPreference(preference: ThemePreference, mediaQuery?: MediaQueryList): Theme {
  const theme = preference === "system" ? getSystemTheme(mediaQuery) : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.siteTheme = theme;
  return theme;
}

export function ThemeToggle() {
  // The inline root-layout script applies the browser preference before paint;
  // this server-safe value is replaced by the actual value on mount.
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const mediaQuery = window.matchMedia(COLOR_SCHEME_QUERY);

    function syncTheme() {
      setTheme(applyPreference(readPreference(), mediaQuery));
    }

    syncTheme();
    window.addEventListener("storage", syncTheme);
    mediaQuery.addEventListener("change", syncTheme);

    return () => {
      window.removeEventListener("storage", syncTheme);
      mediaQuery.removeEventListener("change", syncTheme);
    };
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    applyPreference(nextTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // The visual toggle still works when storage is unavailable.
    }
  }

  const nextAction = theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환";

  return (
    <button
      type="button"
      className="theme-control focus-ring inline-flex size-10 items-center justify-center rounded-full border transition-colors"
      onClick={toggleTheme}
      aria-label={nextAction}
      title={nextAction}
    >
      <Sun className="theme-icon-sun" size={18} aria-hidden="true" />
      <Moon className="theme-icon-moon" size={18} aria-hidden="true" />
    </button>
  );
}
