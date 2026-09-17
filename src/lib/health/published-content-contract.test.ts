import { beforeEach, describe, expect, it, vi } from "vitest";

const healthMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: healthMocks.createClient }));
vi.mock("@/lib/supabase/config", () => ({
  getSupabaseConfig: () => ({ url: "https://supabase.example", publishableKey: "public-key" }),
  hasSupabaseConfig: () => true,
}));

import { readPublishedContent } from "./readiness";

function createQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    limit: vi.fn(),
    abortSignal: vi.fn(),
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve(resolve({ error: null })),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.abortSignal.mockReturnValue(query);
  return query;
}

describe("published content readiness contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("probes the explicit posts media relationships used by the public repository", async () => {
    const portfolioQuery = createQuery();
    const postsQuery = createQuery();
    const client = {
      from: vi.fn()
        .mockReturnValueOnce(portfolioQuery)
        .mockReturnValueOnce(postsQuery),
    };
    healthMocks.createClient.mockReturnValue(client);

    await readPublishedContent(new AbortController().signal);

    expect(postsQuery.select).toHaveBeenCalledWith(expect.stringContaining("media!posts_cover_media_id_fkey"));
    expect(postsQuery.select).toHaveBeenCalledWith(expect.stringContaining("post_media!post_media_post_id_fkey"));
    expect(postsQuery.select).toHaveBeenCalledWith(expect.stringContaining("media!post_media_media_id_fkey"));
  });
});
