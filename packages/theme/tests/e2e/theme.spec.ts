import { expect, test } from "@playwright/test";

const ports = [5185, 5186];

for (const port of ports) {
  const url = `http://localhost:${port}/`;
  const envLabel = port === 5185 ? "dev (live source)" : "debug (built output)";

  test.describe(`Theme Playwright tests - ${envLabel}`, () => {
    test.beforeEach(async ({ page }) => {
      // Clear localStorage before each test
      await page.goto(url);
      await page.evaluate(() => {
        localStorage.clear();
      });
      await page.goto(url);
    });

    test("initializes default theme state", async ({ page }) => {
      const activeTheme = page.locator("#state-active");
      await expect(activeTheme).toHaveText("light");

      const docAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      expect(docAttr).toBe("light");

      const docScheme = await page.evaluate(() => document.documentElement.style.colorScheme);
      expect(docScheme).toBe("light");
    });

    test("toggles theme correctly", async ({ page }) => {
      const btnToggle = page.locator("#btn-toggle");
      await btnToggle.click();

      const activeTheme = page.locator("#state-active");
      await expect(activeTheme).toHaveText("dark");

      const docAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      expect(docAttr).toBe("dark");

      const docScheme = await page.evaluate(() => document.documentElement.style.colorScheme);
      expect(docScheme).toBe("dark");

      // Verify persistence
      const storedTheme = await page.evaluate(() => localStorage.getItem("playground-theme-pref"));
      expect(storedTheme).toBe("dark");
    });

    test("clears preference", async ({ page }) => {
      // Toggle to dark
      await page.locator("#btn-toggle").click();
      await expect(page.locator("#state-stored")).toHaveText("dark");

      // Clear preference
      await page.locator("#btn-clear").click();
      await expect(page.locator("#state-stored")).toHaveText("None");
    });

    test("performs CRUD on themes list", async ({ page }) => {
      // 1. Create Theme
      await page.locator("#btn-new-theme").click();
      await page.locator("#theme-name").fill("ocean-deep");
      await page.locator("#theme-scheme").selectOption("dark");

      // Fill primary token value
      await page.locator('input[data-token-key="primary"]').fill("#0284c7");
      await page.locator('input[data-token-key="background"]').fill("#0c4a6e");
      await page.locator('input[data-token-key="text"]').fill("#e0f2fe");

      await page.locator('[data-testid="btn-save-theme"]').click();

      // Verify theme is listed
      const newThemeCard = page.locator('[data-theme-item="ocean-deep"]');
      await expect(newThemeCard).toBeVisible();

      // 2. Activate Theme
      await newThemeCard.click();
      await expect(page.locator("#state-active")).toHaveText("ocean-deep");

      // Check DOM attributes and styles
      const docAttr = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      expect(docAttr).toBe("ocean-deep");

      const primaryColor = await page.evaluate(() => {
        return getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim();
      });
      expect(primaryColor.toLowerCase()).toBe("#0284c7");

      // 3. Edit Theme
      await page.locator('[data-theme-item="ocean-deep"] [data-edit-theme]').click();
      await page.locator('input[data-token-key="primary"]').fill("#0ea5e9");
      await page.locator('[data-testid="btn-save-theme"]').click();

      // Check updated style is applied (click to reactivate to apply if needed, though CRUD submits re-instantiation)
      await newThemeCard.click();
      const updatedPrimary = await page.evaluate(() => {
        return getComputedStyle(document.documentElement).getPropertyValue("--color-primary").trim();
      });
      expect(updatedPrimary.toLowerCase()).toBe("#0ea5e9");

      // 4. Delete Theme
      await page.locator('[data-theme-item="ocean-deep"] [data-delete-theme]').click();
      await expect(page.locator('[data-theme-item="ocean-deep"]')).not.toBeVisible();
    });

    test("manages token schema dynamically", async ({ page }) => {
      // Add token
      await page.locator("#btn-add-token").click();
      await page.locator("#new-token-key").fill("brand-color");
      await page.locator("#new-token-var").fill("--color-brand");
      await page.locator('#form-add-token button[type="submit"]').click();

      // Verify schema updated
      const schemaList = page.locator("#token-schema-list");
      await expect(schemaList).toContainText("brand-color");
      await expect(schemaList).toContainText("--color-brand");

      // Delete token
      await page.locator('[data-delete-schema="brand-color"]').click();
      await expect(schemaList).not.toContainText("brand-color");
    });
  });
}
