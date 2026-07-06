import { expect, test } from "@playwright/test";

const ports = [5187, 5188];

for (const port of ports) {
  const url = `http://localhost:${port}/`;
  const envLabel = port === 5187 ? "dev (live source)" : "debug (built output)";

  test.describe(`Router Playwright tests - ${envLabel}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(url);
    });

    test("initializes home route", async ({ page }) => {
      await expect(page.locator("#view-title")).toHaveText("Home Page");
      await expect(page.locator("#state-path")).toHaveText("/");
      await expect(page.locator("#state-pathname")).toHaveText("/");
      await expect(page.locator("#state-miss")).toHaveText("No");
    });

    test("navigates via links", async ({ page }) => {
      // 1. Go to About page
      await page.locator("#link-about").click();
      await expect(page.locator("#view-title")).toHaveText("About Page");
      await expect(page.locator("#state-path")).toHaveText("/about");
      await expect(page.locator("#state-pathname")).toHaveText("/about");

      // 2. Go to User Alice
      await page.locator("#link-user-alice").click();
      await expect(page.locator("#view-title")).toHaveText("User Profile");
      await expect(page.locator("#username-display")).toHaveText("alice");
      await expect(page.locator("#state-path")).toHaveText("/users/:id");
      await expect(page.locator("#state-params")).toContainText('"id": "alice"');

      // 3. Go to Settings (Profile)
      await page.locator("#link-settings-profile").click();
      await expect(page.locator("#view-title")).toHaveText("Settings");
      await expect(page.locator("#settings-tab-display")).toHaveText("profile");
      await expect(page.locator("#state-search")).toContainText('"tab": "profile"');

      // 4. Go to Settings (Security #passwords)
      await page.locator("#link-settings-security").click();
      await expect(page.locator("#view-title")).toHaveText("Settings");
      await expect(page.locator("#settings-tab-display")).toHaveText("security");
      await expect(page.locator("#state-hash")).toHaveText("#passwords");
    });

    test("navigates programmatically", async ({ page }) => {
      // 1. Go to User Bob
      await page.locator("#btn-nav-user-bob").click();
      await expect(page.locator("#view-title")).toHaveText("User Profile");
      await expect(page.locator("#username-display")).toHaveText("bob");
      await expect(page.locator("#state-params")).toContainText('"id": "bob"');

      // 2. Go to Settings Billing
      await page.locator("#btn-nav-settings-billing").click();
      await expect(page.locator("#view-title")).toHaveText("Settings");
      await expect(page.locator("#settings-tab-display")).toHaveText("billing");

      // 3. Go Home
      await page.locator("#btn-nav-home").click();
      await expect(page.locator("#view-title")).toHaveText("Home Page");
    });

    test("handles 404/missed routes", async ({ page }) => {
      await page.locator("#link-404").click();
      await expect(page.locator("#view-title")).toHaveText("404 - Not Found");
      await expect(page.locator("#state-miss")).toHaveText("Yes");
      await expect(page.locator("#state-pathname")).toHaveText("/non-existent");
    });

    test("renders route parameters as text", async ({ page }) => {
      const payload = '<img src="x" alt="xss">';

      await page.goto(`${url}users/${encodeURIComponent(payload)}`);

      await expect(page.locator("#view-title")).toHaveText("User Profile");
      await expect(page.locator("#username-display")).toHaveText(payload);
      await expect(page.locator("#username-display img")).toHaveCount(0);
    });

    test("supports browser back/forward history navigation", async ({ page }) => {
      await page.locator("#link-about").click();
      await expect(page.locator("#view-title")).toHaveText("About Page");

      await page.locator("#btn-nav-back").click();
      await expect(page.locator("#view-title")).toHaveText("Home Page");

      await page.locator("#btn-nav-forward").click();
      await expect(page.locator("#view-title")).toHaveText("About Page");
    });
  });
}
