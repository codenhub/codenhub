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

test("restores focus to the trigger after dismissing a focused toast", async ({ page }) => {
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "Success Toast" });
  // Focused explicitly rather than via trigger.click(): WebKit does not
  // focus a <button> on a mouse click (real Safari behavior), so a
  // keyboard user is simulated directly instead of relying on click-to-focus.
  await trigger.focus();
  await page.keyboard.press("Enter");

  const toast = page.getByRole("status");
  await expect(toast).toBeVisible();
  const dismissButton = toast.getByRole("button", { name: "Dismiss toast" });
  await dismissButton.focus();
  await expect(dismissButton).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(toast).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("keeps the dismiss button at the trailing edge in a right-to-left layout", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dir = "rtl";
  });
  await page.getByRole("button", { name: "Success Toast" }).click();

  const toast = page.getByRole("status");
  await expect(toast).toBeVisible();
  const dismissButton = toast.getByRole("button", { name: "Dismiss toast" });
  const toastBox = (await toast.boundingBox())!;
  const buttonBox = (await dismissButton.boundingBox())!;
  const distFromLeft = buttonBox.x - toastBox.x;
  const distFromRight = toastBox.x + toastBox.width - (buttonBox.x + buttonBox.width);

  // In RTL, the trailing edge is the left; the button should sit snug
  // against it, not the physical right (a physical `margin-left: auto`
  // would instead push it toward the physical right regardless of
  // direction).
  expect(distFromLeft).toBeLessThan(distFromRight);

  await page.evaluate(() => {
    document.documentElement.dir = "";
  });
});

test("scrolls an overflowing stack instead of running off-screen, keeping the newest toast in view", async ({
  page,
}) => {
  // Short enough that even the default maxVisible (5) of ordinary short
  // toasts cannot all fit -- maxVisible caps how many render at once
  // regardless of how many times the trigger is clicked, so the viewport
  // (not the click count) is what has to force the overflow here.
  await page.setViewportSize({ width: 400, height: 120 });
  await page.goto("/");
  await page.locator("#select-position").selectOption("top-right");
  await page.locator("#check-auto-dismiss").uncheck();

  // Dispatched one at a time, in order: each click must be its own
  // sequential toast dispatch for the "newest is first" assertion below
  // to mean anything, so this can't be parallelized.
  const trigger = page.getByRole("button", { name: "Success Toast" });
  await trigger.click();
  await trigger.click();
  await trigger.click();
  await trigger.click();
  await trigger.click();

  const stack = page.locator("[data-toast-container]");
  await expect.poll(() => stack.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  const stackBox = (await stack.boundingBox())!;
  expect(stackBox.y).toBeGreaterThanOrEqual(0);
  expect(stackBox.y + stackBox.height).toBeLessThanOrEqual(121);

  // Newest is inserted first for a top-anchored stack (see
  // isTopAnchoredPosition in dom.ts) and should already be visible without
  // any further scrolling -- the whole point of scrolling-to-reveal on
  // dispatch.
  await expect(page.locator(".coden-toast").first()).toBeInViewport();

  await page.locator("#check-auto-dismiss").check();
});

test("hides the stack's own scrollbar chrome while still allowing it to scroll", async ({ page }) => {
  // Short enough to force overflow, same as the scroll-to-reveal test above.
  await page.setViewportSize({ width: 400, height: 120 });
  await page.goto("/");
  await page.locator("#select-position").selectOption("top-right");
  await page.locator("#check-auto-dismiss").uncheck();

  const trigger = page.getByRole("button", { name: "Success Toast" });
  await trigger.click();
  await trigger.click();
  await trigger.click();
  await trigger.click();
  await trigger.click();

  const stack = page.locator("[data-toast-container]");
  await expect.poll(() => stack.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

  // A platform scrollbar that reserves layout space (the classic, non-overlay
  // kind) shrinks clientWidth below offsetWidth by its own track width;
  // hiding the scrollbar's chrome leaves nothing to reserve, so the two stay
  // equal even though the stack is still genuinely scrollable (asserted
  // above via scrollHeight/clientHeight).
  const widths = await stack.evaluate((el) => ({ offsetWidth: el.offsetWidth, clientWidth: el.clientWidth }));
  expect(widths.clientWidth).toBe(widths.offsetWidth);

  await page.locator("#check-auto-dismiss").check();
});

test("keeps a narrower toast flush against the stack's anchored edge when a wider sibling joins it", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#check-auto-dismiss").uncheck();

  // Every toast's entrance animation must have finished before a bounding
  // box is trustworthy -- mid-animation, an in-flight transform makes the
  // read meaningless regardless of the fix this test is for.
  const settled = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll(".coden-toast")).every((el) =>
        el.getAnimations().every((animation) => animation.playState !== "running"),
      ),
    );

  // Default position is Bottom Right, anchored via a physical `right`.
  const successToast = page.getByRole("status").filter({ hasText: "Changes saved successfully!" });
  await page.getByRole("button", { name: "Success Toast" }).click();
  await expect(successToast).toBeVisible();
  await expect.poll(settled).toBe(true);
  const before = (await successToast.boundingBox())!;

  // Longer message widens the stack's own shrink-to-fit width; the already-
  // rendered, narrower toast must stay pinned to the physically anchored
  // right edge instead of drifting left along with the stack's growing
  // left edge (the bug: cross-axis default alignment left-aligns every
  // toast to the stack, leaving a gap on the anchored side). Info, not
  // Warning, so both toasts share the "status" role (warning is "alert")
  // and the count assertion below actually covers both.
  await page.getByRole("button", { name: "Info Toast" }).click();
  await expect(page.getByRole("status")).toHaveCount(2);
  await expect.poll(settled).toBe(true);
  const after = (await successToast.boundingBox())!;

  expect(after.x).toBeCloseTo(before.x, 0);
  expect(after.width).toBeCloseTo(before.width, 0);

  await page.locator("#check-auto-dismiss").check();
});

test("computes the stack-push animation's delta from the new toast's real height, not its empty shell", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#check-auto-dismiss").uncheck();

  await page.getByRole("button", { name: "Success Toast" }).click();
  await expect(page.getByRole("status")).toHaveCount(1);

  // The new toast's own entrance keyframes and the sibling's push keyframes
  // are both created synchronously in the same render() call, so reading
  // them right after dispatch (no wait) is fine -- unlike a live bounding
  // box, a keyframe's own recorded values never change after creation.
  await page.getByRole("button", { name: "Info Toast" }).click();
  await expect(page.getByRole("status")).toHaveCount(2);

  const { deltaFromKeyframe, expectedDelta } = await page.evaluate(() => {
    const stack = document.querySelector("[data-toast-container]") as HTMLElement;
    const [firstToast, secondToast] = Array.from(document.querySelectorAll(".coden-toast")) as HTMLElement[];
    const pushAnimation = firstToast
      .getAnimations()
      .find(
        (animation) => typeof (animation.effect as KeyframeEffect | null)?.getKeyframes()[0].translate === "string",
      );
    const startTranslate = (pushAnimation?.effect as KeyframeEffect | undefined)?.getKeyframes()[0].translate;
    const deltaFromKeyframe =
      typeof startTranslate === "string" ? Math.abs(Number.parseFloat(startTranslate.split(" ")[1] ?? "0")) : 0;
    const gap = Number.parseFloat(getComputedStyle(stack).columnGap || "0");
    const expectedDelta = secondToast.getBoundingClientRect().height + gap;
    return { deltaFromKeyframe, expectedDelta };
  });

  // The bug: measuring the sibling's "next" position right after inserting
  // the new toast's still-empty shell (before populateToastContent gives it
  // real height) understated this delta to the empty shell's much shorter
  // height, leaving the true, larger move to happen later as an unanimated
  // snap -- see captureStackRects's doc comment in dom.ts.
  expect(deltaFromKeyframe).toBeCloseTo(expectedDelta, 0);

  await page.locator("#check-auto-dismiss").check();
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
