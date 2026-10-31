import { expect, test } from "./fixtures";

for (const width of [390, 1440]) {
  test(`soft-wraps the provider diagnostic signature at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/oidc/reference/provider/");

    const block = page.locator(".code-block").filter({ hasText: "export type ProviderDiagnosticReason =" });
    const pre = block.locator("pre");
    await expect(pre).toBeVisible();
    await expect
      .poll(() => pre.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeLessThanOrEqual(0);
    // A page widened to fit the declaration would also make scrollWidth === clientWidth.
    const box = (await pre.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  });
}

test("keeps an ordinary guide example horizontally scrollable on phones", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/styles/usage/customizing/");

  const pre = page.locator("pre").filter({ hasText: "background: color-mix(in oklab" });
  await expect(pre).toBeVisible();
  await expect(pre).toHaveCSS("white-space", "pre");
  const dimensions = await pre.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
    return { clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, scrollLeft: element.scrollLeft };
  });
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  expect(dimensions.scrollLeft).toBeGreaterThan(0);
});

for (const document of [
  { path: "/oidc/reference/provider/", heading: "ProviderDiagnosticReason", fragment: "providerdiagnosticreason" },
  { path: "/styles/usage/customizing/", heading: "Material tokens", fragment: "material-tokens" },
]) {
  test(`opens the phone outline and closes it after navigating on ${document.path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(document.path);

    const toggle = page.getByRole("button", { name: "On this page", exact: true });
    const outline = page.locator("#page-outline-links");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(outline).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(outline).toBeVisible();
    await outline.getByRole("link", { name: document.heading, exact: true }).click();

    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(outline).toBeHidden();
    await expect(page).toHaveURL(`${document.path}#${document.fragment}`);
    // The heading's accessible name includes its permalink label, so find it by its fragment.
    const heading = page.locator(`#${document.fragment}`);
    await expect(heading).toHaveRole("heading");
    await expect(heading).toHaveText(document.heading);
    await expect(heading).toBeInViewport();
  });
}
