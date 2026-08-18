import { expect, test, type Page } from "@playwright/test";

import { expectSameColor, getColorDistance, isTransparent, readSrgb } from "./test-utils";

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

/* `box` composes colours with `color-mix(in oklab, ...)`, and an engine hands the
   result back in the space it was authored in -- `oklab()`, not `rgb()` -- so a
   luminance comparison cannot read the serialized string directly. Painting the
   colour onto a 1x1 canvas over an opaque ground forces it through the engine's
   own conversion, alpha included, which is the number a reader actually sees. */
const readComposited = (page: Page, colors: readonly string[]) =>
  page.evaluate((values: readonly string[]) => {
    const canvas = document.createElement("canvas");

    canvas.width = 1;
    canvas.height = 1;

    const context = canvas.getContext("2d", { willReadFrequently: true })!;

    return values.map((value) => {
      context.fillStyle = "#000";
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);

      const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
      const channels = [red!, green!, blue!].map((channel) => {
        const ratio = channel / 255;

        return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
      });

      return {
        luminance: 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!,
        rgb: [red!, green!, blue!] as [number, number, number],
      };
    });
  }, colors);

const channelDistance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

test.describe("aesthetics", () => {
  test("applies the selected aesthetic to the ordinary fixtures", async ({ page }) => {
    await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));

    await expect(page.getByTestId("preview-root")).toHaveClass(/neobrutalism/);
    await expect(page.getByTestId("card-default-none")).toBeVisible();
  });

  test.describe("neobrutalism", () => {
    test("gives every component a hard offset shadow and a thick edge", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "neobrutalism"));

      const button = await readStyles(page, "btn-default-none", ["box-shadow", "border-top-width", "border-radius"]);

      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));

      const card = await readStyles(page, "card-default-none", ["box-shadow", "border-top-width", "border-radius"]);

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

    /* The one component this aesthetic names in a selector, recorded in the
       registry as `selectors`. The slab is a second ink line rather than depth
       here, and an alert is the only container the registry rests flat, so
       without it a neobrutalist alert is the one box on the page that looks like
       it lost its material. It is written into the component's resting default
       rather than the modifier, which is what leaves every elevation class still
       winning on the element. */
    test("rests an alert on the slab while every elevation class still wins", async ({ page }) => {
      await page.goto(withAesthetic(FEEDBACK_URL, "neobrutalism"));

      const measured = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const read = (className: string) => {
          const alert = document.createElement("div");

          alert.className = className;
          host.append(alert);

          const shadow = getComputedStyle(alert).boxShadow;

          alert.remove();
          return shadow;
        };

        return { flat: read("alert flat"), floating: read("alert floating"), resting: read("alert") };
      });

      expect(measured.resting, "resting alert").toMatch(/\b4px 4px 0px\b/);
      expect(measured.flat, "flat alert").toMatch(/\b0px 0px 0px 0px\b/);
      expect(measured.floating, "floating alert").toMatch(/\b8px 8px 0px\b/);
    });

    test("squares the components that hardcode a radius", async ({ page }) => {
      await page.goto(withAesthetic(FEEDBACK_URL, "neobrutalism"));

      const measured = await readAll(page, ["badge-default-none", "progress-default-none"], ["border-radius"]);

      /* The fill is a pseudo-element, so squaring the track alone would leave a
         pill inside it. */
      const fillRadius = await readPseudoStyle(page, "progress-default-none", "::after", "border-radius");

      await page.goto(withAesthetic(TYPOGRAPHY_URL, "neobrutalism"));

      const keyCap = await readStyles(page, "kbd-default-none", ["border-radius"]);

      for (const [testId, styles] of [...measured, ["kbd-default-none", keyCap] as const]) {
        expect(styles["border-radius"], `${testId} radius`).toBe("0px");
      }

      expect(fillRadius).toBe("0px");
    });

    test("casts the shadow in each component's own intent", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));

      const [neutral, tinted] = await page.evaluate(() =>
        ["card-default-none", "card-default-destructive"].map(
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

    /* The ink used to be a hand-written list of components, which is what let a
       chip be left off it. It is now `--ui-ink` read through the shared intent
       reset, so it reaches every component -- chips included -- and the two
       fourteen-selector lists are gone. Nothing holds a chip back any more: the
       one-pixel ceilings went with the edge scale that made them necessary, and a
       thick chip under a thick aesthetic is two documented features combined
       exactly as documented. */
    test("inks content chips and lets the aesthetic set their edge", async ({ page }) => {
      await page.goto(TYPOGRAPHY_URL);

      const properties = ["border-top-color", "border-top-width"];
      const defaultCap = await readStyles(page, "kbd-default-none", properties);

      await page.goto(withAesthetic(TYPOGRAPHY_URL, "neobrutalism"));

      const inkedCap = await readStyles(page, "kbd-default-none", [...properties, "background-color"]);
      const ink = await resolveToken(page, "--color-text");
      /* A chip rests `soft`, and `box` blends a line toward the plate it rings by
         the resting fill, so the ink sets the edge without being the edge whole.
         Restating the blend here rather than loosening the comparison keeps the
         assertion exact: what is checked is that the aesthetic's ink is the ink
         end of that mix, not merely that the edge moved somewhere darker. */
      const inkedEdge = await page.evaluate(
        ([plate, tone]) => {
          const probe = document.createElement("span");

          probe.style.color = `color-mix(in oklab, ${plate} 12%, ${tone})`;
          document.body.append(probe);

          const resolved = getComputedStyle(probe).color;

          probe.remove();

          return resolved;
        },
        [inkedCap["background-color"]!, ink] as const,
      );

      expectSameColor(inkedCap["border-top-color"]!, inkedEdge, "inked key cap edge");
      expect(
        getColorDistance(inkedCap["border-top-color"]!, defaultCap["border-top-color"]!),
        "the ink moved the key cap edge",
      ).toBeGreaterThan(2);
      /* The aesthetic owns edge width, and a key cap no longer argues with it. */
      expect(defaultCap["border-top-width"], "default key cap width").toBe("1px");
      expect(inkedCap["border-top-width"], "inked key cap width").toBe("2px");

      await page.goto(withAesthetic(BUTTONS_URL, "neobrutalism"));

      const code = await readStyles(page, "code-chip", ["border-top-color", "box-shadow"]);

      /* Code rests edgeless, so the ink has nothing to colour: `--ui-border` at
         zero mixes the line away and P3 then leaves nothing behind it. It rests at
         elevation zero too, so the slab multiplies out to a shadow whose every
         length is zero rather than an offset one. */
      expect(isTransparent(code["border-top-color"]!), "code border").toBe(true);
      expect(code["box-shadow"], "code shadow").toContain("0px 0px 0px 0px");
    });

    test("supplies the neutral ink without overriding an intent", async ({ page }) => {
      await page.goto(SURFACES_URL);

      const plain = await readStyles(page, "card-default-none", ["border-top-color"]);

      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));

      const inked = await readStyles(page, "card-default-none", ["border-top-color"]);
      const tinted = await readStyles(page, "card-default-destructive", ["border-top-color"]);
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
      await expectPressed("btn-default-none");

      /* A card lifts only when it opts in with `.interactive`: a plain card is a
         container, not a control. */
      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));
      await expectPressed("card-default-none-interactive");
    });

    test("lets an explicit presentation on the element win over the aesthetic", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "neobrutalism"));

      const properties = ["border-top-width", "border-top-color", "background-color"];
      const outline = await readStyles(page, "btn-ghost-edged-primary", properties);
      const seamless = await readStyles(page, "btn-solid-primary", properties);

      /* The edge width is the aesthetic's and nothing else: presentation decides
         *whether* a line reads, never how thick it is. `--ui-border-scale` is
         gone, so no presentation doubles the material it lands on. */
      expect(outline["border-top-width"], "edged width").toBe("2px");
      expect(seamless["border-top-width"], "edgeless width").toBe("2px");

      /* P3. `.ghost.edged` draws a line the fill cannot hide; `.solid.edgeless`
         draws none, so the fill reaches the boundary unbroken. The width stays
         the aesthetic's either way -- presentation decides whether a line reads,
         never how much room it takes. */
      expect(
        getColorDistance(outline["border-top-color"]!, outline["background-color"]!),
        "edged line reads against its own fill",
      ).toBeGreaterThan(2);
      expect(isTransparent(seamless["border-top-color"]!), "edgeless edge").toBe(true);
    });
  });

  test("shapes the tooltip bubble with the aesthetic in scope", async ({ page }) => {
    const readBubble = async (aesthetic: string) => {
      await page.goto(withAesthetic(FEEDBACK_URL, aesthetic));

      const host = page.getByTestId("fallback-tooltip");

      await host.hover();

      return host.evaluate((element) => {
        const styles = getComputedStyle(element, "::after");

        return { boxShadow: styles.boxShadow, clipPath: styles.clipPath, filter: styles.filter };
      });
    };

    const plain = await readBubble("");
    const inked = await readBubble("neobrutalism");
    const stepped = await readBubble("pixel");

    /* The silhouette reaches the bubble, because `--ui-clip` is a plain material
       token the bubble resolves at its own root. */
    expect(plain.clipPath, "default bubble clip").toBe("none");
    expect(stepped.clipPath, "pixel bubble clip").toContain("polygon(");

    /* The shadow half reaches it too, now that the bubble is a surface. The
       registry rests it at elevation 2, so the structural depth doubles, the
       brutalist slab doubles, and the stepped one trades both for the inset ring
       its own clip demands. */
    expect(plain.boxShadow, "default bubble").toContain("0px 2px 6px 0px");
    expect(inked.boxShadow, "neobrutalist bubble").toContain("8px 8px 0px 0px");
    expect(stepped.boxShadow, "pixel bubble").toContain("inset");
    expect(stepped.boxShadow, "pixel bubble ring").toContain("0px 0px 0px 4px");
  });

  test("lets a tooltip's direct aesthetic outrank an inherited aesthetic", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const bubbles = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="preview-root"]')!;
      const read = (ancestorClass: string, directClass: string) => {
        const ancestor = document.createElement("div");
        const tooltip = document.createElement("span");

        ancestor.className = ancestorClass;
        tooltip.className = `tooltip ${directClass}`;
        tooltip.dataset.state = "open";
        tooltip.dataset.tooltip = `${directClass} tooltip`;
        ancestor.append(tooltip);
        root.append(ancestor);

        const styles = getComputedStyle(tooltip, "::after");
        const result = {
          backdrop: styles.backdropFilter || styles.getPropertyValue("-webkit-backdrop-filter"),
          borderRadius: styles.borderRadius,
          borderWidth: styles.borderTopWidth,
          boxShadow: styles.boxShadow,
          clipPath: styles.clipPath,
          filter: styles.filter,
        };

        ancestor.remove();
        return result;
      };

      return {
        directGlass: read("", "glass"),
        directPixel: read("", "pixel"),
        glassOverPixel: read("glass", "pixel"),
        pixelOverGlass: read("pixel", "glass"),
      };
    });

    /* The point of the test is the precedence, not the material: a tooltip
       carrying its own aesthetic reads that one, whatever an ancestor declares. */
    for (const [label, styles] of [
      ["direct pixel", bubbles.directPixel],
      ["glass ancestor, pixel tooltip", bubbles.glassOverPixel],
    ] as const) {
      expect(styles.clipPath, `${label} clip`).toContain("polygon(");
      expect(styles.borderWidth, `${label} border`).toBe("0px");
      expect(styles.borderRadius, `${label} radius`).toBe("0px");
      expect(styles.backdrop === "" || styles.backdrop === "none", `${label} backdrop`).toBe(true);
    }

    for (const [label, styles] of [
      ["direct glass", bubbles.directGlass],
      ["pixel ancestor, glass tooltip", bubbles.pixelOverGlass],
    ] as const) {
      expect(styles.clipPath, `${label} clip`).toBe("none");
      expect(styles.filter, `${label} filter`).toBe("none");
      expect(styles.borderRadius, `${label} radius`).toBe("12px");
      /* Glass declares a border width and the bubble is a box that reads it --
         edgeless, so the line is blended into the fill rather than narrowed. The
         backdrop is deliberately not asserted here: this test does not pin the
         transparency preference, and glass drops the blur under `reduce`. */
      expect(styles.borderWidth, `${label} border`).toBe("1px");
    }
  });

  test.describe("glass", () => {
    /* Only Chromium reports `prefers-reduced-transparency: reduce` in this
       environment, so it is also the only engine that needs the preference
       emulated away before the translucent branch can be read. The other two
       report no preference natively and run the same assertions unmodified --
       which is the point: a blur declared in a form one engine cannot read is
       exactly the defect a Chromium-only test cannot see. */
    const allowTransparency = async (page: Page, browserName: string) => {
      if (browserName !== "chromium") {
        return;
      }

      const session = await page.context().newCDPSession(page);

      await session.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-transparency", value: "no-preference" }],
      });
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches)).toBe(false);
    };

    /* `""` is "the engine has no such property"; `"none"` is "it has one and it
       is unset". Folding them with `||` reads an unset standard property as a
       present value and never falls through to the prefixed one. */
    const readBackdrop = (styles: Record<string, string>) =>
      styles["backdrop-filter"] && styles["backdrop-filter"] !== "none"
        ? styles["backdrop-filter"]
        : styles["-webkit-backdrop-filter"];

    const BACKDROP_PROPERTIES = ["backdrop-filter", "-webkit-backdrop-filter", "background-color"];

    test("blurs translucent surfaces when transparency is allowed", async ({ page, browserName }) => {
      await allowTransparency(page, browserName);
      await page.goto(withAesthetic(SURFACES_URL, "glass"));

      const card = await readStyles(page, "card-default-none", BACKDROP_PROPERTIES);

      expect(readBackdrop(card), "card backdrop").toContain("blur(14px)");
      expect(readSrgb(card["background-color"]!).alpha, "card alpha").toBeLessThan(1);
    });

    /* `--ui-backdrop` is a slot only a surface resolves, which is what keeps the
       blur off every button and chip on the page without the aesthetic naming a
       component. The other half of that sentence is that it must reach every
       surface, and a panel, an alert and a tooltip bubble are all surfaces. */
    test("reaches every surface and nothing else", async ({ page, browserName }) => {
      await allowTransparency(page, browserName);
      await page.goto(withAesthetic(SURFACES_URL, "glass"));

      const panel = await readStyles(page, "panel-default-none", BACKDROP_PROPERTIES);

      await page.goto(withAesthetic(FEEDBACK_URL, "glass"));

      const alert = await readStyles(page, "alert-default-none", BACKDROP_PROPERTIES);
      const tooltip = page.getByTestId("tooltip-open");

      await tooltip.hover();

      const tooltipBackdrop = await tooltip.evaluate((element) => {
        const styles = getComputedStyle(element, "::after");

        return (
          (styles.backdropFilter !== "none" && styles.backdropFilter) ||
          styles.getPropertyValue("-webkit-backdrop-filter")
        );
      });

      for (const [label, styles] of [
        ["panel", panel],
        ["alert", alert],
      ] as const) {
        expect(readBackdrop(styles), `${label} backdrop`).toContain("blur(14px)");
        expect(readSrgb(styles["background-color"]!).alpha, `${label} alpha`).toBeLessThan(1);
      }

      expect(tooltipBackdrop, "tooltip backdrop").toContain("blur(14px)");

      /* And nothing else. One compositing layer under every control of a dense
         cluster reads as noise, which is why the slot is a surface's alone. */
      await page.goto(withAesthetic(BUTTONS_URL, "glass"));

      const button = await readStyles(page, "btn-default-none", BACKDROP_PROPERTIES);
      const buttonBackdrop = readBackdrop(button);

      expect(buttonBackdrop === "" || buttonBackdrop === "none", "button backdrop").toBe(true);
    });

    test("makes glass surfaces opaque under reduced transparency", async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "Only Chromium can emulate the transparency preference");
      const session = await page.context().newCDPSession(page);
      await session.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
      });
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches)).toBe(true);
      await page.goto(withAesthetic(SURFACES_URL, "glass"));

      const card = await readStyles(page, "card-default-none", BACKDROP_PROPERTIES);
      const backdrop = readBackdrop(card);

      /* Transparency is the whole aesthetic, so the honest degradation is an
         opaque surface rather than a softer blur. */
      expect(backdrop === "" || backdrop === "none", "card backdrop").toBe(true);
      expect(readSrgb(card["background-color"]!).alpha, "card alpha").toBe(1);
    });

    /* The knob, in the shape the other two aesthetics already publish: a value
       set on the element that carries the aesthetic class, resolved there and
       inherited already-resolved. A consumer who wants tighter glass has one
       place to say so and does not have to know that `--ui-radius` is what it
       feeds. */
    test("takes its corner from the public radius knob", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "glass"));

      const measured = await page.evaluate(() => {
        const host = document.createElement("div");
        const card = document.createElement("div");

        host.className = "glass";
        host.style.setProperty("--glass-radius-surface", "2rem");
        card.className = "card";
        host.append(card);
        document.querySelector('[data-testid="preview-root"]')!.append(host);

        const radius = getComputedStyle(card).borderTopLeftRadius;

        host.remove();
        return radius;
      });

      expect(measured, "overridden surface radius").toBe("32px");
    });

    test("still applies its material tokens to controls", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "glass"));

      const styles = await readStyles(page, "btn-default-primary", ["border-radius"]);

      /* `--glass-radius`, resolved through `--ui-radius`. A bubble takes the
         control radius rather than the surface one, so both this and the tooltip
         above measure the same knob. */
      expect(styles["border-radius"]).toBe("12px");
    });

    test("composes its shadow from the public elevation color", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "glass"));

      const card = page.getByTestId("card-default-none");
      await page
        .getByTestId("preview-root")
        .evaluate((element) => element.style.setProperty("--elevation-color", "rgb(255 0 255)"));

      await expect
        .poll(() => card.evaluate((element) => getComputedStyle(element).boxShadow))
        .toContain("rgb(255, 0, 255)");
    });
  });

  test.describe("pixel", () => {
    /* The material contract stated on an arbitrary aesthetic rather than on
       `.pixel`, so it covers what any aesthetic may declare. A `box` component
       draws its inset edge out of the shadow parts -- `--ui-shadow-inset` plus
       `--ui-shadow-spread` -- because a `clip-path` clips a border away and the
       ceiling has to take the border out with it. */
    test("honors the public shape and ring material contract", async ({ page }) => {
      await page.goto(BUTTONS_URL);

      const values = await page.evaluate(() => {
        const host = document.createElement("div");
        const createButton = (style: string) => {
          const button = document.createElement("button");

          button.className = "btn";
          button.textContent = "Shape";
          button.setAttribute("style", style);
          host.append(button);
          return button;
        };
        const ring = "--ui-shadow-inset: inset; --ui-shadow-spread: 3px";
        const complete = createButton(
          `--ui-clip: inset(3px); ${ring}; --ui-border-max: 0px; --ui-focus-inset: 2px; transition: none`,
        );
        const clipOnly = createButton("--ui-clip: inset(3px); --ui-border-max: 0px");
        const ringOnly = createButton(ring);

        document.body.append(host);

        const read = (element: Element) => {
          const styles = getComputedStyle(element);

          return {
            borderWidth: styles.borderTopWidth,
            boxShadow: styles.boxShadow,
            clipPath: styles.clipPath,
          };
        };
        const resting = read(complete);

        complete.focus();

        const result = {
          clipOnly: read(clipOnly),
          complete: resting,
          focused: read(complete),
          ringOnly: read(ringOnly),
        };

        host.remove();
        return result;
      });

      expect(values.complete.clipPath).toBe("inset(3px)");
      expect(values.complete.borderWidth).toBe("0px");
      expect(values.complete.boxShadow).toMatch(/0px 0px 0px 3px inset/);
      /* The focus layer is a second inset ring wider than the edge, and the
         resting one survives beside it. */
      expect(values.focused.boxShadow).toMatch(/0px 0px 0px 3px inset/);
      expect(values.focused.boxShadow).toMatch(/0px 0px 0px 2px inset/);

      /* Each half is independent: a silhouette with no ring, and a ring with no
         silhouette. `--ui-border-max` is what removes the border a clip would
         otherwise leave painting a second line beside the ring. */
      expect(values.clipOnly.clipPath).toBe("inset(3px)");
      expect(values.clipOnly.borderWidth).toBe("0px");
      expect(values.clipOnly.boxShadow).not.toMatch(/inset/);
      expect(values.ringOnly.clipPath).toBe("none");
      expect(values.ringOnly.boxShadow).toMatch(/0px 0px 0px 3px inset/);
    });

    /* An invalid `var()` inside a `box-shadow` makes the declaration invalid at
       computed-value time, and a non-inherited property invalid there computes
       to its initial value -- `none`, not "the value it already had". Every box
       therefore builds its focus stack as one custom property and substitutes
       the whole thing, so a missing `--ui-focus-inset` costs the focus layer and
       never the resting shadow. This broke once already. */
    test("keeps the resting shadow when a box takes focus under every aesthetic", async ({ page }) => {
      /* oxlint-disable no-await-in-loop -- one page, navigated in turn: the
         aesthetics cannot be probed in parallel on a single tab. */
      for (const aesthetic of ["", "neobrutalism", "glass", "pixel"] as const) {
        await page.goto(aesthetic ? withAesthetic(BUTTONS_URL, aesthetic) : BUTTONS_URL);

        /* Every engine gates `:focus-visible` on its own keyboard-modality
           heuristic, and a programmatic `focus()` satisfies none of them
           reliably. Focusing a sibling and pressing Tab is a real keyboard move,
           which all three agree about. */
        const resting = await page.evaluate(() => {
          const host = document.querySelector('[data-testid="preview-root"]')!;
          const previous = document.createElement("button");
          const target = document.createElement("button");

          previous.id = "focus-probe-previous";
          previous.textContent = "Previous";
          target.id = "focus-probe";
          target.className = "btn primary";
          target.textContent = "Probe";
          target.style.transition = "none";
          host.append(previous, target);
          previous.focus();

          return getComputedStyle(target).boxShadow;
        });

        await page.keyboard.press("Tab");

        const focused = await page.evaluate(() => {
          const target = document.querySelector("#focus-probe")!;
          const styles = getComputedStyle(target);
          const result = { focusVisible: target.matches(":focus-visible"), shadow: styles.boxShadow };

          target.remove();
          document.querySelector("#focus-probe-previous")!.remove();

          return result;
        });

        const label = aesthetic || "no aesthetic";

        expect(focused.focusVisible, `${label} is focus-visible`).toBe(true);
        expect(resting, `${label} has a resting shadow`).not.toBe("none");
        expect(focused.shadow, `${label} keeps its resting shadow`).toContain(resting);
      }
    });

    test("cuts stepped corners and draws the edge as an inset ring", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "pixel"));

      const button = await readStyles(page, "btn-default-none", [
        "clip-path",
        "border-top-width",
        "box-shadow",
        "border-radius",
      ]);

      const properties = ["clip-path", "border-top-width", "box-shadow", "border-radius"];

      await page.goto(withAesthetic(SURFACES_URL, "pixel"));

      const card = await readAll(page, ["card-default-none"], properties);

      await page.goto(withAesthetic(FORMS_URL, "pixel"));

      const input = await readAll(page, ["ipt-default-none"], properties);

      for (const [testId, styles] of [["btn-default-none", button] as const, ...card, ...input]) {
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

    /* The corner is one square grid unit and nothing else. The staircase this
       replaces stepped twice at half a unit to approximate a curve, which is the
       one shape a low-resolution grid cannot draw: at any size it read as a bevel
       that had not quite committed rather than as a pixel. */
    test("cuts one square grid unit off each corner", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "pixel"));

      const structural = await readStyles(page, "card-default-none", ["clip-path"]);

      /* Left edge to the cut, across the corner square, then up to the top edge:
         two vertices where the staircase needed four. The unit is the ring's own
         depth, so the cut and what covers it agree by construction. */
      expect(structural["clip-path"], "card clip").toContain("polygon(0px 4px, 4px 4px, 4px 0px");
    });

    /* The other half of the vocabulary: no radius at all. One unit off each
       corner of a 24px badge is a bite rather than a corner, and squared is still
       on the grid this aesthetic is made of. */
    test("squares a chip instead of stepping it", async ({ page }) => {
      await page.goto(withAesthetic(FEEDBACK_URL, "pixel"));

      const chip = await readStyles(page, "badge-default-none", ["clip-path", "border-radius"]);

      await page.goto(withAesthetic(BUTTONS_URL, "pixel"));

      const code = await readStyles(page, "code-chip", ["clip-path", "border-radius"]);

      for (const [name, styles] of [
        ["badge", chip],
        ["code", code],
      ] as const) {
        expect(styles["clip-path"], `${name} clip`).toBe("none");
        expect(styles["border-radius"], `${name} radius`).toBe("0px");
      }
    });

    /* The ring is this aesthetic's border, drawn where a `clip-path` cannot cut
       it, so it answers the edge axis exactly as a real border does. It did not:
       `--ui-shadow-ink` painted it at full strength on every box the aesthetic
       reached, so `.edged` and `.edgeless` rendered identically and the aesthetic
       decided an axis that is not its to decide. `--ui-shadow-edge` points it at
       `--_edge` instead, which already carries the edge amount as its alpha. */
    test("draws the inset ring only where the edge axis asks for one", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "pixel"));

      const surfaces = await readAll(page, ["card-ghost-edged-none", "card-soft-edgeless-none"], ["box-shadow"]);
      const [edged, edgeless] = surfaces.map(([, styles]) => styles["box-shadow"]!);

      /* Same geometry either way -- only the colour moves, which is what keeps
         the aesthetic's material out of the presentation's decision. */
      for (const shadow of [edged, edgeless]) {
        expect(shadow).toMatch(/\b0px 0px 0px 4px\b/);
        expect(shadow).toContain("inset");
      }

      expect(isTransparent(readShadowColor(edged!)), "edged ring").toBe(false);
      expect(isTransparent(readShadowColor(edgeless!)), "edgeless ring").toBe(true);

      /* A field floors its own edge, so a container asking for none cannot take
         away the one mark of where typing goes (WCAG 1.4.11). */
      await page.goto(withAesthetic(FORMS_URL, "pixel"));

      const field = await readStyles(page, "ipt-default-none", ["box-shadow"]);

      expect(isTransparent(readShadowColor(field["box-shadow"]!)), "field ring").toBe(false);
    });

    test("keeps a focus ring that clipping would otherwise remove", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "pixel"));

      const input = page.getByTestId("ipt-default-none");

      await input.focus();

      /* Two inset layers: the edge on top, the focus ring immediately inside it.
         An outline or an outer ring would be clipped away entirely. The focus
         layer is `--ui-focus-inset`, which pixel sizes past its own 4px ring so
         it shows at all. The ring is transitioned in, so this polls for the
         settled value. */
      await expect
        .poll(() => input.evaluate((element) => getComputedStyle(element).boxShadow))
        .toMatch(/\b0px 0px 0px 7px\b/);

      const styles = await input.evaluate((element) => {
        const computed = getComputedStyle(element);

        return { boxShadow: computed.boxShadow, outlineStyle: computed.outlineStyle };
      });

      expect(styles.boxShadow.match(/inset/g)?.length, styles.boxShadow).toBe(2);
      /* The outline from `reset.css` is declared and drawn, and `clip-path`
         clips an element's whole rendering including its outline -- which is the
         reason the inset layer exists. This used to read `none`, because
         `text-control` carried an `outline-none` that suppressed the ring on
         every control in the package rather than only under a clip. */
      expect(styles.outlineStyle).toBe("solid");
    });

    test("squares what it can, squares a checkbox, and keeps a radio round", async ({ page }) => {
      await page.goto(withAesthetic(FEEDBACK_URL, "pixel"));

      const track = await readAll(page, ["progress-default-none"], ["border-radius", "clip-path"]);
      const fillRadius = await readPseudoStyle(page, "progress-default-none", "::after", "border-radius");

      await page.goto(withAesthetic(FORMS_URL, "pixel"));

      const checkbox = await readStyles(page, "checkbox-default-none", ["border-radius", "box-shadow", "clip-path"]);
      const radio = await readStyles(page, "radio-default-none", ["border-radius", "box-shadow", "clip-path"]);

      /* An indicator reads no material beyond the radius, so nothing clips it. */
      for (const [testId, styles] of track) {
        expect(styles["border-radius"], `${testId} radius`).toBe("0px");
        expect(styles["clip-path"], `${testId} clip`).toBe("none");
      }

      expect(fillRadius).toBe("0px");

      /* A toggle takes the chip silhouette, which this aesthetic squares, and its
         inset edge is capped at the line width: four pixels a side on a
         sixteen-pixel box would leave an eight-pixel hole and an unchecked box
         reads as a filled one. */
      expect(checkbox["border-radius"], "checkbox radius").toBe("0px");
      expect(checkbox["clip-path"], "checkbox clip").toBe("none");
      expect(checkbox["box-shadow"], "checkbox ring").toContain("0px 0px 0px 2px");

      /* The circle is the only thing telling a radio from a checkbox at a glance,
         so the radio is the one toggle that declines the silhouette. An inset
         shadow follows `border-radius`, so its edge stays round without one. */
      expect(radio["border-radius"], "radio radius").not.toBe("0px");
      expect(radio["clip-path"], "radio clip").toBe("none");
      expect(radio["box-shadow"], "radio ring").toContain("0px 0px 0px 2px");
    });

    test("resolves each component's own intent through the shared ring", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "pixel"));

      /* Probed on `.ghost.edged`, because the ring now answers the edge axis and
         a fill would blend it toward the plate: P3 runs the line into the fill by
         the fill amount, so a `.solid` ring is the plate's own colour by design.
         Zero fill is where the intent reaches the line undiluted. */
      const [neutralShadow, tintedShadow] = await page.evaluate(() =>
        ["btn-ghost-edged-none", "btn-ghost-edged-destructive"].map(
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

      const [button, input, code] = shapes;

      for (const shape of shapes) {
        expect(shape.borderTopWidth, `${shape.selector} border`).toBe("0px");
        expect(shape.borderTopLeftRadius, `${shape.selector} radius`).toBe("0px");
      }

      /* The structural silhouette on the two structural elements, and the chip
         one -- squared, under this aesthetic -- on the content chip. Both are
         material tokens, so both travel. */
      expect(button!.clipped, "button clip").toBe(true);
      expect(input!.clipped, "input clip").toBe(true);
      expect(code!.clipped, "code clip").toBe(false);

      /* A clip removes a border, so the edge has to be the inset ring instead or
         the element loses its outline entirely. The ring travels through the
         `@apply` that maps the element onto the utility, where a rule keyed on a
         class never could. A bare `<input>` is the one probed for colour: it is
         the element that floors its own edge, so the ring is there whatever a
         container says, where a `<button>` is solid and edgeless and a `<code>`
         edgeless, and neither is owed a line. */
      for (const shape of [button!, input!, code!]) {
        expect(shape.ring, `${shape.selector} ring`).toContain("inset");
        expect(shape.ring, `${shape.selector} ring depth`).toContain("0px 0px 0px 4px");
      }

      expect(isTransparent(readShadowColor(input!.ring)), "input ring").toBe(false);
    });
  });
  test.describe("chunky tile", () => {
    /* The whole aesthetic in one measurement. `--intent-border` IS `--intent-color`
       for all six hue intents, so at a full shadow ink the bar equals the plate
       exactly -- the state this aesthetic exists to avoid, where the bar is painted
       and invisible and the press then reads as the button spontaneously
       shortening. An opaque `--elevation-color` plus a partial ink is what turns
       the repeat into a shade. */
    test("seats a filled tile on a darker shade of its own fill", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "chunky-tile"));

      const probes = await readAll(
        page,
        ["btn-default-success", "btn-default-warning", "btn-default-info"],
        ["background-color", "box-shadow"],
      );

      /* oxlint-disable-next-line no-await-in-loop -- two probes, read in turn on one page. */
      for (const [testId, styles] of probes) {
        // oxlint-disable-next-line no-await-in-loop
        const [fill, bar] = await readComposited(page, [
          styles["background-color"]!,
          readShadowColor(styles["box-shadow"]!),
        ]);

        expect(bar!.luminance, `${testId} bar is darker than its fill`).toBeLessThan(fill!.luminance);
        /* Far enough apart to read as a separate surface rather than as an
           antialiasing seam. Measured, identical on both palettes because the hue
           intents do not vary by theme: success #007a55 on #004c34 is 57, warning
           #e17100 on #914600 is 91, info #4f39f6 on #30219f is 95. */
        expect(channelDistance(fill!.rgb, bar!.rgb), `${testId} bar separates from its fill`).toBeGreaterThan(40);
      }
    });

    test("drops the bar straight down and presses the element into it", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "chunky-tile"));

      const button = await readStyles(page, "btn-default-none", [
        "box-shadow",
        "border-radius",
        "border-top-width",
        "--ui-active-shadow-y",
        "--ui-active-transform",
        "--ui-hover-transform",
      ]);

      /* No x offset is what separates this from neobrutalism, and no blur or spread
         is what keeps the bar inside the element's own silhouette so its corners
         stay in step with the radius. */
      expect(button["box-shadow"], "resting bar").toMatch(/\b0px 4px 0px 0px\b/);
      expect(button["border-radius"], "radius").toBe("12px");
      expect(button["border-top-width"], "line").toBe("2px");

      /* `:focus-visible` can be driven from a keyboard but `:active` cannot, so the
         press asserts the tokens the rule reads. That the rule reads them is
         `button.css`'s contract and the neobrutalism suite already covers it. */
      expect(button["--ui-active-shadow-y"].trim(), "the bar collapses on press").toBe("0px");
      expect(button["--ui-active-transform"].trim(), "the element travels the bar's depth").toBe("translateY(4px)");
      expect(button["--ui-hover-transform"].trim(), "hover holds still").toBe("none");
    });

    /* An unfilled tile gets its bar for free and correct: the shadow ink resolves
       `--intent-border`, which is the token that drew the line, so a card's border
       and its bar are the same colour by construction rather than by a second
       token kept in step with the first. */
    test("matches an unfilled tile's bar to the line it already draws", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "chunky-tile"));

      const card = await readStyles(page, "card-default-none", ["background-color", "border-top-color", "box-shadow"]);
      const [fill, bar, line] = await readComposited(page, [
        card["background-color"]!,
        readShadowColor(card["box-shadow"]!),
        card["border-top-color"]!,
      ]);

      expect(bar!.luminance, "bar is darker than the plate").toBeLessThan(fill!.luminance);
      /* The bar is the line run toward the depth colour, so the two share a family
         rather than a value. This asserts the family, not equality. */
      expect(channelDistance(line!.rgb, bar!.rgb), "line and bar are the same grey").toBeLessThan(120);
    });

    /* The recorded R3 exception. `.btn` is the only action the package ships, and
       the bare element is named beside the class so the treatment reaches an
       unclassed `<button>` the way every Tier 1 token already does. */
    test("weights its action labels, including on an unclassed button", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "chunky-tile"));

      const classed = await readStyles(page, "btn-default-none", ["text-transform", "font-weight", "letter-spacing"]);

      expect(classed["font-weight"], "classed weight").toBe("800");
      expect(classed["letter-spacing"], "classed tracking").not.toBe("normal");
      /* Casing is the application's decision. An aesthetic that recased a label
         would also recase every acronym, proper noun and locale whose rules are
         not English's, which is not a material choice at all. */
      expect(classed["text-transform"], "casing is left alone").toBe("none");

      await page.goto(withAesthetic(NATIVE_URL, "chunky-tile"));

      const bare = await page.evaluate(() => {
        const styles = getComputedStyle(document.querySelector('[data-testid="native-root"] button')!);

        return { transform: styles.textTransform, weight: styles.fontWeight };
      });

      expect(bare.weight, "bare <button> weight").toBe("800");
      expect(bare.transform, "bare <button> casing").toBe("none");
    });

    /* The knob exists for one reason, and this is it. An aesthetic declares the
       shared material tokens on its own class, and a declaration beats inheritance
       whatever the specificity -- so a consumer theming from `:root` or a wrapper
       cannot reach `--ui-radius` at all. Reading a knob here instead lets an
       ancestor's value flow in, which is the ordinary way an application themes
       something. The shared token still wins on the element itself and below, so
       the two reach in opposite directions rather than one replacing the other. */
    test("takes its corner from a knob an ancestor can reach", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "chunky-tile"));

      const measured = await page.evaluate(() => {
        const build = (property: string) => {
          const ancestor = document.createElement("div");
          const host = document.createElement("div");
          const card = document.createElement("div");

          host.className = "chunky-tile";
          card.className = "card";
          ancestor.style.setProperty(property, "2rem");
          host.append(card);
          ancestor.append(host);
          document.querySelector('[data-testid="preview-root"]')!.append(ancestor);

          const radius = getComputedStyle(card).borderTopLeftRadius;

          ancestor.remove();
          return radius;
        };

        return { sharedToken: build("--ui-radius-surface"), knob: build("--tile-radius") };
      });

      expect(measured.knob, "an ancestor's knob reaches the tile").toBe("32px");
      /* The counterpart, asserted so the reason the knob exists stays visible: the
         shared token set on an ancestor is outranked by the aesthetic's own
         declaration and the tile keeps its default. */
      expect(measured.sharedToken, "an ancestor's shared token does not").toBe("12px");
    });

    /* Depth stays a per-element decision, and this aesthetic changes none of it:
       the registry rests a badge at zero, so it sits on no bar until asked. */
    test("leaves the components the registry rests flat without a bar", async ({ page }) => {
      await page.goto(withAesthetic(FEEDBACK_URL, "chunky-tile"));

      const badge = await readStyles(page, "badge-default-none", ["box-shadow"]);

      expect(badge["box-shadow"], "badge").toMatch(/\b0px 0px 0px 0px\b/);
    });
  });
});
