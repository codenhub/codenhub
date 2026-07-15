import { expect, test } from "@playwright/test";

const PLAYGROUND_URL = "http://localhost:5184/";

test("links to each focused playground route", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  await expect(page.getByRole("link", { exact: true, name: "Typography" })).toHaveAttribute("href", "/typography/");
  await expect(page.getByRole("link", { exact: true, name: "Layout" })).toHaveAttribute("href", "/layout/");
  await expect(page.getByRole("link", { exact: true, name: "Components" })).toHaveAttribute("href", "/components/");
  await expect(page.getByRole("link", { exact: true, name: "Native" })).toHaveAttribute("href", "/native/");
});

test("keeps route cards compact", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const route = page.locator(".playground-route").first();
  await expect(route).toHaveCSS("justify-content", "normal");
  await expect(route).toHaveCSS("min-height", "auto");
});

test("uses circular icon controls for environment and theme", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const controls = [page.getByTestId("environment-toggle"), page.getByTestId("theme-toggle")];

  await Promise.all(
    controls.flatMap((control) => [
      expect(control.locator("svg")).toBeVisible(),
      expect(control).toHaveCSS("width", "40px"),
      expect(control).toHaveCSS("height", "40px"),
      expect(control).toHaveCSS("border-radius", "50%"),
    ]),
  );
});

test("centers navbar content with the playground sections", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const styles = await page.locator(".playground-nav-content").evaluate((element) => {
    const bounds = element.getBoundingClientRect();

    return {
      inlineOffsetDifference: Math.abs(bounds.left - (window.innerWidth - bounds.right)),
      maxWidth: getComputedStyle(element).maxWidth,
    };
  });

  expect(styles.inlineOffsetDifference).toBeLessThan(1);
  expect(styles.maxWidth).not.toBe("none");
});
