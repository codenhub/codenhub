import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";
import { expectSameColor, readSrgb } from "./test-utils";

/* A solo class exists for an element this package does not style, on a page
   that may never have loaded the base stylesheet. So unlike the aesthetic
   suite, which reads the shared playground fixtures, these build a blank page
   and load only the built files a consumer in that position would: an aesthetic
   entrypoint, and sometimes the theme. See docs/internal/model.md#solo-classes. */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const built = (file: string) => readFile(path.join(packageRoot, "dist", file), "utf8");

/* The sheets arrive after the first render, so every transitioned property
   animates in from its initial value, and a class toggled later animates too. A
   consumer's page has the sheet before it renders; waiting the transitions out
   reads what that page shows. */
const settle = (page: Page) =>
  page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));

const load = async (page: Page, files: readonly string[], markup: string, extraCss = "") => {
  await page.setContent(`<!doctype html><html><body>${markup}</body></html>`);

  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- source order is the contract, so the sheets load in turn.
    await page.addStyleTag({ content: await built(file) });
  }
  if (extraCss) {
    await page.addStyleTag({ content: extraCss });
  }

  await settle(page);
};

const read = (page: Page, selector: string, properties: readonly string[]) =>
  page
    .locator(selector)
    .evaluate(
      (element, names: readonly string[]) =>
        Object.fromEntries(names.map((name) => [name, getComputedStyle(element).getPropertyValue(name)])),
      properties,
    );

/* See the glass suite in aesthetics.spec.ts: only Chromium reports reduced
   transparency here, so only Chromium needs it emulated away. */
const allowTransparency = async (page: Page, browserName: string) => {
  if (browserName !== "chromium") {
    return;
  }

  const session = await page.context().newCDPSession(page);

  await session.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-transparency", value: "no-preference" }],
  });
};

const ALL_SOLO = `
  <div id="glass" class="glass-solo">glass</div>
  <div id="neobrutalism" class="neobrutalism-solo">neobrutalism</div>
  <div id="pixel" class="pixel-solo">pixel</div>
  <div id="chunky-tile" class="chunky-tile-solo">chunky tile</div>
  <div id="cyber" class="cyber-solo">cyber</div>
  <div id="sketch" class="sketch-solo">sketch</div>
`;

test.describe("solo utilities", () => {
  test("paint each aesthetic onto a bare element with no other stylesheet", async ({ page, browserName }) => {
    await allowTransparency(page, browserName);
    await load(page, ["aesthetics/index.css"], ALL_SOLO);

    const properties = [
      "backdrop-filter",
      "-webkit-backdrop-filter",
      "background-color",
      "border-top-width",
      "border-top-left-radius",
      "border-top-right-radius",
      "box-shadow",
      "clip-path",
      "corner-shape",
      "font-family",
      "text-shadow",
    ];
    const glass = await read(page, "#glass", properties);
    const neobrutalism = await read(page, "#neobrutalism", properties);
    const pixel = await read(page, "#pixel", properties);
    const tile = await read(page, "#chunky-tile", properties);
    const cyber = await read(page, "#cyber", properties);
    const sketch = await read(page, "#sketch", properties);

    const backdrop =
      glass["backdrop-filter"] && glass["backdrop-filter"] !== "none"
        ? glass["backdrop-filter"]
        : glass["-webkit-backdrop-filter"];

    expect(backdrop, "glass blurs").toContain("blur(14px)");
    expect(readSrgb(glass["background-color"]!).alpha, "glass is translucent").toBeLessThan(1);
    expect(glass["border-top-left-radius"], "glass corner").toBe("16px");
    expect(glass["border-top-width"], "glass hairline").toBe("1px");

    expect(neobrutalism["border-top-width"], "neobrutalism line").toBe("2px");
    expect(neobrutalism["border-top-left-radius"], "neobrutalism corner").toBe("0px");
    expect(neobrutalism["box-shadow"], "neobrutalism slab").toMatch(/\b4px 4px 0px 0px\b/);

    /* The clip removes a border, so the ring replaces it. */
    expect(pixel["clip-path"], "pixel silhouette").toMatch(/^polygon/);
    expect(pixel["border-top-width"], "pixel border").toBe("0px");
    expect(pixel["box-shadow"], "pixel ring").toMatch(/inset|0px 0px 0px 4px/);
    expect(pixel["font-family"], "pixel font falls back to monospace").toContain("monospace");

    expect(tile["border-top-left-radius"], "tile corner").toBe("12px");
    expect(tile["border-top-width"], "tile line").toBe("2px");
    expect(tile["box-shadow"], "tile bar").toMatch(/\b0px 4px 0px 0px\b/);

    expect(cyber["border-top-width"], "cyber line").toBe("1px");
    expect(cyber["box-shadow"], "cyber glow").toMatch(/\b0px 0px 8px 1px\b/);
    /* A pane takes the surface diagonal: top-right and bottom-left. */
    expect(cyber["border-top-left-radius"], "cyber top-left").toBe("0px");
    if (browserName === "chromium") {
      expect(cyber["corner-shape"], "cyber bevel").toBe("bevel");
      expect(cyber["border-top-right-radius"], "cyber cut").toBe("min(10px, 25%)");
    } else {
      expect(cyber["border-top-right-radius"], "cyber squares where no bevel is drawn").toBe("0px");
    }

    expect(sketch["border-top-width"], "sketch line").toBe("1px");
    expect(sketch["border-top-left-radius"], "sketch uneven corner").toBe("80px 3px");
    expect(sketch["box-shadow"], "sketch offset").toMatch(/\b2px 2px 0px 0px\b/);
    /* The neutral depth colour, as the aesthetic class casts it, not the opaque
       ink: in full ink the pane read as a neobrutalist slab. */
    expect(
      readSrgb(sketch["box-shadow"]!.match(/^[a-z]+\([^)]*\)/)![0]).alpha,
      "sketch shadow is the depth colour",
    ).toBeLessThan(1);
    expect(sketch["font-family"], "sketch font falls back to cursive").toContain("cursive");
  });

  /* The colours are the theme's foundation tokens with the shipped literal as
     the fallback: the theme is followed where it is loaded, and the look still
     renders where it is not. */
  test("follow the theme where it is loaded, and fall back to the shipped look where it is not", async ({ page }) => {
    await load(page, ["aesthetics/neobrutalism.css"], `<div id="solo" class="neobrutalism-solo">x</div>`);

    const bare = await read(page, "#solo", ["border-top-color"]);

    /* No `color-scheme` in scope resolves the light half of `light-dark()`. */
    expectSameColor(bare["border-top-color"]!, "oklch(0.145 0 0)", "light ink with no theme");

    await load(page, ["theme.css", "aesthetics/neobrutalism.css"], `<div id="solo" class="neobrutalism-solo">x</div>`);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await settle(page);

    const dark = await read(page, "#solo", ["border-top-color"]);

    expectSameColor(dark["border-top-color"]!, "oklch(0.985 0 0)", "dark ink from the theme");

    await page.evaluate(() => {
      document.documentElement.classList.remove("dark");
      document.documentElement.style.setProperty("--color-neutral-950", "rgb(255 0 0)");
    });
    await settle(page);

    const themed = await read(page, "#solo", ["border-top-color"]);

    expectSameColor(themed["border-top-color"]!, "rgb(255, 0, 0)", "a themed foundation token is followed");
  });

  test("uses a solid border in forced colors without the theme stylesheet", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await load(page, ["aesthetics/sketch.css"], `<div id="solo" class="sketch-solo">x</div>`);

    expect((await read(page, "#solo", ["border-top-style"]))["border-top-style"]).toBe("solid");
  });

  test("take each knob from an ancestor", async ({ page }) => {
    await load(
      page,
      ["aesthetics/index.css"],
      `<div style="--glass-radius-surface: 2rem; --neo-offset: 6px; --pixel-unit: 6px; --tile-lift: 6px; --tile-radius: 1rem; --cyber-glow: 20px">${ALL_SOLO}</div>`,
    );

    const radius = ["border-top-left-radius"];
    const shadow = ["box-shadow"];

    expect((await read(page, "#glass", radius))["border-top-left-radius"], "glass corner").toBe("32px");
    expect((await read(page, "#neobrutalism", shadow))["box-shadow"], "neobrutalism offset").toMatch(
      /\b6px 6px 0px 0px\b/,
    );
    expect((await read(page, "#pixel", shadow))["box-shadow"], "pixel unit").toMatch(/\b6px\b/);
    expect((await read(page, "#chunky-tile", shadow))["box-shadow"], "tile lift").toMatch(/\b0px 6px 0px 0px\b/);
    expect((await read(page, "#chunky-tile", radius))["border-top-left-radius"], "tile corner").toBe("16px");
    expect((await read(page, "#cyber", shadow))["box-shadow"], "cyber glow").toMatch(/\b0px 0px 20px 1px\b/);
  });

  /* The whole reason a solo class reads no `--ui-*` or `--elevation-color`: an
     ancestor aesthetic declares both, and a solo element has to look the same
     inside any of them. */
  test("ignore the shared tokens an ancestor aesthetic declares", async ({ page }) => {
    await load(
      page,
      ["aesthetics/index.css"],
      `<div class="pixel"><div id="in-pixel" class="glass-solo">x</div></div>
       <div class="chunky-tile"><div id="in-tile" class="glass-solo">x</div></div>
       <div id="alone" class="glass-solo">x</div>`,
    );

    const inPixel = await read(page, "#in-pixel", ["border-top-left-radius"]);
    const inTile = await read(page, "#in-tile", ["box-shadow"]);
    const alone = await read(page, "#alone", ["box-shadow"]);

    expect(inPixel["border-top-left-radius"], "pixel's zero radius does not reach it").toBe("16px");
    expect(inTile["box-shadow"], "chunky tile's black depth colour does not reach it").toBe(alone["box-shadow"]);
  });

  /* The foreign component this exists for writes its own unlayered rules. A
     single unlayered class beats a zero-specificity rule wherever the two load,
     which is why the solo classes are not in a cascade layer. */
  test("win against a foreign component's zero-specificity rules loaded after them", async ({ page }) => {
    await load(
      page,
      ["aesthetics/glass.css"],
      `<div id="toast" class="foreign-toast glass-solo">x</div>`,
      ":where(.foreign-toast) { border-radius: 3px; border: 5px solid red; background-color: red; }",
    );

    const toast = await read(page, "#toast", ["border-top-left-radius", "border-top-width"]);

    expect(toast["border-top-left-radius"], "corner").toBe("16px");
    expect(toast["border-top-width"], "edge").toBe("1px");
  });

  /* An action presses; a container clicked to dismiss does not, and neither
     does a disabled action. A held pointer is what drives `:active`. */
  test("press an action, and neither a container nor a disabled action", async ({ page }) => {
    await load(
      page,
      ["aesthetics/neobrutalism.css"],
      `<button id="action" class="neobrutalism-solo" style="margin: 40px">Go</button>
       <div id="container" class="neobrutalism-solo" style="margin: 40px">Toast</div>
       <button id="disabled" class="neobrutalism-solo" style="margin: 40px" disabled>Off</button>`,
    );

    const pressed = async (selector: string) => {
      const target = page.locator(selector);

      await target.hover();
      await page.mouse.down();

      try {
        // Transitions run, so this polls for the settled value.
        return await expect
          .poll(() => target.evaluate((node) => getComputedStyle(node).transform), { timeout: 2000 })
          .toBe("matrix(1, 0, 0, 1, 4, 4)")
          .then(
            () => true,
            () => false,
          );
      } finally {
        await page.mouse.up();
      }
    };

    expect(await pressed("#action"), "action").toBe(true);
    expect(await pressed("#container"), "container").toBe(false);
    expect(await pressed("#disabled"), "disabled action").toBe(false);
  });

  test("drop the press transform under reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await load(
      page,
      ["aesthetics/index.css"],
      `<button id="neo" class="neobrutalism-solo" style="margin: 40px">Go</button>`,
    );

    const target = page.locator("#neo");

    await target.hover();
    await page.mouse.down();

    try {
      /* The slab still collapses; only the movement goes. */
      await expect
        .poll(() => target.evaluate((node) => getComputedStyle(node).boxShadow))
        .toMatch(/\b0px 0px 0px 0px\b/);
      expect(await target.evaluate((node) => getComputedStyle(node).transform)).toBe("none");
    } finally {
      await page.mouse.up();
    }
  });

  /* The same split the aesthetic class draws between controls and surfaces:
     an action cuts the opposite diagonal to a pane. */
  test("cut a cyber action on the control diagonal", async ({ page, browserName }) => {
    await load(page, ["aesthetics/cyber.css"], `<button id="action" class="cyber-solo">Go</button>`);

    const action = await read(page, "#action", ["border-top-left-radius", "border-top-right-radius"]);

    expect(action["border-top-left-radius"], "top-left").toBe(browserName === "chromium" ? "min(10px, 25%)" : "0px");
    expect(action["border-top-right-radius"], "top-right").toBe("0px");
  });

  /* The same split between controls and surfaces: an action takes the expressive
     control outline while a container takes the subtle surface outline. */
  test("give a sketch action the control outline and a container the surface outline", async ({ page }) => {
    await load(
      page,
      ["aesthetics/sketch.css"],
      `<button id="action" class="sketch-solo">Go</button><div id="container" class="sketch-solo">Pane</div>`,
    );

    const action = await read(page, "#action", ["border-top-left-radius"]);
    const container = await read(page, "#container", ["border-top-left-radius"]);

    expect(action["border-top-left-radius"], "action control radius").toBe("255px 15px");
    expect(container["border-top-left-radius"], "container surface radius").toBe("80px 3px");
  });

  test("draws rounded contours on sketch-solo when paired with sketch-rounded", async ({ page }) => {
    await load(
      page,
      ["aesthetics/sketch.css"],
      '<button id="action" class="sketch-solo sketch-rounded">Go</button><div id="container" class="sketch-solo sketch-rounded">Pane</div><button id="custom" class="sketch-solo sketch-rounded" style="--sketch-radius-rounded: 10px">Custom</button>',
    );

    const action = await read(page, "#action", ["border-top-left-radius"]);
    const container = await read(page, "#container", ["border-top-left-radius"]);
    const custom = await read(page, "#custom", ["border-top-left-radius"]);

    expect(action["border-top-left-radius"], "action rounded radius").toBe("26px 12px");
    expect(container["border-top-left-radius"], "container rounded surface radius").toBe("38px 16px");
    expect(custom["border-top-left-radius"], "custom knob overrides").toBe("10px");
  });

  test("weight chunky tile's label on an action only", async ({ page }) => {
    await load(
      page,
      ["aesthetics/chunky-tile.css"],
      `<button id="action" class="chunky-tile-solo">Go</button><div id="container" class="chunky-tile-solo">Toast</div>`,
    );

    expect((await read(page, "#action", ["font-weight"]))["font-weight"], "action").toBe("800");
    expect((await read(page, "#container", ["font-weight"]))["font-weight"], "container").toBe("400");
  });

  /* The clip takes the focus outline with it, so a focused pixel element draws
     focus as a second inset layer under its ring. */
  test("give a focused pixel element a focus ring the clip cannot remove", async ({ page }) => {
    await load(page, ["aesthetics/pixel.css"], `<button id="pixel" class="pixel-solo">Go</button>`);

    const resting = (await read(page, "#pixel", ["box-shadow"]))["box-shadow"]!;

    await page.keyboard.press("Tab");
    await expect(page.locator("#pixel")).toBeFocused();

    const focused = (await read(page, "#pixel", ["box-shadow"]))["box-shadow"]!;

    /* The fill is an inset layer too, under everything else. */
    expect(resting.match(/inset/g), "the ring and the fill at rest").toHaveLength(2);
    expect(focused.match(/inset/g), "ring, focus layer, its inner line, and the fill").toHaveLength(4);
    expect(focused, "focus layer is wider than the ring").toMatch(/\b7px\b/);
    expect(focused, "the inner line is wider again").toMatch(/\b9px\b/);
  });

  /* The ring is a box shadow, and forced colours remove every one. An outline
     stands in for it and the clip goes, so the element keeps an edge. */
  test("keep a pixel element's edge in forced colors", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await load(page, ["aesthetics/pixel.css"], `<div id="pixel" class="pixel-solo">pixel</div>`);

    const styles = await read(page, "#pixel", ["outline-style", "outline-width", "outline-offset", "clip-path"]);

    expect(styles["outline-style"]).toBe("solid");
    expect(styles["outline-width"]).toBe("4px");
    expect(styles["outline-offset"], "drawn inward, so nothing moves").toBe("-4px");
    expect(styles["clip-path"]).toBe("none");
  });

  /* A solo class composes with what the element is asked to be, the way a
     component does: presentation from the element or a container, the intent
     on the element, the element's own elevation. See
     docs/internal/model.md#solo-classes. */
  test.describe("composition", () => {
    const SHEETS = ["index.css", "aesthetics/index.css"] as const;
    const HOST = ".host { background-color: rgb(1, 2, 3); color: rgb(4, 5, 6); }";
    /* The colour of each layer of a box shadow, in order. */
    const shadowColors = (shadow: string) => shadow.match(/[a-z]+\([^)]*\)/g) ?? [];
    const resolve = (page: Page, color: string) =>
      page.evaluate((value) => {
        const probe = document.createElement("span");

        probe.style.color = value;
        document.body.append(probe);

        const resolved = getComputedStyle(probe).color;

        probe.remove();

        return resolved;
      }, color);

    test("leaves an unclassed element's own background and text alone", async ({ page }) => {
      await load(
        page,
        SHEETS,
        ["neobrutalism", "pixel", "chunky-tile", "cyber", "sketch"]
          .map((name) => `<div id="${name}" class="host ${name}-solo">x</div>`)
          .join(""),
        HOST,
      );

      /* oxlint-disable no-await-in-loop -- five reads of one page. */
      for (const name of ["neobrutalism", "pixel", "chunky-tile", "cyber", "sketch"]) {
        const styles = await read(page, `#${name}`, ["background-color", "color", "box-shadow"]);

        expect(styles["background-color"], `${name} background`).toBe("rgb(1, 2, 3)");
        expect(styles.color, `${name} text`).toBe("rgb(4, 5, 6)");
        expect(readSrgb(shadowColors(styles["box-shadow"]!).at(-1)!).alpha, `${name} paints no fill`).toBe(0);
      }
      /* oxlint-enable no-await-in-loop */
    });

    test("answers the edge axis on the element", async ({ page }) => {
      await load(
        page,
        SHEETS,
        `<div id="border" class="neobrutalism-solo edgeless">x</div>
         <div id="ring" class="pixel-solo edgeless">x</div>
         <div id="glass" class="glass-solo edgeless">x</div>`,
      );

      const border = await read(page, "#border", ["border-top-color", "box-shadow"]);
      const ring = (await read(page, "#ring", ["box-shadow"]))["box-shadow"]!;
      const glass = (await read(page, "#glass", ["border-top-color"]))["border-top-color"]!;

      expect(readSrgb(border["border-top-color"]!).alpha, "no line").toBe(0);
      expect(border["box-shadow"], "the slab is depth, and stays").toMatch(/\b4px 4px 0px 0px\b/);
      expect(readSrgb(shadowColors(ring)[0]!).alpha, "no ring").toBe(0);
      expect(readSrgb(glass).alpha, "no hairline").toBe(0);
    });

    test("fills and colours from the element's own fill and intent", async ({ page, browserName }) => {
      await allowTransparency(page, browserName);
      await load(
        page,
        SHEETS,
        `<div id="solid" class="host neobrutalism-solo solid success">x</div>
         <div id="soft" class="host chunky-tile-solo soft success">x</div>
         <div id="glass" class="glass-solo solid success">x</div>`,
        HOST,
      );

      const success = await resolve(page, "var(--color-success)");
      const contrast = await resolve(page, "var(--color-success-contrast)");
      const solid = await read(page, "#solid", ["box-shadow", "color", "border-top-color", "background-color"]);
      const soft = (await read(page, "#soft", ["box-shadow"]))["box-shadow"]!;
      const glass = await read(page, "#glass", ["background-color", "color"]);

      expectSameColor(shadowColors(solid["box-shadow"]!).at(-1)!, success, "the fill layer");
      expectSameColor(shadowColors(solid["box-shadow"]!)[0]!, success, "the slab takes the intent");
      expectSameColor(solid["border-top-color"]!, success, "the line takes the intent");
      expectSameColor(solid.color!, contrast, "the text is the contrast tone");
      expect(solid["background-color"], "the element's own background is under the fill").toBe("rgb(1, 2, 3)");
      expect(readSrgb(shadowColors(soft).at(-1)!).alpha, "a soft fill is a tint").toBeCloseTo(0.12, 2);
      expectSameColor(glass["background-color"]!, success, "a solid glass pane is opaque");
      expectSameColor(glass.color!, contrast, "with contrast text");
    });

    test("follows a container's presentation, and not a container's intent", async ({ page }) => {
      await load(
        page,
        SHEETS,
        `<div class="soft edgeless"><div id="cascaded" class="sketch-solo info">x</div></div>
         <div class="success solid"><div id="uncoloured" class="host cyber-solo">x</div></div>
         <div id="alone" class="cyber-solo solid">x</div>`,
        HOST,
      );

      const cascaded = await read(page, "#cascaded", ["box-shadow", "border-top-color"]);
      const uncoloured = await read(page, "#uncoloured", ["border-top-color", "box-shadow"]);
      const alone = await read(page, "#alone", ["border-top-color", "box-shadow"]);

      expect(readSrgb(shadowColors(cascaded["box-shadow"]!).at(-1)!).alpha, "the container's soft fill").toBeCloseTo(
        0.12,
        2,
      );
      expectSameColor(
        cascaded["border-top-color"]!,
        shadowColors(cascaded["box-shadow"]!).at(-1)!,
        "and its edgeless line is the fill's one coat",
      );
      /* A `.success` container leaves a component inside it neutral, so it
         leaves a solo element neutral too: same line and same fill as one that
         is solid on its own. */
      expectSameColor(uncoloured["border-top-color"]!, alone["border-top-color"]!, "the container's intent");
      expectSameColor(
        shadowColors(uncoloured["box-shadow"]!).at(-1)!,
        shadowColors(alone["box-shadow"]!).at(-1)!,
        "the neutral fill",
      );
    });

    test("scales its depth by the element's own elevation class", async ({ page }) => {
      await load(
        page,
        SHEETS,
        `<div id="flat" class="neobrutalism-solo flat">x</div>
         <div id="floating" class="chunky-tile-solo floating">x</div>
         <div class="flat"><div id="inside" class="sketch-solo">x</div></div>
         <div id="glow" class="cyber-solo flat">x</div>`,
      );

      expect((await read(page, "#flat", ["box-shadow"]))["box-shadow"], "no slab").toMatch(/\b0px 0px 0px 0px\b/);
      expect((await read(page, "#floating", ["box-shadow"]))["box-shadow"], "twice the bar").toMatch(
        /\b0px 8px 0px 0px\b/,
      );
      expect((await read(page, "#inside", ["box-shadow"]))["box-shadow"], "a container's does not reach it").toMatch(
        /\b2px 2px 0px 0px\b/,
      );
      expect((await read(page, "#glow", ["box-shadow"]))["box-shadow"], "the glow is not depth").toMatch(
        /\b0px 0px 8px 1px\b/,
      );
    });

    /* The classes it composes with are the theme's. With the aesthetic alone
       on the page they set nothing, so the edge, the fill, and the depth are
       the shipped look's. The text colour is still written, in the neutral
       ink, because the class is on the element. */
    test("paints the shipped look where the theme is not loaded", async ({ page }) => {
      await load(
        page,
        ["aesthetics/neobrutalism.css"],
        `<div id="plain" class="neobrutalism-solo">x</div><div id="classed" class="neobrutalism-solo solid success edgeless flat">x</div>`,
      );

      const properties = ["box-shadow", "border-top-color"];

      expect(await read(page, "#classed", properties)).toEqual(await read(page, "#plain", properties));
    });
  });

  /* A modifier beside a solo class is a token class too, and a token declared
     on the element inherits into what it holds. A component inside a solo
     element is not in that aesthetic's region and keeps the page's own look. */
  test("keep a modifier's tokens off the components inside a solo element", async ({ page }) => {
    await load(
      page,
      ["index.css", "aesthetics/index.css"],
      `<button id="plain" class="btn">Plain</button>
       <div class="sketch-solo sketch-rounded"><button id="sketch-first" class="btn">One</button><button id="sketch-second" class="btn">Two</button></div>
       <div class="glass-solo glass-liquid"><button id="liquid" class="btn">Liquid</button><div id="card" class="card">Card</div></div>`,
    );

    const radius = async (selector: string) => (await read(page, selector, ["border-radius"]))["border-radius"];
    const plain = await radius("#plain");

    expect(await radius("#sketch-first"), "first child of a rounded solo element").toBe(plain);
    expect(await radius("#sketch-second"), "the rotation does not reach it either").toBe(plain);
    expect(await radius("#liquid"), "inside a liquid solo element").toBe(plain);
    expect(
      await page.locator("#card").evaluate((element) => getComputedStyle(element, "::before").content),
      "and a card inside takes no layers",
    ).toBe("none");
  });
});
