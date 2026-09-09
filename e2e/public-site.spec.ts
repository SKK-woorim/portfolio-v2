import { expect, test } from "@playwright/test";

test("visitor can navigate the main public journeys", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "포트폴리오 보기" }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await page.getByRole("link", { name: "블로그" }).first().click();
  await expect(page).toHaveURL(/\/blog$/);
});

test("contact page shows the configured email and collaboration visual", async ({ page }) => {
  await page.goto("/contact");

  await expect(page.locator("#main-content").getByRole("link", { name: "swoorim31@gmail.com" })).toHaveAttribute(
    "href",
    "mailto:swoorim31@gmail.com",
  );

  const collaborationVisual = page.locator('img[src*="contact-ai-collaboration"]');
  await expect(collaborationVisual).toBeVisible();
  await expect.poll(() => collaborationVisual.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});

test("visitor can ask the chatbot and inspect a verified source", async ({ page }) => {
  await page.route("**/api/chat/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true }) });
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

  await page.goto("/");
  const openButton = page.getByRole("button", { name: "포트폴리오 챗봇 열기" });
  await openButton.click();
  await expect(page.getByRole("dialog", { name: "포트폴리오 챗봇" })).toBeVisible();
  await page.getByRole("button", { name: "RAG 관련 프로젝트를 알려주세요" }).click();
  await expect(page.getByText("질문을 확인하고 있어요.")).toBeVisible();
  await expect(page.getByText(/RAG 파이프라인을 설계/)).toBeVisible();
  await expect(page.getByRole("link", { name: /RAG 프로젝트/ })).toHaveAttribute("href", "/portfolio/rag-project");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "포트폴리오 챗봇" })).toBeHidden();
  await expect(openButton).toBeFocused();
});
