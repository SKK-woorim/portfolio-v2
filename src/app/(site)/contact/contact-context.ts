export type ContactContext = { kind: "blog" | "portfolio"; slug: string };

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseContactContext(searchParams: { from?: string | string[]; slug?: string | string[] }): ContactContext | null {
  const from = firstQueryValue(searchParams.from);
  const slug = firstQueryValue(searchParams.slug)?.trim();
  if (from !== "blog" && from !== "portfolio") return null;
  if (!slug || slug.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return { kind: from, slug };
}
