import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "./fixtures";

/* `data-contrast` and `data-motion` on `<html>` decide in place of
   `prefers-contrast` and `prefers-reduced-motion`, as docs/accessibility.md
   says: each value has to draw what the media query it stands for draws, and
   override the system when the two disagree. Every rule that reads either
   query is reached below -- components, aesthetics, solo classes, native
   elements, and the reset -- so a rule given one trigger and not the other
   shows up as a difference between two snapshots that should be equal. */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const built = (file: string) => readFile(path.join(packageRoot, "dist", file), "utf8");

const MARKUP = `
  <input data-testid="ipt" class="ipt" />
  <button data-testid="btn" class="btn">Button</button>
  <span data-testid="badge" class="badge soft edged warning">Badge</span>
  <div data-testid="alert" class="alert soft edged success">Alert</div>
  <div data-testid="card" class="card">Card</div>
  <div data-testid="progress" class="progress active" style="--progress-value: 40%"></div>
  <div data-testid="indeterminate" class="progress indeterminate"></div>
  <div data-testid="skeleton" class="skeleton"></div>
  <input data-testid="checkbox" type="checkbox" class="checkbox" />
  <input data-testid="radio" type="radio" class="radio" />
  <input data-testid="switch" type="checkbox" class="switch" />
  <span class="tooltip"><button>Trigger</button><span data-testid="bubble" class="tooltip-bubble">Bubble</span></span>
  <progress data-testid="native-progress"></progress>
  <div class="glass">
    <div data-testid="glass-card" class="card">Glass</div>
    <div data-testid="liquid-card" class="card glass-liquid">Liquid</div>
  </div>
  <div class="chunky-tile">
    <div data-testid="tile-card" class="card">Tile</div>
    <button data-testid="tile-btn" class="btn">Tile</button>
  </div>
  <div class="cyber"><button data-testid="cyber-btn" class="btn">Cyber</button></div>
  <div class="neobrutalism"><button data-testid="neo-btn" class="btn">Neo</button></div>
  <div data-testid="glass-solo" class="glass-solo">Solo</div>
  <div data-testid="liquid-solo" class="glass-solo glass-liquid">Solo</div>
  <button data-testid="tile-solo" class="chunky-tile-solo">Solo</button>
  <button data-testid="cyber-solo" class="cyber-solo">Solo</button>
  <button data-testid="neo-solo" class="neobrutalism-solo">Solo</button>
  <div data-testid="plain" style="transition: transform 1s, opacity 1s; animation: spin 1s infinite"></div>
  <style>@keyframes spin { to { rotate: 1turn; } }</style>
`;

const CONTRAST_PROPERTIES = [
  "border-top-color",
  "outline-color",
  "background-color",
  "backdrop-filter",
  "--color-border",
  "--intent-border",
  "--ui-ink",
  "--ui-surface-ground",
  "--_solo-ink",
  "--_solo-ground",
  "--_line-rest",
  "--_d-border",
];
const MOTION_PROPERTIES = [
  "transition-property",
  "transition-duration",
  "animation-name",
  "animation-duration",
  "animation-iteration-count",
  "scroll-behavior",
];

type Conditions = {
  contrast?: "more" | "no-preference";
  reducedMotion?: "reduce" | "no-preference";
  attributes?: string;
  /* `native.css` carries the reset, whose page-wide motion rule would hide a
     component rule that missed its trigger; `components.css` has none, so the
     motion tests read both. */
  sheet?: "native.css" | "components.css";
};

/* Every listed property of every test element and its two pseudo-elements,
   once the transitions the sheets set off on load have ended. */
const snapshot = async (page: Page, conditions: Conditions, properties: string[], theme = "light") => {
  await page.emulateMedia({
    contrast: conditions.contrast ?? "no-preference",
    reducedMotion: conditions.reducedMotion ?? "no-preference",
  });
  await page.setContent(
    `<!doctype html><html data-theme="${theme}" ${conditions.attributes ?? ""}><body>${MARKUP}</body></html>`,
  );
  await page.addStyleTag({ content: await built(conditions.sheet ?? "native.css") });
  await page.addStyleTag({ content: await built("aesthetics/index.css") });

  return page.evaluate(async (names) => {
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    );

    const out: Record<string, string> = {
      html: names.map((name) => getComputedStyle(document.documentElement).getPropertyValue(name)).join(" | "),
    };

    for (const element of document.querySelectorAll<HTMLElement>("[data-testid]")) {
      for (const pseudo of ["", "::before", "::after"]) {
        const styles = getComputedStyle(element, pseudo || null);

        out[`${element.dataset.testid}${pseudo}`] = names
          .map((name) => `${name}: ${styles.getPropertyValue(name).trim()}`)
          .join("; ");
      }
    }

    return out;
  }, properties);
};

for (const theme of ["light", "dark"] as const) {
  test.describe(`data-contrast, ${theme}`, () => {
    test('data-contrast="more" draws what prefers-contrast: more draws', async ({ page }) => {
      const system = await snapshot(page, { contrast: "more" }, CONTRAST_PROPERTIES, theme);
      const attribute = await snapshot(
        page,
        { contrast: "no-preference", attributes: 'data-contrast="more"' },
        CONTRAST_PROPERTIES,
        theme,
      );
      const standard = await snapshot(page, {}, CONTRAST_PROPERTIES, theme);

      expect(attribute).toEqual(system);
      expect(attribute, "more contrast changes something").not.toEqual(standard);
    });

    test('data-contrast="standard" turns the system\'s more contrast off', async ({ page }) => {
      const standard = await snapshot(page, {}, CONTRAST_PROPERTIES, theme);
      const overridden = await snapshot(
        page,
        { contrast: "more", attributes: 'data-contrast="standard"' },
        CONTRAST_PROPERTIES,
        theme,
      );

      expect(overridden).toEqual(standard);
    });
  });
}

test.describe("data-motion", () => {
  for (const sheet of ["components.css", "native.css"] as const) {
    test(`data-motion="reduced" moves as prefers-reduced-motion: reduce does, ${sheet}`, async ({ page }) => {
      const system = await snapshot(page, { reducedMotion: "reduce", sheet }, MOTION_PROPERTIES);
      const attribute = await snapshot(page, { attributes: 'data-motion="reduced"', sheet }, MOTION_PROPERTIES);
      const full = await snapshot(page, { sheet }, MOTION_PROPERTIES);

      expect(attribute).toEqual(system);
      expect(attribute, "reduced changes something").not.toEqual(full);
    });

    test(`data-motion="full" turns the system's reduced motion off, ${sheet}`, async ({ page }) => {
      const full = await snapshot(page, { sheet }, MOTION_PROPERTIES);
      const overridden = await snapshot(
        page,
        { reducedMotion: "reduce", attributes: 'data-motion="full"', sheet },
        MOTION_PROPERTIES,
      );

      expect(overridden).toEqual(full);
    });

    test(`data-motion="none" is the same with or without the system asking, ${sheet}`, async ({ page }) => {
      const alone = await snapshot(page, { attributes: 'data-motion="none"', sheet }, MOTION_PROPERTIES);
      const withSystem = await snapshot(
        page,
        { reducedMotion: "reduce", attributes: 'data-motion="none"', sheet },
        MOTION_PROPERTIES,
      );
      const reduced = await snapshot(page, { attributes: 'data-motion="reduced"', sheet }, MOTION_PROPERTIES);

      expect(withSystem).toEqual(alone);
      expect(alone, "none differs from reduced").not.toEqual(reduced);
    });
  }

  /* What the reset does to an element the package does not style. Under
     `reduced` a fade keeps its duration and a transform loses its transition;
     under `none` every duration is near zero. Both end every animation at
     once and stop smooth scrolling. */
  test("the reset keeps a fade under reduced and nothing under none", async ({ page }) => {
    const read = async (attributes: string) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setContent(
        `<!doctype html><html ${attributes} style="scroll-behavior: smooth"><body>${MARKUP}</body></html>`,
      );
      await page.addStyleTag({ content: await built("index.css") });

      return page.getByTestId("plain").evaluate((element) => {
        const styles = getComputedStyle(element);

        return {
          property: styles.transitionProperty,
          duration: styles.transitionDuration,
          animation: styles.animationDuration,
          iterations: styles.animationIterationCount,
          scroll: getComputedStyle(document.documentElement).scrollBehavior,
        };
      });
    };

    const reduced = await read('data-motion="reduced"');

    expect(reduced.property).not.toMatch(/\b(transform|all)\b/);
    expect(reduced.property).toMatch(/\bopacity\b/);
    expect(Number.parseFloat(reduced.duration), "a fade keeps its duration").toBe(1);
    expect(Number.parseFloat(reduced.animation)).toBeLessThan(0.001);
    expect(reduced.iterations).toBe("1");
    expect(reduced.scroll).toBe("auto");

    const none = await read('data-motion="none"');

    expect(none.property).toBe("transform, opacity");
    for (const duration of none.duration.split(",")) {
      expect(Number.parseFloat(duration)).toBeLessThan(0.001);
    }
    expect(Number.parseFloat(none.animation)).toBeLessThan(0.001);
    expect(none.scroll).toBe("auto");

    const full = await read('data-motion="full"');

    expect(full.property).toBe("transform, opacity");
    expect(full.scroll).toBe("smooth");
  });

  /* The reset swaps the transition's properties and keeps its durations, and
     the browser reuses that list in order, as docs/accessibility.md says. So
     with two durations, opacity and a text color take the first one, and a
     background the author left without a transition takes the second one. */
  for (const [label, attributes, reducedMotion] of [
    ["the system's reduced motion", "", "reduce"],
    ['data-motion="reduced"', 'data-motion="reduced"', "no-preference"],
  ] as const) {
    test(`under ${label}, the reset reuses the durations in order`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setContent(
        `<!doctype html><html ${attributes}><body><div data-testid="drawer" style="transition: transform 200ms, opacity 1s; background-color: red"></div></body></html>`,
      );
      await page.addStyleTag({ content: await built("index.css") });

      const running = await page.getByTestId("drawer").evaluate(async (element) => {
        await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
        element.style.transform = "translateX(100px)";
        element.style.opacity = "0.5";
        element.style.backgroundColor = "blue";
        element.style.color = "green";

        return Object.fromEntries(
          element
            .getAnimations()
            .map((animation) => [
              (animation as CSSTransition).transitionProperty,
              animation.effect?.getTiming().duration,
            ]),
        );
      });

      expect(running).toEqual({ opacity: 200, color: 200, "background-color": 1000 });
    });
  }
});
