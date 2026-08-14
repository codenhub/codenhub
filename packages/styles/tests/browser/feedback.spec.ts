import { expect, test } from "@playwright/test";

import { expectSameColor, getColorDistance, isTransparent, readSrgb } from "./test-utils";

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

  /* An indicator reads intent and no presentation token at all: it stands in for
     content rather than being a box with a look, so there is nothing a fill or an
     edge class has to say about it. The floor that used to keep an unfilled
     skeleton visible is gone with the `--ui-fill` read it was fighting. */
  test("renders a skeleton from its intent alone", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]')!;
      const read = (className: string) => {
        const skeleton = document.createElement("div");

        skeleton.className = `skeleton ${className}`;
        host.append(skeleton);

        const computed = getComputedStyle(skeleton);
        const values = { border: computed.borderTopWidth, image: computed.backgroundImage };

        skeleton.remove();

        return values;
      };

      return {
        bareEdgeless: read("primary bare edgeless"),
        plain: read("primary"),
        secondary: read("secondary"),
        solidEdged: read("primary solid edged"),
      };
    });

    expect(styles.plain.image).not.toBe("none");
    /* Both ends of both axes land on the same pixels as no class at all. */
    expect(styles.solidEdged.image, "solid edged").toBe(styles.plain.image);
    expect(styles.bareEdgeless.image, "bare edgeless").toBe(styles.plain.image);
    expect(styles.solidEdged.border, "no edge to draw").toBe("0px");
    /* Intent is the one axis it does read. */
    expect(styles.secondary.image).not.toBe(styles.plain.image);
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

      const probe = document.createElement("span");

      probe.style.color = "var(--color-background)";
      document.body.append(probe);

      const ground = getComputedStyle(probe).color;

      probe.remove();

      return {
        bare: read("alert-bare-edged-info"),
        ground,
        softEdgeless: read("alert-soft-edgeless-warning"),
        solid: read("alert-solid-info"),
      };
    });

    /* Solid fills and flips the text to the contrast tone. */
    expect(isTransparent(styles.solid.background)).toBe(false);
    expect(getColorDistance(styles.solid.color, styles.solid.background)).toBeGreaterThan(2);
    /* Soft tints and keeps the intent tone; `.edgeless` drops the line. */
    expect(isTransparent(styles.softEdgeless.background)).toBe(false);
    expect(getColorDistance(styles.softEdgeless.color, styles.softEdgeless.background)).toBeGreaterThan(2);
    /* `.edgeless` zeroes the line, and P3 then blends what is left toward the
       fill: on a surface that leaves the fill's own twelve percent against the
       opaque line an `.edged` one draws. The border box sits over the alert's own
       background, so that reads as a seamless boundary rather than a gap. */
    expect(readSrgb(styles.softEdgeless.border).alpha, "edgeless alert line").toBeLessThanOrEqual(0.13);
    expect(readSrgb(styles.bare.border).alpha, "edged alert line").toBe(1);
    /* Bare adds no fill, so what is left is the ground every surface rests on --
       an alert is a container, and a container is opaque. `.edged` still draws
       the line. */
    expectSameColor(styles.bare.background, styles.ground, "bare alert ground");
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

      /* The edge axis is not on the grid at `.solid` -- one row stands for both,
         because they render the same box -- so the pair is built here to prove
         that is true rather than assumed. */
      const probe = (className: string) => {
        const element = document.createElement("span");

        element.className = className;
        document.body.append(element);

        const styles = getComputedStyle(element);
        const values = { background: styles.backgroundColor, border: styles.borderTopColor };

        element.remove();

        return values;
      };

      return {
        edgedSolid: probe("badge info solid edged"),
        edgelessSolid: probe("badge info solid edgeless"),
        solidInfo: read("badge-solid-info"),
        solidPrimary: read("badge-solid-primary"),
        solidSecondary: read("badge-solid-secondary"),
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
       draws the boundary in the fill and `.edgeless` draws none -- and the border
       box shows the same fill through the gap. Two spellings, one box. */
    expectSameColor(styles.edgedSolid.border, styles.edgedSolid.background, "solid edged badge edge");
    expect(isTransparent(styles.edgelessSolid.border), "solid edgeless badge edge").toBe(true);
    expectSameColor(styles.edgelessSolid.background, styles.edgedSolid.background, "solid badge fill");

    expectSameColor(styles.solidPrimary.background, styles.tokenPrimary, "solid primary badge");
    expectSameColor(styles.solidPrimary.color, styles.tokenPrimaryContrast, "solid primary badge text");
    // Secondary maps to the accent token pair.
    expectSameColor(styles.solidSecondary.background, styles.tokenAccent, "solid secondary badge");
    expectSameColor(styles.solidSecondary.color, styles.tokenAccentContrast, "solid secondary badge text");

    /* An edgeless box draws no edge at all, so the border band shows the fill
       through it and the boundary is the fill rather than a ring. Asserting the
       colour matched the fill instead would pass on a band painted a second coat
       of a translucent tint, which is the ring it is meant to rule out. */
    expect(isTransparent(styles.softSuccess.background)).toBe(false);
    expect(isTransparent(styles.softSuccess.border), "soft badge edge").toBe(true);
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

  /* Elevation is one unitless number multiplied into the aesthetic's shadow
     geometry, so "twice a card" is a measurement rather than a second shadow
     token. The registry rests a bubble at 2 and a card at 1, and this is that
     sentence read off the composited value. */
  test("lifts a tooltip bubble to twice a raised card's depth", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const offsets = await page.evaluate(() => {
      /* Every engine serialises a layer as `<colour> <x> <y> <blur> <spread>`, so
         the vertical offset is the second length after the colour closes. */
      const verticalOffset = (shadow: string) => Number.parseFloat(shadow.split(") ")[1]!.split(" ")[1]!);
      const host = document.querySelector('[data-testid="preview-root"]')!;
      const card = document.createElement("div");

      /* A card rests flat now, so the unit of depth is one a consumer asked
         for. The bubble is the one component that floats without being asked. */
      card.className = "card raised";
      host.append(card);

      const values = {
        bubble: verticalOffset(
          getComputedStyle(document.querySelector('[data-testid="fallback-tooltip"]')!, "::after").boxShadow,
        ),
        card: verticalOffset(getComputedStyle(card).boxShadow),
      };

      card.remove();

      return values;
    });

    expect(offsets.card, "a raised card draws a step of depth").toBeGreaterThan(0);
    expect(offsets.bubble).toBe(offsets.card * 2);
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
