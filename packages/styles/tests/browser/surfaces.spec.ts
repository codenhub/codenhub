import { expect, test } from "@playwright/test";

import { expectSameColor, getColorDistance } from "./test-utils";

const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";

test.describe("surfaces", () => {
  test("gives cards elevation and reads intent and presentation", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };

      const neutral = get("card-plain-none");
      const successSoft = get("card-soft-success");
      const primaryOut = get("card-out-primary");
      const panel = get("panel-plain-none");

      return {
        neutralBackground: neutral.backgroundColor,
        neutralShadow: neutral.boxShadow,
        outBackground: primaryOut.backgroundColor,
        outBorder: primaryOut.borderTopColor,
        outBorderWidth: primaryOut.borderTopWidth,
        panelShadow: panel.boxShadow,
        softBackground: successSoft.backgroundColor,
        tokenBackground: resolveToken("background"),
        tokenPrimary: resolveToken("primary"),
      };
    });

    // A card is the elevated sibling.
    expect(styles.neutralShadow).not.toBe("none");
    // A panel is the flush one, so it stays unelevated.
    expect(styles.panelShadow).toBe("none");

    expectSameColor(styles.neutralBackground, styles.tokenBackground, "neutral card background");
    expect(getColorDistance(styles.softBackground, styles.tokenBackground)).toBeGreaterThan(2);
    expectSameColor(styles.outBackground, styles.tokenBackground, "outlined card stays unfilled");
    expectSameColor(styles.outBorder, styles.tokenPrimary, "outlined card border");
    expect(Number.parseFloat(styles.outBorderWidth)).toBeGreaterThan(1);
  });

  test("changes only padding for the density modifiers", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const padding = await page.evaluate(() =>
      ["card-compact", "card-default-padding", "card-spacious", "card-flush"].map((testId) =>
        Number.parseFloat(getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!).paddingTop),
      ),
    );

    const [compact, base, spacious, flush] = padding as [number, number, number, number];

    expect(flush).toBe(0);
    expect(compact).toBeLessThan(base);
    expect(spacious).toBeGreaterThan(base);
  });

  test("colors a divider by intent and doubles it for an outlined presentation", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };

      return {
        infoColor: get("divider-plain-info").borderTopColor,
        outWidth: get("divider-out-info").borderTopWidth,
        plainWidth: get("divider-plain-info").borderTopWidth,
        tokenInfo: resolveToken("info"),
        verticalWidth: get("divider-vertical-primary").borderLeftWidth,
      };
    });

    expectSameColor(styles.infoColor, styles.tokenInfo, "divider intent color");
    expect(Number.parseFloat(styles.outWidth)).toBeGreaterThan(Number.parseFloat(styles.plainWidth));
    expect(styles.verticalWidth).not.toBe("0px");
  });

  /* Presentation cascades and intent does not, so a container sets the look of
     its subtree while any element opts out. Breaking either half is silent. */
  test("lets a container set the presentation while an element overrides it", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      return {
        inheritedFill: get("cascade-card-inherited").getPropertyValue("--ui-fill").trim(),
        overriddenFill: get("cascade-card-override").getPropertyValue("--ui-fill").trim(),
        panelFill: get("cascade-panel-inherited").getPropertyValue("--ui-fill").trim(),
      };
    });

    expect(styles.inheritedFill).toBe("12%");
    expect(styles.panelFill).toBe("12%");
    expect(styles.overriddenFill).toBe("0%");
  });
});
