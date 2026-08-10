import { expect, test } from "@playwright/test";

import { expectSameColor, getColorDistance, isTransparent } from "./test-utils";

const FEEDBACK_URL = "http://localhost:5184/feedback/?env=vanilla";

test.describe("feedback", () => {
  test("loads canonical compiled styles with tokens and components", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    await expect(page.getByTestId("preview-root")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();

    const badgeStyles = await page.getByTestId("badge-plain-primary").evaluate((element) => {
      const styles = getComputedStyle(element);

      return {
        backgroundColor: styles.backgroundColor,
        borderRadius: styles.borderRadius,
        color: styles.color,
      };
    });

    expect(badgeStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(badgeStyles.color).not.toBe(badgeStyles.backgroundColor);
    expect(badgeStyles.borderRadius).not.toBe("0px");
  });

  test("pads an alert around its icon and keeps a readable border", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const alertStyles = await page.getByTestId("alert-plain-success").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { borderWidth: styles.borderWidth, color: styles.color };
    });
    const alertIconPaddingLeft = await page
      .getByTestId("alert-plain-success-icon")
      .evaluate((element) => getComputedStyle(element).paddingLeft);

    expect(alertStyles.borderWidth).not.toBe("0px");
    expect(alertStyles.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(alertIconPaddingLeft).toBe("44px");
  });

  test("animates skeletons and styles progress tracks", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const skeletonAnimationName = await page
      .getByTestId("skeleton-plain-none")
      .evaluate((element) => getComputedStyle(element).animationName);
    const progressStyles = await page.getByTestId("progress-plain-none").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { backgroundColor: styles.backgroundColor, overflow: styles.overflow };
    });

    expect(skeletonAnimationName).not.toBe("none");
    expect(progressStyles.overflow).toBe("hidden");
    expect(progressStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("sizes loaders and renders every loader variant", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const loaderWidths = await Promise.all(
      ["loader-sm", "loader-default", "loader-lg"].map((testId) =>
        page.getByTestId(testId).evaluate((element) => getComputedStyle(element).width),
      ),
    );
    const loaderDefaultMask = await page
      .getByTestId("loader-default")
      .evaluate(
        (element) => getComputedStyle(element).maskImage || getComputedStyle(element).webkitMaskImage || "none",
      );
    const variantIds = [
      "loader-dots-wave",
      "loader-dots-fade",
      "loader-dots-queue",
      "loader-dots-rotate",
      "loader-dots-grow",
      "loader-dots-grow-alternate",
      "loader-dot-bounce",
      "loader-bars-wave",
      "loader-pulse-ring",
    ];
    const variantImages = await Promise.all(
      variantIds.map((testId) =>
        page.getByTestId(testId).evaluate((element) => getComputedStyle(element).getPropertyValue("--ai-image")),
      ),
    );

    expect(loaderWidths).toEqual(["24px", "32px", "40px"]);
    expect(loaderDefaultMask).not.toBe("none");
    for (const [index, image] of variantImages.entries()) {
      expect(image, variantIds[index]).toContain("data:image/svg+xml");
    }
  });

  test("preserves a distinct mask for every loader variant", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const testIds = [
      "loader-default",
      "loader-dots-wave",
      "loader-dots-fade",
      "loader-dots-queue",
      "loader-dots-rotate",
      "loader-dots-grow",
      "loader-dots-grow-alternate",
      "loader-dot-bounce",
      "loader-bars-wave",
      "loader-pulse-ring",
    ];
    const images = await Promise.all(
      testIds.map((testId) =>
        page.getByTestId(testId).evaluate((element) => getComputedStyle(element).getPropertyValue("--ai-image")),
      ),
    );

    expect(new Set(images).size).toBe(testIds.length);
  });

  test("renders flat and soft alert variants with correct styles", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const flatInfoStyles = await page.getByTestId("alert-flat-info").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.borderColor,
      };
    });
    expect(isTransparent(flatInfoStyles.backgroundColor)).toBe(false);
    expect(getColorDistance(flatInfoStyles.color, flatInfoStyles.backgroundColor)).toBeGreaterThan(2);

    const softWarningStyles = await page.getByTestId("alert-soft-warning").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.borderColor,
      };
    });
    expect(isTransparent(softWarningStyles.backgroundColor)).toBe(false);
    expect(getColorDistance(softWarningStyles.color, softWarningStyles.backgroundColor)).toBeGreaterThan(2);
    expect(isTransparent(softWarningStyles.borderColor)).toBe(true);
  });

  test("renders flat and soft badge variants with correct styles", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    // Flat badge: background = intent color, border = intent color (non-transparent)
    const flatBadgeStyles = await page.getByTestId("badge-flat-info").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        borderColor: styles.borderColor,
      };
    });
    expect(isTransparent(flatBadgeStyles.backgroundColor)).toBe(false);
    expect(getColorDistance(flatBadgeStyles.color, flatBadgeStyles.backgroundColor)).toBeGreaterThan(2);
    expect(isTransparent(flatBadgeStyles.borderColor)).toBe(false);

    const flatPrimaryBadgeStyles = await page.getByTestId("badge-flat-primary").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });
    const expectedPrimaryColors = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-primary)";
      const probeContrast = document.createElement("span");
      probeContrast.style.color = "var(--color-primary-contrast)";
      document.body.append(probe, probeContrast);
      const colors = {
        primary: getComputedStyle(probe).color,
        contrast: getComputedStyle(probeContrast).color,
      };
      probe.remove();
      probeContrast.remove();
      return colors;
    });
    expectSameColor(flatPrimaryBadgeStyles.backgroundColor, expectedPrimaryColors.primary, "flat primary badge");
    expectSameColor(flatPrimaryBadgeStyles.color, expectedPrimaryColors.contrast, "flat primary badge text");

    // Secondary maps to the accent token pair.
    const flatSecondaryBadgeStyles = await page.getByTestId("badge-flat-secondary").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        color: styles.color,
      };
    });
    const expectedSecondaryColors = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-accent)";
      const probeContrast = document.createElement("span");
      probeContrast.style.color = "var(--color-accent-contrast)";
      document.body.append(probe, probeContrast);
      const colors = {
        accent: getComputedStyle(probe).color,
        contrast: getComputedStyle(probeContrast).color,
      };
      probe.remove();
      probeContrast.remove();
      return colors;
    });
    expectSameColor(flatSecondaryBadgeStyles.backgroundColor, expectedSecondaryColors.accent, "flat secondary badge");
    expectSameColor(flatSecondaryBadgeStyles.color, expectedSecondaryColors.contrast, "flat secondary badge text");

    // Soft badge: tinted background, no border
    const softBadgeStyles = await page.getByTestId("badge-soft-success").evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        backgroundColor: styles.backgroundColor,
        borderColor: styles.borderColor,
      };
    });
    expect(isTransparent(softBadgeStyles.backgroundColor)).toBe(false);
    expect(isTransparent(softBadgeStyles.borderColor)).toBe(true);
  });

  test("uses the neutral text tokens when no intent is set", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const values = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-text)";
      document.body.append(probe);
      const tokenText = getComputedStyle(probe).color;
      probe.remove();

      const read = (testId: string, pseudo?: string) =>
        getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!, pseudo);

      return {
        alertFg: read("alert-plain-none").color,
        badgeFg: read("badge-plain-none").color,
        progressBg: read("progress-plain-none", "::after").backgroundColor,
        tokenText,
      };
    });

    expectSameColor(values.alertFg, values.tokenText, "no-intent alert text");
    expectSameColor(values.badgeFg, values.tokenText, "no-intent badge text");
    expectSameColor(values.progressBg, values.tokenText, "no-intent progress fill");
  });

  test("colors progress fills and loaders by intent", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const fill = (testId: string) =>
        getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!, "::after").backgroundColor;

      return {
        loader: getComputedStyle(document.querySelector('[data-testid="loader-plain-success"]')!).backgroundColor,
        progressDestructive: fill("progress-plain-destructive"),
        progressInfo: fill("progress-plain-info"),
        progressPrimary: fill("progress-plain-primary"),
        progressSecondary: fill("progress-plain-secondary"),
        progressSuccess: fill("progress-plain-success"),
        progressWarning: fill("progress-plain-warning"),
        tokenDestructive: resolveToken("destructive"),
        tokenInfo: resolveToken("info"),
        tokenPrimary: resolveToken("primary"),
        tokenSecondary: resolveToken("accent"),
        tokenSuccess: resolveToken("success"),
        tokenWarning: resolveToken("warning"),
      };
    });

    expectSameColor(styles.loader, styles.tokenSuccess, "loader intent color");
    expect(styles.progressPrimary).toBe(styles.tokenPrimary);
    expect(styles.progressSecondary).toBe(styles.tokenSecondary);
    expect(styles.progressSuccess).toBe(styles.tokenSuccess);
    expect(styles.progressWarning).toBe(styles.tokenWarning);
    expect(styles.progressDestructive).toBe(styles.tokenDestructive);
    expect(styles.progressInfo).toBe(styles.tokenInfo);
  });

  test("renders active progress bar with skeleton animation on pseudo-element", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const activeProgressStyles = await page.evaluate(() => {
      const beforeStyles = getComputedStyle(
        document.querySelector('[data-testid="progress-plain-none-active"]')!,
        "::before",
      );
      return {
        animationName: beforeStyles.animationName,
        display: beforeStyles.display,
        backgroundImage: beforeStyles.backgroundImage,
      };
    });

    expect(activeProgressStyles.animationName).toContain("anim-skeleton");
    expect(activeProgressStyles.display).toBe("block");
    expect(activeProgressStyles.backgroundImage).toContain("linear-gradient");
  });

  test("renders indeterminate progress bar with sliding animation", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const indeterminateProgressStyles = await page.evaluate(() => {
      const afterStyles = getComputedStyle(
        document.querySelector('[data-testid="progress-plain-none-indeterminate"]')!,
        "::after",
      );
      return {
        animationName: afterStyles.animationName,
        display: afterStyles.display,
        width: afterStyles.width,
      };
    });

    expect(indeterminateProgressStyles.animationName).toContain("anim-progress-indeterminate");
    expect(indeterminateProgressStyles.display).toBe("block");
    expect(indeterminateProgressStyles.width).not.toBe("0px");
  });

  test("lifts a tooltip bubble no higher than a raised surface", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const shadows = await page.evaluate(() => {
      const probe = document.createElement("span");

      probe.style.boxShadow = "var(--elevation-mid)";
      document.body.append(probe);

      const mid = getComputedStyle(probe).boxShadow;

      probe.remove();

      const bubble = getComputedStyle(
        document.querySelector('[data-testid="fallback-tooltip"]') as Element,
        "::after",
      ).boxShadow;

      return { bubble, mid };
    });

    /* A bubble is a small transient popover, not a modal, so it sits at the
       elevation a hovered card uses. `--elevation-high` stays for full
       overlays. The bubble also carries Tailwind's empty ring layers, so this
       asserts the elevation is present rather than that it is the whole
       value. */
    expect(shadows.bubble).toContain(shadows.mid);
  });

  test("uses a default tooltip position when no position attribute is set", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const tooltipStyles = await page.getByTestId("fallback-tooltip").evaluate((element) => {
      const styles = getComputedStyle(element, "::after");

      return {
        left: styles.left,
        top: styles.top,
        transformOrigin: styles.transformOrigin,
      };
    });

    expect(tooltipStyles.left).not.toBe("auto");
    expect(tooltipStyles.top).not.toBe("auto");
    expect(tooltipStyles.transformOrigin).not.toBe("");
  });
});
