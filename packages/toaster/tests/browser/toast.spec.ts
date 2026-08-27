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
