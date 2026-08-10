import { expect, test, type Page } from "@playwright/test";

import { expectSameColor, getColorDistance, readSrgb } from "./test-utils";

const AESTHETICS_URL = "http://localhost:5184/aesthetics/?env=vanilla";

/* Engines order the parts of a serialized `box-shadow` differently, so the color
   is matched by shape rather than by position. No color function nests
   parentheses, which keeps this a single non-greedy match. */
const readShadowColor = (shadow: string) => {
  const match = shadow.match(/(?:rgba?|color|oklab|oklch)\([^)]*\)/);

  if (!match) {
    throw new Error(`No color found in box-shadow: ${shadow}`);
  }

  return match[0];
};

/* An aesthetic sets material tokens on a container and every descendant resolves
   them against its own intent, so these read computed values from components
   nested inside the aesthetic scope rather than from the scope itself. */
const readStyles = async (page: Page, testId: string, properties: readonly string[]): Promise<Record<string, string>> =>
  page.getByTestId(testId).evaluate((element, propertyNames: readonly string[]) => {
    const styles = getComputedStyle(element);

    return Object.fromEntries(propertyNames.map((name) => [name, styles.getPropertyValue(name)]));
  }, properties);

/* Reading every element up front keeps the assertion loops free of awaits. */
const readAll = (page: Page, testIds: readonly string[], properties: readonly string[]) =>
  Promise.all(testIds.map(async (testId) => [testId, await readStyles(page, testId, properties)] as const));

/* Reading a custom property gives back its declared text, and every color token
   is a `light-dark()` pair that only resolves at the point of use. Painting it
   on a probe element is what forces that resolution. */
const resolveToken = (page: Page, token: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("span");

    probe.style.color = `var(${name})`;
    document.body.append(probe);

    const resolved = getComputedStyle(probe).color;

    probe.remove();

    return resolved;
  }, token);

test.describe("aesthetics", () => {
  test("loads the aesthetics fixtures", async ({ page }) => {
    await page.goto(AESTHETICS_URL);

    await expect(page.getByTestId("preview-root")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Aesthetics" })).toBeVisible();
  });

  test.describe("neobrutalism", () => {
    test("gives every component a hard offset shadow and a thick edge", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const measured = await readAll(
        page,
        ["neobrutalism-button", "neobrutalism-card"],
        ["box-shadow", "border-top-width", "border-radius"],
      );

      for (const [testId, styles] of measured) {
        /* A hard shadow has a zero blur radius, which is the third length in the
           serialized value. A blurred shadow would be an elevation, not ink. */
        expect(styles["box-shadow"], `${testId} shadow`).toMatch(/\b4px 4px 0px\b/);
        expect(styles["border-top-width"], `${testId} border`).toBe("2px");
        expect(styles["border-radius"], `${testId} radius`).toBe("0px");
      }
    });

    test("squares the components that hardcode a radius", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const measured = await readAll(page, ["neobrutalism-badge", "neobrutalism-kbd"], ["border-radius"]);

      for (const [testId, styles] of measured) {
        expect(styles["border-radius"], `${testId} radius`).toBe("0px");
      }
    });

    test("casts the shadow in each component's own intent", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const [neutral, tinted] = await page.evaluate(() =>
        ["neobrutalism-card", "neobrutalism-intent-card"].map(
          (testId) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`) as Element).boxShadow,
        ),
      );
      const destructive = await resolveToken(page, "--color-destructive");
      const ink = await resolveToken(page, "--color-text");

      /* The shadow is declared on the component rather than on the aesthetic
         container, so it resolves against the component's own intent: a
         destructive card casts a red shadow, not the neutral ink. */
      expectSameColor(readShadowColor(neutral), ink, "neutral shadow");
      expectSameColor(readShadowColor(tinted), destructive, "destructive shadow");
    });

    test("leaves a key cap its quiet edge", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const { plain, inked } = await page.evaluate(() => {
        const read = (testId: string) =>
          getComputedStyle(document.querySelector(`[data-testid="${testId}"]`) as Element).borderTopColor;

        return { inked: read("neobrutalism-kbd"), plain: read("default-kbd") };
      });

      /* A key cap is a content chip rather than structure, so the ink override
         skips it and its edge stays the quiet border color the default uses. */
      expectSameColor(inked, plain, "neobrutalism key cap edge");
    });

    test("supplies the neutral ink without overriding an intent", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const { inked, plain, tinted } = await page.evaluate(() => {
        const read = (testId: string) =>
          getComputedStyle(document.querySelector(`[data-testid="${testId}"]`) as Element).borderTopColor;

        return {
          inked: read("neobrutalism-card"),
          plain: read("default-card"),
          tinted: read("neobrutalism-intent-card"),
        };
      });
      const destructive = await resolveToken(page, "--color-destructive");
      const gray = await resolveToken(page, "--color-border");
      const ink = await resolveToken(page, "--color-text");

      /* A card draws its edge from `--intent-border`, which is the border gray by
         default. A thick gray edge is not a brutalist one, so the aesthetic
         supplies the ink -- at zero specificity, so an intent class still wins. */
      expectSameColor(plain, gray, "default card border");
      expectSameColor(inked, ink, "neobrutalism card border");
      expectSameColor(tinted, destructive, "neobrutalism intent card border");
    });

    test("moves a hovered button into its own shadow", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const button = page.getByTestId("neobrutalism-button");

      await button.hover();

      /* Both the shadow and the transform are transitioned, so these poll for
         the settled value rather than reading mid-flight. */
      await expect
        .poll(() => button.evaluate((element) => getComputedStyle(element).transform))
        /* translate(4px, 4px) serializes as a matrix with the offsets last. */
        .toBe("matrix(1, 0, 0, 1, 4, 4)");
      await expect
        .poll(() => button.evaluate((element) => getComputedStyle(element).boxShadow))
        .toMatch(/\b0px 0px 0px 0px\b/);
    });

    test("lets an explicit presentation on the element win over the aesthetic", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const outline = await readStyles(page, "neobrutalism-out-button", ["border-top-width"]);

      /* `.out` doubles the aesthetic's 2px material rather than replacing it:
         the axes meet only in `--ui-border-width * --ui-border-scale`. */
      expect(outline["border-top-width"]).toBe("4px");
    });
  });

  test.describe("glass", () => {
    test("blurs what is behind a surface and stays translucent", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      /* Headless Chromium reports `reduce`, which is the branch that drops the
         blur for an opaque surface, so which assertion applies is decided by the
         engine rather than assumed. */
      const prefersReducedTransparency = await page.evaluate(
        () => matchMedia("(prefers-reduced-transparency: reduce)").matches,
      );

      const measured = await readAll(
        page,
        ["glass-card", "glass-panel", "glass-alert"],
        ["backdrop-filter", "-webkit-backdrop-filter", "background-color"],
      );

      for (const [testId, styles] of measured) {
        const backdrop = styles["backdrop-filter"] || styles["-webkit-backdrop-filter"];
        const { alpha } = readSrgb(styles["background-color"] as string);

        if (prefersReducedTransparency) {
          expect(backdrop, `${testId} backdrop`).toBe("none");
          expect(alpha, `${testId} alpha`).toBe(1);
          continue;
        }

        expect(backdrop, `${testId} backdrop`).toContain("blur(14px)");
        expect(alpha, `${testId} alpha`).toBeLessThan(1);
      }
    });

    test("leaves controls solid rather than giving each one its own blur", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const styles = await readStyles(page, "glass-button", ["backdrop-filter", "-webkit-backdrop-filter"]);
      const backdrop = styles["backdrop-filter"] || styles["-webkit-backdrop-filter"];

      expect(backdrop === "" || backdrop === "none").toBe(true);
    });

    test("still applies its material tokens to controls", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const styles = await readStyles(page, "glass-button", ["border-radius"]);

      expect(styles["border-radius"]).toBe("14px");
    });
  });

  test.describe("pixel", () => {
    test("cuts stepped corners and draws the edge as an inset ring", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const measured = await readAll(
        page,
        ["pixel-button", "pixel-card", "pixel-input"],
        ["clip-path", "border-top-width", "box-shadow", "border-radius"],
      );

      for (const [testId, styles] of measured) {
        expect(styles["clip-path"], `${testId} clip`).toContain("polygon(");
        /* `clip-path` clips a border away, so the element must not draw one. */
        expect(styles["border-top-width"], `${testId} border`).toBe("0px");
        expect(styles["border-radius"], `${testId} radius`).toBe("0px");
        expect(styles["box-shadow"], `${testId} ring`).toMatch(/inset/);
        /* The ring must be as deep as the corner cut, or the staircase shows
           through and the edge reads as broken at every corner. */
        expect(styles["box-shadow"], `${testId} ring depth`).toMatch(/\b0px 0px 0px 4px\b/);
      }
    });

    test("scales the unit down for chips", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const styles = await readStyles(page, "pixel-badge", ["box-shadow"]);

      expect(styles["box-shadow"]).toMatch(/\b0px 0px 0px 2px\b/);
    });

    test("keeps a focus ring that clipping would otherwise remove", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const input = page.getByTestId("pixel-input");

      await input.focus();

      /* Two inset layers: the edge on top, the focus ring immediately inside it.
         An outline or an outer ring would be clipped away entirely. The ring is
         transitioned in, so this polls for the settled value. */
      await expect
        .poll(() => input.evaluate((element) => getComputedStyle(element).boxShadow))
        .toMatch(/\b0px 0px 0px 7px\b/);

      const styles = await input.evaluate((element) => {
        const computed = getComputedStyle(element);

        return { boxShadow: computed.boxShadow, outlineStyle: computed.outlineStyle };
      });

      expect(styles.boxShadow.match(/inset/g)?.length, styles.boxShadow).toBe(2);
      expect(styles.outlineStyle).toBe("none");
    });

    test("squares the components it does not clip, and keeps a radio round", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const measured = await readAll(page, ["pixel-checkbox", "pixel-progress"], ["border-radius", "clip-path"]);

      for (const [testId, styles] of measured) {
        expect(styles["border-radius"], `${testId} radius`).toBe("0px");
        expect(styles["clip-path"], `${testId} clip`).toBe("none");
      }

      const radio = await readStyles(page, "pixel-radio", ["border-radius"]);

      /* The circle is the only thing telling a radio from a checkbox at a glance. */
      expect(radio["border-radius"]).not.toBe("0px");
    });

    test("resolves each component's own intent through the shared ring", async ({ page }) => {
      await page.goto(AESTHETICS_URL);

      const [neutralShadow, tintedShadow] = await page.evaluate(() =>
        ["pixel-button", "pixel-intent-button"].map(
          (testId) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`) as Element).boxShadow,
        ),
      );
      const destructive = await resolveToken(page, "--color-destructive");

      /* One rule sets the ring for every shaped component. It reads
         `--intent-border`, which resolves on the element the rule matched, so
         each component rings itself in its own intent. */
      expectSameColor(readShadowColor(tintedShadow), destructive, "pixel destructive ring");
      expect(
        getColorDistance(readShadowColor(neutralShadow), readShadowColor(tintedShadow)),
        `${neutralShadow} vs ${tintedShadow}`,
      ).toBeGreaterThan(20);
    });
  });
});
