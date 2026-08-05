"use client";

import { useEffect } from "react";

/**
 * Older Supabase recovery emails can return to the site root. Preserve the
 * one-time code (or error fragment) and continue in the dedicated recovery UI.
 */
export function AuthRecoveryRedirect() {
  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const hasRecoveryCode = currentUrl.searchParams.has("code");
    const hasAuthError = currentUrl.hash.includes("error=");

    if (currentUrl.pathname !== "/" || (!hasRecoveryCode && !hasAuthError)) return;

    const activationUrl = new URL("/admin/activate", currentUrl.origin);
    activationUrl.search = currentUrl.search;
    activationUrl.hash = currentUrl.hash;
    window.location.replace(activationUrl.toString());
  }, []);

  return null;
}
