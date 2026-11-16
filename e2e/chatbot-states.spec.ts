import { expect, test, type Page } from "@playwright/test";

// 챗봇 화면의 상태는 문구 대신 data-* 속성으로 읽는다. 속성 목록은 docs/architecture/state-machines.md 참고.

const QUESTION = "주요 기술 스택이 궁금해요";
const ANSWER = "Python과 TypeScript를 주로 사용합니다. [S1]";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function mockStatus(page: Page, body: unknown, options: { slowAfterFirst?: boolean } = {}) {
  let calls = 0;
  await page.route("**/api/chat/status", async (route) => {
    calls += 1;
    if (options.slowAfterFirst && calls > 1) await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) }).catch(() => undefined);
  });
}

async function mockChat(page: Page, frames: string[]) {
  await page.route("**/api/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fulfill({ status: 200, contentType: "text/event-stream", headers: { "Cache-Control": "no-store" }, body: frames.join("") });
  });
}

const ANSWER_FRAMES = [
  sse("status", { phase: "accepted", message: "질문을 확인하고 있어요." }),
  sse("status", { phase: "searching", message: "관련 정보를 검색하고 있어요." }),
  sse("sources", { items: [{ id: "S1", title: "소개", type: "profile", url: "/about" }] }),
  sse("status", { phase: "generating", message: "답변을 생성하고 있어요." }),
  sse("token", { delta: ANSWER }),
  sse("done", { requestId: "4e2c0d9a-2f4b-4c58-9c1e-0c9a3f6f8b11", finishReason: "stop" }),
];

test.describe("chatbot state machines", () => {
  test("hero console walks a request from idle to a complete answer", async ({ page }) => {
    await mockStatus(page, { status: "enabled" });
    await mockChat(page, ANSWER_FRAMES);
    await page.goto("/");

    const heroConsole = page.locator("#hero-chat");
    await expect(heroConsole).toHaveAttribute("data-availability", "enabled");
    await expect(heroConsole).toHaveAttribute("data-phase", "idle");

    await heroConsole.getByRole("button", { name: QUESTION }).click();
    await expect(heroConsole).toHaveAttribute("data-phase", "complete");
    await expect(heroConsole.locator('.console-answer[data-delivery="complete"]')).toContainText("Python과 TypeScript");
    await expect(heroConsole.getByRole("link", { name: /소개/ }).first()).toHaveAttribute("href", "/about");
  });

  test("a failed answer offers retry in the hero console and the retry can succeed", async ({ page }) => {
    await mockStatus(page, { status: "enabled" });
    await mockChat(page, [sse("error", { code: "MODEL_BUSY", message: "요청이 많아요. 잠시 후 다시 질문해 주세요." })]);
    await page.goto("/");

    const heroConsole = page.locator("#hero-chat");
    await expect(heroConsole).toHaveAttribute("data-availability", "enabled");
    await heroConsole.getByRole("button", { name: QUESTION }).click();
    await expect(heroConsole).toHaveAttribute("data-phase", "error");
    await expect(heroConsole.locator('.console-answer[data-delivery="error"]')).toContainText("요청이 많아요");

    await page.unroute("**/api/chat");
    await mockChat(page, ANSWER_FRAMES);
    await heroConsole.getByRole("button", { name: "다시 시도" }).click();
    await expect(heroConsole.locator('.console-answer[data-delivery="complete"]')).toContainText("Python과 TypeScript");
  });

  test("opening the panel while online keeps the conversation and composer usable during the recheck", async ({ page }) => {
    // 첫 상태 확인은 바로 끝나고, 패널을 열 때의 재확인은 3초 걸린다.
    await mockStatus(page, { status: "enabled" }, { slowAfterFirst: true });
    await mockChat(page, ANSWER_FRAMES);
    await page.goto("/about");

    const openButton = page.getByRole("button", { name: "포트폴리오 챗봇 열기" });
    await expect(openButton).toHaveAttribute("data-availability", "enabled");
    await openButton.click();
    const panel = page.getByRole("dialog", { name: "포트폴리오 챗봇" });
    await expect(panel).toHaveAttribute("data-availability", "enabled", { timeout: 1_500 });
    const composer = panel.getByRole("textbox", { name: "포트폴리오에 대해 질문하기" });
    await expect(composer).toBeEnabled({ timeout: 1_500 });

    await composer.fill("기술 스택을 알려주세요");
    await composer.press("Enter");
    await expect(panel.locator('article[data-delivery="complete"]', { hasText: "Python과 TypeScript" })).toBeVisible();
    await expect(panel).toHaveAttribute("data-phase", "complete");

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("a disabled chatbot shows the offline state everywhere and takes no questions", async ({ page }) => {
    await mockStatus(page, { status: "disabled", enabled: false });
    await page.goto("/");

    const heroConsole = page.locator("#hero-chat");
    await expect(heroConsole).toHaveAttribute("data-availability", "disabled");
    await expect(heroConsole.getByRole("textbox", { name: "포트폴리오에 질문하기" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "연락하기" })).toBeVisible();
  });
});
