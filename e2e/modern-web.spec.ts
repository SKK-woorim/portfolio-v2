import { expect, test, type Page } from "@playwright/test";

// 웹 표준 현대화 후속 검토 항목을 실제 브라우저에서 확인한다. 기록은 docs/reviews/modern-web-guidance-handover-2026-11-17.md 참고.

const themeStorageKey = "portfolio-color-theme";

function rootColorScheme(page: Page) {
  return page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
}

test.describe("modern web platform follow-ups", () => {
  test.describe("root color scheme", () => {
    test.use({ colorScheme: "dark" });

    test("keeps admin light on a dark system while the public site follows the theme", async ({ page }) => {
      await page.goto("/admin/login");
      expect(await rootColorScheme(page)).toBe("light");
      await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute("content", "light");

      await page.goto("/about");
      await expect(page.locator("html")).toHaveAttribute("data-site-theme", "dark");
      expect(await rootColorScheme(page)).toBe("dark");
    });

    test("uses a stored light preference on the public site", async ({ page }) => {
      await page.addInitScript((key) => localStorage.setItem(key, "light"), themeStorageKey);
      await page.goto("/about");
      await expect(page.locator("html")).toHaveAttribute("data-site-theme", "light");
      expect(await rootColorScheme(page)).toBe("light");
    });
  });

  test("read progress tracks the case article, not the whole document", async ({ page }) => {
    await page.goto("/portfolio");
    const firstProject = page.locator('#main-content a[href^="/portfolio/"]').first();
    const href = await firstProject.getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);

    const article = page.locator("#case-article");
    // 스크롤 타임라인 지원 브라우저에서는 대상에 뷰 타임라인 클래스가 붙은 뒤부터 막대가 대상을 잰다.
    await expect(article).toHaveClass(/read-progress-target/);

    const readProgress = () => page.evaluate(() => {
      const rect = document.getElementById("case-article")!.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const expected = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
      const bar = document.querySelector(".read-progress")!;
      const actual = new DOMMatrixReadOnly(getComputedStyle(bar).transform).a;
      return { expected, actual };
    });

    const articleEnd = await page.evaluate(() => {
      const rect = document.getElementById("case-article")!.getBoundingClientRect();
      return Math.round(rect.bottom + window.scrollY - window.innerHeight);
    });
    const pageEnd = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(articleEnd).toBeGreaterThan(0);

    for (const top of [0, Math.round(articleEnd * 0.25), Math.round(articleEnd * 0.5), Math.round(articleEnd * 0.75), articleEnd, pageEnd]) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), top);
      await expect.poll(async () => {
        const { expected, actual } = await readProgress();
        return Math.abs(expected - actual);
      }, { message: `scrollY ${top}` }).toBeLessThanOrEqual(0.01);
    }

    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), articleEnd);
    await expect.poll(async () => (await readProgress()).actual).toBeGreaterThanOrEqual(0.99);
  });

  test("command palette has a visible close control and returns focus to its trigger", async ({ page }) => {
    await page.goto("/about");
    const trigger = page.getByRole("button", { name: "검색 열기" });
    const palette = page.getByRole("dialog", { name: "검색", exact: true });
    const input = palette.getByRole("combobox", { name: "검색어" });
    const close = palette.getByRole("button", { name: "검색 닫기" });

    await trigger.click();
    await expect(palette).toBeVisible();
    await expect(input).toBeFocused();
    await close.click();
    await expect(palette).toBeHidden();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await expect(input).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
    await expect(trigger).toBeFocused();

    // 닫기 버튼에 초점이 있을 때 Enter는 선택된 항목을 실행하지 않고 닫기만 한다.
    await trigger.click();
    await expect(input).toBeFocused();
    await close.focus();
    await page.keyboard.press("Enter");
    await expect(palette).toBeHidden();
    await expect(page).toHaveURL(/\/about$/);
    await expect(trigger).toBeFocused();
  });

  test("mobile menu is inert while closed", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/about");
    const menu = page.locator("#mobile-menu");

    await expect(menu).toHaveJSProperty("inert", true);
    await page.getByRole("button", { name: "메뉴 열기" }).click();
    await expect(menu).toHaveJSProperty("inert", false);
    await page.getByRole("button", { name: "메뉴 닫기" }).click();
    await expect(menu).toHaveJSProperty("inert", true);
  });
});
