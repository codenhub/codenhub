import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";
import { expectSameColor, readSrgb } from "./test-utils";

/* A solo class exists for an element this package does not style, on a page
   that may never have loaded the base stylesheet. So unlike the aesthetic
   suite, which reads the shared playground fixtures, these build a blank page
   and load only the built files a consumer in that position would: an aesthetic
   entrypoint, and sometimes the theme. See docs/internal/solo-utilities.md. */
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
      "box-shadow",
      "clip-path",
      "corner-shape",
      "font-family",
    ];
    const glass = await read(page, "#glass", properties);
    const neobrutalism = await read(page, "#neobrutalism", properties);
    const pixel = await read(page, "#pixel", properties);
    const tile = await read(page, "#chunky-tile", properties);
    const cyber = await read(page, "#cyber", properties);

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
    expect(cyber["box-shadow"], "cyber glow").toMatch(/\b0px 0px 12px 0px\b/);
    if (browserName === "chromium") {
      expect(cyber["corner-shape"], "cyber bevel").toBe("bevel");
      expect(cyber["border-top-left-radius"], "cyber cut").toBe("8px");
    } else {
      expect(cyber["border-top-left-radius"], "cyber squares where no bevel is drawn").toBe("0px");
    }
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
    expect((await read(page, "#cyber", shadow))["box-shadow"], "cyber glow").toMatch(/\b0px 0px 20px 0px\b/);
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

    expect(resting.match(/inset/g), "one ring at rest").toHaveLength(1);
    expect(focused.match(/inset/g), "ring and focus layer").toHaveLength(2);
    expect(focused, "focus layer is wider than the ring").toMatch(/\b7px\b/);
  });
});
