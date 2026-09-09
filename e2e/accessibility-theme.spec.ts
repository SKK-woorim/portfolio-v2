import { expect, test } from "@playwright/test";

const themeStorageKey = "portfolio-color-theme";

test.describe("public accessibility and theme controls", () => {
  test("provides a skip link and marks the current desktop menu item", async ({ page }) => {
    await page.goto("/portfolio");

    const skipLink = page.getByRole("link", { name: "본문으로 건너뛰기" });
    await expect(skipLink).toHaveAttribute("href", "#main-content");
    await skipLink.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();

    const desktopNavigation = page.getByRole("navigation", { name: "주요 메뉴" });
    await expect(desktopNavigation.getByRole("link", { name: "포트폴리오" })).toHaveAttribute("aria-current", "page");
    await expect(desktopNavigation.getByRole("link", { name: "소개" })).not.toHaveAttribute("aria-current", "page");
  });

  test("moves focus into and back out of the mobile menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/blog");

    const menuButton = page.getByRole("button", { name: "메뉴 열기" });
    await menuButton.click();
    const mobileNavigation = page.getByRole("navigation", { name: "모바일 주요 메뉴" });
    await expect(mobileNavigation.getByRole("link", { name: "소개" })).toBeFocused();
    await expect(mobileNavigation.getByRole("link", { name: "블로그" })).toHaveAttribute("aria-current", "page");

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "메뉴 열기" })).toBeFocused();
    await expect(page.locator('#mobile-menu a[href="/about"]')).toHaveAttribute("tabindex", "-1");
  });

  test("follows the system theme until an explicit choice is made", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await page.evaluate((key) => localStorage.removeItem(key), themeStorageKey);
    await page.reload();

    const themeButton = page.getByRole("button", { name: "다크 모드로 전환" });
    await expect(page.locator("html")).toHaveAttribute("data-site-theme", "light");
    await expect(themeButton).toHaveAttribute("title", "다크 모드로 전환");

    await themeButton.click();
    await expect(page.locator("html")).toHaveAttribute("data-site-theme", "dark");
    await expect(page).toHaveTitle(/송경근/);
    await expect(page.getByRole("button", { name: "라이트 모드로 전환" })).toBeVisible();
    const storedTheme = await page.evaluate((key) => localStorage.getItem(key), themeStorageKey);
    expect(storedTheme).toBe("dark");

    await page.evaluate((key) => {
      localStorage.setItem(key, "light");
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: "light" }));
    }, themeStorageKey);
    await expect(page.locator("html")).toHaveAttribute("data-site-theme", "light");
    await expect(page.getByRole("button", { name: "다크 모드로 전환" })).toBeVisible();
  });

  test("updates a system theme when the operating-system preference changes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.evaluate((key) => localStorage.removeItem(key), themeStorageKey);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-site-theme", "dark");

    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-site-theme", "light");
    await expect(page.getByRole("button", { name: "다크 모드로 전환" })).toBeVisible();
  });
});
