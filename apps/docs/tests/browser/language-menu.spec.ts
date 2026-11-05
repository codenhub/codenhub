import { expect, test } from "./fixtures";

test("finishes a language-menu close cancelled before its first animation frame", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/pt-BR/styles/");

  const menu = page.locator("[data-language-menu]");
  await menu.locator("summary").click();
  await menu.locator("ul").evaluate(async (list) => {
    await Promise.all(list.getAnimations().map((animation) => animation.finished));
  });

  // Cancel in the same task as Escape, before a frame can start the close.
  // Disabling motion in this window emits neither animationend nor animationcancel.
  await menu.evaluate((element) => {
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }));
    element.querySelector("ul")!.style.animation = "none";
  });

  await expect(menu).not.toHaveAttribute("open", "");
  await expect(menu.locator("summary")).toBeFocused();
});

for (const width of [320, 375, 640, 1280]) {
  test(`keeps every language option inside a ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/pt-BR/styles/");

    const menu = page.locator("[data-language-menu]");
    await menu.locator("summary").click();
    await expect(menu.getByRole("link")).toHaveCount(3);

    const bounds = await menu.getByRole("link").evaluateAll((options) =>
      options.map((option) => {
        const { left, right } = option.getBoundingClientRect();
        return { left, right };
      }),
    );
    for (const { left, right } of bounds) {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(width);
    }
  });
}
