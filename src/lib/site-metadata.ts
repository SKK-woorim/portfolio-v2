import type { Metadata } from "next";

function withProtocol(value: string) {
  return value.includes("://") ? value : `https://${value}`;
}

type SiteUrlEnvironment = {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
  NODE_ENV?: string;
};

export function resolveSiteUrl(environment: SiteUrlEnvironment) {
  const configured = environment.NEXT_PUBLIC_SITE_URL
    || environment.VERCEL_PROJECT_PRODUCTION_URL
    || environment.VERCEL_URL;
  if (!configured && environment.NODE_ENV === "production") {
    throw new Error("A production site URL is required");
  }

  const url = new URL(withProtocol((configured || "http://localhost:3000").trim()).replace(/\/$/, ""));
  if (!["http:", "https:"].includes(url.protocol)
    || url.username
    || url.password
    || (url.pathname !== "/" && url.pathname !== "")
    || url.search
    || url.hash) {
    throw new Error("The site URL must be an HTTP(S) origin without credentials, path, query, or fragment");
  }
  return url;
}

export function getSiteUrl() {
  return resolveSiteUrl(process.env);
}

export function absoluteUrl(path: string) {
  return new URL(path, getSiteUrl()).toString();
}

export function createPageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "ko_KR",
      url: path,
      title,
      description,
      images: [{ url: "/og.png", width: 1200, height: 630, alt: "송경근 AI Engineer Portfolio" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}

export function jsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
