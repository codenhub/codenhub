import { expect, test, type Page } from "@playwright/test";

import { expectSameColor, getColorDistance, readSrgb } from "./test-utils";

/* An aesthetic is a cascading class the playground puts on the preview root, so
   these read the ordinary component fixtures under a chosen aesthetic rather
   than a separate set that could drift from them. */
const BUTTONS_URL = "http://localhost:5184/buttons/?env=vanilla";
const FEEDBACK_URL = "http://localhost:5184/feedback/?env=vanilla";
const FORMS_URL = "http://localhost:5184/forms/?env=vanilla";
const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";
const TYPOGRAPHY_URL = "http://localhost:5184/typography/?env=vanilla";
const NATIVE_URL = "http://localhost:5184/native/?env=vanilla";

const withAesthetic = (url: string, aesthetic: string) => `${url}&aesthetic=${aesthetic}`;

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

const readStyles = async (page: Page, testId: string, properties: readonly string[]): Promise<Record<string, string>> =>
  page.getByTestId(testId).evaluate((element, propertyNames: readonly string[]) => {
    const styles = getComputedStyle(element);

    return Object.fromEntries(propertyNames.map((name) => [name, styles.getPropertyValue(name)]));
  }, properties);

/* Reading every element up front keeps the assertion loops free of awaits. */
const readAll = (page: Page, testIds: readonly string[], properties: readonly string[]) =>
  Promise.all(testIds.map(async (testId) => [testId, await readStyles(page, testId, properties)] as const));

/* A progress bar draws its fill as a pseudo-element, which `readStyles` cannot
   reach: squaring the track alone leaves a pill-shaped fill inside it. */
const readPseudoStyle = (page: Page, testId: string, pseudo: string, property: string) =>
  page
    .getByTestId(testId)
    .evaluate(
      (element, [name, propertyName]: readonly string[]) =>
        getComputedStyle(element, name).getPropertyValue(propertyName as string),
      [pseudo, property] as const,
    );

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
  test("applies the selected aesthetic to the ordinary fixtures", async ({ page }) => {
    await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));

    await expect(page.getByTestId("preview-root")).toHaveClass(/neobrutalism/);
    await expect(page.getByTestId("card-plain-none")).toBeVisible();
  });

  test.describe("neobrutalism", () => {
    test("gives every component a hard offset shadow and a thick edge", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "neobrutalism"));

      const button = await readStyles(page, "btn-plain-none", ["box-shadow", "border-top-width", "border-radius"]);

      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));

      const card = await readStyles(page, "card-plain-none", ["box-shadow", "border-top-width", "border-radius"]);

      for (const [name, styles] of [
        ["button", button],
        ["card", card],
      ] as const) {
        /* A hard shadow has a zero blur radius, which is the third length in the
           serialized value. A blurred shadow would be an elevation, not ink. */
        expect(styles["box-shadow"], `${name} shadow`).toMatch(/\b4px 4px 0px\b/);
        expect(styles["border-top-width"], `${name} border`).toBe("2px");
        expect(styles["border-radius"], `${name} radius`).toBe("0px");
      }
    });

    test("squares the components that hardcode a radius", async ({ page }) => {
      await page.goto(withAesthetic(FEEDBACK_URL, "neobrutalism"));

      const measured = await readAll(page, ["badge-plain-none", "progress-plain-none"], ["border-radius"]);

      /* The fill is a pseudo-element, so squaring the track alone would leave a
         pill inside it. */
      const fillRadius = await readPseudoStyle(page, "progress-plain-none", "::after", "border-radius");

      await page.goto(withAesthetic(TYPOGRAPHY_URL, "neobrutalism"));

      const keyCap = await readStyles(page, "kbd-plain-none", ["border-radius"]);

      for (const [testId, styles] of [...measured, ["kbd-plain-none", keyCap] as const]) {
        expect(styles["border-radius"], `${testId} radius`).toBe("0px");
      }

      expect(fillRadius).toBe("0px");
    });

    test("casts the shadow in each component's own intent", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));

      const [neutral, tinted] = await page.evaluate(() =>
        ["card-plain-none", "card-plain-destructive"].map(
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

    test("leaves content chips alone", async ({ page }) => {
      await page.goto(TYPOGRAPHY_URL);

      const plainCap = await readStyles(page, "kbd-plain-none", ["border-top-color"]);

      await page.goto(withAesthetic(TYPOGRAPHY_URL, "neobrutalism"));

      const inkedCap = await readStyles(page, "kbd-plain-none", ["border-top-color"]);

      /* A key cap is a content chip rather than structure, so the ink override
         skips it and its edge stays the quiet border color the default uses. */
      expectSameColor(inkedCap["border-top-color"]!, plainCap["border-top-color"]!, "key cap edge");

      await page.goto(withAesthetic(BUTTONS_URL, "neobrutalism"));

      const code = await readStyles(page, "code-chip", ["border-top-width", "box-shadow"]);

      /* Code draws no edge by design. An ink outline and an offset shadow on one
         read as a defect. */
      expect(code["border-top-width"], "code border").toBe("0px");
      expect(code["box-shadow"], "code shadow").toBe("none");
    });

    test("supplies the neutral ink without overriding an intent", async ({ page }) => {
      await page.goto(SURFACES_URL);

      const plain = await readStyles(page, "card-plain-none", ["border-top-color"]);

      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));

      const inked = await readStyles(page, "card-plain-none", ["border-top-color"]);
      const tinted = await readStyles(page, "card-plain-destructive", ["border-top-color"]);
      const destructive = await resolveToken(page, "--color-destructive");
      const gray = await resolveToken(page, "--color-border");
      const ink = await resolveToken(page, "--color-text");

      /* A card draws its edge from `--intent-border`, which is the border gray by
         default. A thick gray edge is not a brutalist one, so the aesthetic
         supplies the ink -- at zero specificity, so an intent class still wins. */
      expectSameColor(plain["border-top-color"]!, gray, "default card border");
      expectSameColor(inked["border-top-color"]!, ink, "neobrutalism card border");
      expectSameColor(tinted["border-top-color"]!, destructive, "neobrutalism intent card border");
    });

    test("moves a hovered button, and an interactive card, into its own shadow", async ({ page }) => {
      const expectPressed = async (testId: string) => {
        const element = page.getByTestId(testId);

        await element.hover();

        /* Both the shadow and the transform are transitioned, so these poll for
           the settled value rather than reading mid-flight. */
        await expect
          .poll(() => element.evaluate((node) => getComputedStyle(node).transform), testId)
          /* translate(4px, 4px) serializes as a matrix with the offsets last. */
          .toBe("matrix(1, 0, 0, 1, 4, 4)");
        await expect
          .poll(() => element.evaluate((node) => getComputedStyle(node).boxShadow), testId)
          .toMatch(/\b0px 0px 0px 0px\b/);
      };

      await page.goto(withAesthetic(BUTTONS_URL, "neobrutalism"));
      await expectPressed("btn-plain-none");

      /* A card lifts only when it opts in with `.interactive`: a plain card is a
         container, not a control. */
      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));
      await expectPressed("card-plain-none-interactive");
    });

    test("lets an explicit presentation on the element win over the aesthetic", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "neobrutalism"));

      const outline = await readStyles(page, "btn-out-none", ["border-top-width"]);

      /* `.out` doubles the aesthetic's 2px material rather than replacing it:
         the axes meet only in `--ui-border-width * --ui-border-scale`. */
      expect(outline["border-top-width"]).toBe("4px");
    });
  });

  test("shapes the tooltip bubble with the aesthetic in scope", async ({ page }) => {
    const readBubble = async (aesthetic: string) => {
      await page.goto(withAesthetic(FEEDBACK_URL, aesthetic));

      const host = page.getByTestId("fallback-tooltip");

      await host.hover();

      return host.evaluate((element) => {
        const styles = getComputedStyle(element, "::after");

        return { boxShadow: styles.boxShadow, filter: styles.filter };
      });
    };

    const plain = await readBubble("");
    const inked = await readBubble("neobrutalism");
    const stepped = await readBubble("pixel");

    /* The bubble resolves `--ui-shadow` like every other component, so an
       aesthetic reaches it too: a blurred drop under a brutalist tooltip was the
       one place the material stopped at a component boundary. */
    expect(plain.boxShadow, "default bubble").toMatch(/\b0px 4px 6px -1px\b/);
    expect(inked.boxShadow, "neobrutalist bubble").toMatch(/\b4px 4px 0px 0px\b/);

    /* Clipping removes an outer shadow, so the stepped bubble casts a filter
       one: a filter applies after the clip and follows the stepped silhouette. */
    expect(stepped.boxShadow, "pixel bubble ring").toMatch(/inset/);
    expect(stepped.filter, "pixel bubble shadow").toMatch(/^drop-shadow\(/);
  });

  test.describe("glass", () => {
    test("blurs what is behind a surface and stays translucent", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "glass"));

      /* Headless Chromium reports `reduce`, which is the branch that drops the
         blur for an opaque surface, so which assertion applies is decided by the
         engine rather than assumed. */
      const prefersReducedTransparency = await page.evaluate(
        () => matchMedia("(prefers-reduced-transparency: reduce)").matches,
      );

      const properties = ["backdrop-filter", "-webkit-backdrop-filter", "background-color"];
      const surfaces = await readAll(page, ["card-plain-none", "panel-plain-none"], properties);

      await page.goto(withAesthetic(FEEDBACK_URL, "glass"));

      const alerts = await readAll(page, ["alert-plain-none"], properties);

      for (const [testId, styles] of [...surfaces, ...alerts]) {
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
      await page.goto(withAesthetic(BUTTONS_URL, "glass"));

      const styles = await readStyles(page, "btn-plain-primary", ["backdrop-filter", "-webkit-backdrop-filter"]);
      const backdrop = styles["backdrop-filter"] || styles["-webkit-backdrop-filter"];

      expect(backdrop === "" || backdrop === "none").toBe(true);
    });

    test("still applies its material tokens to controls", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "glass"));

      const styles = await readStyles(page, "btn-plain-primary", ["border-radius"]);

      expect(styles["border-radius"]).toBe("14px");
    });

    test("composes its shadow from the public elevation color", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "glass"));

      const card = page.getByTestId("card-plain-none");
      await page
        .getByTestId("preview-root")
        .evaluate((element) => element.style.setProperty("--elevation-color", "rgb(255 0 255)"));

      await expect
        .poll(() => card.evaluate((element) => getComputedStyle(element).boxShadow))
        .toContain("rgb(255, 0, 255)");
    });
  });

  test.describe("pixel", () => {
    test("cuts stepped corners and draws the edge as an inset ring", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "pixel"));

      const button = await readStyles(page, "btn-plain-none", [
        "clip-path",
        "border-top-width",
        "box-shadow",
        "border-radius",
      ]);

      const properties = ["clip-path", "border-top-width", "box-shadow", "border-radius"];

      await page.goto(withAesthetic(SURFACES_URL, "pixel"));

      const card = await readAll(page, ["card-plain-none"], properties);

      await page.goto(withAesthetic(FORMS_URL, "pixel"));

      const input = await readAll(page, ["ipt-plain-none"], properties);

      for (const [testId, styles] of [["btn-plain-none", button] as const, ...card, ...input]) {
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
      await page.goto(withAesthetic(FEEDBACK_URL, "pixel"));

      const styles = await readStyles(page, "badge-plain-none", ["box-shadow"]);

      expect(styles["box-shadow"]).toMatch(/\b0px 0px 0px 2px\b/);
    });

    test("steps a code chip's corners without ringing it", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "pixel"));

      const styles = await readStyles(page, "code-chip", ["clip-path", "box-shadow", "background-color"]);

      expect(styles["clip-path"]).toContain("polygon(");
      /* Clipping needs a ring to cover the staircase, but code draws no border,
         so the ring is its own background: the corners step and nothing rings
         the chip. */
      expectSameColor(readShadowColor(styles["box-shadow"]!), styles["background-color"]!, "code edge");
    });

    test("keeps a focus ring that clipping would otherwise remove", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "pixel"));

      const input = page.getByTestId("ipt-plain-none");

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
      await page.goto(withAesthetic(FEEDBACK_URL, "pixel"));

      const track = await readAll(page, ["progress-plain-none"], ["border-radius", "clip-path"]);
      const fillRadius = await readPseudoStyle(page, "progress-plain-none", "::after", "border-radius");

      await page.goto(withAesthetic(FORMS_URL, "pixel"));

      const checkbox = await readAll(page, ["checkbox-plain-none"], ["border-radius", "clip-path"]);

      for (const [testId, styles] of [...track, ...checkbox]) {
        expect(styles["border-radius"], `${testId} radius`).toBe("0px");
        expect(styles["clip-path"], `${testId} clip`).toBe("none");
      }

      expect(fillRadius).toBe("0px");

      const radio = await readStyles(page, "radio-plain-none", ["border-radius"]);

      /* The circle is the only thing telling a radio from a checkbox at a glance. */
      expect(radio["border-radius"]).not.toBe("0px");
    });

    test("resolves each component's own intent through the shared ring", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "pixel"));

      const [neutralShadow, tintedShadow] = await page.evaluate(() =>
        ["btn-plain-none", "btn-soft-destructive"].map(
          (testId) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`) as Element).boxShadow,
        ),
      );
      const ink = await resolveToken(page, "--color-text");
      const destructive = await resolveToken(page, "--color-destructive");

      /* The ring is one declaration shared by every clipped component, and it
         resolves against the component it is declared on. */
      expectSameColor(readShadowColor(neutralShadow!), ink, "no-intent ring");
      expect(getColorDistance(readShadowColor(tintedShadow!), destructive)).toBeLessThan(0.4);
    });

    /* The silhouette is a material token, so it travels through the `@apply` that
       `native.css` uses to map a bare element onto a component utility. A rule
       keyed on a class list could never reach these. */
    test("reaches unclassed native elements", async ({ page }) => {
      await page.goto(withAesthetic(NATIVE_URL, "pixel"));

      /* Scoped to the preview root: the playground chrome sits outside it and is
         deliberately left unstyled by the aesthetic. */
      const shapes = await page.evaluate(() =>
        [
          '[data-testid="native-root"] button',
          '[data-testid="native-root"] input[type="text"]',
          '[data-testid="native-root"] code',
        ].map((selector) => {
          const styles = getComputedStyle(document.querySelector(selector) as Element);

          return {
            selector,
            clipped: styles.clipPath.startsWith("polygon("),
            ring: styles.boxShadow,
            borderTopWidth: styles.borderTopWidth,
            borderTopLeftRadius: styles.borderTopLeftRadius,
          };
        }),
      );

      for (const shape of shapes) {
        expect(shape.clipped, `${shape.selector} clip`).toBe(true);
        /* A clip removes a border, so the edge has to be the inset ring instead or
           the element loses its outline entirely. */
        expect(shape.ring, `${shape.selector} ring`).toContain("inset");
        expect(shape.borderTopWidth, `${shape.selector} border`).toBe("0px");
        expect(shape.borderTopLeftRadius, `${shape.selector} radius`).toBe("0px");
      }

      /* A chip reads the tight slots, so its step and ring stay one unit deep
         where a structural component uses two. */
      const [button, , code] = shapes;

      expect(button!.ring).toContain("4px");
      expect(code!.ring).toContain("2px");
    });
  });
});
