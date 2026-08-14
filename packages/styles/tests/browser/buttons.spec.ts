import { expect, test } from "@playwright/test";

import {
  BUTTON_INTENT_TOKENS,
  expectSameColor,
  flattenColor,
  getColorDistance,
  getContrastRatio,
  isTransparent,
  type ButtonIntentToken,
} from "./test-utils";

const BUTTONS_URL = "http://localhost:5184/buttons/?env=vanilla";

test.describe("buttons", () => {
  test("keeps filled semantic button text readable", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    /* A filled button is one whose fill resolves to `.solid`, which since
       presentation cascades means no quieter fill on the button or on an
       ancestor. `.btn`'s published default is solid, so the absence of a fill
       class is the filled case. */
    const buttonColors = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ":is(.btn.success, .btn.warning, .btn.destructive, .btn.info):not(:is(.soft, .bare)):not(:is(.soft, .bare) *)",
        ),
      ].map((button) => {
        const styles = getComputedStyle(button);

        return {
          backgroundColor: styles.backgroundColor,
          color: styles.color,
          label: button.textContent?.trim() ?? button.className,
        };
      }),
    );

    for (const button of buttonColors) {
      expect(getContrastRatio(button.color, button.backgroundColor), button.label).toBeGreaterThanOrEqual(3);
    }
  });

  test("composes button intent classes with presentation classes", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const styles = await page.evaluate(() => {
      const read = (testId: string) => {
        const element = document.querySelector(`[data-testid="${testId}"]`);

        if (!element) {
          throw new Error(`Expected button composition fixture ${testId} to exist.`);
        }

        return getComputedStyle(element);
      };
      const outline = read("btn-bare-edged-success");
      const soft = read("btn-soft-edgeless-success");
      const pill = read("primary-pill-button");
      const ghost = read("btn-bare-edgeless-secondary");

      return {
        ghostBackground: ghost.backgroundColor,
        ghostBorderColor: ghost.borderTopColor,
        ghostColor: ghost.color,
        primaryPillBorderRadius: pill.borderRadius,
        successOutlineBackground: outline.backgroundColor,
        successOutlineBorder: outline.borderColor,
        successOutlineColor: outline.color,
        successSoftBackground: soft.backgroundColor,
        successSoftColor: soft.color,
      };
    });

    /* `bare edged` is the outline button: no fill, a line in the intent. */
    expect(isTransparent(styles.successOutlineBorder)).toBe(false);
    expect(isTransparent(styles.successOutlineColor)).toBe(false);
    expect(isTransparent(styles.successOutlineBackground)).toBe(true);
    /* `bare edgeless` is the ghost: no fill and no line at all. The line goes in
       the colour rather than the width, so the box geometry stays identical
       across the edge classes and nothing shifts when one is applied. */
    expect(isTransparent(styles.ghostBackground)).toBe(true);
    expect(isTransparent(styles.ghostBorderColor)).toBe(true);
    expect(isTransparent(styles.ghostColor)).toBe(false);
    expect(isTransparent(styles.successSoftBackground)).toBe(false);
    expect(isTransparent(styles.successSoftColor)).toBe(false);
    expect(Number.parseFloat(styles.primaryPillBorderRadius)).toBeGreaterThan(20);

    await page.getByTestId("btn-bare-edgeless-secondary").hover();

    /* Hover is derived rather than declared: `bare` picks up the hover step, so
       a ghost button's background transitions out of fully transparent. A single
       read can land on the starting value before the transition moves. */
    await expect
      .poll(async () =>
        isTransparent(
          await page
            .getByTestId("btn-bare-edgeless-secondary")
            .evaluate((element) => getComputedStyle(element).backgroundColor),
        ),
      )
      .toBe(false);
  });

  /* `.loading` hides the label by forcing `color` to transparent, so the spinner
     cannot paint in `currentColor`: it has to read the foreground `box`
     resolved. A spinner painted in the hidden colour is invisible, which looks
     exactly like a button that never entered the loading state. */
  test("centers a visible loading spinner in the label's own color", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const styles = await page.evaluate(() => {
      const read = (testId: string) => {
        const button = document.querySelector(`[data-testid="${testId}"]`)!;
        const spinner = getComputedStyle(button, "::after");

        return {
          buttonHeight: button.getBoundingClientRect().height,
          buttonWidth: button.getBoundingClientRect().width,
          labelColor: getComputedStyle(button).color,
          spinnerColor: spinner.backgroundColor,
          spinnerHeight: spinner.height,
          spinnerLeft: spinner.left,
          spinnerMask: spinner.maskImage || spinner.webkitMaskImage || "none",
          spinnerTop: spinner.top,
          spinnerTranslate: spinner.translate,
          spinnerWidth: spinner.width,
        };
      };

      return { soft: read("btn-soft-edged-primary-loading"), solid: read("loading-button") };
    });

    for (const [label, measured] of Object.entries(styles)) {
      expect(measured.spinnerMask, `${label} artwork`).not.toBe("none");
      expect(Number.parseFloat(measured.spinnerTop), `${label} top`).toBeCloseTo(measured.buttonHeight / 2, 1);
      expect(Number.parseFloat(measured.spinnerLeft), `${label} left`).toBeCloseTo(measured.buttonWidth / 2, 1);
      expect(measured.spinnerTranslate, `${label} translate`).toBe("-50% -50%");
      expect(measured.spinnerWidth, `${label} width`).not.toBe("0px");
      expect(measured.spinnerHeight, `${label} height`).not.toBe("0px");
      /* The label is hidden and the spinner is not. */
      expect(isTransparent(measured.labelColor), `${label} label`).toBe(true);
      expect(isTransparent(measured.spinnerColor), `${label} spinner`).toBe(false);
    }

    /* A solid button's spinner is the contrast tone and a soft one's is the
       intent tone, so reading `--_fg` rather than a fixed colour is what makes
       both legible. */
    expect(getColorDistance(styles.solid.spinnerColor, styles.soft.spinnerColor)).toBeGreaterThan(2);
  });

  test("uses loader variants on loading buttons", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const images = await Promise.all(
      ["loading-button", "loading-button-dots", "loading-button-bars"].map((testId) =>
        page
          .getByTestId(testId)
          .evaluate((button) => getComputedStyle(button, "::after").getPropertyValue("--loader-art")),
      ),
    );

    for (const [index, image] of images.entries()) {
      expect(image, `${index}`).toContain("data:image/svg+xml");
    }
    expect(new Set(images).size).toBe(images.length);
  });

  test("styles disabled and error button states", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const styles = await page.evaluate(() => {
      const disabledStyles = getComputedStyle(document.querySelector('[data-testid="aria-disabled-button"]')!);
      const errorStyles = getComputedStyle(document.querySelector('[data-testid="btn-default-error"]')!);

      return {
        disabledCursor: disabledStyles.cursor,
        disabledOpacity: disabledStyles.opacity,
        errorBackground: errorStyles.backgroundColor,
        errorColor: errorStyles.color,
      };
    });

    expect(styles.errorColor).not.toBe(styles.errorBackground);
    expect(styles.disabledCursor).toBe("not-allowed");
    expect(Number(styles.disabledOpacity)).toBeLessThan(1);
  });

  /* A filled button with no intent is the package's most common single element,
     and the neutral cap is the whole reason it is a quiet plate rather than a
     slab of the page's own ink. Both expectations are built from the cap the
     button itself reports, so this states the contract -- a neutral fill stops
     where its intent says it stops, and its ink walks toward the contrast tone
     exactly that far -- instead of restating numbers that would then have to be
     changed in two places.

     The ink matters as much as the fill. Capping one alone prints the ink of a
     full slab onto a fifth of one: white on light grey, which is how a capped
     intent loses its label. */
  test("fills a button with no intent to the neutral cap and no further", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const values = await page.evaluate(() => {
      const resolveColor = (value: string) => {
        const probe = document.createElement("span");
        probe.style.color = value;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const styles = getComputedStyle(document.querySelector('[data-testid="btn-default-none"]')!);
      const cap = styles.getPropertyValue("--intent-fill-max").trim();

      return {
        background: styles.backgroundColor,
        cap,
        expectedFill: resolveColor(`color-mix(in oklab, var(--color-text) ${cap}, transparent)`),
        expectedText: resolveColor(`color-mix(in oklab, var(--color-text-contrast) ${cap}, var(--color-text-strong))`),
        foreground: styles.color,
        page: getComputedStyle(document.body).backgroundColor,
      };
    });

    expect(Number.parseFloat(values.cap)).toBeLessThan(100);
    expectSameColor(values.background, values.expectedFill, "no-intent button background");
    expectSameColor(values.foreground, values.expectedText, "no-intent button text");

    /* A quieter plate is only worth having if the label still reads on it. The
       fill is translucent, so the ratio is measured against what the button
       actually shows: the fill composited over the page behind it. */
    const plate = flattenColor(values.background, values.page);
    expect(getContrastRatio(values.foreground, plate), "no-intent button label").toBeGreaterThanOrEqual(4.5);
  });

  test("hides nested elements inside loading buttons", async ({ page }) => {
    await page.goto(BUTTONS_URL);
    const childOpacity = await page.evaluate(() => {
      const child = document.querySelector('[data-testid="loading-nested-text"]');
      if (!child) {
        throw new Error("Nested text fixture not found");
      }
      return getComputedStyle(child).opacity;
    });
    expect(childOpacity).toBe("0");
  });

  test("uses intent tone slots for button presentation classes", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const buttonPresentationStyles = await page.evaluate((intents) => {
      const resolveColor = ({ host, value }: { host: Element; value: string }) => {
        const probe = document.createElement("span");
        probe.style.color = value;
        host.append(probe);

        const color = getComputedStyle(probe).color;
        probe.remove();

        return color;
      };

      const resolveTokenColor = ({ host, tokenName }: { host: Element; tokenName: string }) =>
        resolveColor({ host, value: `var(--color-${tokenName})` });

      const readButtonStyles = ({
        host,
        intent,
        theme,
      }: {
        host: Element;
        intent: ButtonIntentToken;
        theme: "dark" | "light";
      }) => {
        const outlineButton = document.createElement("button");
        const ghostButton = document.createElement("button");
        const softButton = document.createElement("button");

        outlineButton.className = `btn ${intent.className} bare edged`;
        ghostButton.className = `btn ${intent.className} bare edgeless`;
        softButton.className = `btn ${intent.className} soft edgeless`;
        host.append(outlineButton, ghostButton, softButton);

        const outlineStyles = getComputedStyle(outlineButton);
        const ghostStyles = getComputedStyle(ghostButton);
        const softStyles = getComputedStyle(softButton);

        const styles = {
          expectedOutlineBorder: resolveTokenColor({
            host,
            tokenName: intent.tokenName,
          }),
          /* An unfilled button's text is the intent's strong tone: `--ui-fg-on-fill`
             is 0%, so `box` mixes the contrast tone in at zero strength and lands
             on `--intent-strong`. The base tone is a ground, picked to be filled
             with; the strong tone is the one picked to be read on a page, which
             is why amber-800 rather than amber-600 prints here. */
          expectedPresentationText: resolveTokenColor({
            host,
            tokenName: `${intent.tokenName}-strong`,
          }),
          /* The same mix `.soft` produces, resolved by the browser so the test
             states the intended tint rather than a hard-coded color. */
          expectedSoftBackground: resolveColor({
            host,
            value: `color-mix(in oklab, var(--color-${intent.tokenName}) 12%, transparent)`,
          }),
          ghostColor: ghostStyles.color,
          intent: intent.className,
          outlineBorderColor: outlineStyles.borderColor,
          outlineColor: outlineStyles.color,
          softBackground: softStyles.backgroundColor,
          softColor: softStyles.color,
          theme,
        };

        outlineButton.remove();
        ghostButton.remove();
        softButton.remove();

        return styles;
      };

      const darkHost = document.createElement("section");
      darkHost.className = "dark";
      document.body.append(darkHost);

      const styles = intents.flatMap((intent) => [
        readButtonStyles({ host: document.body, intent, theme: "light" }),
        readButtonStyles({ host: darkHost, intent, theme: "dark" }),
      ]);

      darkHost.remove();

      return styles;
    }, BUTTON_INTENT_TOKENS);

    for (const styles of buttonPresentationStyles) {
      const label = `${styles.theme} ${styles.intent}`;

      expectSameColor(styles.outlineColor, styles.expectedPresentationText, `${label} outline color`);
      expectSameColor(styles.outlineBorderColor, styles.expectedOutlineBorder, `${label} outline border`);
      expectSameColor(styles.ghostColor, styles.expectedPresentationText, `${label} ghost color`);
      expectSameColor(styles.softColor, styles.expectedPresentationText, `${label} soft color`);
      expectSameColor(styles.softBackground, styles.expectedSoftBackground, `${label} soft background`);
    }
  });

  test("cascades presentation from a container and lets an element override it", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const styles = await page.evaluate(() => {
      const container = document.createElement("div");
      container.className = "soft";

      const inheritedButton = document.createElement("button");
      const overriddenButton = document.createElement("button");
      const inheritedBadge = document.createElement("span");

      inheritedButton.className = "btn primary";
      overriddenButton.className = "btn primary bare edged";
      inheritedBadge.className = "badge success";
      container.append(inheritedButton, overriddenButton, inheritedBadge);
      document.body.append(container);

      const soloButton = document.createElement("button");
      soloButton.className = "btn primary";
      document.body.append(soloButton);

      const softButton = document.createElement("button");
      softButton.className = "btn primary soft";
      document.body.append(softButton);

      const result = {
        inheritedBadgeBackground: getComputedStyle(inheritedBadge).backgroundColor,
        inheritedBadgeBorder: getComputedStyle(inheritedBadge).borderTopColor,
        inheritedButtonBackground: getComputedStyle(inheritedButton).backgroundColor,
        overriddenButtonBackground: getComputedStyle(overriddenButton).backgroundColor,
        overriddenButtonBorderColor: getComputedStyle(overriddenButton).borderTopColor,
        softButtonBackground: getComputedStyle(softButton).backgroundColor,
        soloButtonBackground: getComputedStyle(soloButton).backgroundColor,
      };

      container.remove();
      soloButton.remove();
      softButton.remove();

      return result;
    });

    // A container turns its subtree soft, matching an element-level `.soft`.
    expectSameColor(styles.inheritedButtonBackground, styles.softButtonBackground, "inherited soft button");
    expect(getColorDistance(styles.inheritedButtonBackground, styles.soloButtonBackground)).toBeGreaterThan(2);

    /* The badge is a different component reading the same inherited tokens. It
       rests edgeless, so it draws no edge and the inherited tint shows through
       the border band unbroken. */
    expect(isTransparent(styles.inheritedBadgeBorder), "inherited badge edge").toBe(true);
    expect(isTransparent(styles.inheritedBadgeBackground)).toBe(false);

    /* An element declaring its own presentation wins over the container: the
       button drops the inherited tint and draws the line the container's fill
       classes never asked for. */
    expect(isTransparent(styles.overriddenButtonBackground)).toBe(true);
    expect(isTransparent(styles.overriddenButtonBorderColor)).toBe(false);
  });

  /* Replaces the `.out.fill` coverage this suite used to carry. `.fill` is gone
     and has no replacement spelling: hover is derived from the resting fill by
     one published step, so an outline button tints rather than filling, and its
     text stays the intent tone instead of flipping to the contrast one. */
  test("tints an outline button on hover by the published step", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const expected = await page.evaluate(() => {
      const probe = document.createElement("span");
      const host = document.querySelector('[data-testid="preview-root"]')!;
      const step = getComputedStyle(document.documentElement).getPropertyValue("--hover-step").trim();

      probe.style.backgroundColor = `color-mix(in oklab, var(--color-primary-hover) ${step}, transparent)`;
      probe.style.color = "var(--color-primary-strong)";
      host.append(probe);

      const values = {
        hoverTint: getComputedStyle(probe).backgroundColor,
        intent: getComputedStyle(probe).color,
        step,
      };

      probe.remove();

      return values;
    });

    expect(expected.step).toBe("14%");

    const outline = page.getByTestId("btn-bare-edged-primary");

    await outline.hover();

    /* Background and colour are both transitioned, so these poll for the settled
       value rather than reading mid-flight. */
    await expect
      .poll(async () =>
        getColorDistance(
          await outline.evaluate((element) => getComputedStyle(element).backgroundColor),
          expected.hoverTint,
        ),
      )
      .toBeLessThanOrEqual(2);

    expectSameColor(
      await outline.evaluate((element) => getComputedStyle(element).color),
      expected.intent,
      "hovered outline text",
    );
  });

  /* A hovered `.solid` box mixes its edge toward `--intent-hover`, not toward
     the resting `--intent-color`. Without that the edge blends to the resting
     colour exactly, and a hovered solid button wears a ring of the colour it
     just left -- visible only as a hairline, and invisible to any assertion that
     reads the background alone. */
  test("moves a hovered solid button's edge to the hover tone", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    /* Built rather than read off the grid: `.solid` shows one row there, and a
       button with no edge class rests edgeless, whose edge is nothing at all.
       The tone the edge follows is only visible where a line is drawn. */
    await page.evaluate(() => {
      const button = document.createElement("button");

      button.className = "btn primary solid edged";
      button.dataset.testid = "hover-solid-edged";
      document.querySelector('[data-testid="preview-root"]')!.append(button);
    });

    const solid = page.getByTestId("hover-solid-edged");
    const resting = await solid.evaluate((element) => getComputedStyle(element).borderTopColor);
    const hoverToken = await page.evaluate(() => {
      const probe = document.createElement("span");

      probe.style.color = "var(--color-primary-hover)";
      document.body.append(probe);

      const color = getComputedStyle(probe).color;

      probe.remove();

      return color;
    });

    expect(getColorDistance(resting, hoverToken), "resting edge is not already the hover tone").toBeGreaterThan(2);

    await solid.hover();

    await expect
      .poll(async () =>
        getColorDistance(await solid.evaluate((element) => getComputedStyle(element).borderTopColor), hoverToken),
      )
      .toBeLessThanOrEqual(2);
  });

  /* The two intents whose hover token is itself a `color-mix()` rather than a
     `light-dark()` pair, which is what makes them the interesting case: `box`
     nests that token two levels deeper to blend the edge toward the fill, and
     three levels of `color-mix()` over a `light-dark()` crashes the WebKit
     renderer outright -- the same limit `progress` is written around. Asserted
     where it can be, and skipped where the engine cannot survive the hover. */
  test("derives the hover tint for the semantic intents", async ({ browserName, page }) => {
    test.skip(
      browserName === "webkit",
      "WebKit crashes hovering `.success`/`.warning`: their hover token is a color-mix, and box nests it two deeper",
    );
    await page.goto(BUTTONS_URL);

    /* oxlint-disable no-await-in-loop -- one page, hovered in turn: hover is a
       single pointer, so the intents cannot be probed in parallel. */
    for (const intent of ["success", "warning"] as const) {
      const expected = await page.evaluate((name) => {
        const probe = document.createElement("span");
        const step = getComputedStyle(document.documentElement).getPropertyValue("--hover-step").trim();

        probe.style.backgroundColor = `color-mix(in oklab, var(--color-${name}-hover) ${step}, transparent)`;
        document.querySelector('[data-testid="preview-root"]')!.append(probe);

        const tint = getComputedStyle(probe).backgroundColor;

        probe.remove();

        return tint;
      }, intent);
      const outline = page.getByTestId(`btn-bare-edged-${intent}`);

      await outline.hover();

      await expect
        .poll(
          async () =>
            getColorDistance(await outline.evaluate((element) => getComputedStyle(element).backgroundColor), expected),
          { message: intent },
        )
        .toBeLessThanOrEqual(2);
    }
  });

  test("configures button padding with the compact and spacious modifiers", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const readPadding = (testId: string, property: "padding" | "paddingLeft") =>
      page.getByTestId(testId).evaluate((element, name) => getComputedStyle(element)[name], property);

    expect(await readPadding("btn-compact", "paddingLeft")).toBe("10px");
    expect(await readPadding("btn-default-padding", "paddingLeft")).toBe("16px");
    expect(await readPadding("btn-spacious", "paddingLeft")).toBe("24px");

    expect(await readPadding("btn-icon-compact", "padding")).toBe("4px");
    expect(await readPadding("btn-icon-default", "padding")).toBe("8px");
    expect(await readPadding("btn-icon-spacious", "padding")).toBe("12px");
  });
});
