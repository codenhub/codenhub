import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";

/* The layer map: everything the package ships sits in `theme`, `base`,
   `components`, or `utilities`, so a consumer's own utility or unlayered CSS
   beats the aesthetic, presentation, intent, and elevation classes on every
   entrypoint and in any load order. See docs/internal/cascade-layers.md.

   Like the solo suite, these build a blank page from the built files a consumer
   links, rather than a playground page: the playground compiles everything
   through Tailwind again, which hid every entrypoint-order failure the layer
   map had to fix. The consumer stylesheet is appended last, the way an
   application's own CSS usually loads. */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const built = (file: string) => readFile(path.join(packageRoot, "dist", file), "utf8");

const SCENARIOS: Record<string, readonly string[]> = {
  ".": ["index.css", "aesthetics/index.css"],
  "/theme + /components": ["theme.css", "components.css", "aesthetics/index.css"],
  "/native": ["native.css", "aesthetics/index.css"],
  "/aesthetics loaded first": ["aesthetics/index.css", "theme.css", "components.css"],
};

/* A consumer's Tailwind utilities, and a consumer's plain unlayered rules. */
const CONSUMER_CSS = `
@layer utilities {
  .c-font { font-family: serif; }
  .c-radius { --ui-radius: 3px; }
  .c-fill { --ui-fill: 50%; }
  .c-intent { --intent-color: rgb(1 2 3); }
  .c-elevation { --ui-elevation: 3; }
  .c-weight { font-weight: 300; }
}
.u-font { font-family: fantasy; }
.u-fill { --ui-fill: 40%; }
`;

const MARKUP = `
<div data-testid="pixel-utility-font" class="pixel c-font">x</div>
<div class="pixel c-radius"><button data-testid="pixel-utility-radius" class="btn">b</button></div>
<div data-testid="pixel-own-font" class="pixel u-font">x</div>
<button data-testid="solid-utility-fill" class="btn solid c-fill">b</button>
<button data-testid="solid-own-fill" class="btn solid u-fill">b</button>
<button data-testid="success-utility-intent" class="btn success c-intent">b</button>
<button data-testid="flat-utility-elevation" class="btn flat c-elevation">b</button>
<div class="chunky-tile">
  <button data-testid="tile-button" class="btn">b</button>
  <button data-testid="tile-utility-weight" class="btn c-weight">b</button>
  <div class="pixel"><button data-testid="tile-nested-pixel-button" class="btn">b</button></div>
</div>
<div class="neobrutalism"><div data-testid="neo-alert" class="alert">a</div></div>
<div data-testid="glass-card" class="card glass">g</div>
<div data-testid="glass-soft-card" class="card soft glass">g</div>
<input data-testid="soft-field" class="ipt soft" />
<input data-testid="invalid-field" class="ipt success" aria-invalid="true" />
<button data-testid="destructive-button" class="btn destructive">d</button>
`;

const load = async (page: Page, files: readonly string[]) => {
  await page.setContent(`<!doctype html><html class="chunky-tile"><body>${MARKUP}</body></html>`);

  for (const file of files) {
    // oxlint-disable-next-line no-await-in-loop -- source order is the contract, so the sheets load in turn.
    await page.addStyleTag({ content: await built(file) });
  }
  await page.addStyleTag({ content: CONSUMER_CSS });
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
};

const read = (page: Page, testId: string, property: string) =>
  page
    .getByTestId(testId)
    .evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), property);

for (const [scenario, files] of Object.entries(SCENARIOS)) {
  test.describe(`layers, ${scenario}`, () => {
    test("a consumer's utility beats every class family", async ({ page }) => {
      await load(page, files);

      expect(await read(page, "pixel-utility-font", "font-family"), "aesthetic font").toBe("serif");
      expect(await read(page, "pixel-utility-radius", "border-top-left-radius"), "aesthetic radius").toBe("3px");
      expect(await read(page, "solid-utility-fill", "--ui-fill"), "presentation").toBe("50%");
      expect(await read(page, "success-utility-intent", "--intent-color"), "intent").toBe("rgb(1 2 3)");
      expect(await read(page, "flat-utility-elevation", "--ui-elevation"), "elevation").toBe("3");
    });

    test("a consumer's unlayered CSS beats the class families too", async ({ page }) => {
      await load(page, files);

      expect(await read(page, "pixel-own-font", "font-family"), "aesthetic font").toBe("fantasy");
      expect(await read(page, "solid-own-fill", "--ui-fill"), "presentation").toBe("40%");
    });

    /* The theme's `:root` tokens sit in `theme`, below the aesthetic in
       `components`, so an aesthetic on `<html>` keeps its own press and depth
       colour whichever sheet loads first. */
    test("an aesthetic on the root keeps its tokens over the theme's", async ({ page }) => {
      await load(page, files);

      const root = await page.evaluate(() => {
        const styles = getComputedStyle(document.documentElement);

        return {
          depth: styles.getPropertyValue("--elevation-color").trim(),
          press: styles.getPropertyValue("--ui-active-transform").trim(),
        };
      });

      expect(root.press, "chunky tile's press").toBe("translateY(4px)");
      expect(["#000", "rgb(0 0 0)", "rgb(0, 0, 0)"], `chunky tile's depth colour, got ${root.depth}`).toContain(
        root.depth,
      );
    });

    test("keeps the aesthetics' component treatments", async ({ page }) => {
      await load(page, files);

      expect(await read(page, "tile-button", "font-weight"), "chunky tile's label").toBe("800");
      expect(await read(page, "tile-utility-weight", "font-weight"), "a consumer's weight beats it").toBe("300");
      expect(await read(page, "tile-button", "--ui-button-weight"), "chunky tile declares button weight slot").toBe(
        "800",
      );
      expect(
        await read(page, "tile-nested-pixel-button", "--ui-button-weight"),
        "nested aesthetic clears chunky tile's weight slot to initial (guaranteed-invalid)",
      ).toBe("");
      expect(
        await read(page, "tile-nested-pixel-button", "font-weight"),
        "nested aesthetic is not chunky tile's 800 weight",
      ).not.toBe("800");
      expect(await read(page, "neo-alert", "box-shadow"), "neobrutalism's alert slab").not.toBe("none");
      expect(
        await read(page, "glass-soft-card", "--_d-ground"),
        "`.card.soft.glass` takes glass's ground, not the soft card's",
      ).toBe(await read(page, "glass-card", "--_d-ground"));
    });

    /* The component seams sit in `utilities` and win on specificity over their
       own component, and a state still beats a consumer's choice of intent. */
    test("keeps the component seams winning over their own component", async ({ page }) => {
      await load(page, files);

      expect(await read(page, "soft-field", "--_fill-cap"), "`.ipt.soft` names its own cap").toBe("12%");
      expect(await read(page, "invalid-field", "--intent-color"), "invalid beats `.success`").toBe(
        await read(page, "destructive-button", "--intent-color"),
      );
    });
  });
}
