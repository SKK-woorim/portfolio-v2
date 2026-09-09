import { beforeEach, describe, expect, it, vi } from "vitest";

const contentMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: contentMocks.createClient }));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: contentMocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: contentMocks.revalidatePath, updateTag: contentMocks.updateTag }));

import {
  deleteMedia,
  moveToTrash,
  publishContent,
  reindexAllKnowledgeDocuments,
  reindexKnowledgeDocument,
  reorderPortfolioItems,
  restoreContent,
  savePortfolio,
  savePost,
  setChatbotRuntimeEnabled,
  updateMediaAlt,
  updateSiteProfile,
  uploadMedia,
} from "./actions";

const ITEM_ID = "1d4ba08f-0e22-4dcb-839f-96056e30b0e0";
const POST_ID = "26ed78d5-f82c-437c-a093-a97addf70020";
const COVER_ID = "b9ea1a8f-b97d-441d-86d9-873e2a56b80f";
const INLINE_ID = "a9d67a95-a44b-43a5-8bda-a568795a66c2";
const UPDATED_AT = "2026-09-07T12:00:00.000Z";

function setupContentClient(content: { id: string; slug: string; status: string; status_before_trash?: string | null }) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: content, error: null });
  const selectEq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq: selectEq });
  const from = vi.fn(() => ({ select }));
  const nextStatus = content.status === "trashed" ? (content.status_before_trash ?? "draft") : "published";
  const rpc = vi.fn().mockResolvedValue({ data: { slug: content.slug, status: nextStatus }, error: null });
  contentMocks.createClient.mockResolvedValue({ from, rpc });
  return { rpc };
}

describe("CMS content status workflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    contentMocks.requireAdmin.mockResolvedValue({ id: "1d4ba08f-0e22-4dcb-839f-96056e30b0e0" });
  });

  it("publishes a draft portfolio item and revalidates public routes", async () => {
    const client = setupContentClient({ id: ITEM_ID, slug: "draft-project", status: "draft" });

    await expect(publishContent("portfolio_items", ITEM_ID)).resolves.toEqual({ success: "포트폴리오 항목을 발행했습니다. 챗봇 반영을 준비하고 있습니다." });
    expect(client.rpc).toHaveBeenCalledWith("transition_content_status_atomic", {
      p_content_type: "portfolio",
      p_content_id: ITEM_ID,
      p_expected_status: "draft",
      p_transition: "publish",
    });
    expect(contentMocks.revalidatePath).toHaveBeenCalledWith("/portfolio");
  });

  it("records the previous status when content moves to trash", async () => {
    const client = setupContentClient({ id: POST_ID, slug: "published-post", status: "published" });

    await expect(moveToTrash("posts", POST_ID)).resolves.toEqual({ success: "휴지통으로 옮겼습니다. 언제든 복구할 수 있습니다." });
    expect(client.rpc).toHaveBeenCalledWith("transition_content_status_atomic", expect.objectContaining({
      p_expected_status: "published",
      p_transition: "trash",
    }));
  });

  it("restores trashed content to its prior visibility state", async () => {
    const client = setupContentClient({ id: POST_ID, slug: "published-post", status: "trashed", status_before_trash: "published" });

    await expect(restoreContent("posts", POST_ID)).resolves.toEqual({ success: "발행 상태로 복구했습니다." });
    expect(client.rpc).toHaveBeenCalledWith("transition_content_status_atomic", expect.objectContaining({
      p_expected_status: "trashed",
      p_transition: "restore",
    }));
  });

  it("restores hidden portfolio items with the hidden status message", async () => {
    const client = setupContentClient({ id: ITEM_ID, slug: "hidden-project", status: "trashed", status_before_trash: "hidden" });

    await expect(restoreContent("portfolio_items", ITEM_ID)).resolves.toEqual({ success: "숨김 상태로 복구했습니다." });
    expect(client.rpc).toHaveBeenCalledWith("transition_content_status_atomic", expect.objectContaining({
      p_content_type: "portfolio",
      p_transition: "restore",
    }));
  });

  it("restores private posts with the private status message", async () => {
    setupContentClient({ id: POST_ID, slug: "private-post", status: "trashed", status_before_trash: "private" });

    await expect(restoreContent("posts", POST_ID)).resolves.toEqual({ success: "비공개 상태로 복구했습니다." });
  });

  it("surfaces a conditional transition race as a conflict", async () => {
    const client = setupContentClient({ id: ITEM_ID, slug: "draft-project", status: "draft" });
    client.rpc.mockResolvedValue({ data: null, error: { code: "40001", message: "content_status_conflict" } });

    await expect(publishContent("portfolio_items", ITEM_ID)).resolves.toEqual({
      error: "다른 요청에서 상태가 변경되었습니다. 목록을 새로고침해 주세요.",
    });
    expect(contentMocks.revalidatePath).not.toHaveBeenCalled();
  });
});

function portfolioFormData() {
  const data = new FormData();
  data.set("id", ITEM_ID);
  data.set("expectedUpdatedAt", UPDATED_AT);
  data.set("title", "Atomic portfolio");
  data.set("slug", "atomic-portfolio");
  data.set("type", "Project");
  data.set("summary", "Atomic save coverage");
  data.set("contentMarkdown", "## Result\n\nSaved together.");
  data.set("startDate", "");
  data.set("endDate", "");
  data.set("status", "draft");
  data.set("sortOrder", "2");
  data.set("isFeatured", "true");
  data.set("tagNames", "Next.js, Security, Next.js");
  data.set("coverMediaId", COVER_ID);
  data.set("inlineMediaIds", JSON.stringify([INLINE_ID]));
  return data;
}

function postFormData() {
  const data = new FormData();
  data.set("id", POST_ID);
  data.set("expectedUpdatedAt", UPDATED_AT);
  data.set("title", "Atomic post");
  data.set("slug", "atomic-post");
  data.set("excerpt", "Atomic save coverage");
  data.set("contentMarkdown", "## Result\n\nSaved together.");
  data.set("categoryId", "");
  data.set("status", "draft");
  data.set("tagNames", "Database, Security");
  data.set("coverMediaId", COVER_ID);
  data.set("inlineMediaIds", JSON.stringify([INLINE_ID]));
  return data;
}

describe("atomic CMS save actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    contentMocks.requireAdmin.mockResolvedValue({ id: ITEM_ID });
  });

  it("sends the portfolio row, tags, cover, inline media, and version to one RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: ITEM_ID, slug: "atomic-portfolio", updated_at: UPDATED_AT }, error: null });
    contentMocks.createClient.mockResolvedValue({ rpc });

    await expect(savePortfolio({}, portfolioFormData())).resolves.toEqual({ success: "포트폴리오 항목을 저장했습니다.", contentId: ITEM_ID, slug: "atomic-portfolio", updatedAt: UPDATED_AT });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_portfolio_atomic", {
      p_payload: expect.objectContaining({
        id: ITEM_ID,
        tag_names: ["Next.js", "Security"],
        cover_media_id: COVER_ID,
        inline_media_ids: [INLINE_ID],
      }),
      p_expected_updated_at: UPDATED_AT,
    });
  });

  it("sends the post and all of its relations through one RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: POST_ID, slug: "atomic-post", updated_at: UPDATED_AT }, error: null });
    contentMocks.createClient.mockResolvedValue({ rpc });

    await expect(savePost({}, postFormData())).resolves.toEqual({ success: "게시글을 저장했습니다.", contentId: POST_ID, slug: "atomic-post", updatedAt: UPDATED_AT });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_post_atomic", {
      p_payload: expect.objectContaining({
        id: POST_ID,
        tag_names: ["Database", "Security"],
        cover_media_id: COVER_ID,
        inline_media_ids: [INLINE_ID],
      }),
      p_expected_updated_at: UPDATED_AT,
    });
  });

  it("requires a rendered version before updating existing content", async () => {
    const data = postFormData();
    data.delete("expectedUpdatedAt");

    await expect(savePost({}, data)).resolves.toEqual({ error: "편집 버전 정보가 없습니다. 페이지를 새로고침해 주세요." });
    expect(contentMocks.requireAdmin).not.toHaveBeenCalled();
    expect(contentMocks.createClient).not.toHaveBeenCalled();
  });

  it("does not revalidate when the database rejects a stale save", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "40001", message: "content_version_conflict" } });
    contentMocks.createClient.mockResolvedValue({ rpc });

    await expect(savePost({}, postFormData())).resolves.toEqual({
      error: "다른 곳에서 수정된 글입니다. 최신 내용을 다시 불러온 뒤 다시 저장해 주세요.",
    });
    expect(contentMocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("atomic portfolio ordering and media deletion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    contentMocks.requireAdmin.mockResolvedValue({ id: ITEM_ID });
  });

  it("reorders the complete list with one database command", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { updated_count: 2 }, error: null });
    contentMocks.createClient.mockResolvedValue({ rpc });

    await expect(reorderPortfolioItems([ITEM_ID, POST_ID])).resolves.toEqual({ success: "노출 순서를 저장했습니다." });
    expect(rpc).toHaveBeenCalledWith("reorder_portfolio_items_atomic", { p_ordered_ids: [ITEM_ID, POST_ID] });
  });

  it("rejects duplicate order IDs before authorization or a database call", async () => {
    await expect(reorderPortfolioItems([ITEM_ID, ITEM_ID])).resolves.toEqual({ error: "순서 정보에 중복 항목이 있습니다." });
    expect(contentMocks.requireAdmin).not.toHaveBeenCalled();
  });

  it("uses the storage key returned by the guarded delete RPC", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { storage_key: "trusted/key.webp" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const storageFrom = vi.fn().mockReturnValue({ remove });
    contentMocks.createClient.mockResolvedValue({ rpc, storage: { from: storageFrom } });
    const data = new FormData();
    data.set("id", COVER_ID);

    await expect(deleteMedia({}, data)).resolves.toEqual({ success: "이미지를 삭제했습니다." });

    expect(rpc).toHaveBeenCalledWith("delete_media_atomic", { p_media_id: COVER_ID });
    expect(remove).toHaveBeenCalledWith(["trusted/key.webp"]);
    expect(rpc).toHaveBeenCalledWith("complete_media_deletion", { p_media_id: COVER_ID });
  });

  it("keeps in-use media intact when the guarded delete RPC rejects it", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "23503" } });
    const remove = vi.fn();
    contentMocks.createClient.mockResolvedValue({
      rpc,
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    });
    const data = new FormData();
    data.set("id", COVER_ID);

    await expect(deleteMedia({}, data)).resolves.toEqual({
      error: "사용 중인 이미지는 삭제할 수 없습니다. 사용처를 먼저 해제해 주세요.",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("keeps a retry record when Storage deletion fails", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { storage_key: "trusted/key.webp" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const remove = vi.fn().mockResolvedValue({ error: { message: "temporary" } });
    contentMocks.createClient.mockResolvedValue({
      rpc,
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    });
    const data = new FormData();
    data.set("id", COVER_ID);

    await expect(deleteMedia({}, data)).resolves.toEqual({
      error: "파일 삭제가 완료되지 않아 재시도 목록에 보관했습니다.",
    });
    expect(rpc).toHaveBeenCalledWith("record_media_deletion_failure", { p_media_id: COVER_ID });
    expect(rpc).not.toHaveBeenCalledWith("complete_media_deletion", expect.anything());
  });

  it("reports an incomplete outbox transition when completion recording fails", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { storage_key: "trusted/key.webp" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "temporary database failure" } });
    const remove = vi.fn().mockResolvedValue({ error: null });
    contentMocks.createClient.mockResolvedValue({
      rpc,
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    });
    const data = new FormData();
    data.set("id", COVER_ID);

    await expect(deleteMedia({}, data)).resolves.toEqual({
      error: "파일은 삭제했지만 완료 기록을 남기지 못했습니다. 재시도하면 정리됩니다.",
    });
    expect(remove).toHaveBeenCalledWith(["trusted/key.webp"]);
    expect(rpc).toHaveBeenCalledWith("complete_media_deletion", { p_media_id: COVER_ID });
    expect(rpc).not.toHaveBeenCalledWith("record_media_deletion_failure", expect.anything());
  });

  it("updates media alt text and its audit entry through one RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { id: COVER_ID, alt: "새 설명" }, error: null });
    contentMocks.createClient.mockResolvedValue({ rpc });
    const data = new FormData();
    data.set("id", COVER_ID);
    data.set("alt", "새 설명");

    await expect(updateMediaAlt({}, data)).resolves.toEqual({ success: "대체 텍스트를 저장했습니다." });
    expect(rpc).toHaveBeenCalledWith("update_media_alt_atomic", {
      p_media_id: COVER_ID,
      p_alt: "새 설명",
    });
  });

  it("rejects a file whose declared MIME type does not match real image bytes", async () => {
    const data = new FormData();
    data.set("file", new File(["not an image"], "fake.png", { type: "image/png" }));
    data.set("alt", "위장 파일");

    await expect(uploadMedia({}, data)).resolves.toEqual({ error: "지원하는 실제 이미지 형식이 아닙니다." });
    expect(contentMocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps a committed upload when the registration response is ambiguous", async () => {
    const { default: sharp } = await import("sharp");
    const source = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#1463c3" },
    }).png().toBuffer();
    const upload = vi.fn().mockResolvedValue({ error: null });
    const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: "https://cdn.example/upload.webp" } });
    const remove = vi.fn();
    const storageFrom = vi.fn().mockReturnValue({ upload, getPublicUrl, remove });
    const eq = vi.fn().mockImplementation((_column: string, storageKey: string) => ({
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: COVER_ID,
          public_url: "https://cdn.example/upload.webp",
          alt: "복구 가능한 업로드",
          storage_key: storageKey,
        },
        error: null,
      }),
    }));
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "connection closed" } });
    contentMocks.createClient.mockResolvedValue({ rpc, from, storage: { from: storageFrom } });
    const data = new FormData();
    data.set("file", new File([new Uint8Array(source)], "source.png", { type: "image/png" }));
    data.set("alt", "복구 가능한 업로드");

    const result = await uploadMedia({}, data);

    expect(result.success).toBe("이미지를 검사하고 최적화해 업로드했습니다.");
    expect(result.media).toEqual(expect.objectContaining({ id: COVER_ID }));
    expect(from).toHaveBeenCalledWith("media");
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("atomic site profile action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    contentMocks.requireAdmin.mockResolvedValue({ id: ITEM_ID });
  });

  it("updates profile data and its audit through one RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { updated_at: UPDATED_AT }, error: null });
    contentMocks.createClient.mockResolvedValue({ rpc });
    const data = new FormData();
    data.set("displayName", "송경근");
    data.set("roleTitle", "AI Engineer");
    data.set("headline", "AI와 데이터를 연결합니다.");
    data.set("bio", "RAG와 데이터 워크플로우를 설계하고 구현합니다.");
    data.set("skills", "RAG, Python");
    data.set("email", "swoorim31@gmail.com");
    data.set("socialLinks", '[{"label":"GitHub","href":"https://github.com/SKK-woorim"}]');

    await expect(updateSiteProfile({}, data)).resolves.toEqual({
      success: "사이트 프로필을 저장했습니다. 챗봇 반영을 준비하고 있습니다.",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("update_site_profile_atomic", {
      p_payload: expect.objectContaining({
        email: "swoorim31@gmail.com",
        skills: ["RAG", "Python"],
      }),
    });
  });
});

describe("chatbot reindex actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    contentMocks.requireAdmin.mockResolvedValue({ id: "1d4ba08f-0e22-4dcb-839f-96056e30b0e0" });
  });

  it("validates the document ID before calling the administrator RPC", async () => {
    const rpc = vi.fn();
    contentMocks.createClient.mockResolvedValue({ rpc });
    const formData = new FormData();
    formData.set("documentId", "not-a-uuid");

    await expect(reindexKnowledgeDocument({}, formData)).resolves.toEqual({ error: "올바른 지식 문서 ID가 아닙니다." });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("queues a single document through the protected RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "26ed78d5-f82c-437c-a093-a97addf70020", error: null });
    contentMocks.createClient.mockResolvedValue({ rpc });
    const formData = new FormData();
    formData.set("documentId", "26ed78d5-f82c-437c-a093-a97addf70020");

    await expect(reindexKnowledgeDocument({}, formData)).resolves.toEqual({ success: "재인덱싱 작업을 요청했습니다." });
    expect(rpc).toHaveBeenCalledWith("reindex_knowledge_document", { p_document_id: "26ed78d5-f82c-437c-a093-a97addf70020" });
  });

  it("requires explicit confirmation before queueing every document", async () => {
    const rpc = vi.fn();
    contentMocks.createClient.mockResolvedValue({ rpc });

    await expect(reindexAllKnowledgeDocuments({}, new FormData())).resolves.toEqual({ error: "전체 재인덱싱 확인이 필요합니다." });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("chatbot runtime action", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    contentMocks.requireAdmin.mockResolvedValue({ id: "1d4ba08f-0e22-4dcb-839f-96056e30b0e0" });
  });

  it("changes the connection through the protected administrator RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { enabled: false }, error: null });
    const insert = vi.fn().mockResolvedValue({ error: null });
    contentMocks.createClient.mockResolvedValue({ rpc, from: vi.fn(() => ({ insert })) });
    const formData = new FormData();
    formData.set("enabled", "false");

    await expect(setChatbotRuntimeEnabled({}, formData)).resolves.toEqual({ success: "챗봇 연결을 비활성화했습니다." });
    expect(contentMocks.requireAdmin).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("set_chatbot_runtime_enabled", { p_enabled: false });
    expect(contentMocks.revalidatePath).toHaveBeenCalledWith("/admin/chatbot");
  });

  it("rejects an invalid state before calling the RPC", async () => {
    const formData = new FormData();
    formData.set("enabled", "maybe");
    await expect(setChatbotRuntimeEnabled({}, formData)).resolves.toEqual({ error: "챗봇 연결 상태를 확인해 주세요." });
    expect(contentMocks.requireAdmin).not.toHaveBeenCalled();
  });
});
