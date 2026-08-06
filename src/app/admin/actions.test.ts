import { beforeEach, describe, expect, it, vi } from "vitest";

const contentMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: contentMocks.createClient }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: contentMocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: contentMocks.revalidatePath }));

import { moveToTrash, publishContent, restoreContent } from "./actions";

function setupContentClient(content: { id: string; slug: string; status: string; status_before_trash?: string | null }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: content, error: null });
  const selectEq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: selectEq });
  const updateEq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: updateEq });
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn((table: string) => table === "audit_logs" ? { insert: auditInsert } : { select, update });
  contentMocks.createClient.mockResolvedValue({ from });
  return { update, updateEq };
}

describe("CMS content status workflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    contentMocks.requireAdmin.mockResolvedValue({ id: "1d4ba08f-0e22-4dcb-839f-96056e30b0e0" });
  });

  it("publishes a draft portfolio item and revalidates public routes", async () => {
    const client = setupContentClient({ id: "item-1", slug: "draft-project", status: "draft" });

    await expect(publishContent("portfolio_items", "item-1")).resolves.toEqual({ success: "발행했습니다." });
    expect(client.update).toHaveBeenCalledWith({ status: "published" });
    expect(client.updateEq).toHaveBeenCalledWith("id", "item-1");
    expect(contentMocks.revalidatePath).toHaveBeenCalledWith("/portfolio");
  });

  it("records the previous status when content moves to trash", async () => {
    const client = setupContentClient({ id: "post-1", slug: "published-post", status: "published" });

    await expect(moveToTrash("posts", "post-1")).resolves.toEqual({ success: "휴지통으로 옮겼습니다. 언제든 복구할 수 있습니다." });
    expect(client.update).toHaveBeenCalledWith({ status: "trashed", status_before_trash: "published" });
  });

  it("restores trashed content to its prior visibility state", async () => {
    const client = setupContentClient({ id: "post-1", slug: "published-post", status: "trashed", status_before_trash: "published" });

    await expect(restoreContent("posts", "post-1")).resolves.toEqual({ success: "발행 상태로 복구했습니다." });
    expect(client.update).toHaveBeenCalledWith({ status: "published", status_before_trash: null });
  });
});
