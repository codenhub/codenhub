import { expect, test } from "@playwright/test";

const VANILLA_COMPONENTS_URL = "http://localhost:5184/components/?env=vanilla";
const BUILD_COMPONENTS_URL = "http://localhost:5184/components/?env=build";
const BUILD_LAYOUT_URL = "http://localhost:5184/layout/?env=build";
const BUILD_NATIVE_URL = "http://localhost:5184/native/?env=build";
const BUILD_TYPOGRAPHY_URL = "http://localhost:5184/typography/?env=build";
const DEFAULT_NATIVE_URL = "http://localhost:5184/native/";

test.describe("preview environments", () => {
  test("shows the alternate preview environment in the environment toggle tooltip", async ({ page }) => {
    await page.goto(VANILLA_COMPONENTS_URL);
    await expect(page.getByTestId("environment-toggle")).toHaveAttribute("data-tooltip", "See build");
    await page.goto(BUILD_COMPONENTS_URL);
    await expect(page.getByTestId("environment-toggle")).toHaveAttribute("data-tooltip", "See vanilla");
  });

  test("loads shared and native stylesheets from their owning folders", async ({ page }) => {
    await page.goto(VANILLA_COMPONENTS_URL);
    await expect(page.locator('link[href="/shared/entry-vanilla.css"]')).toHaveCount(1);

    await page.goto(BUILD_NATIVE_URL);
    await expect(page.locator('link[href="/native/entry-tw.css"]')).toHaveCount(1);
  });

  test("defaults the native route to its Tailwind build entry", async ({ page }) => {
    await page.goto(DEFAULT_NATIVE_URL);

    await expect(page.locator("html")).toHaveAttribute("data-env", "build");
    await expect(page.locator('link[href="/native/entry-tw.css"]')).toHaveCount(1);
    await expect(page.getByTestId("environment-toggle")).toHaveAttribute("data-tooltip", "See vanilla");
  });

  test("switches between preview environments from the environment toggle", async ({ page }) => {
    await page.goto(VANILLA_COMPONENTS_URL);
    await page.getByTestId("environment-toggle").click();
    await expect(page).toHaveURL(/env=build/);
    await expect(page.locator("html")).toHaveAttribute("data-env", "build");
    await page.getByTestId("environment-toggle").click();
    await expect(page).toHaveURL(/env=vanilla/);
    await expect(page.locator("html")).toHaveAttribute("data-env", "vanilla");
  });

  test("loads source build correctly and applies classes", async ({ page }) => {
    await page.goto(BUILD_COMPONENTS_URL);
    await expect(page.getByTestId("preview-root")).toBeVisible();
    await expect(page.getByTestId("primary-button")).toBeVisible();
  });

  test("builds layout and content utilities from Tailwind source", async ({ page }) => {
    await page.goto(BUILD_LAYOUT_URL);
    await expect(page.getByTestId("view-vertical")).toHaveCSS("display", "flex");
    await expect(page.getByTestId("divider-vertical")).not.toHaveCSS("border-left-width", "0px");

    await page.goto(BUILD_TYPOGRAPHY_URL);
    await expect(page.getByTestId("table")).toHaveCSS("border-collapse", "separate");
    await expect(page.getByTestId("keyboard")).not.toHaveCSS("border-top-width", "0px");
  });

  test("builds native mappings from Tailwind source", async ({ page }) => {
    await page.goto(BUILD_NATIVE_URL);

    await expect(page.locator("body")).toHaveCSS("display", "flex");
    await expect(page.locator("table")).toHaveCSS("border-collapse", "separate");
    await expect(page.locator("blockquote")).not.toHaveCSS("border-left-width", "0px");
  });

  test("preserves build environment when navigating between routes", async ({ page }) => {
    await page.goto(BUILD_COMPONENTS_URL);
    await page.getByRole("link", { exact: true, name: "Layout" }).click();

    await expect(page).toHaveURL(/\/layout\/?\?env=build/);
    await expect(page.locator("html")).toHaveAttribute("data-env", "build");
  });
});
