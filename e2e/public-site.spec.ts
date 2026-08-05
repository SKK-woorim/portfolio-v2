import { expect, test } from "@playwright/test";

test("visitor can navigate the main public journeys", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "포트폴리오 보기" }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await page.getByRole("link", { name: "블로그" }).first().click();
  await expect(page).toHaveURL(/\/blog$/);
});
