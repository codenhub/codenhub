import { expect, test } from "@playwright/test";

import { expectSameColor, getColorDistance, isTransparent, readSrgb } from "./test-utils";

const FEEDBACK_URL = "http://localhost:5184/feedback/?env=vanilla";
const FORMS_URL = "http://localhost:5184/forms/?env=vanilla";

test.describe("forms", () => {
  test("marks an invalid control without an intent class", async ({ page }) => {
    await page.goto(FORMS_URL);

    const borderColor = await page
      .getByTestId("invalid-input")
      .evaluate((element) => getComputedStyle(element).borderColor);

    expect(isTransparent(borderColor)).toBe(false);
  });

  test("caps text control fill so a flat container stays readable", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      return {
        default: get("ipt-plain-none").backgroundColor,
        flat: get("ipt-flat-none").backgroundColor,
        flatBorderWidth: get("ipt-flat-none").borderTopWidth,
        ghostBorder: get("ipt-ghost-none").borderTopColor,
        outBorderWidth: get("ipt-out-none").borderTopWidth,
        soft: get("ipt-soft-none").backgroundColor,
      };
    });

    // `.flat` resolves to the same tint as `.soft` rather than a solid fill.
    expectSameColor(styles.flat, styles.soft, "flat input clamps to the soft tint");
    expect(getColorDistance(styles.flat, styles.default)).toBeGreaterThan(1);
    expect(Number.parseFloat(styles.outBorderWidth)).toBeGreaterThan(Number.parseFloat(styles.flatBorderWidth));
    expect(isTransparent(styles.ghostBorder)).toBe(true);
  });

  /* `none` is only valid as an entire `box-shadow` value. Composing a focus ring
     as `<ring>, var(--ui-shadow, none)` makes the whole declaration invalid, so
     the ring silently disappears. Asserted on a real focus because that is the
     only state where the composed list applies. */
  test("keeps a focus ring on text controls", async ({ page }) => {
    await page.goto(FORMS_URL);

    // Focus moves between controls, so these must be read one at a time.
    const readFocused = async (testId: string) => {
      await page.getByTestId(testId).focus();

      return page.getByTestId(testId).evaluate((element) => {
        const computed = getComputedStyle(element);

        return { borderColor: computed.borderTopColor, boxShadow: computed.boxShadow };
      });
    };

    const neutral = await readFocused("ipt-plain-none");
    const intent = await readFocused("ipt-plain-success");

    for (const [label, styles] of [
      ["neutral", neutral],
      ["success", intent],
    ] as const) {
      expect(styles.boxShadow, `${label} focus ring`).not.toBe("none");
      expect(styles.boxShadow, `${label} focus ring`).toContain("px");
      expect(isTransparent(styles.borderColor), `${label} focus border`).toBe(false);
    }
  });

  test("moves the control border on hover", async ({ page }) => {
    await page.goto(FORMS_URL);

    const resting = await page
      .getByTestId("ipt-plain-success")
      .evaluate((element) => getComputedStyle(element).borderTopColor);

    await page.getByTestId("ipt-plain-success").hover();

    await expect
      .poll(async () =>
        getColorDistance(
          await page.getByTestId("ipt-plain-success").evaluate((element) => getComputedStyle(element).borderTopColor),
          resting,
        ),
      )
      .toBeGreaterThan(2);
  });

  /* Both tints are mixed toward `transparent`, so their strength is their alpha.
     Comparing them against an opaque token instead would be dominated by that
     alpha gap and report every tint as equally distant. */
  test("keeps the soft control tint quieter than a soft badge", async ({ page }) => {
    await page.goto(FORMS_URL);

    const softInput = await page
      .getByTestId("ipt-soft-success")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    await page.goto(FEEDBACK_URL);

    const softBadge = await page
      .getByTestId("badge-soft-success")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    const inputAlpha = readSrgb(softInput).alpha;
    const badgeAlpha = readSrgb(softBadge).alpha;

    // Visible, but markedly quieter than the badge tint.
    expect(inputAlpha).toBeGreaterThan(0);
    expect(inputAlpha).toBeLessThan(badgeAlpha / 1.5);
  });

  test("applies intent classes to checked toggles", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const read = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      const intents = ["primary", "secondary", "success", "warning", "destructive", "info"];
      const tokens: Record<string, string> = {
        destructive: resolveToken("destructive"),
        info: resolveToken("info"),
        primary: resolveToken("primary"),
        secondary: resolveToken("accent"),
        success: resolveToken("success"),
        warning: resolveToken("warning"),
      };

      return intents.flatMap((intent) =>
        ["checkbox", "radio", "switch"].map((component) => {
          const styles = read(`${component}-plain-${intent}-checked`);

          return {
            /* A checked radio keeps a transparent box and shows the intent in
               its ring and its dot, so its intent reads from the border. */
            intentColor: component === "radio" ? styles.borderTopColor : styles.backgroundColor,
            label: `${component} ${intent}`,
            token: tokens[intent]!,
          };
        }),
      );
    });

    for (const { intentColor, label, token } of styles) {
      expect(intentColor, label).toBe(token);
    }
  });

  test("uses the neutral text token for a checked toggle with no intent", async ({ page }) => {
    await page.goto(FORMS_URL);

    const values = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-text)";
      document.body.append(probe);
      const tokenText = getComputedStyle(probe).color;
      probe.remove();

      const background = (testId: string) =>
        getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!).backgroundColor;

      return {
        checkbox: background("checkbox-plain-none-checked"),
        switch: background("switch-plain-none-checked"),
        tokenText,
      };
    });

    expectSameColor(values.checkbox, values.tokenText, "checked checkbox background");
    expectSameColor(values.switch, values.tokenText, "checked switch background");
  });

  test("renders checkbox and switch with correct appearance and transitions", async ({ page }) => {
    await page.goto(FORMS_URL);

    const checkbox = page.getByTestId("checkbox-plain-none");
    const switchElement = page.getByTestId("switch-plain-none");

    await expect(checkbox).toBeVisible();
    await expect(switchElement).toBeVisible();

    const checkboxStyles = await checkbox.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        appearance: styles.appearance,
        width: styles.width,
        height: styles.height,
        cursor: styles.cursor,
      };
    });

    expect(checkboxStyles.appearance).toBe("none");
    expect(checkboxStyles.width).toBe("16px");
    expect(checkboxStyles.height).toBe("16px");
    expect(checkboxStyles.cursor).toBe("pointer");

    const switchStyles = await switchElement.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        appearance: styles.appearance,
        width: styles.width,
        height: styles.height,
        cursor: styles.cursor,
      };
    });

    expect(switchStyles.appearance).toBe("none");
    expect(switchStyles.width).toBe("40px");
    expect(switchStyles.height).toBe("20px");
    expect(switchStyles.cursor).toBe("pointer");
  });

  test("stops a disabled toggle reacting to hover", async ({ page }) => {
    await page.goto(FORMS_URL);

    const expectUnmoved = async (testId: string) => {
      const element = page.getByTestId(testId);
      const before = await element.evaluate((node) => getComputedStyle(node).borderColor);

      await element.hover();

      const after = await element.evaluate((node) => getComputedStyle(node).borderColor);

      expect(after, testId).toBe(before);
    };

    await expectUnmoved("checkbox-plain-none-disabled");
    await expectUnmoved("switch-plain-none-disabled");
  });

  test("configures input icons with composable classes, position, and theme variables", async ({ page }) => {
    await page.goto(FORMS_URL);

    const emailInput = page.getByTestId("field-email-icon-left");
    const rightInput = page.getByTestId("field-email-icon-right");
    const searchStandardInput = page.getByTestId("field-search-standard");

    const emailBgBefore = await emailInput.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(emailBgBefore).toContain("data:image/svg+xml");
    expect(emailBgBefore).toContain("%23737373");

    await emailInput.focus();
    const emailBgFocused = await emailInput.evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(emailBgFocused).toContain("data:image/svg+xml");
    expect(emailBgFocused).toContain("%230a0a0a");

    // A search input without `.icon` keeps the plain control padding.
    const searchPaddingLeft = await searchStandardInput.evaluate((el) => getComputedStyle(el).paddingLeft);
    expect(searchPaddingLeft).toBe("12px");

    const rightPadding = await rightInput.evaluate((el) => getComputedStyle(el).paddingRight);
    const rightPos = await rightInput.evaluate((el) => getComputedStyle(el).backgroundPosition);

    expect(rightPadding).not.toBe("0px");
    expect(rightPos).toContain("100%");
  });

  /* `.error` claims helper text inside a field, which would swallow a
     destructive button if the selector were not narrowed. */
  test("keeps a destructive button out of the field error rule", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      return {
        buttonBackground: get("field-error-button").backgroundColor,
        errorColor: get("field-error").color,
      };
    });

    expect(isTransparent(styles.buttonBackground)).toBe(false);
    expect(isTransparent(styles.errorColor)).toBe(false);
  });
});
