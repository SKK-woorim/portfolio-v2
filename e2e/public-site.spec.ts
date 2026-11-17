import { expect, test } from "@playwright/test";

test("visitor can navigate the main public journeys", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "프로젝트 보기" }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await page.getByRole("link", { name: "블로그" }).first().click();
  await expect(page).toHaveURL(/\/blog$/);
});

test("contact page shows the configured email and collaboration visual", async ({ page }) => {
  await page.goto("/contact");

  const mailto = await page.locator("#main-content").getByRole("link", { name: "swoorim31@gmail.com" }).getAttribute("href");
  expect(mailto).toContain("mailto:swoorim31@gmail.com?subject=");
  expect(mailto).toContain("&body=");

  const collaborationVisual = page.locator('img[src*="contact-ai-collaboration"]');
  await expect(collaborationVisual).toBeVisible();
  await expect.poll(() => collaborationVisual.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test("keeps the blog search field inside a 320px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/blog");

  const search = page.getByRole("textbox", { name: "글 검색" });
  await expect(search).toBeVisible();
  const box = await search.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});

test("direct and site 404 views each expose one main landmark", async ({ page }) => {
  await page.goto("/route-that-does-not-exist");
  await expect(page.getByRole("heading", { level: 1, name: "페이지를 찾을 수 없습니다." })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);

  await page.goto("/blog/route-that-does-not-exist");
  await expect(page.getByRole("heading", { level: 1, name: "페이지를 찾을 수 없습니다." })).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
});

test("visitor can ask the chatbot and inspect a verified source", async ({ page }) => {
  await page.route("**/api/chat/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "enabled" }) });
  });
  await page.route("**/api/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "Cache-Control": "no-store" },
      body: [
        'event: status\ndata: {"phase":"accepted","message":"질문을 확인하고 있어요."}\n\n',
        'event: status\ndata: {"phase":"searching","message":"관련 정보를 검색하고 있어요."}\n\n',
        'event: sources\ndata: {"items":[{"id":"S1","title":"RAG 프로젝트","type":"portfolio","url":"/portfolio/rag-project"}]}\n\n',
        'event: status\ndata: {"phase":"generating","message":"답변을 생성하고 있어요."}\n\n',
        'event: token\ndata: {"delta":"RAG 파이프라인을 설계하고 구현한 경험이 있습니다. [S1]"}\n\n',
        `event: done\ndata: {"requestId":"${crypto.randomUUID()}","finishReason":"stop"}\n\n`,
      ].join(""),
    });
  });

  // 홈에서는 히어로 콘솔이 보이는 동안 떠 있는 실행 버튼이 숨으므로 다른 공개 페이지에서 연다.
  await page.goto("/about");
  const openButton = page.getByRole("button", { name: "포트폴리오 챗봇 열기" });
  await expect(openButton).toHaveAttribute("data-availability", "enabled");
  await openButton.click();

  const panel = page.getByRole("dialog", { name: "포트폴리오 챗봇" });
  await expect(panel).toHaveAttribute("data-availability", "enabled");
  const composer = panel.getByRole("textbox", { name: "포트폴리오에 대해 질문하기" });
  await expect(composer).toBeEnabled();
  await composer.fill("RAG 관련 프로젝트를 알려주세요");
  await composer.press("Enter");

  await expect(panel).toHaveAttribute("data-phase", "complete");
  await expect(panel.locator('article[data-delivery="complete"]', { hasText: "RAG 파이프라인을 설계" })).toBeVisible();
  await expect(panel.getByRole("navigation", { name: "답변 출처" }).getByRole("link", { name: /RAG 프로젝트/ })).toHaveAttribute("href", "/portfolio/rag-project");

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(openButton).toBeFocused();
});
