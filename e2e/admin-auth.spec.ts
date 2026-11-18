import { expect, test, type Locator, type Page } from "@playwright/test";

// 로그인 없이 열리는 관리자 화면(로그인·계정 활성화)의 폼 접근성·자동 완성 계약을 실제 브라우저에서 확인한다.
// 기록은 docs/reviews/admin-modern-web-guidance-2026-11-17.md 참고.
// Supabase 환경 변수가 없으면(CI 등) 폼이 렌더링되지 않으므로 해당 검사는 건너뛴다.

async function fontSizePx(locator: Locator) {
  return locator.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

async function skipWithoutForm(page: Page, field: Locator) {
  const configured = await page.getByText("Supabase 환경 변수가 아직 설정되지 않았습니다.").count() === 0;
  test.skip(!configured, "Supabase 환경 변수가 없어 관리자 폼이 렌더링되지 않는다.");
  await expect(field).toBeVisible();
}

test.describe("admin sign-in form", () => {
  test("labels fields explicitly, hints autofill, and keeps inputs at 16px or more", async ({ page }) => {
    await page.goto("/admin/login");
    const email = page.getByLabel("이메일", { exact: true });
    await skipWithoutForm(page, email);

    await expect(email).toHaveAttribute("id", "admin-login-email");
    await expect(email).toHaveAttribute("type", "email");
    await expect(email).toHaveAttribute("name", "email");
    await expect(email).toHaveAttribute("autocomplete", "username");
    await expect(email).toHaveAttribute("spellcheck", "false");

    const password = page.getByLabel("비밀번호", { exact: true });
    await expect(password).toHaveAttribute("id", "admin-login-password");
    await expect(password).toHaveAttribute("autocomplete", "current-password");
    await expect(password).toHaveAttribute("type", "password");

    // iOS는 16px 미만 입력에 포커스하면 화면을 확대한다.
    expect(await fontSizePx(email)).toBeGreaterThanOrEqual(16);
    expect(await fontSizePx(password)).toBeGreaterThanOrEqual(16);
  });

  test("toggles password visibility without submitting and allows pasting", async ({ page }) => {
    await page.goto("/admin/login");
    const password = page.getByLabel("비밀번호", { exact: true });
    await skipWithoutForm(page, password);

    // 붙여넣기를 막는 처리기가 없다.
    const pasteBlocked = await password.evaluate((element) => {
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(pasteBlocked).toBe(false);

    const toggle = page.getByRole("button", { name: "비밀번호 표시" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(password).toHaveAttribute("type", "text");
    await toggle.press("Enter");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(password).toHaveAttribute("type", "password");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("admin activation form", () => {
  test("names the expired-link email field and keeps the status region in the page", async ({ page }) => {
    // 세션 없이 열면 만료 상태(새 링크 요청 폼)가 보인다.
    await page.goto("/admin/activate");
    const email = page.getByLabel("관리자 이메일");
    await skipWithoutForm(page, email);

    await expect(email).toHaveAttribute("id", "admin-activate-email");
    await expect(email).toHaveAttribute("name", "email");
    await expect(email).toHaveAttribute("spellcheck", "false");
    expect(await fontSizePx(email)).toBeGreaterThanOrEqual(16);

    const status = page.getByRole("status");
    await expect(status).toHaveCount(1);
    await expect(status).toHaveText("");
    // 비어 있는 상태 영역은 폼 grid에 칸이나 gap을 만들지 않는다.
    await expect(status).toHaveCSS("position", "absolute");
  });
});
