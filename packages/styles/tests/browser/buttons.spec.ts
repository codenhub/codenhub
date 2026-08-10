import { expect, test } from "@playwright/test";

import {
  BUTTON_INTENT_TOKENS,
  expectSameColor,
  getColorDistance,
  getContrastRatio,
  isTransparent,
  type ButtonIntentToken,
} from "./test-utils";

const BUTTONS_URL = "http://localhost:5184/buttons/?env=vanilla";

test.describe("buttons", () => {
  test("keeps filled semantic button text readable", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    /* A filled button is one with no presentation in scope, which since
       presentation cascades means neither on the button nor on an ancestor. */
    const buttonColors = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          ":is(.btn.success, .btn.warning, .btn.destructive, .btn.info):not(:is(.out, .ghost, .soft)):not(:is(.out, .ghost, .soft) *)",
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
      const successOutlineButton = document.querySelector('[data-testid="btn-out-success"]');
      const successSoftButton = document.querySelector('[data-testid="btn-soft-success"]');
      const primaryPillButton = document.querySelector('[data-testid="primary-pill-button"]');
      const secondaryGhostButton = document.querySelector('[data-testid="btn-ghost-secondary"]');

      if (!successOutlineButton || !successSoftButton || !primaryPillButton || !secondaryGhostButton) {
        throw new Error("Expected button composition fixtures to exist.");
      }

      const successOutlineStyles = getComputedStyle(successOutlineButton);
      const successSoftStyles = getComputedStyle(successSoftButton);
      const primaryPillStyles = getComputedStyle(primaryPillButton);
      const secondaryGhostStyles = getComputedStyle(secondaryGhostButton);

      return {
        ghostBackground: secondaryGhostStyles.backgroundColor,
        ghostColor: secondaryGhostStyles.color,
        successOutlineBackground: successOutlineStyles.backgroundColor,
        successOutlineBorder: successOutlineStyles.borderColor,
        successOutlineColor: successOutlineStyles.color,
        successSoftBackground: successSoftStyles.backgroundColor,
        successSoftColor: successSoftStyles.color,
        primaryPillBorderRadius: primaryPillStyles.borderRadius,
      };
    });

    expect(isTransparent(styles.successOutlineBorder)).toBe(false);
    expect(isTransparent(styles.successOutlineColor)).toBe(false);
    expect(isTransparent(styles.successOutlineBackground)).toBe(true);
    expect(isTransparent(styles.ghostBackground)).toBe(true);
    expect(isTransparent(styles.ghostColor)).toBe(false);
    expect(isTransparent(styles.successSoftBackground)).toBe(false);
    expect(isTransparent(styles.successSoftColor)).toBe(false);
    expect(Number.parseFloat(styles.primaryPillBorderRadius)).toBeGreaterThan(20);

    await page.getByTestId("btn-ghost-secondary").hover();

    // A ghost button's hover background transitions out of fully transparent, so
    // a single read can land on the starting value before the transition moves.
    await expect
      .poll(async () =>
        isTransparent(
          await page
            .getByTestId("btn-ghost-secondary")
            .evaluate((element) => getComputedStyle(element).backgroundColor),
        ),
      )
      .toBe(false);
  });

  test("centers the loading spinner without transitioning hidden colors", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const styles = await page.getByTestId("loading-button").evaluate((button) => {
      const rootStyles = getComputedStyle(button);
      const spinnerStyles = getComputedStyle(button, "::after");

      return {
        buttonHeight: button.getBoundingClientRect().height,
        buttonWidth: button.getBoundingClientRect().width,
        spinnerAnimation:
          spinnerStyles.animationName !== "none"
            ? spinnerStyles.animationName
            : spinnerStyles.maskImage || spinnerStyles.webkitMaskImage || "none",
        spinnerHeight: spinnerStyles.height,
        spinnerLeft: spinnerStyles.left,
        spinnerTop: spinnerStyles.top,
        spinnerTranslate: spinnerStyles.translate,
        spinnerWidth: spinnerStyles.width,
        transitionProperty: rootStyles.transitionProperty,
      };
    });

    expect(styles.spinnerAnimation).not.toBe("none");
    expect(Number.parseFloat(styles.spinnerTop)).toBeCloseTo(styles.buttonHeight / 2, 1);
    expect(Number.parseFloat(styles.spinnerLeft)).toBeCloseTo(styles.buttonWidth / 2, 1);
    expect(styles.spinnerTranslate).toBe("-50% -50%");
    expect(styles.transitionProperty).not.toContain("background-color");
    expect(styles.transitionProperty).not.toContain("color");
    expect(styles.spinnerWidth).not.toBe("0px");
    expect(styles.spinnerHeight).not.toBe("0px");
  });

  test("uses loader variants on loading buttons", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const images = await Promise.all(
      ["loading-button", "loading-button-dots", "loading-button-bars"].map((testId) =>
        page
          .getByTestId(testId)
          .evaluate((button) => getComputedStyle(button, "::after").getPropertyValue("--ai-image")),
      ),
    );

    expect(new Set(images).size).toBe(images.length);
  });

  test("styles disabled and error button states", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const styles = await page.evaluate(() => {
      const disabledStyles = getComputedStyle(document.querySelector('[data-testid="aria-disabled-button"]')!);
      const errorStyles = getComputedStyle(document.querySelector('[data-testid="btn-plain-error"]')!);

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

  test("uses the neutral text tokens when no intent is set", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const values = await page.evaluate(() => {
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const styles = getComputedStyle(document.querySelector('[data-testid="btn-plain-none"]')!);

      return {
        background: styles.backgroundColor,
        foreground: styles.color,
        tokenText: resolveToken("text"),
        tokenTextContrast: resolveToken("text-contrast"),
      };
    });

    expectSameColor(values.background, values.tokenText, "no-intent button background");
    expectSameColor(values.foreground, values.tokenTextContrast, "no-intent button text");
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

        outlineButton.className = `btn ${intent.className} out`;
        ghostButton.className = `btn ${intent.className} ghost`;
        softButton.className = `btn ${intent.className} soft`;
        host.append(outlineButton, ghostButton, softButton);

        const outlineStyles = getComputedStyle(outlineButton);
        const ghostStyles = getComputedStyle(ghostButton);
        const softStyles = getComputedStyle(softButton);

        const styles = {
          expectedPresentationText: resolveTokenColor({
            host,
            tokenName: `${intent.tokenName}-strong`,
          }),
          expectedOutlineBorder: resolveTokenColor({
            host,
            tokenName: intent.tokenName,
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
      overriddenButton.className = "btn primary out";
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
        inheritedBadgeBorder: getComputedStyle(inheritedBadge).borderTopColor,
        inheritedButtonBackground: getComputedStyle(inheritedButton).backgroundColor,
        overriddenButtonBackground: getComputedStyle(overriddenButton).backgroundColor,
        overriddenButtonBorderWidth: getComputedStyle(overriddenButton).borderTopWidth,
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

    // The badge is a different component reading the same inherited tokens.
    expect(isTransparent(styles.inheritedBadgeBorder)).toBe(true);

    // An element declaring its own presentation wins over the container.
    expect(isTransparent(styles.overriddenButtonBackground)).toBe(true);
    expect(Number.parseFloat(styles.overriddenButtonBorderWidth)).toBeGreaterThan(1);
  });

  test("uses contrast text on filled outline hover", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const successContrast = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-success-contrast)";
      document.body.append(probe);

      const color = getComputedStyle(probe).color;
      probe.remove();

      return color;
    });

    await page.getByTestId("btn-out-fill-success").hover();

    await expect
      .poll(async () =>
        getColorDistance(
          await page.getByTestId("btn-out-fill-success").evaluate((element) => getComputedStyle(element).color),
          successContrast,
        ),
      )
      .toBeLessThanOrEqual(2);
  });

  test("configures button padding options with p-sm/compact and p-lg/spacious modifier classes", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const btnPSm = page.getByTestId("btn-p-sm");
    const btnDefault = page.getByTestId("btn-default");
    const btnPLg = page.getByTestId("btn-p-lg");
    const btnIconPSm = page.getByTestId("btn-icon-p-sm");
    const btnIconDefault = page.getByTestId("btn-icon-default");
    const btnIconPLg = page.getByTestId("btn-icon-p-lg");

    // Standard Buttons Horizontal Padding
    const pSmLeft = await btnPSm.evaluate((el) => getComputedStyle(el).paddingLeft);
    const defaultLeft = await btnDefault.evaluate((el) => getComputedStyle(el).paddingLeft);
    const pLgLeft = await btnPLg.evaluate((el) => getComputedStyle(el).paddingLeft);

    expect(pSmLeft).toBe("10px");
    expect(defaultLeft).toBe("16px");
    expect(pLgLeft).toBe("24px");

    // Icon Buttons Padding (all sides)
    const iconPSmPadding = await btnIconPSm.evaluate((el) => getComputedStyle(el).padding);
    const iconDefaultPadding = await btnIconDefault.evaluate((el) => getComputedStyle(el).padding);
    const iconPLgPadding = await btnIconPLg.evaluate((el) => getComputedStyle(el).padding);

    expect(iconPSmPadding).toBe("4px");
    expect(iconDefaultPadding).toBe("8px");
    expect(iconPLgPadding).toBe("12px");

    // Test Aliases dynamically
    await page.evaluate(() => {
      const btn = document.createElement("button");
      btn.className = "btn primary compact";
      btn.setAttribute("data-testid", "btn-alias-compact");
      document.body.appendChild(btn);

      const btnSpacious = document.createElement("button");
      btnSpacious.className = "btn primary spacious";
      btnSpacious.setAttribute("data-testid", "btn-alias-spacious");
      document.body.appendChild(btnSpacious);
    });

    const btnAliasCompact = page.getByTestId("btn-alias-compact");
    const btnAliasSpacious = page.getByTestId("btn-alias-spacious");

    const aliasCompactLeft = await btnAliasCompact.evaluate((el) => getComputedStyle(el).paddingLeft);
    const aliasSpaciousLeft = await btnAliasSpacious.evaluate((el) => getComputedStyle(el).paddingLeft);

    expect(aliasCompactLeft).toBe("10px");
    expect(aliasSpaciousLeft).toBe("24px");
  });
});
