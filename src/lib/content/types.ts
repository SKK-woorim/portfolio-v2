export type ContentStatus = "draft" | "published" | "private" | "hidden" | "trashed";

export type SiteProfile = {
  displayName: string;
  roleTitle: string;
  headline: string;
  bio: string;
  email: string;
  socialLinks: { label: string; href: string }[];
  skills: string[];
};

export type PortfolioLink = {
  label: string;
  href: string;
};

export type PortfolioItem = {
  id: string;
  slug: string;
  title: string;
  type: string;
  period: string;
  summary: string;
  body: string[];
  contentMarkdown?: string;
  tags: string[];
  links: PortfolioLink[];
  featured: boolean;
  accent: "blue" | "sky" | "navy";
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string[];
  contentMarkdown?: string;
  category: string;
  tags: string[];
  publishedAt: string;
  readingMinutes: number;
};
