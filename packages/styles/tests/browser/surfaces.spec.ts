import { expect, test } from "@playwright/test";

import { expectSameColor, getColorDistance, isTransparent } from "./test-utils";

const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";

test.describe("surfaces", () => {
  test("keeps ordinary surfaces flat and reads intent and presentation", async ({ page }) => {
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

      const neutral = get("card-default-none");
      const successSoft = get("card-soft-edged-success");
      const primaryOutline = get("card-ghost-edged-primary");
      const panel = get("panel-default-none");

      return {
        neutralBackground: neutral.backgroundColor,
        neutralShadowOffset: neutral.boxShadow.match(/-?\d+(?:\.\d+)?px(?:\s+-?\d+(?:\.\d+)?px){3}/g)?.join(", "),
        outlineBackground: primaryOutline.backgroundColor,
        outlineBorder: primaryOutline.borderTopColor,
        outlineBorderWidth: primaryOutline.borderTopWidth,
        panelShadowOffset: panel.boxShadow.match(/-?\d+(?:\.\d+)?px(?:\s+-?\d+(?:\.\d+)?px){3}/g)?.join(", "),
        softBackground: successSoft.backgroundColor,
        tokenBackground: resolveToken("background"),
        tokenPrimary: resolveToken("primary"),
      };
    });

    /* Neither ordinary surface opts into depth. The composed shadow remains a
       valid zero-length value rather than gaining structural elevation. */
    expect(styles.neutralShadowOffset).toBe("0px 0px 0px 0px");
    expect(styles.panelShadowOffset).toBe("0px 0px 0px 0px");

    expectSameColor(styles.neutralBackground, styles.tokenBackground, "neutral card background");
    expect(getColorDistance(styles.softBackground, styles.tokenBackground)).toBeGreaterThan(2);
    expectSameColor(styles.outlineBackground, styles.tokenBackground, "outlined card stays unfilled");
    expectSameColor(styles.outlineBorder, styles.tokenPrimary, "outlined card border");
    /* The edge width is the aesthetic's material alone: no presentation scales
       it, so a default card is one pixel however it is presented. */
    expect(styles.outlineBorderWidth).toBe("1px");
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

  /* A divider is an indicator: it reads intent and no presentation token at all.
     A rule is a line, and neither a fill class nor an edge class has anything to
     say about one -- while reading both used to mean a container's `.ghost.edgeless`
     made every `<hr>` inside it invisible. */
  test("colors a divider by intent and ignores presentation entirely", async ({ page }) => {
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
      const host = document.querySelector('[data-testid="preview-root"]')!;
      const read = (presentation: string) => {
        const divider = document.createElement("hr");

        divider.className = `divider primary ${presentation}`.trim();
        host.append(divider);

        const computed = getComputedStyle(divider);
        const result = {
          color: computed.borderTopColor,
          presentation: presentation || "default",
          width: computed.borderTopWidth,
        };

        divider.remove();

        return result;
      };

      return {
        infoColor: get("divider-default-info").borderTopColor,
        tokenInfo: resolveToken("info"),
        variants: ["", "solid edged", "soft edgeless", "ghost edged", "edgeless", "ghost edgeless"].map(read),
        verticalWidth: get("divider-vertical-primary").borderLeftWidth,
      };
    });

    expectSameColor(styles.infoColor, styles.tokenInfo, "divider intent color");
    expect(styles.verticalWidth).not.toBe("0px");

    for (const variant of styles.variants) {
      /* Same width and same colour on every row, including the one that used to
         turn the rule off. The width is the aesthetic's material and nothing
         scales it; the colour is the intent and nothing dilutes it. */
      expect(variant.width, `${variant.presentation} width`).toBe("1px");
      expect(isTransparent(variant.color), `${variant.presentation} divider`).toBe(false);
    }
  });

  test("renders every card fill against the surface ground", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      const probe = document.createElement("span");

      probe.style.color = "var(--color-background)";
      document.body.append(probe);

      const ground = getComputedStyle(probe).color;

      probe.remove();

      return {
        ghostEdgeless: get("card-ghost-edgeless-primary").backgroundColor,
        ghostEdgelessBorder: get("card-ghost-edgeless-primary").borderTopColor,
        defaultBorderWidth: get("card-default-primary").borderTopWidth,
        ground,
        softBackground: get("card-soft-edged-primary").backgroundColor,
        solidBackground: get("card-solid-primary").backgroundColor,
        solidColor: get("card-solid-primary").color,
      };
    });

    /* Bare adds no fill, so what shows is the ground every surface rests on. */
    expectSameColor(styles.ghostEdgeless, styles.ground, "ghost card ground");
    expect(getColorDistance(styles.softBackground, styles.ground)).toBeGreaterThan(2);
    expect(getColorDistance(styles.solidBackground, styles.ground)).toBeGreaterThan(2);
    expect(getColorDistance(styles.solidColor, styles.solidBackground)).toBeGreaterThan(2);
    expect(Number.parseFloat(styles.defaultBorderWidth)).toBeGreaterThanOrEqual(1);
    /* The two-pixel ceiling is gone with the edge scale that made it necessary.
       `.edgeless` mixes the line to nothing rather than narrowing it: the width is
       the aesthetic's material and presentation never touches it. */
    expect(isTransparent(styles.ghostEdgelessBorder), "edgeless card line").toBe(true);
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
