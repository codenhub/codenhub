import { expect, test } from "@playwright/test";

test("renders accessible toast controls within the viewport", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Dismiss Button").check();
  await page.getByRole("button", { name: "Success Toast" }).click();

  const toast = page.getByRole("status");
  await expect(toast).toContainText("Changes saved successfully");
  const dismissButton = toast.getByRole("button", { name: "Dismiss toast" });
  const box = await dismissButton.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(24);
  expect(box?.height).toBeGreaterThanOrEqual(24);
  await expect
    .poll(async () => {
      const toastBox = (await toast.boundingBox())!;
      return toastBox.x + toastBox.width;
    })
    .toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("names dialogs and prompt input programmatically", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Prompt Dialog" }).click();

  const dialog = page.getByRole("dialog", { name: "Enter new workspace namespace:" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Enter new workspace namespace:" })).toBeFocused();
});

test("dismisses a dialog from its visual backdrop", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Confirm Dialog" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await page.mouse.click(2, 2);

  await expect(dialog).not.toBeVisible();
});

test("propagates a live styles color customization to a toast", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Success Toast" }).click();
  const toast = page.getByRole("status");
  await expect(toast).toBeVisible();

  const before = await toast.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.style.setProperty("--color-success", "rgb(255, 0, 255)"));
  await expect.poll(() => toast.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(before);

  await page.evaluate(() => document.documentElement.style.removeProperty("--color-success"));
});

test("a toast's own presentation class overrides an inherited one", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Success Toast" }).click();
  const toast = page.getByRole("status");
  await expect(toast).toBeVisible();

  const withoutGhostAncestor = await toast.evaluate((el) => {
    el.classList.add("solid");
    return getComputedStyle(el).backgroundColor;
  });

  const withGhostAncestor = await toast.evaluate((el) => {
    document.body.classList.add("ghost");
    const value = getComputedStyle(el).backgroundColor;
    document.body.classList.remove("ghost");
    return value;
  });

  expect(withGhostAncestor).toBe(withoutGhostAncestor);
});

test("resolves theme against a nested light/dark section, not just the root", async ({ page }) => {
  await page.goto("/");
  // The playground's own FOUC-prevention script sets an inline `color-scheme`
  // on <html>, which otherwise outranks a `.dark` class's stylesheet rule --
  // matching it here is how a themed page actually sets its root theme.
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  });
  await page.getByRole("button", { name: "Success Toast" }).click();
  const toast = page.getByRole("status");
  await expect(toast).toBeVisible();

  const darkBackground = await toast.evaluate((el) => getComputedStyle(el).backgroundColor);
  const lightNestedBackground = await toast.evaluate((el) => {
    document.body.classList.add("light");
    document.body.style.colorScheme = "light";
    const value = getComputedStyle(el).backgroundColor;
    document.body.classList.remove("light");
    document.body.style.colorScheme = "";
    return value;
  });

  expect(lightNestedBackground).not.toBe(darkBackground);
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });
});

test("draws a visible edge on an edged dialog button", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.body.classList.add("edged"));
  await page.getByRole("button", { name: "Confirm Dialog" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const primaryButton = dialog.getByRole("button").first();
  const borderWidth = await primaryButton.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderWidth));
  expect(borderWidth).toBeGreaterThan(0);

  await page.evaluate(() => document.body.classList.remove("edged"));
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("disables indefinite loader animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.getByRole("button", { name: "Show Persistent Loader" }).click();

    const spinner = page.locator(".coden-toast-spinner");
    await expect(spinner).toHaveCSS("animation-name", "none");
  });
});
