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
  <textarea data-testid="textarea" class="textarea"></textarea>
  <select data-testid="select" class="select"><option>a</option></select>
  <div data-testid="group" class="input-group"><input class="ipt" /></div>
  <hr data-testid="divider" class="divider" />
  <table class="data-table"><thead><tr><th data-testid="head">Head</th></tr></thead></table>
  <div data-testid="panel" class="panel soft edged info">Panel</div>
  <kbd data-testid="kbd" class="kbd soft edged">K</kbd>
  <code data-testid="code" class="code soft edged">code</code>
  <pre data-testid="pre" class="pre soft edged">pre</pre>
  <div data-testid="chunky-tile-solo-card" class="chunky-tile-solo">Solo</div>
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
  "border-bottom-color",
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

/* docs/usage/theming.md's recipe for giving a custom intent the strong
   border the six built-in ones take under more contrast, as written there:
   the badge draws what one handed its strong tone as its border draws. */
test("a custom intent takes its strong border with the theming recipe", async ({ page }) => {
  const RECIPE = `
    .beta {
      --intent-color: #7c3aed;
      --intent-contrast: #ffffff;
      --intent-hover: #6d28d9;
      --intent-strong: light-dark(#5b21b6, #c4b5fd);
      --intent-subtle: light-dark(#ede9fe, #4c1d95);
      --intent-border: light-dark(#7c3aed, #a78bfa);
      --intent-fill-max: 100%;
    }
    @media (prefers-contrast: more) {
      .beta:not(:where(:root[data-contrast="standard"] *)) {
        --intent-border: var(--intent-strong);
      }
    }
    :root[data-contrast="more"] .beta {
      --intent-border: var(--intent-strong);
    }`;
  const read = async (contrast: "more" | "no-preference", attributes = "") => {
    await page.emulateMedia({ contrast });
    await page.setContent(
      `<!doctype html><html data-theme="light" ${attributes}><body>
        <span data-testid="beta" class="badge soft edged beta">Beta</span>
        <span data-testid="strong" class="badge soft edged beta" style="--intent-border: var(--intent-strong)">Beta</span>
      </body></html>`,
    );
    await page.addStyleTag({ content: await built("index.css") });
    await page.addStyleTag({ content: RECIPE });

    return page.evaluate(async () => {
      await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));

      return {
        border: getComputedStyle(document.querySelector('[data-testid="beta"]')!).borderTopColor,
        strong: getComputedStyle(document.querySelector('[data-testid="strong"]')!).borderTopColor,
      };
    });
  };

  const standard = await read("no-preference");
  const more = await read("more");

  expect(more.border).toBe(more.strong);
  expect(standard.border).not.toBe(more.border);
  expect(await read("no-preference", 'data-contrast="more"')).toEqual(more);
  expect(await read("more", 'data-contrast="standard"')).toEqual(standard);
});

test.describe("data-motion", () => {
  for (const sheet of ["components.css", "native.css"] as const) {
    test(`data-motion="reduce" moves as prefers-reduced-motion: reduce does, ${sheet}`, async ({ page }) => {
      const system = await snapshot(page, { reducedMotion: "reduce", sheet }, MOTION_PROPERTIES);
      const attribute = await snapshot(page, { attributes: 'data-motion="reduce"', sheet }, MOTION_PROPERTIES);
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
      const reduced = await snapshot(page, { attributes: 'data-motion="reduce"', sheet }, MOTION_PROPERTIES);

      expect(withSystem).toEqual(alone);
      expect(alone, "none differs from reduced").not.toEqual(reduced);
    });
  }

  /* What the reset does to an element the package does not style. Under
     `reduce` a fade keeps its duration and a transform loses its transition;
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

    const reduced = await read('data-motion="reduce"');

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
    ['data-motion="reduce"', 'data-motion="reduce"', "no-preference"],
  ] as const) {
    test(`under ${label}, the reset reuses the durations in order`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setContent(
        `<!doctype html><html ${attributes}><body><div data-testid="drawer" style="transition: transform 200ms, opacity 1s; background-color: red"></div></body></html>`,
      );
      await page.addStyleTag({ content: await built("index.css") });

      const running = await page.getByTestId("drawer").evaluate(async (element) => {
        /* Finite only: an endless animation never settles. */
        await Promise.allSettled(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
            .map((animation) => animation.finished),
        );
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

      expect(running).toEqual({
        opacity: 200,
        color: 200,
        "background-color": 1000,
      });
    });

    /* A popover or dialog fades out by keeping `display` and `overlay` for the
       length of the fade; without them in the list it vanishes at once. The
       reset gives both `allow-discrete` itself, since the behaviour the author
       wrote for them sits at whatever position they named them in: MDN's
       recipe names `transform` second, where the reset puts `display`. */
    for (const transition of [
      "opacity 1s, display 1s allow-discrete, overlay 1s allow-discrete",
      "opacity 1s, transform 1s, overlay 1s allow-discrete, display 1s allow-discrete",
    ]) {
      test(`under ${label}, a popover still fades out, with ${transition}`, async ({ page }) => {
        const read = async (motion: "reduce" | "no-preference", html: string) => {
          await page.emulateMedia({ reducedMotion: motion });
          await page.setContent(
            `<!doctype html><html ${html}><body><style>
          [popover] { opacity: 0; transform: scale(0.9); transition: ${transition}; }
          [popover]:popover-open { opacity: 1; transform: none; }
          @starting-style { [popover]:popover-open { opacity: 0; transform: scale(0.9); } }
        </style><div popover data-testid="pop">Saved</div></body></html>`,
          );
          await page.addStyleTag({ content: await built("index.css") });

          return page.getByTestId("pop").evaluate(async (element: HTMLElement) => {
            element.showPopover();
            await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
            element.hidePopover();
            await new Promise(requestAnimationFrame);

            return getComputedStyle(element).display;
          });
        };

        // An engine that cannot animate `display` closes the popover at once with no preference too.
        expect(await read(reducedMotion, attributes)).toBe(await read("no-preference", ""));
      });
    }

    /* A dialog fades out the same way, and keeps `allow-discrete` for the same
       reason: it is one of the elements written to leave the top layer. */
    test(`under ${label}, a dialog still fades out`, async ({ page }) => {
      const read = async (motion: "reduce" | "no-preference", html: string) => {
        await page.emulateMedia({ reducedMotion: motion });
        await page.setContent(
          `<!doctype html><html ${html}><body><style>
          dialog { opacity: 0; transition: opacity 1s, transform 1s, overlay 1s allow-discrete, display 1s allow-discrete; }
          dialog[open] { opacity: 1; }
          @starting-style { dialog[open] { opacity: 0; } }
        </style><dialog data-testid="dialog">Saved</dialog></body></html>`,
        );
        await page.addStyleTag({ content: await built("index.css") });

        return page.getByTestId("dialog").evaluate(async (element: HTMLDialogElement) => {
          element.showModal();
          await Promise.allSettled(element.getAnimations().map((animation) => animation.finished));
          element.close();
          await new Promise(requestAnimationFrame);

          return getComputedStyle(element).display;
        });
      };

      // An engine that cannot animate `display` closes the dialog at once with no preference too.
      expect(await read(reducedMotion, attributes)).toBe(await read("no-preference", ""));
    });

    /* Anything else keeps the behaviour its author wrote. Forced on every
       element, `allow-discrete` paired `display` with the duration of a
       `transform` transition, so a panel hidden with `display: none` stayed
       on screen, and took clicks, for that long where full motion hides it at
       once. */
    test(`under ${label}, an element hidden with display: none hides at once`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setContent(
        `<!doctype html><html ${attributes}><body><div data-testid="panel" style="transition: transform 300ms">Panel</div></body></html>`,
      );
      await page.addStyleTag({ content: await built("index.css") });

      const display = await page.getByTestId("panel").evaluate(async (element) => {
        element.style.display = "none";
        await new Promise(requestAnimationFrame);

        return getComputedStyle(element).display;
      });

      expect(display).toBe("none");
    });

    /* The reset pairs its own properties with the author's durations and
       delays by position, as docs/accessibility.md says, so what survives is
       a hide that puts `opacity` first or gives every property one duration
       and no delay. Pinned so a change to the reset's order or to delays
       shows here. */
    for (const transition of ["opacity 1s, visibility 0s 1s", "visibility 1s, opacity 1s"]) {
      test(`under ${label}, ${transition} still fades before it hides`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion });
        await page.setContent(
          `<!doctype html><html ${attributes}><body><style>
          #m { transition: ${transition}; } #m.off { opacity: 0; visibility: hidden; }
        </style><div id="m" data-testid="m">Saved</div></body></html>`,
        );
        await page.addStyleTag({ content: await built("index.css") });

        const running = await page.getByTestId("m").evaluate((element) => {
          element.classList.add("off");

          return Object.fromEntries(
            element.getAnimations().map((animation) => {
              const timing = animation.effect!.getTiming();

              return [(animation as CSSTransition).transitionProperty, [Number(timing.duration), timing.delay ?? 0]];
            }),
          ) as Record<string, [number, number] | undefined>;
        });
        const [visibilityDuration = Number.NaN, visibilityDelay = Number.NaN] = running.visibility ?? [];

        expect(running.opacity, "opacity fades for its own duration, at once").toEqual([1000, 0]);
        expect(visibilityDuration + visibilityDelay, "visibility holds until the fade ends").toBe(1000);
      });
    }
  }
});
/* The reset reaches the pseudo-elements a page animates outside the element
   tree: a dialog's `::backdrop`, and the view transition's tree on `:root`.
   Under reduced motion a view transition's group stops gliding between the
   two positions; under `none` everything ends at once. */
for (const [label, attributes, reducedMotion] of [
  ["the system's reduced motion", "", "reduce"],
  ['data-motion="reduce"', 'data-motion="reduce"', "no-preference"],
  ['data-motion="none"', 'data-motion="none"', "no-preference"],
] as const) {
  test.describe(`under ${label}`, () => {
    test("a backdrop's animation ends at once", async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setContent(
        `<!doctype html><html ${attributes}><body><style>
        @keyframes fade { from { opacity: 0; } }
        dialog::backdrop { animation: fade 1s forwards; }
      </style><dialog data-testid="dialog">Saved</dialog></body></html>`,
      );
      await page.addStyleTag({ content: await built("index.css") });

      /* Read from the computed style: WebKit lists no animation on a
         `::backdrop` in `getAnimations()`. */
      const duration = await page.getByTestId("dialog").evaluate((element: HTMLDialogElement) => {
        element.showModal();

        return getComputedStyle(element, "::backdrop").animationDuration;
      });

      expect(Number.parseFloat(duration)).toBeLessThan(0.001);
    });

    test("a view transition does not move", async ({ page }) => {
      await page.emulateMedia({ reducedMotion });
      await page.setContent(
        `<!doctype html><html ${attributes}><body><style>
        #box { view-transition-name: box; width: 50px; height: 50px; background: red; }
      </style><div id="box" data-testid="box"></div></body></html>`,
      );
      await page.addStyleTag({ content: await built("index.css") });

      const durations = await page.getByTestId("box").evaluate(async (element) => {
        if (!("startViewTransition" in document)) {
          return null;
        }

        const transition = document.startViewTransition(() => {
          element.style.marginLeft = "300px";
        });

        await transition.ready;

        return Object.fromEntries(
          document
            .getAnimations()
            .map((animation) => [
              (animation.effect as KeyframeEffect).pseudoElement,
              animation.effect!.getComputedTiming().duration,
            ])
            .filter(([pseudo]) => String(pseudo).startsWith("::view-transition")),
        );
      });

      test.skip(durations === null, "the engine has no view transitions");
      expect(Object.keys(durations!).length, "the group and its two images animate").toBeGreaterThanOrEqual(3);
      for (const [pseudo, duration] of Object.entries(durations!)) {
        expect(Number(duration), pseudo).toBeLessThan(1);
      }
    });
  });
}
