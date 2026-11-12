import { expect, test } from "./fixtures";
import { expectSameColor, getColorDistance } from "./test-utils";

const BUTTONS_URL = "http://localhost:5184/buttons/?env=vanilla";

/* A `box` on an element the intent reset does not name has no intent slots of
   its own. `--intent-border` used to be resolved at `:root`, where no aesthetic
   sets `--ui-ink`, so under `.neobrutalism` such a box drew the theme's grey line
   and a grey slab beside a `.neutral` sibling's black ink. */
test("draws a box with no intent in the aesthetic's ink", async ({ page }) => {
  await page.goto(BUTTONS_URL);

  const values = await page.evaluate(() => {
    const host = document.createElement("div");

    host.className = "neobrutalism";
    host.innerHTML =
      '<button class="box box-hover soft edged">Bare</button><button class="box box-hover soft edged neutral">Neutral</button>';
    document.body.append(host);

    const [bare, neutral] = [...host.children].map((element) => {
      const styles = getComputedStyle(element);

      return { line: styles.borderTopColor, shadow: styles.boxShadow };
    });

    host.remove();

    return { bare: bare!, neutral: neutral! };
  });

  expect(values.bare.line).toBe(values.neutral.line);
  expect(values.bare.shadow).toBe(values.neutral.shadow);
});

/* With no aesthetic a raised button's depth is the plain step's offset, and
   the press read it from nowhere: `0 1px 3px` at rest and on hover, `0 0 3px`
   held down. */
test("keeps a raised button's vertical offset while it is pressed", async ({ page }) => {
  await page.goto(BUTTONS_URL);

  await page.evaluate(() => {
    const target = document.createElement("button");

    target.id = "press-probe";
    target.className = "btn raised";
    target.textContent = "Press";
    target.style.transition = "none";
    document.body.prepend(target);
  });

  const target = page.locator("#press-probe");
  const readShadow = () => target.evaluate((element) => getComputedStyle(element).boxShadow);

  await target.hover();
  const hovered = await readShadow();

  await page.mouse.down();
  const pressed = await readShadow();
  await page.mouse.up();

  expect(hovered).not.toBe("none");
  expect(pressed).toBe(hovered);
});

/* A component's resting defaults are privates it writes on itself, and a custom
   property inherits. `box`, `surface`, and `text-control` are typeable on their
   own, and inside a component each took whichever default it did not write
   itself: a `box` in a button filled like the button, and a surface in a card
   took the card's depth under an aesthetic that draws one. */
test("a helper inside a component rests as it does alone", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: "http://localhost:5184/native/entry-vanilla.css" });

  const read = (parent: string) =>
    page.evaluate((parentClass) => {
      document.body.innerHTML =
        `<div class="neobrutalism"><div class="${parentClass}">` +
        '<div class="box" id="box">Box</div><div class="surface" id="surface">Surface</div>' +
        '<div class="text-control" id="control">Control</div></div></div>';

      return Object.fromEntries(
        [...document.querySelectorAll("[id]")].map((element) => {
          const styles = getComputedStyle(element);

          return [element.id, [styles.backgroundColor, styles.borderTopWidth, styles.boxShadow].join(" | ")];
        }),
      );
    }, parent);

  const alone = await read("stack");

  expect(await read("btn")).toEqual(alone);
  expect(await read("card")).toEqual(alone);
  expect(await read("badge")).toEqual(alone);
});

/* Intent does not cascade, so a component with none resolves the neutral
   slots, and its ink is the page's. On a filled parent that ink sat on the
   parent's fill: a badge in a primary button read at 1.11:1, and a ghost
   button or a field in a solid primary card at 1.1:1. A filled box hands its
   own ink down, and a neutral box with no plate of its own prints in it.
   Unfilled boxes pass it on; a box with a plate of its own starts again. */
test("a neutral box with no plate prints in the ink of the plate it sits on", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: "http://localhost:5184/shared/entry-vanilla.css" });

  const read = (html: string) =>
    page.evaluate((markup) => {
      document.body.innerHTML = markup;

      const styles = (selector: string) => {
        const computed = getComputedStyle(document.querySelector(selector)!);

        return { color: computed.color, line: computed.borderTopColor };
      };

      return { plate: styles("[data-plate]"), child: styles("[data-child]") };
    }, html);
  const alone = async (child: string) => (await read(`<div data-plate>${child}</div>`)).child;

  const onPlate = [
    ['<button class="btn primary" data-plate>', '<span class="badge" data-child>3</span>', "</button>"],
    ['<div class="card solid primary" data-plate>', '<button class="btn ghost" data-child>Go</button>', "</div>"],
    ['<div class="card solid primary" data-plate>', '<input class="ipt" data-child />', "</div>"],
    ['<div class="alert solid destructive" data-plate>', '<button class="btn ghost" data-child>Go</button>', "</div>"],
    [
      '<div class="card solid primary" data-plate><div class="input-group"><span>@</span>',
      '<input class="ipt" data-child />',
      "</div></div>",
    ],
    [
      '<div class="card solid primary" data-plate><div class="box">',
      '<button class="btn ghost" data-child>Go</button>',
      "</div></div>",
    ],
  ] as const;

  for (const [open, child, close] of onPlate) {
    // oxlint-disable-next-line no-await-in-loop -- one fixture on the page at a time.
    const styles = await read(open + child + close);

    expectSameColor(styles.child.color, styles.plate.color, `${open} ${child} ink`);
  }

  const edged = await read(
    '<div class="card solid primary" data-plate><button class="btn ghost edged" data-child>Go</button></div>',
  );

  expectSameColor(edged.child.line, edged.plate.color, "a neutral line on a plate is drawn in its ink");

  const ownInk = [
    /* An intent keeps its own ink: intent does not cascade, either way. */
    [
      '<div class="card solid primary" data-plate>',
      '<button class="btn ghost success" data-child>Go</button>',
      "</div>",
    ],
    /* An unfilled parent has no plate, so its intent's ink stays its own. */
    ['<div class="alert success" data-plate>', '<button class="btn ghost" data-child>Go</button>', "</div>"],
    /* A child with a plate of its own prints on that plate. */
    ['<button class="btn primary" data-plate>', '<kbd class="kbd" data-child>K</kbd>', "</button>"],
    ['<div class="card solid primary" data-plate>', '<button class="btn" data-child>Go</button>', "</div>"],
    /* A surface is a plate, so what is inside it starts again. */
    [
      '<div class="card solid primary" data-plate><div class="card ghost">',
      '<button class="btn ghost" data-child>Go</button>',
      "</div></div>",
    ],
  ] as const;

  for (const [open, child, close] of ownInk) {
    // oxlint-disable-next-line no-await-in-loop -- one fixture on the page at a time.
    const styles = await read(open + child + close);
    const wrapper = open.includes("card ghost") ? `<div class="card ghost">${child}</div>` : child;
    // oxlint-disable-next-line no-await-in-loop -- as above.
    const reference = await alone(wrapper);

    expect(getColorDistance(styles.child.color, reference.color), `${open} ${child} keeps its ink`).toBeLessThanOrEqual(
      2,
    );
  }
});

/* A touch screen has no pointer to rest on an element, yet a tap leaves the
   element in `:hover` until something else is tapped, so a hover tint stuck
   on whatever was last touched. Tailwind's `hover:` variant applies only under
   `(hover: hover)` for this reason, and the hover responses follow it. A
   context of its own, because touch emulation is set when one is created.

   Whether a tap leaves its element in `:hover` is the engine's own choice:
   Chromium does on Windows and did not in CI's Linux image. Where it does not,
   the pointer is moved onto the element instead, which reaches `:hover` the
   same way while the page still reports no hover-capable pointer. */
test("leaves no hover tint on what a touch screen tapped", async ({ browser, browserName }) => {
  const context = await browser.newContext({ hasTouch: true, isMobile: browserName !== "firefox" });
  const page = await context.newPage();
  const settle = () =>
    page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );

  await page.goto(BUTTONS_URL);
  // The shared fixture's `goto` waits this out; a page of the test's own does not.
  await settle();
  expect(await page.evaluate(() => matchMedia("(hover: hover)").matches), "a touch page has no hover").toBe(false);
  await page.evaluate(() => {
    const host = document.createElement("div");

    host.id = "touch-probe";
    host.innerHTML = `
      <button class="btn primary soft" data-pair="button">Tapped</button>
      <button class="btn primary soft" data-pair="button">Untouched</button>
      <div class="card interactive soft" data-pair="card">Tapped</div>
      <div class="card interactive soft" data-pair="card">Untouched</div>
      <table class="data-table"><tbody>
        <tr><td data-pair="row">Tapped</td></tr>
        <tr><td data-pair="row">Untouched</td></tr>
      </tbody></table>
      <input type="checkbox" class="checkbox" data-pair="checkbox" checked aria-label="Tapped" />
      <input type="checkbox" class="checkbox" data-pair="checkbox" aria-label="Untouched" />`;
    /* WebKit, as iOS does, puts a tapped element in `:hover` only when it
       answers clicks, and an interactive card or row does. The tapped checkbox
       starts checked, so the tap leaves both unchecked. */
    for (const element of host.querySelectorAll<HTMLElement>("[data-pair]")) {
      element.style.transition = "none";
      element.addEventListener("click", () => {});
    }
    document.body.prepend(host);
  });

  const read = (element: Element) => {
    const style = getComputedStyle(element);

    return `${style.backgroundColor} ${style.borderColor}`;
  };
  const hovered = (element: Element) => element.matches(":hover");

  /* oxlint-disable no-await-in-loop -- each tap moves `:hover`, so they run in order. */
  for (const pair of ["button", "card", "row", "checkbox"]) {
    const [tapped, untouched] = await page.locator(`#touch-probe [data-pair="${pair}"]`).all();

    await tapped!.tap();
    await settle();
    if (!(await tapped!.evaluate(hovered))) {
      await tapped!.hover();
      await settle();
    }

    expect(await tapped!.evaluate(hovered), `${pair} is in :hover after a tap`).toBe(true);
    expect(await tapped!.evaluate(read), pair).toBe(await untouched!.evaluate(read));
  }
  /* oxlint-enable no-await-in-loop */

  await context.close();
});
