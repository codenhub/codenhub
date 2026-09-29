import { expect, test, type Page } from "./fixtures";
import { expectSameColor, flattenColor, getColorDistance, isTransparent, readSrgb } from "./test-utils";

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
      /* A chip rests `soft`, and `box` fades a line out by the resting fill, so
         the ink sets the edge without being the edge whole. Restating the blend
         here rather than loosening the comparison keeps the assertion exact: what
         is checked is that the aesthetic's ink is the ink end of that mix, not
         merely that the edge moved somewhere darker. */
      const inkedEdge = await page.evaluate((tone) => {
        const probe = document.createElement("span");

        probe.style.color = `color-mix(in oklab, transparent 12%, ${tone})`;
        document.body.append(probe);

        const resolved = getComputedStyle(probe).color;

        probe.remove();

        return resolved;
      }, ink);

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

    test("holds its slab under a hover and travels it on the press", async ({ page }) => {
      const expectHeldThenPressed = async (testId: string) => {
        const element = page.getByTestId(testId);

        /* Hover keeps the resting offset slab and does not move the element:
           `box-hover`'s derived fill tint is the whole hover response. */
        await element.hover();
        await expect
          .poll(() => element.evaluate((node) => getComputedStyle(node).transform), `${testId} hover`)
          .toBe("none");
        await expect
          .poll(() => element.evaluate((node) => getComputedStyle(node).boxShadow), `${testId} hover`)
          .toMatch(/\b4px 4px 0px 0px\b/);

        /* The press travels the offset and collapses the shadow. A held pointer is
           what drives `:active`, which no keyboard move can. Both properties are
           transitioned, so these poll for the settled value. */
        await page.mouse.down();
        try {
          await expect
            .poll(() => element.evaluate((node) => getComputedStyle(node).translate), `${testId} press`)
            .toBe("4px 4px");
          await expect
            .poll(() => element.evaluate((node) => getComputedStyle(node).boxShadow), `${testId} press`)
            .toMatch(/\b0px 0px 0px 0px\b/);
        } finally {
          await page.mouse.up();
        }
      };

      await page.goto(withAesthetic(BUTTONS_URL, "neobrutalism"));
      await expectHeldThenPressed("btn-default-none");

      /* A card responds only when it opts in with `.interactive`: a plain card is
         a container, not a control. */
      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));
      await expectHeldThenPressed("card-default-none-interactive");
    });

    /* The offset is read with a fallback rather than declared, which is what lets
       an ancestor set it. Declared on the class it would outrank every ancestor --
       including `:root`, where an application normally themes something -- and the
       first version of it did exactly that. One knob drives the slab and the travel
       into it, so a consumer scaling the look scales it whole. */
    test("takes its offset from a knob an ancestor can reach", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "neobrutalism"));

      const measured = await page.evaluate(() => {
        const build = (where: "ancestor" | "self") => {
          const ancestor = document.createElement("div");
          const host = document.createElement("div");
          const card = document.createElement("div");

          host.className = "neobrutalism";
          card.className = "card raised";
          (where === "ancestor" ? ancestor : host).style.setProperty("--neo-offset", "9px");
          host.append(card);
          ancestor.append(host);
          document.querySelector('[data-testid="preview-root"]')!.append(ancestor);

          const { boxShadow } = getComputedStyle(card);

          ancestor.remove();
          return boxShadow;
        };

        return { ancestor: build("ancestor"), self: build("self") };
      });

      expect(measured.ancestor, "an ancestor's knob offsets the slab").toContain("9px 9px");
      expect(measured.self, "so does one on the element itself").toContain("9px 9px");
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
    const readBubble = async (aesthetic: string, extraClass = "") => {
      await page.goto(withAesthetic(FEEDBACK_URL, aesthetic));

      const host = page.getByTestId("fallback-tooltip");

      await host.hover();

      return host.evaluate((element, extra) => {
        const bubble = element.querySelector(".tooltip-bubble");
        if (!bubble) {
          throw new Error("Expected the fallback tooltip fixture to contain a .tooltip-bubble child.");
        }
        if (extra) {
          bubble.classList.add(extra);
        }

        const styles = getComputedStyle(bubble);

        return { boxShadow: styles.boxShadow, clipPath: styles.clipPath, filter: styles.filter };
      }, extraClass);
    };

    const plain = await readBubble("");
    const inked = await readBubble("neobrutalism");
    const stepped = await readBubble("pixel");
    const inkedFloating = await readBubble("neobrutalism", "floating");

    /* The silhouette reaches the bubble, because `--ui-clip` is a plain material
       token the bubble resolves at its own root. */
    expect(plain.clipPath, "default bubble clip").toBe("none");
    expect(stepped.clipPath, "pixel bubble clip").toContain("polygon(");

    /* Shape and edge material reach the bubble; part-based depth does not, because
       the bubble rests flat and depth is opt-in. The plain and brutalist bubbles
       draw no offset slab until `.floating` asks for one, and then it is the
       aesthetic's -- doubled. The pixel ring is the edge rather than depth
       -- spread, not offset -- so it reaches the bubble whatever the elevation. */
    const offsets = (shadow: string) => (shadow.split(") ")[1] ?? "0 0 0 0").split(" ").map(Number.parseFloat);
    expect(
      offsets(plain.boxShadow)
        .slice(0, 3)
        .every((length) => length === 0),
      "default bubble flat",
    ).toBe(true);
    expect(
      offsets(inked.boxShadow)
        .slice(0, 3)
        .every((length) => length === 0),
      "brutalist bubble flat",
    ).toBe(true);
    expect(inkedFloating.boxShadow, "brutalist bubble lifted").toContain("8px 8px 0px 0px");
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
        const bubble = document.createElement("span");

        ancestor.className = ancestorClass;
        tooltip.className = "tooltip";
        tooltip.dataset.state = "open";
        bubble.className = `tooltip-bubble ${directClass}`.trim();
        bubble.textContent = `${directClass} tooltip`;
        tooltip.append(bubble);
        ancestor.append(tooltip);
        root.append(ancestor);

        const styles = getComputedStyle(bubble);
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

      /* Neutral as well as named. A neutral panel, alert, and `.card.soft` rest
         on a quiet ground of their own, and they write it as a private default
         beneath `--ui-surface-ground` rather than as that public token -- so
         glass's ground still wins in its region. Written as the public token,
         each one's own declaration beat glass's inherited one and the three sat
         opaque inside a glass region. See docs/internal/model.md#cascade-layers. */
      const panel = await readStyles(page, "panel-default-none", BACKDROP_PROPERTIES);
      const namedPanel = await readStyles(page, "panel-default-destructive", BACKDROP_PROPERTIES);
      const softCard = await readStyles(page, "card-soft-edged-none", BACKDROP_PROPERTIES);

      await page.goto(withAesthetic(FEEDBACK_URL, "glass"));

      const alert = await readStyles(page, "alert-default-none", BACKDROP_PROPERTIES);
      const namedAlert = await readStyles(page, "alert-default-destructive", BACKDROP_PROPERTIES);
      const tooltip = page.getByTestId("tooltip-open");

      await tooltip.hover();

      const tooltipBackdrop = await tooltip.evaluate((element) => {
        const bubble = element.querySelector(".tooltip-bubble");
        if (!bubble) {
          throw new Error("Expected the tooltip-open fixture to contain a .tooltip-bubble child.");
        }
        const styles = getComputedStyle(bubble);

        return (
          (styles.backdropFilter !== "none" && styles.backdropFilter) ||
          styles.getPropertyValue("-webkit-backdrop-filter")
        );
      });

      for (const [label, styles] of [
        ["panel", panel],
        ["destructive panel", namedPanel],
        ["soft card", softCard],
        ["alert", alert],
        ["destructive alert", namedAlert],
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

    /* The glass is the ground a partial fill is painted over, not a thinning of
       the fill: how much colour a presentation asks for is presentation's
       question. `--ui-bg-alpha: 0.8` used to answer it here, and every `.solid`
       in the region -- button, checked toggle, card -- showed the backdrop
       through it. A neutral `.solid` is opaque too, because the cap that stops
       its ink rests it on the page background. */
    test("keeps every presentation's fill whole", async ({ page, browserName }) => {
      await allowTransparency(page, browserName);

      const read = async (url: string, testIds: readonly string[]) => {
        await page.goto(withAesthetic(url, "glass"));
        return readAll(page, testIds, ["background-color"]);
      };
      const opaque = [
        ...(await read(BUTTONS_URL, ["btn-solid-primary", "btn-solid-none", "btn-solid-neutral"])),
        ...(await read(FORMS_URL, ["checkbox-solid-primary-checked", "switch-soft-edged-success-checked"])),
        ...(await read(SURFACES_URL, ["card-solid-primary", "card-solid-none", "panel-solid-destructive"])),
        ...(await read(TYPOGRAPHY_URL, ["data-table-solid-primary", "data-table-solid-none"])),
      ];

      for (const [testId, styles] of opaque) {
        expect(readSrgb(styles["background-color"]!).alpha, `${testId} alpha`).toBe(1);
      }

      const [[, soft]] = await read(BUTTONS_URL, ["btn-soft-edged-primary"]);

      expect(readSrgb(soft!["background-color"]!).alpha, "soft button keeps its whole tint").toBeCloseTo(0.12, 2);
    });

    /* A table is a pane of content, and next to frosted cards an opaque one read
       as a slab -- while its `.solid` form, thinned, showed more of the backdrop
       than its default one did. Its lines are drawn on the plate rather than at
       its edge against the backdrop, so they take glass's rule ink: the pane
       hairline vanished there, and `.ruled` rendered as the default. */
    test("frosts a table and keeps its rules visible", async ({ page, browserName }) => {
      await allowTransparency(page, browserName);
      await page.goto(withAesthetic(TYPOGRAPHY_URL, "glass"));

      const table = await readStyles(page, "data-table-default-none", BACKDROP_PROPERTIES);

      expect(readBackdrop(table), "table backdrop").toContain("blur(14px)");
      expect(readSrgb(table["background-color"]!).alpha, "table alpha").toBeLessThan(1);

      const rules = await page.evaluate(() => {
        const read = (testId: string) => {
          const cell = document.querySelector(`[data-testid="${testId}"] tbody tr:first-child > td`)!;
          const rule = getComputedStyle(cell).borderBottomColor;
          const plate = getComputedStyle(cell.closest("table")!).backgroundColor;
          return { plate, rule };
        };
        const probe = document.createElement("span");
        probe.style.color = "var(--color-background)";
        document.body.append(probe);
        const page = getComputedStyle(probe).color;
        probe.remove();

        return { page, ruled: read("data-table-ruled"), ruleless: read("data-table-ruleless") };
      });
      const painted = (color: string, plate: string) => flattenColor(color, flattenColor(plate, rules.page));

      expect(
        getColorDistance(painted(rules.ruled.rule, rules.ruled.plate), flattenColor(rules.ruled.plate, rules.page)),
        "a ruled table's rule reads on its plate",
      ).toBeGreaterThan(20);
      expect(isTransparent(rules.ruleless.rule), "a ruleless table draws none").toBe(true);
    });

    /* Glass has no slab for a press to travel into, so the base scale is the
       press. It read `none` from before the base look had one, and a click on a
       glass button changed nothing. Pressed for real, since `:active` is what
       `box-active` keys on. */
    test("presses with the base scale, and not at all under reduced motion", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "glass"));

      const button = page.getByTestId("btn-solid-primary");
      const pressedTransform = () => button.evaluate((node) => getComputedStyle(node).transform);
      const press = async (expected: RegExp, label: string) => {
        await button.hover();
        await page.mouse.down();
        try {
          /* The transform is transitioned, so this polls for the settled value. */
          await expect.poll(pressedTransform, label).toMatch(expected);
        } finally {
          await page.mouse.up();
        }
      };

      await press(/^matrix\(0\.97, 0, 0, 0\.97,/, "pressed");
      await page.emulateMedia({ reducedMotion: "reduce" });
      await press(/^none$/, "pressed under reduced motion");
      await page.emulateMedia({ reducedMotion: null });
    });

    /* `.neutral` beat the control line's zero-specificity selector, so writing the
       intent out put the pane hairline back on the one boundary it erases. */
    test("draws a neutral control's line in the control ink", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "glass"));

      const [[, none], [, neutral]] = await readAll(
        page,
        ["checkbox-default-none", "checkbox-default-neutral"],
        ["border-top-color"],
      );

      expectSameColor(neutral!["border-top-color"]!, none!["border-top-color"]!, "neutral checkbox line");
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

    /* The knob is read with a fallback rather than declared, and that is what makes
       it worth having. Declared on the class it would outrank every ancestor --
       including `:root`, where an application normally themes something -- and the
       first version of it did exactly that, buying a name and no reach at all. */
    test("takes its corner from a knob an ancestor can reach", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "glass"));

      const measured = await page.evaluate(() => {
        const build = (where: "ancestor" | "self") => {
          const ancestor = document.createElement("div");
          const host = document.createElement("div");
          const card = document.createElement("div");

          host.className = "glass";
          card.className = "card";
          (where === "ancestor" ? ancestor : host).style.setProperty("--glass-radius-surface", "2rem");
          host.append(card);
          ancestor.append(host);
          document.querySelector('[data-testid="preview-root"]')!.append(ancestor);

          const radius = getComputedStyle(card).borderTopLeftRadius;

          ancestor.remove();
          return radius;
        };

        return { ancestor: build("ancestor"), self: build("self") };
      });

      expect(measured.ancestor, "an ancestor's knob reaches the pane").toBe("32px");
      expect(measured.self, "so does one on the element itself").toBe("32px");
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

    /* Liquid glass moves the blur off the surface onto a layer behind its
       content, and puts a lens on a second layer above it. A surface with a
       backdrop filter is a backdrop root, and a layer inside one sees only the
       surface -- so the surface's own filter must be gone for either layer to
       reach the page. The lens renders only where an engine draws an SVG filter
       in `backdrop-filter`; these read the declared contract, which every engine
       computes. */
    test.describe("liquid", () => {
      const LIQUID = "glass glass-liquid";
      const readLayers = (page: Page, selector: string) =>
        page
          .locator(selector)
          .first()
          .evaluate((element) => {
            const host = getComputedStyle(element);
            const before = getComputedStyle(element, "::before");
            const after = getComputedStyle(element, "::after");
            const backdrop = (styles: CSSStyleDeclaration) =>
              styles.backdropFilter && styles.backdropFilter !== "none"
                ? styles.backdropFilter
                : (styles.getPropertyValue("-webkit-backdrop-filter") ?? "");

            return {
              host: backdrop(host),
              position: host.position,
              isolation: host.isolation,
              before: before.content,
              beforeBackdrop: backdrop(before),
              after: after.content,
              afterBackdrop: after.backdropFilter,
              rim: after.boxShadow,
            };
          });

      test("layers the blur and the lens behind every surface", async ({ page, browserName }) => {
        await allowTransparency(page, browserName);
        /* oxlint-disable no-await-in-loop -- one page, navigated in turn. */
        for (const [url, testId] of [
          [SURFACES_URL, "card-default-none"],
          [SURFACES_URL, "panel-default-none"],
          [FEEDBACK_URL, "alert-default-destructive"],
          [TYPOGRAPHY_URL, "data-table-default-none"],
        ] as const) {
          await page.goto(withAesthetic(url, LIQUID));

          const layers = await readLayers(page, `[data-testid="${testId}"]`);

          expect(layers.host, `${testId} has no backdrop of its own`).toMatch(/^(none)?$/);
          expect(layers.isolation, testId).toBe("isolate");
          expect(layers.position, testId).toBe("relative");
          expect(layers.before, `${testId} blur layer`).toBe('""');
          expect(layers.beforeBackdrop, `${testId} blur layer`).toContain("blur(2px)");
          expect(layers.after, `${testId} lens layer`).toBe('""');
          expect(layers.afterBackdrop, `${testId} lens layer`).toContain("#lens");
          expect(layers.rim, `${testId} rim`).toContain("inset");
        }
      });

      test("keeps controls solid and the tooltip bubble in place", async ({ page, browserName }) => {
        await allowTransparency(page, browserName);
        await page.goto(withAesthetic(SURFACES_URL, LIQUID));

        const bubble = await page.getByTestId("preview-root").evaluate((root) => {
          const host = document.createElement("span");

          host.className = "tooltip";
          host.innerHTML = '<button class="btn">Trigger</button><span class="tooltip-bubble" role="tooltip">Tip</span>';
          root.append(host);

          const read = (element: Element) => ({
            position: getComputedStyle(element).position,
            before: getComputedStyle(element, "::before").content,
          });
          const result = {
            bubble: read(host.querySelector(".tooltip-bubble")!),
            button: read(host.querySelector(".btn")!),
          };

          host.remove();

          return result;
        });

        expect(bubble.bubble.position, "bubble keeps its own placement").toBe("absolute");
        expect(bubble.bubble.before, "bubble takes the layers").toBe('""');
        expect(bubble.button.before, "a control takes no layer").toBe("none");

        /* A `.solid` table is opaque, not frosted, so there is nothing for a
           layer to blur behind it. */
        await page.goto(withAesthetic(TYPOGRAPHY_URL, LIQUID));

        const solidTable = await readLayers(page, '[data-testid="data-table-solid-primary"]');

        expect(solidTable.before, "a solid table takes no layer").toBe("none");
      });

      test("reaches one surface inside a glass region, and skips a plain glass region nested inside", async ({
        page,
        browserName,
      }) => {
        await allowTransparency(page, browserName);
        await page.goto(withAesthetic(SURFACES_URL, "glass"));

        const read = await page.getByTestId("preview-root").evaluate((root) => {
          const region = document.createElement("div");

          region.innerHTML =
            '<div class="card" data-probe="plain">Plain</div>' +
            '<div class="card glass-liquid" data-probe="one">Liquid</div>' +
            '<div class="glass-liquid"><div class="glass"><div class="card" data-probe="nested">Nested</div></div></div>';
          root.append(region);

          const layer = (probe: string) =>
            getComputedStyle(region.querySelector(`[data-probe="${probe}"]`)!, "::before").content;
          const hostBackdrop = (probe: string) => {
            const styles = getComputedStyle(region.querySelector(`[data-probe="${probe}"]`)!);

            return styles.backdropFilter && styles.backdropFilter !== "none"
              ? styles.backdropFilter
              : styles.getPropertyValue("-webkit-backdrop-filter");
          };
          const result = {
            plain: layer("plain"),
            one: layer("one"),
            nested: layer("nested"),
            nestedBackdrop: hostBackdrop("nested"),
          };

          region.remove();

          return result;
        });

        expect(read.plain, "a plain glass card takes no layer").toBe("none");
        expect(read.one, "liquid on one card").toBe('""');
        expect(read.nested, "plain glass nested in liquid takes no layer").toBe("none");
        expect(read.nestedBackdrop, "and keeps its own blur").toContain("blur(14px)");
      });

      test("drops the blur and the lens under reduced transparency", async ({ page, browserName }) => {
        if (browserName === "chromium") {
          const session = await page.context().newCDPSession(page);

          await session.send("Emulation.setEmulatedMedia", {
            features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
          });
        }

        await page.goto(withAesthetic(SURFACES_URL, LIQUID));

        /* Only Chromium can be told the preference here; the other two report
           none and have nothing to assert. */
        test.skip(
          !(await page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches)),
          "engine cannot emulate reduced transparency",
        );

        const layers = await readLayers(page, '[data-testid="card-default-none"]');
        const ground = await page
          .getByTestId("card-default-none")
          .evaluate((element) => getComputedStyle(element).backgroundColor);

        expect(layers.beforeBackdrop, "no blur").toMatch(/^(none)?$/);
        expect(layers.afterBackdrop, "no lens").toBe("none");
        expect(readSrgb(ground).alpha, "an opaque ground").toBe(1);
      });

      test("paints the liquid pane on a solo element and leaves its own placement alone", async ({ page }) => {
        await page.goto(SURFACES_URL);

        const read = await page.getByTestId("preview-root").evaluate((root) => {
          const loose = document.createElement("div");
          const fixed = document.createElement("div");

          loose.className = "glass-solo glass-liquid";
          fixed.className = "glass-solo glass-liquid";
          fixed.style.position = "fixed";
          root.append(loose, fixed);

          const result = {
            loose: getComputedStyle(loose).position,
            fixed: getComputedStyle(fixed).position,
            before: getComputedStyle(loose, "::before").content,
            after: getComputedStyle(loose, "::after").content,
            host: getComputedStyle(loose).backdropFilter,
          };

          loose.remove();
          fixed.remove();

          return result;
        });

        expect(read.loose, "an unpositioned element is anchored").toBe("relative");
        expect(read.fixed, "a fixed element stays fixed").toBe("fixed");
        expect(read.before).toBe('""');
        expect(read.after).toBe('""');
        expect(read.host, "the element's own blur moves to the layer").toMatch(/^(none)?$/);
      });
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

    /* The unit is read with a fallback rather than declared, which is what lets an
       ancestor set it. Declared on the class it would outrank every ancestor --
       including `:root`, where an application normally themes something -- and the
       first version of it did exactly that. The corner is the whole look measured
       in units, so if the knob reaches anything it reaches this. */
    test("scales its whole grid from a knob an ancestor can reach", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "pixel"));

      const measured = await page.evaluate(() => {
        const build = (where: "ancestor" | "self") => {
          const ancestor = document.createElement("div");
          const host = document.createElement("div");
          const card = document.createElement("div");

          host.className = "pixel";
          card.className = "card";
          (where === "ancestor" ? ancestor : host).style.setProperty("--pixel-unit", "6px");
          host.append(card);
          ancestor.append(host);
          document.querySelector('[data-testid="preview-root"]')!.append(ancestor);

          const { clipPath, boxShadow } = getComputedStyle(card);

          ancestor.remove();
          return { clipPath, boxShadow };
        };

        return { ancestor: build("ancestor"), self: build("self") };
      });

      expect(measured.ancestor.clipPath, "an ancestor's knob cuts the corner").toContain(
        "polygon(0px 6px, 6px 6px, 6px 0px",
      );
      expect(measured.self.clipPath, "so does one on the element itself").toContain(
        "polygon(0px 6px, 6px 6px, 6px 0px",
      );
      /* One knob, and the ring follows it too -- the cut and what covers it are the
         same unit by construction, which is the reason there is only one. */
      expect(measured.ancestor.boxShadow, "and the ring it covers with").toContain("6px");
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
         a fill would fade it out: P3 fades the line by the fill amount, so a
         `.solid` ring is transparent by design and shows the plate under it.
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
        "--ui-active-translate-y",
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
      expect(button["--ui-active-translate-y"].trim(), "the element travels the bar's depth").toBe("4px");
      /* The tile holds still under the pointer, and says so rather than leaving
         the token undeclared: undeclared, a region nested inside an aesthetic
         that moves on hover would inherit the move. */
      expect(button["--ui-hover-transform"].trim(), "no hover transform").toBe("none");
    });

    /* `box-active` reaches `.card.interactive`, not only `.btn`. Under a
       hover-holds-still aesthetic the press is the one gesture an interactive
       tile has, and before the utility was applied the card sat inert on
       mousedown. A held pointer is what drives `:active`, which no keyboard
       move can. */
    test("presses an interactive card into its bar", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "chunky-tile"));

      const card = page.getByTestId("card-default-none-interactive");

      await card.hover();
      await page.mouse.down();

      try {
        /* Both properties are transitioned, so these poll for the settled value. */
        await expect
          .poll(() => card.evaluate((node) => getComputedStyle(node).translate), "the tile travels the bar's depth")
          .toBe("0px 4px");
        await expect
          .poll(() => card.evaluate((node) => getComputedStyle(node).boxShadow), "the bar collapses under it")
          .toMatch(/\b0px 0px 0px 0px\b/);
      } finally {
        await page.mouse.up();
      }
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

    /* Through the `--ui-label-weight`/`--ui-label-tracking` pair `.btn`
       reads, so it reaches a bare `<button>` wherever the package styles one --
       the native entry, which maps the element onto `btn` -- and nowhere it does
       not. `layers.spec.ts` covers a consumer's utility beating it. */
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

  test.describe("cyber", () => {
    type Probe = { className: string; pseudo?: string; tag?: string; type?: string };

    /* Every corner site, built fresh under the preview root so one list covers
       the box components and the sites that set a radius without `box`. Grouped
       by the corner each is meant to take. */
    const CONTROLS: readonly Probe[] = [
      { className: "btn" },
      { className: "btn icon" },
      { className: "ipt", tag: "input" },
      { className: "skeleton" },
    ];
    const SURFACES: readonly Probe[] = [{ className: "card" }, { className: "panel" }, { className: "alert" }];
    /* Fully round by default, whether through the pill corner (badge, switch,
       progress, tooltip icon) or through a full radius of their own (radio,
       `.btn.pill`). */
    const PILLS: readonly Probe[] = [
      { className: "badge" },
      { className: "tooltip-icon" },
      { className: "progress" },
      { className: "progress", pseudo: "::after" },
      { className: "switch", tag: "input", type: "checkbox" },
      { className: "switch", pseudo: "::after", tag: "input", type: "checkbox" },
      { className: "radio", tag: "input", type: "radio" },
      { className: "radio", pseudo: "::after", tag: "input", type: "radio" },
      { className: "btn pill" },
      { className: "btn icon pill" },
    ];
    const CHIPS: readonly Probe[] = [
      { className: "checkbox", tag: "input", type: "checkbox" },
      { className: "kbd", tag: "kbd" },
      { className: "code", tag: "code" },
    ];

    const readCorners = (page: Page, entries: readonly Probe[], ancestorStyle = "", wrapperClass = "") =>
      page.evaluate(
        ([list, style, wrapper]) => {
          const host = document.createElement("div");

          host.setAttribute("style", style);
          host.className = wrapper;
          document.querySelector('[data-testid="preview-root"]')!.append(host);

          const measured = list.map(({ className, pseudo, tag, type }) => {
            const element = document.createElement(tag ?? "div");

            element.className = className;
            if (type) {
              element.setAttribute("type", type);
            }
            host.append(element);

            const styles = getComputedStyle(element, pseudo ?? null);

            return {
              bottomRight: styles.borderBottomRightRadius,
              name: `${className}${pseudo ?? ""}`,
              shape: styles.getPropertyValue("corner-shape"),
              topLeft: styles.borderTopLeftRadius,
              topRight: styles.borderTopRightRadius,
            };
          });

          host.remove();
          return measured;
        },
        [entries, ancestorStyle, wrapperClass] as const,
      );

    const isFull = (radius: string) => Number.parseFloat(radius) > 1000;

    /* Only Chromium draws `corner-shape` today, so the engine split is the
       contract rather than a skip. Where the bevel is drawn: controls cut top-left
       and bottom-right, surfaces the opposite diagonal, anything fully round
       cuts to points, and chips square -- which is what tells the checkbox from
       the diamond radio. Where it is not: cut corners square, and what is fully
       round stays round, because a square radio is a checkbox. */
    test("cuts controls and surfaces on opposite diagonals, points the pills, and squares the chips", async ({
      page,
      browserName,
    }) => {
      await page.goto(withAesthetic(SURFACES_URL, "cyber"));

      const bevels = browserName === "chromium";
      const controls = await readCorners(page, CONTROLS, "", "cyber");
      const surfaces = await readCorners(page, SURFACES, "", "cyber");
      const pills = await readCorners(page, PILLS, "", "cyber");
      const chips = await readCorners(page, CHIPS, "", "cyber");

      for (const corner of controls) {
        expect(corner.topLeft, `${corner.name} top-left`).toBe(bevels ? "10px" : "0px");
        expect(corner.topRight, `${corner.name} top-right`).toBe("0px");
        if (bevels) {
          expect(corner.shape, `${corner.name} shape`).toBe("bevel");
        }
      }
      for (const corner of surfaces) {
        expect(corner.topLeft, `${corner.name} top-left`).toBe("0px");
        expect(corner.topRight, `${corner.name} top-right`).toBe(bevels ? "10px" : "0px");
        if (bevels) {
          expect(corner.shape, `${corner.name} shape`).toBe("bevel");
        }
      }
      for (const corner of pills) {
        expect(isFull(corner.topLeft), `${corner.name} is fully round: ${corner.topLeft}`).toBe(true);
        if (bevels) {
          expect(corner.shape, `${corner.name} cuts to points`).toBe("bevel");
        }
      }
      for (const corner of chips) {
        expect(corner.topLeft, `${corner.name} squares`).toBe("0px");
      }
    });

    /* The cut follows the size step, so a small button keeps its corners. This
       hit-tests inside the corner rather than reading the radius, because what
       matters is the drawn shape -- 2px in from the top-left lies outside a full
       10px cut and inside a scaled one, and Chromium's hit testing follows the
       bevel. */
    test("scales the cut down with a small element's step", async ({ page, browserName }) => {
      test.skip(browserName !== "chromium", "Only Chromium draws the bevel the cap is measured on.");
      await page.goto(withAesthetic(BUTTONS_URL, "cyber"));

      const hits = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const probe = (className: string, style = "") => {
          const button = document.createElement("button");

          button.className = className;
          /* Pinned mid-viewport and on top, so the sticky playground header
             cannot be what the hit test finds. */
          button.setAttribute("style", `position: fixed; top: 50vh; left: 50vw; z-index: 2147483647; ${style}`);
          button.textContent = "+";
          host.append(button);

          const box = button.getBoundingClientRect();
          const hit = document.elementFromPoint(box.left + 2, box.top + 2) === button;

          button.remove();
          return hit;
        };

        return {
          full: probe("btn"),
          small: probe("btn icon p-xs"),
          unscaled: probe("btn icon p-xs", "--ui-radius: 10px 0"),
        };
      });

      expect(hits.full, "a full-size button takes the full cut").toBe(false);
      expect(hits.small, "a small button takes a smaller cut").toBe(true);
      expect(hits.unscaled, "the same button with the full cut").toBe(false);
    });

    /* The glow is light, not depth, so it is the halo: elevation does not scale
       it, every component takes it -- fields and chips too -- and `.flat` does
       not put it out. */
    test("glows every component in its own intent, flat or not", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "cyber"));

      const button = await readStyles(page, "btn-default-success", ["box-shadow"]);
      const success = await resolveToken(page, "--color-success");

      await page.goto(withAesthetic(SURFACES_URL, "cyber"));

      const card = await readStyles(page, "card-default-none", ["box-shadow"]);

      await page.goto(withAesthetic(FEEDBACK_URL, "cyber"));

      const badge = await readStyles(page, "badge-default-none", ["box-shadow"]);
      const flat = await page.evaluate(() => {
        const badgeElement = document.createElement("span");

        badgeElement.className = "badge flat";
        document.querySelector('[data-testid="preview-root"]')!.append(badgeElement);

        const shadow = getComputedStyle(badgeElement).boxShadow;

        badgeElement.remove();
        return shadow;
      });

      await page.goto(withAesthetic(FORMS_URL, "cyber"));

      const field = await readStyles(page, "ipt-default-none", ["box-shadow"]);

      /* Offsetless and blurred: the glow sits evenly around the silhouette. */
      const glows = /\b0px 0px 8px 0px\b/;

      expect(button["box-shadow"], "button glows").toMatch(glows);
      expect(card["box-shadow"], "card glows").toMatch(glows);
      expect(badge["box-shadow"], "badge glows").toMatch(glows);
      expect(flat, "a flat badge still glows").toMatch(glows);
      expect(field["box-shadow"], "field glows").toMatch(glows);

      /* The glow is the intent colour itself, thinned: 40% of the intent over
         nothing is 40% alpha rather than a darker shade. */
      const halo = button["box-shadow"]!.split(/,(?![^(]*\))/).find((layer) => glows.test(layer))!;
      const glow = readSrgb(readShadowColor(halo));
      const intent = readSrgb(success);

      expect(glow.alpha, "glow alpha").toBeCloseTo(0.4, 2);
      expect(
        channelDistance([glow.red, glow.green, glow.blue], [intent.red, intent.green, intent.blue]),
        "glow hue",
      ).toBeLessThan(2);
    });

    test("takes its cut, shapes, glow, and ink from knobs an ancestor can reach", async ({ page, browserName }) => {
      await page.goto(withAesthetic(SURFACES_URL, "cyber"));

      const bevels = browserName === "chromium";
      /* The cut sizes the default pair without restating it. */
      const [scaledButton, scaledCard] = await readCorners(
        page,
        [{ className: "btn" }, { className: "card" }],
        "--cyber-cut: 4px",
        "cyber",
      );
      /* A shape knob takes any radius value: here a single notch on each. */
      const [shapedButton, shapedCard] = await readCorners(
        page,
        [{ className: "btn" }, { className: "card" }],
        "--cyber-shape: 0 6px 0 0; --cyber-shape-surface: 0 0 20px 0",
        "cyber",
      );

      expect(scaledButton!.topLeft, "cut reaches controls").toBe(bevels ? "4px" : "0px");
      expect(scaledCard!.topRight, "cut reaches surfaces").toBe(bevels ? "4px" : "0px");
      expect(shapedButton!.topRight, "control shape").toBe(bevels ? "6px" : "0px");
      expect(shapedButton!.topLeft, "control shape leaves the rest square").toBe("0px");
      expect(shapedCard!.bottomRight, "surface shape").toBe(bevels ? "20px" : "0px");

      const measured = await page.evaluate(() => {
        const ancestor = document.createElement("div");
        const host = document.createElement("div");
        const card = document.createElement("div");

        ancestor.style.setProperty("--cyber-glow", "20px");
        ancestor.style.setProperty("--cyber-ink", "rgb(0 255 255)");
        host.className = "cyber";
        card.className = "card";
        host.append(card);
        ancestor.append(host);
        document.querySelector('[data-testid="preview-root"]')!.append(ancestor);

        const styles = getComputedStyle(card);
        const result = { border: styles.borderTopColor, shadow: styles.boxShadow };

        ancestor.remove();
        return result;
      });

      expect(measured.shadow, "glow").toMatch(/\b0px 0px 20px 0px\b/);
      /* A card with no intent draws its line in the neutral ink, so the ink knob
         is what colours it. */
      expectSameColor(measured.border, "rgb(0, 255, 255)", "ink");
    });

    /* Every shipped aesthetic declares its corner shape and clears the pill and
       chip corners, because an aesthetic nested inside another negotiates each
       token separately and one it leaves undeclared is inherited -- a glass badge
       inside a cyber region would otherwise come out a pointed hexagon, and a
       glass checkbox square. */
    test("keeps its corners out of an aesthetic nested inside it", async ({ page, browserName }) => {
      await page.goto(withAesthetic(SURFACES_URL, "cyber"));

      const [card, badge, checkbox] = await readCorners(
        page,
        [{ className: "card" }, { className: "badge" }, { className: "checkbox", tag: "input", type: "checkbox" }],
        "",
        "glass",
      );

      expect(card!.topLeft, "glass card corner").toBe("16px");
      expect(badge!.topLeft, "glass badge corner").toBe("12px");
      expect(checkbox!.topLeft, "glass checkbox corner").toBe("4px");
      if (browserName === "chromium") {
        for (const aesthetic of ["glass", "neobrutalism", "pixel", "chunky-tile"]) {
          // oxlint-disable-next-line no-await-in-loop -- four regions, measured in turn on one page.
          const [nested] = await readCorners(page, [{ className: "card" }], "", aesthetic);

          expect(nested!.shape, aesthetic).toBe("round");
        }
      }
    });

    test("presses with the base scale, and not at all under reduced motion", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "cyber"));

      const resting = await readStyles(page, "btn-default-none", ["--ui-active-transform", "--ui-hover-transform"]);

      await page.emulateMedia({ reducedMotion: "reduce" });

      const reduced = await readStyles(page, "btn-default-none", ["--ui-active-transform"]);

      expect(resting["--ui-active-transform"].trim(), "press").toBe("scale(.97)");
      expect(resting["--ui-hover-transform"].trim(), "hover holds still").toBe("none");
      expect(reduced["--ui-active-transform"].trim(), "reduced motion").toBe("none");
    });
  });

  test.describe("sketch", () => {
    test("scales pressed buttons and opts out under reduced motion", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "sketch"));

      const resting = await readStyles(page, "btn-default-none", ["--ui-active-transform"]);

      await page.emulateMedia({ reducedMotion: "reduce" });

      const reduced = await readStyles(page, "btn-default-none", ["--ui-active-transform"]);

      expect(resting["--ui-active-transform"].trim()).toBe("scale(.97)");
      expect(reduced["--ui-active-transform"].trim()).toBe("none");
    });

    test("gives pill buttons an organic hand-drawn pill contour", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "sketch"));

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<button class="btn">Ordinary</button><button class="btn pill">Pill</button><button class="btn pill" style="--ui-radius-pill: 9px">Custom</button>';
        host.append(row);
        const values = Array.from(row.children, (element) => getComputedStyle(element).borderRadius);

        row.remove();
        return values;
      });

      expect(radii[1]).toBe("17px 23px 16px 24px / 21px 16px 20px 17px");
      expect(radii[0]).not.toBe(radii[1]);
      expect(radii[2]).toBe("9px");
    });

    test("keeps the radio round and slightly uneven", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "sketch"));

      const radio = await readStyles(page, "radio-default-none", ["border-radius"]);

      expect(radio["border-radius"]).toContain("% / ");
    });

    test("gives the switch track and knob matching box outlines", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "sketch"));

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<input type="checkbox" class="switch"><input type="checkbox" class="switch" style="--ui-radius-pill: 8px">';
        host.append(row);
        const values = Array.from(row.children, (element) => ({
          track: getComputedStyle(element).borderRadius,
          knob: getComputedStyle(element, "::after").borderRadius,
        }));

        row.remove();
        return values;
      });

      expect(radii[0]).toEqual({
        track: "11px 1px 7px 2px / 2px 7px 1px 11px",
        knob: "11px 1px 7px 2px / 2px 7px 1px 11px",
      });
      expect(radii[1]).toEqual({ track: "8px", knob: "8px" });
    });

    test("gives checkbox, code, and key caps rotating small sketch outlines", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "sketch"));

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<input type="checkbox" class="checkbox"><code class="code">code</code><kbd class="kbd">K</kbd>';
        host.append(row);
        const values = Array.from(row.children, (element) => getComputedStyle(element).borderRadius);

        row.remove();
        return values;
      });

      expect(new Set(radii).size).toBe(3);
      expect(radii[0]).toBe("11px 1px 7px 2px / 2px 7px 1px 11px");
      expect(radii[1]).toBe("2px 8px 1px 10px / 8px 2px 10px 1px");
      expect(radii[2]).toBe("8px 2px 10px 1px / 1px 9px 2px 8px");
    });

    test("eliminates pill eggs from badges and progress bars in favor of chip outlines", async ({ page }) => {
      await page.goto(withAesthetic(FEEDBACK_URL, "sketch"));

      const measured = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<span class="badge">Badge with a long text</span>' +
          '<div class="progress" style="--progress-value: 50%"></div>';
        host.append(row);
        const badge = getComputedStyle(row.children[0]!).borderRadius;
        const progress = getComputedStyle(row.children[1]!).borderRadius;
        const fill = getComputedStyle(row.children[1]!, "::after").borderRadius;

        row.remove();
        return { badge, fill, progress };
      });

      expect(measured.badge).not.toContain("% / ");
      expect(measured.badge).toBe("11px 1px 7px 2px / 2px 7px 1px 11px");
      expect(measured.progress).not.toContain("% / ");
      expect(measured.progress).toBe("2px 8px 1px 10px / 8px 2px 10px 1px");
      expect(measured.fill).toBe(measured.progress);
    });

    test("varies outlines across sequential form fields", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "sketch"));

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const form = document.createElement("div");

        form.innerHTML =
          '<div class="field"><label class="label">One</label><input class="ipt"></div>' +
          '<div class="field"><label class="label">Two</label><input class="ipt"></div>' +
          '<div class="field"><label class="label">Three</label><input class="ipt"></div>';
        host.append(form);
        const values = Array.from(
          form.querySelectorAll<HTMLInputElement>(".ipt"),
          (input) => getComputedStyle(input).borderRadius,
        );

        form.remove();
        return values;
      });

      expect(new Set(radii).size).toBe(3);
      expect(radii[0]).toBe("255px 15px 225px / 15px 225px 15px 255px");
      expect(radii[1]).toBe("18px 240px 15px 255px / 240px 15px 255px 18px");
      expect(radii[2]).toBe("245px 220px 15px 18px / 18px 15px 245px 235px");
    });

    test("allows complete chip radii outside sketch instead of capping them", async ({ page }) => {
      await page.goto(FORMS_URL);

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<input type="checkbox" class="checkbox" style="--ui-radius-tight: 12px 2px / 2px 12px"><code class="code" style="--ui-radius-tight: 12px 2px / 2px 12px">code</code><kbd class="kbd" style="--ui-radius-tight: 12px 2px / 2px 12px">K</kbd>';
        host.append(row);
        const values = Array.from(row.children, (element) => getComputedStyle(element).borderRadius);

        row.remove();
        return values;
      });

      expect(radii).toEqual(Array(3).fill("12px 2px / 2px 12px"));
    });

    test("uses solid ink on boxes and the solo class", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "sketch"));

      const card = await readStyles(page, "card-default-none", ["border-top-style"]);
      const solo = await page.evaluate(() => {
        const node = document.createElement("div");

        node.className = "sketch-solo";
        document.body.append(node);
        const style = getComputedStyle(node).borderTopStyle;

        node.remove();
        return style;
      });

      expect(card["border-top-style"]).toBe("solid");
      expect(solo).toBe("solid");
    });

    test("dashes checkboxes and rules without changing other controls", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "sketch"));

      const checkbox = await readStyles(page, "checkbox-default-none", ["border-top-style"]);
      const radio = await readStyles(page, "radio-default-none", ["border-top-style"]);

      await page.goto(withAesthetic(SURFACES_URL, "sketch"));

      const rules = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const divider = document.createElement("hr");

        divider.className = "divider";
        host.append(divider);
        const style = getComputedStyle(divider).borderTopStyle;

        divider.remove();
        return style;
      });

      expect(checkbox["border-top-style"]).toBe("dashed");
      expect(radio["border-top-style"]).toBe("solid");
      expect(rules).toBe("dashed");
    });

    test("keeps table rules dashed and allows a per-element line override", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "sketch"));

      const styles = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<hr class="divider vertical"><table class="data-table"><thead><tr><th>Head</th></tr></thead></table><button class="btn ghost edged" style="--ui-line-style: dashed">Note</button>';
        host.append(row);
        const divider = getComputedStyle(row.children[0]!).borderInlineStartStyle;
        const table = getComputedStyle(row.querySelector("th")!).borderBottomStyle;
        const button = getComputedStyle(row.children[2]!).borderTopStyle;

        row.remove();
        return { divider, table, button };
      });

      expect(styles).toEqual({ divider: "dashed", table: "dashed", button: "dashed" });
    });

    test("restores solid accents in forced colors", async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await page.goto(withAesthetic(FORMS_URL, "sketch"));

      const checkbox = await readStyles(page, "checkbox-default-none", ["border-top-style"]);
      const divider = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const rule = document.createElement("hr");

        rule.className = "divider";
        host.append(rule);
        const style = getComputedStyle(rule).borderTopStyle;

        rule.remove();
        return style;
      });

      expect(checkbox["border-top-style"]).toBe("solid");
      expect(divider).toBe("solid");
    });

    test("varies sibling outlines while keeping explicit radius overrides", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "sketch"));

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<button class="btn">One</button><button class="btn">Two</button><button class="btn">Three</button><button class="btn" style="--ui-radius: 8px">Four</button>';
        host.append(row);

        const values = Array.from(row.children, (element) => getComputedStyle(element).borderRadius);

        row.remove();
        return values;
      });

      expect(new Set(radii.slice(0, 3)).size).toBe(3);
      expect(radii[3]).toBe("8px");
    });

    test("varies siblings with sketch applied directly to each button", async ({ page }) => {
      await page.goto(BUTTONS_URL);

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<button class="btn sketch">One</button><button class="btn sketch">Two</button><button class="btn sketch">Three</button>';
        host.append(row);
        const values = Array.from(row.children, (element) => getComputedStyle(element).borderRadius);

        row.remove();
        return values;
      });

      expect(new Set(radii).size).toBe(3);
    });

    test("rotates a sketch region nested inside another aesthetic, and skips one nested inside it", async ({
      page,
    }) => {
      await page.goto(BUTTONS_URL);

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const outer = document.createElement("div");
        const buttons =
          '<button class="btn">One</button><button class="btn">Two</button><button class="btn">Three</button>';

        outer.innerHTML = `<div class="glass"><div class="sketch">${buttons}</div></div><div class="sketch"><div class="glass">${buttons}</div></div>`;
        host.append(outer);
        const read = (selector: string) =>
          Array.from(outer.querySelectorAll(selector), (element) => getComputedStyle(element).borderRadius);
        const values = { inside: read(".glass > .sketch > .btn"), around: read(".sketch > .glass > .btn") };

        outer.remove();
        return values;
      });

      expect(new Set(radii.inside).size, "sketch inside glass still rotates").toBe(3);
      expect(new Set(radii.around).size, "glass inside sketch keeps one corner").toBe(1);
    });

    test("draws sharp uneven corners on surfaces, solid ink, and a small offset shadow", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "sketch"));

      const card = await readStyles(page, "card-default-none", [
        "border-radius",
        "border-top-style",
        "box-shadow",
        "font-family",
      ]);

      expect(card["border-radius"], "sharp uneven surface corner").toBe("80px 4px 75px 5px / 3px 70px 4px 80px");
      expect(card["border-top-style"], "ink line").toBe("solid");
      expect(card["box-shadow"], "small offset shadow").toMatch(/\b2px 2px 0px 0px\b/);
      expect(card["font-family"], "handwriting fallback").toContain("cursive");
    });

    test("varies sibling surface outlines while keeping explicit radius overrides", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "sketch"));

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<div class="card">One</div><div class="card">Two</div><div class="card">Three</div><div class="card" style="--ui-radius-surface: 8px">Four</div>';
        host.append(row);

        const values = Array.from(row.children, (element) => getComputedStyle(element).borderRadius);

        row.remove();
        return values;
      });

      expect(new Set(radii.slice(0, 3)).size).toBe(3);
      expect(radii[3]).toBe("8px");
    });

    test("allows customizing control and surface outlines via --sketch-radius and --sketch-radius-surface knobs", async ({
      page,
    }) => {
      await page.goto(withAesthetic(SURFACES_URL, "sketch"));

      const measured = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const section = document.createElement("section");
        section.className = "sketch";
        section.style.setProperty("--sketch-radius", "4px");
        section.style.setProperty("--sketch-radius-surface", "16px");

        section.innerHTML = '<div class="card"><button class="btn">Action</button></div>';
        host.append(section);

        const card = getComputedStyle(section.querySelector(".card")!).borderRadius;
        const btn = getComputedStyle(section.querySelector(".btn")!).borderRadius;

        section.remove();
        return { card, btn };
      });

      expect(measured.card).toBe("16px");
      expect(measured.btn).toBe("4px");
    });

    test("keeps sketch chips irregular and clears material from nested aesthetics", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "sketch"));

      const checkbox = await readStyles(page, "checkbox-default-none", ["--ui-radius-tight", "border-radius"]);

      expect(checkbox["--ui-radius-tight"].trim(), "complete chip radius").toBe("11px 1px 7px 2px / 2px 7px 1px 11px");
      expect(checkbox["border-radius"], "sketch checkbox silhouette").toBe("11px 1px 7px 2px / 2px 7px 1px 11px");

      const nested = await page.evaluate(() => {
        const build = (ancestor = "") => {
          const outer = document.createElement("div");
          const inner = document.createElement("div");
          const card = document.createElement("div");

          outer.className = ancestor;
          inner.className = "sketch";
          card.className = "card";
          inner.append(card);
          outer.append(inner);
          document.body.append(outer);

          const styles = getComputedStyle(card);
          const result = {
            backgroundColor: styles.backgroundColor,
            boxShadow: styles.boxShadow,
            clipPath: styles.clipPath,
            radius: styles.borderRadius,
          };

          outer.remove();
          return result;
        };

        return { cyber: build("cyber"), glass: build("glass"), pixel: build("pixel"), plain: build() };
      });

      expect(nested.pixel.clipPath, "pixel clip cleared").toBe("none");
      for (const [name, styles] of Object.entries(nested)) {
        expect(styles.radius, `${name} sketch radius`).toBe("80px 4px 75px 5px / 3px 70px 4px 80px");
        expect(styles.backgroundColor, `${name} sketch ground`).toBe(nested.plain.backgroundColor);
        expect(styles.boxShadow, `${name} sketch shadow`).toBe(nested.plain.boxShadow);
      }
    });

    test("draws subtle rounded hand-drawn contours on controls and surfaces under sketch-rounded", async ({ page }) => {
      await page.goto(withAesthetic(BUTTONS_URL, "sketch"));

      const measured = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const section = document.createElement("section");
        section.className = "sketch-rounded";
        section.innerHTML =
          '<div class="card"><button class="btn">Action 1</button><button class="btn">Action 2</button></div>';
        host.append(section);

        const card = getComputedStyle(section.querySelector(".card")!).borderRadius;
        const btn1 = getComputedStyle(section.querySelectorAll(".btn")[0]!).borderRadius;
        const btn2 = getComputedStyle(section.querySelectorAll(".btn")[1]!).borderRadius;

        section.remove();
        return { card, btn1, btn2 };
      });

      expect(measured.card, "rounded card surface").toBe("38px 16px 36px 17px / 16px 34px 17px 32px");
      expect(measured.btn1, "rounded btn 1").toBe("26px 10px 24px 11px / 12px 23px 11px 20px");
      expect(measured.btn2, "rounded btn 2 sibling variation").toBe("11px 25px 12px 24px / 23px 11px 22px 12px");
    });

    test("rotates subtle rounded chip outlines under sketch-rounded", async ({ page }) => {
      await page.goto(withAesthetic(FORMS_URL, "sketch"));

      const radii = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const section = document.createElement("section");
        section.className = "sketch-rounded";
        section.innerHTML =
          '<input type="checkbox" class="checkbox"><code class="code">code</code><kbd class="kbd">K</kbd>';
        host.append(section);

        const values = Array.from(section.children, (element) => getComputedStyle(element).borderRadius);

        section.remove();
        return values;
      });

      expect(radii[0]).toBe("9px 3px 8px 4px / 4px 8px 3px 7px");
      expect(radii[1]).toBe("4px 8px 3px 9px / 8px 3px 8px 4px");
      expect(radii[2]).toBe("8px 4px 9px 3px / 3px 9px 4px 8px");
    });

    test("allows customizing rounded sketch contours via knobs", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "sketch"));

      const measured = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const section = document.createElement("section");
        section.className = "sketch-rounded";
        section.style.setProperty("--sketch-radius-rounded", "12px");
        section.style.setProperty("--sketch-radius-surface-rounded", "20px");

        section.innerHTML = '<div class="card"><button class="btn">Action</button></div>';
        host.append(section);

        const card = getComputedStyle(section.querySelector(".card")!).borderRadius;
        const btn = getComputedStyle(section.querySelector(".btn")!).borderRadius;

        section.remove();
        return { card, btn };
      });

      expect(measured.card).toBe("20px");
      expect(measured.btn).toBe("12px");
    });

    test("allows applying sketch-rounded directly to individual components", async ({ page }) => {
      await page.goto(withAesthetic(SURFACES_URL, "sketch"));

      const measured = await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]')!;
        const row = document.createElement("div");

        row.innerHTML =
          '<div class="card">Sharp</div><div class="card sketch-rounded">Rounded</div><button class="btn">Sharp Btn</button><button class="btn sketch-rounded">Rounded Btn</button>';
        host.append(row);

        const sharpCard = getComputedStyle(row.children[0]!).borderRadius;
        const roundedCard = getComputedStyle(row.children[1]!).borderRadius;
        const sharpBtn = getComputedStyle(row.children[2]!).borderRadius;
        const roundedBtn = getComputedStyle(row.children[3]!).borderRadius;

        row.remove();
        return { sharpCard, roundedCard, sharpBtn, roundedBtn };
      });

      expect(measured.sharpCard).toBe("80px 4px 75px 5px / 3px 70px 4px 80px");
      expect(measured.roundedCard).toBe("17px 36px 18px 34px / 33px 16px 32px 17px");
      expect(measured.sharpBtn).toBe("245px 220px 15px 18px / 18px 15px 245px 235px");
      expect(measured.roundedBtn).toBe("12px 24px 10px 25px / 22px 12px 23px 11px");
    });
  });
});

/* A control's boundary is not a pane's edge. Glass's white hairline and chunky
   tile's tile grey stay on surfaces, and a control inside either takes the
   aesthetic's `--ui-control-ink` instead. The ink aesthetics name the theme's
   control border there: their ink is the primary colour in both themes, and a
   resting toggle drawn in it read as loudly as a primary one. A region nested
   inside glass or chunky tile draws its controls in its own control ink.
   Read as the control's own `--intent-border`, the ink its line is drawn from:
   the painted line then walks toward the fill by P3, which is not this test's
   question. */
test.describe("control ink", () => {
  const CASES = [
    { aesthetic: "glass", controlInk: "light-dark(rgb(0 0 0 / 0.55), rgb(255 255 255 / 0.55))" },
    { aesthetic: "chunky-tile", controlInk: "light-dark(var(--color-neutral-600), var(--color-neutral-400))" },
    { aesthetic: "neobrutalism", controlInk: "var(--color-control-border)" },
    { aesthetic: "pixel", controlInk: "var(--color-control-border)" },
    { aesthetic: "cyber", controlInk: "var(--color-control-border)" },
    { aesthetic: "sketch", controlInk: "var(--color-control-border)" },
  ] as const;

  for (const { aesthetic, controlInk } of CASES) {
    test(`${aesthetic} draws controls in its control ink and surfaces in its own`, async ({ page }) => {
      await page.goto(FORMS_URL);

      const read = await page.evaluate(
        ({ name, ink }) => {
          const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
          const region = document.createElement("div");

          region.className = name;
          region.innerHTML =
            '<div class="card"><input type="checkbox" class="checkbox" data-probe="control"></div>' +
            '<div class="neobrutalism"><input type="checkbox" class="checkbox" data-probe="nested"></div>';
          host.append(region);

          const resolve = (value: string, within: Element) => {
            const probe = document.createElement("span");

            probe.style.color = value;
            within.append(probe);

            const color = getComputedStyle(probe).color;

            probe.remove();

            return color;
          };
          const nested = region.querySelector(".neobrutalism")!;
          /* A custom property computes to its token string, so the ink is read
             back through a colour property the control does not otherwise use. */
          const inkOf = (element: HTMLElement) => {
            element.style.outlineColor = "var(--intent-border)";

            const color = getComputedStyle(element).outlineColor;

            element.style.removeProperty("outline-color");

            return color;
          };
          const result = {
            card: getComputedStyle(region.querySelector(".card")!).borderTopColor,
            control: inkOf(region.querySelector<HTMLElement>('[data-probe="control"]')!),
            expectedControl: resolve(ink, region),
            nested: inkOf(region.querySelector<HTMLElement>('[data-probe="nested"]')!),
            nestedInk: resolve("var(--color-control-border)", nested),
            surfaceInk: resolve("var(--ui-ink)", region),
          };

          region.remove();

          return result;
        },
        { ink: controlInk, name: aesthetic },
      );

      expectSameColor(read.control, read.expectedControl, `${aesthetic} checkbox ink`);
      expect(
        getColorDistance(read.control, read.surfaceInk),
        `${aesthetic} checkbox is not the surface ink`,
      ).toBeGreaterThan(2);
      expect(isTransparent(read.card), `${aesthetic} card keeps a line`).toBe(false);
      expectSameColor(read.nested, read.nestedInk, `neobrutalism nested in ${aesthetic} checkbox ink`);
    });
  }
});

/* An aesthetic nested inside another is the aesthetic, not a blend of the two.
   Material inherits, so every token one aesthetic sets is one a region nested
   inside it inherits unless that region names or clears it --
   `registry.test.ts` holds the declarations, and this holds the painted result:
   a focused button and a resting card inside every other aesthetic compute
   exactly what they compute on their own. Pixel's inset focus ring once
   reached every region nested inside it, and a glass card inside chunky tile
   cast chunky tile's opaque black depth. */
test.describe("nested aesthetics", () => {
  /* Liquid glass is a modifier, not an aesthetic, but it writes layers onto
     surfaces, and a region nested inside it must not take them. */
  const AESTHETICS = [
    "neobrutalism",
    "glass",
    "glass glass-liquid",
    "pixel",
    "chunky-tile",
    "cyber",
    "sketch",
  ] as const;

  test("paints a nested region exactly as it paints alone", async ({ page }) => {
    await page.goto(BUTTONS_URL);

    const cases = AESTHETICS.flatMap((inner) => [
      { inner, outer: "" },
      ...AESTHETICS.filter((outer) => outer !== inner).map((outer) => ({ inner, outer })),
    ]);

    await page.evaluate((all) => {
      const host = document.querySelector('[data-testid="preview-root"]')!;
      const previous = document.createElement("button");

      previous.id = "nested-probe-previous";
      host.append(previous);

      for (const [index, { inner, outer }] of all.entries()) {
        const region = document.createElement("div");

        region.className = inner;
        region.innerHTML =
          `<button class="btn primary" data-nested-probe="${index}" style="transition:none">Probe</button>` +
          `<div class="card" data-nested-card="${index}" style="transition:none">Card</div>`;

        if (outer) {
          const wrapper = document.createElement("div");

          wrapper.className = outer;
          wrapper.append(region);
          host.append(wrapper);
        } else {
          host.append(region);
        }
      }

      previous.focus();
    }, cases);

    /* A real keyboard move, for the reason the resting-shadow test gives:
       `:focus-visible` follows each engine's own modality heuristic. */
    const focused: { focusVisible: boolean; shadow: string }[] = [];

    /* oxlint-disable no-await-in-loop -- one focus moves at a time. */
    while (focused.length < cases.length) {
      await page.keyboard.press("Tab");
      focused.push(
        await page.evaluate(() => {
          const active = document.activeElement!;

          return { focusVisible: active.matches(":focus-visible"), shadow: getComputedStyle(active).boxShadow };
        }),
      );
    }

    const cards = await page.evaluate(
      (count) =>
        Array.from({ length: count }, (_, index) => {
          const card = document.querySelector(`[data-nested-card="${index}"]`)!;

          return [getComputedStyle(card).boxShadow, getComputedStyle(card, "::before").content].join(" | ");
        }),
      cases.length,
    );
    const alone = new Map(cases.flatMap((entry, index) => (entry.outer ? [] : [[entry.inner, index] as const])));

    for (const [index, { inner, outer }] of cases.entries()) {
      const reference = alone.get(inner)!;

      expect(focused[index]!.focusVisible, `${inner} in ${outer || "nothing"} is focus-visible`).toBe(true);

      if (!outer) {
        continue;
      }

      expect(focused[index]!.shadow, `${inner} in ${outer}: focused button`).toBe(focused[reference]!.shadow);
      expect(cards[index], `${inner} in ${outer}: card`).toBe(cards[reference]);
    }
  });
});

/* Under pixel the edge is an inset ring and the border is zero, and a knob
   sized from the border alone covered the ring: the track had no visible
   margin, and an unchecked and a checked switch both read as two halves. The
   knob sits inside the ring now, the way it sits inside a real border. */
test("keeps a switch's knob inside an inset-ring edge", async ({ page }) => {
  await page.goto(withAesthetic(FORMS_URL, "pixel"));

  const read = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
    const probe = document.createElement("input");

    probe.type = "checkbox";
    probe.className = "switch";
    host.append(probe);

    const style = getComputedStyle(probe);
    const knob = getComputedStyle(probe, "::after");
    const result = {
      border: Number.parseFloat(style.borderTopWidth),
      shadow: style.boxShadow,
      top: Number.parseFloat(knob.top),
      height: Number.parseFloat(knob.height),
      track: Number.parseFloat(style.height),
    };

    probe.remove();

    return result;
  });

  expect(read.border, "pixel draws no border").toBe(0);
  /* The ring is two pixels deep (the toggle cap); the knob starts past it. */
  expect(read.top, `knob offset inside ${read.shadow}`).toBeGreaterThanOrEqual(3);
  expect(read.top * 2 + read.height, "knob fits the track").toBeCloseTo(read.track, 1);
});
