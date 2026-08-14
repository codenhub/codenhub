import { expect, test } from "@playwright/test";

import { expectSameColor, getColorDistance, isTransparent } from "./test-utils";

const FEEDBACK_URL = "http://localhost:5184/feedback/?env=vanilla";

test.describe("feedback", () => {
  test("loads canonical compiled styles with tokens and components", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    await expect(page.getByTestId("preview-root")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();

    const badgeStyles = await page.getByTestId("badge-default-primary").evaluate((element) => {
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

    const alertStyles = await page.getByTestId("alert-default-success").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { borderWidth: styles.borderWidth, color: styles.color };
    });
    const alertIconPaddingLeft = await page
      .getByTestId("alert-default-success-icon")
      .evaluate((element) => getComputedStyle(element).paddingLeft);

    expect(alertStyles.borderWidth).not.toBe("0px");
    expect(alertStyles.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(alertIconPaddingLeft).toBe("44px");
  });

  test("animates skeletons and styles progress tracks", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const skeletonAnimationName = await page
      .getByTestId("skeleton-default-none")
      .evaluate((element) => getComputedStyle(element).animationName);
    const progressStyles = await page.getByTestId("progress-default-none").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { backgroundColor: styles.backgroundColor, overflow: styles.overflow };
    });

    expect(skeletonAnimationName).not.toBe("none");
    expect(progressStyles.overflow).toBe("hidden");
    expect(progressStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  /* A loader used to be a bordered box wrapped around a masked pseudo-element,
     and it read every presentation class through that box. It is now the mask
     itself: a coloured shape with no fill, no edge and no silhouette. The
     presentation coverage is not narrowed but inverted -- what has to hold is
     that no presentation class moves it at all. */
  test("keeps a loader on intent alone, whatever presentation is in scope", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const measured = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]')!;
      const read = (presentation: string) => {
        const loader = document.createElement("span");

        loader.className = `loader primary ${presentation}`.trim();
        host.append(loader);

        const styles = getComputedStyle(loader);
        const result = {
          background: styles.backgroundColor,
          borderWidth: styles.borderTopWidth,
          presentation: presentation || "default",
        };

        loader.remove();

        return result;
      };
      const probe = document.createElement("span");

      probe.style.color = "var(--color-primary)";
      host.append(probe);

      const intent = getComputedStyle(probe).color;

      probe.remove();

      return {
        intent,
        variants: ["", "solid edged", "soft edged", "bare edged", "bare edgeless"].map(read),
      };
    });

    for (const variant of measured.variants) {
      expect(variant.borderWidth, `${variant.presentation} border`).toBe("0px");
      expectSameColor(variant.background, measured.intent, `${variant.presentation} loader colour`);
    }
  });

  /* A skeleton is still wave 2: it reads `--ui-fill` behind a visibility floor
     and `--ui-border` behind a one-pixel ceiling, and paints them into its own
     gradient rather than through `box`. */
  test("renders every skeleton presentation", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const read = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      return {
        bareBorderWidth: read("skeleton-bare-edged-primary").borderTopWidth,
        bareEdgeless: read("skeleton-bare-edgeless-primary").backgroundImage,
        soft: read("skeleton-soft-edgeless-primary").backgroundImage,
        solid: read("skeleton-solid-edgeless-primary").backgroundImage,
      };
    });

    /* The floor is what keeps an unfilled skeleton visible at all. */
    expect(styles.bareEdgeless).not.toBe("none");
    expect(styles.soft).not.toBe(styles.bareEdgeless);
    expect(styles.solid).not.toBe(styles.soft);
    /* A skeleton is 16px tall, so its edge keeps a one-pixel ceiling. */
    expect(Number.parseFloat(styles.bareBorderWidth)).toBeLessThanOrEqual(1);
  });

  test("sizes loaders and renders every loader variant", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const loaderWidths = await Promise.all(
      ["loader-sm", "loader-default", "loader-lg"].map((testId) =>
        page.getByTestId(testId).evaluate((element) => getComputedStyle(element).width),
      ),
    );
    /* The artwork is the element's own mask now, not a pseudo-element's. */
    const loaderDefaultMask = await page.getByTestId("loader-default").evaluate((element) => {
      const styles = getComputedStyle(element);

      return styles.maskImage || styles.getPropertyValue("-webkit-mask-image") || "none";
    });
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
        page.getByTestId(testId).evaluate((element) => getComputedStyle(element).getPropertyValue("--loader-art")),
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
        page.getByTestId(testId).evaluate((element) => getComputedStyle(element).getPropertyValue("--loader-art")),
      ),
    );

    expect(new Set(images).size).toBe(testIds.length);
  });

  /* `.flat` is an elevation modifier now, and the fill it used to name is
     `.solid`. An alert is still wave 2: it composes `--ui-fill`, `--ui-fg-on-fill`
     and `--ui-border` itself rather than through `box`, so its resting pair is a
     `var()` fallback (12% fill, 42% edge) rather than a `--_d-*` declaration. */
  test("renders every alert fill", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const read = (testId: string) => {
        const element = getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

        return {
          background: element.backgroundColor,
          border: element.borderTopColor,
          color: element.color,
        };
      };

      return {
        bare: read("alert-bare-edged-info"),
        softEdgeless: read("alert-soft-edgeless-warning"),
        solid: read("alert-solid-edged-info"),
      };
    });

    /* Solid fills and flips the text to the contrast tone. */
    expect(isTransparent(styles.solid.background)).toBe(false);
    expect(getColorDistance(styles.solid.color, styles.solid.background)).toBeGreaterThan(2);
    /* Soft tints and keeps the intent tone; `.edgeless` drops the line. */
    expect(isTransparent(styles.softEdgeless.background)).toBe(false);
    expect(getColorDistance(styles.softEdgeless.color, styles.softEdgeless.background)).toBeGreaterThan(2);
    expect(isTransparent(styles.softEdgeless.border)).toBe(true);
    /* Bare fills nothing at all, and `.edged` still draws the line. */
    expect(isTransparent(styles.bare.background)).toBe(true);
    expect(isTransparent(styles.bare.border)).toBe(false);
  });

  test("renders every badge fill", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const read = (testId: string) => {
        const element = getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

        return {
          background: element.backgroundColor,
          border: element.borderTopColor,
          color: element.color,
        };
      };
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");

        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);

        const color = getComputedStyle(probe).color;

        probe.remove();

        return color;
      };

      return {
        solidInfo: read("badge-solid-edged-info"),
        solidPrimary: read("badge-solid-edgeless-primary"),
        solidSecondary: read("badge-solid-edgeless-secondary"),
        softSuccess: read("badge-soft-edgeless-success"),
        tokenAccent: resolveToken("accent"),
        tokenAccentContrast: resolveToken("accent-contrast"),
        tokenPrimary: resolveToken("primary"),
        tokenPrimaryContrast: resolveToken("primary-contrast"),
      };
    });

    /* A solid badge fills with the intent and reads in the contrast tone. */
    expect(isTransparent(styles.solidInfo.background)).toBe(false);
    expect(getColorDistance(styles.solidInfo.color, styles.solidInfo.background)).toBeGreaterThan(2);
    /* P3: a filled badge's edge blends all the way to its own fill, so `.edged`
       leaves a seamless boundary rather than a ring of another colour. */
    expectSameColor(styles.solidInfo.border, styles.solidInfo.background, "solid badge edge");

    expectSameColor(styles.solidPrimary.background, styles.tokenPrimary, "solid primary badge");
    expectSameColor(styles.solidPrimary.color, styles.tokenPrimaryContrast, "solid primary badge text");
    // Secondary maps to the accent token pair.
    expectSameColor(styles.solidSecondary.background, styles.tokenAccent, "solid secondary badge");
    expectSameColor(styles.solidSecondary.color, styles.tokenAccentContrast, "solid secondary badge text");

    /* Soft badge: tinted background and no line to read. `.edgeless` zeroes the
       line, and P3 then blends the edge to the fill, so the boundary is the fill
       rather than a transparent gap the background would show through. */
    expect(isTransparent(styles.softSuccess.background)).toBe(false);
    expectSameColor(styles.softSuccess.border, styles.softSuccess.background, "soft badge edge");
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
        alertFg: read("alert-default-none").color,
        badgeFg: read("badge-default-none").color,
        progressBg: read("progress-default-none", "::after").backgroundColor,
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
        /* The loader is the mask, so its own background is the colour. */
        loader: getComputedStyle(document.querySelector('[data-testid="loader-default-success"]')!).backgroundColor,
        progressDestructive: fill("progress-default-destructive"),
        progressInfo: fill("progress-default-info"),
        progressPrimary: fill("progress-default-primary"),
        progressSecondary: fill("progress-default-secondary"),
        progressSuccess: fill("progress-default-success"),
        progressWarning: fill("progress-default-warning"),
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
        document.querySelector('[data-testid="progress-default-none-active"]')!,
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
        document.querySelector('[data-testid="progress-default-none-indeterminate"]')!,
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
