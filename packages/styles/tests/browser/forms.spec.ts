import { readFile } from "node:fs/promises";

import { expect, test } from "./fixtures";
import {
  BUTTON_INTENT_TOKENS,
  expectSameColor,
  flattenColor,
  getColorDistance,
  getContrastRatio,
  isTransparent,
  ORIGIN,
  readSrgb,
  stopTransitions,
} from "./test-utils";

const FORMS_URL = `${ORIGIN}/forms/?env=vanilla`;

/* Matrix rows name a fill and an edge, and the test id joins them with a dash the
   way `playground/shared/matrix.js` does. */
const slug = (presentation: string) => presentation.replace(/\s+/gu, "-");

test.describe("forms", () => {
  /* An invalid control is destructive, and it has to be destructive over an
     intent class rather than under one. The rule that says so once had to be
     unlayered: nested in `@utility text-control` it landed in the utilities
     layer while the intent reset sat in no layer at all, and unlayered beats
     layered at any specificity. When the control classes joined the reset,
     every invalid field drew a plain grey line and the only thing still marking
     the error was the hint underneath it. Intent now sits in `components` and
     the rule in `utilities` at 0-2-0 (docs/internal/model.md#cascade-layers). Asserting
     "not transparent" is what let that through, so this names the color. */
  test("marks an invalid control destructive over any intent class", async ({ page }) => {
    await page.goto(FORMS_URL);

    const values = await page.evaluate(() => {
      /* Drawn at the same fraction the resting line takes, because that is what
         the control paints -- comparing against the whole tone would report a
         quiet destructive line as the wrong color rather than a lighter one. */
      const control = document.createElement("input");

      control.className = "ipt";
      document.body.append(control);

      const probe = document.createElement("span");

      probe.style.setProperty("--_line-rest", getComputedStyle(control).getPropertyValue("--_line-rest"));
      probe.style.color = "color-mix(in oklab, var(--color-destructive) var(--_line-rest), transparent)";
      document.body.append(probe);

      const destructive = getComputedStyle(probe).color;

      probe.remove();
      control.remove();

      const host = document.querySelector('[data-testid="preview-root"]')!;
      const overridden = document.createElement("input");

      overridden.className = "ipt success";
      overridden.setAttribute("aria-invalid", "true");
      host.append(overridden);

      const read = (element: Element) => getComputedStyle(element).borderColor;
      const result = {
        destructive,
        overridden: read(overridden),
        plain: read(document.querySelector('[data-testid="invalid-input"]')!),
      };

      overridden.remove();

      return result;
    });

    expectSameColor(values.plain, values.destructive, "invalid control border");
    expectSameColor(values.overridden, values.destructive, "invalid control border under .success");
  });

  /* Presentation cascades by design, so `.solid` on a container reaches the
     inputs inside it, and an input filled 100% with the text colour has text the
     same colour as its background. Our own cascade produced that, so our own
     `min()` answers it -- the one bound the model keeps. The edge is drawn
     whatever the edge class says, for the same reason: a container's `.edgeless`
     would otherwise leave a field with no mark of where typing goes. */
  test("caps text control fill and keeps its edge whatever the container says", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const read = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
      const host = document.createElement("div");
      const inherited = document.createElement("input");

      host.className = "solid edgeless";
      inherited.className = "ipt";
      host.append(inherited);
      document.querySelector('[data-testid="preview-root"]')!.append(host);

      const inheritedStyles = getComputedStyle(inherited);
      const result = {
        ghost: read("ipt-ghost-edged-none").backgroundColor,
        default: read("ipt-default-none").backgroundColor,
        inheritedBackground: inheritedStyles.backgroundColor,
        inheritedBorderColor: inheritedStyles.borderTopColor,
        inheritedBorderWidth: inheritedStyles.borderTopWidth,
        soft: read("ipt-soft-edged-none").backgroundColor,
        solid: read("ipt-solid-none").backgroundColor,
      };

      host.remove();

      return result;
    });

    /* `.solid` clamps far below a saturated fill, and above `.soft`, because
       each names its own cap. Both are the element's own class, which is a
       consumer describing what they want; the 6% cap underneath them is for the
       container that cascades onto a field nobody classed. */
    expect(readSrgb(styles.solid).alpha, "solid input clamps").toBeLessThan(0.5);
    expect(readSrgb(styles.solid).alpha, "and above the tint soft names").toBeGreaterThan(readSrgb(styles.soft).alpha);
    expect(getColorDistance(styles.solid, styles.default)).toBeGreaterThan(1);
    /* `.ghost` is the published resting fill, so it lands on the default. */
    expectSameColor(styles.ghost, styles.default, "ghost input is the resting fill");

    /* The cascade case, and the reason the two caps are not one number. A
       `.solid` container reaching a field nobody classed gets the 6% cap; the
       field wearing `.solid` itself gets the 20% its own class names. The
       cascaded fill is therefore quieter than the declared one, which is the
       whole shape of the element-versus-cascade split.

       Asserting these were equal is what let the inversion sit: with one cap for
       both, `.solid` was pinned to the cascade value and `.soft` walked past it. */
    expect(readSrgb(styles.inheritedBackground).alpha, "a cascaded solid is quieter than a declared one").toBeLessThan(
      readSrgb(styles.solid).alpha,
    );
    expect(readSrgb(styles.inheritedBackground).alpha, "and quieter than soft").toBeLessThan(
      readSrgb(styles.soft).alpha,
    );
    expect(Number.parseFloat(styles.inheritedBorderWidth)).toBeGreaterThan(0);
    expect(isTransparent(styles.inheritedBorderColor)).toBe(false);
  });

  /* The browser paints the open list over the select's own background, and a
     ghost select has none, so the options carry an opaque ground of their own
     that their text reads on, in both themes, at the 4.5:1 WCAG 1.4.3 asks of
     normal text. */
  test("paints a select's options on an opaque ground their text reads on", async ({ page }) => {
    await page.goto(FORMS_URL);

    for (const theme of ["light", "dark"]) {
      // oxlint-disable-next-line no-await-in-loop -- one theme, then the other, on one page.
      const option = await page.evaluate((name) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(name);
        const select = document.createElement("select");

        select.className = "select";
        select.innerHTML = "<option>One</option>";
        document.querySelector('[data-testid="preview-root"]')!.append(select);
        const styles = getComputedStyle(select.options[0]!);
        const result = { background: styles.backgroundColor, color: styles.color };

        select.remove();
        return result;
      }, theme);

      expect(readSrgb(option.background).alpha, `${theme} ground`).toBe(1);
      expect(getContrastRatio(option.color, option.background), `${theme} text on ground`).toBeGreaterThanOrEqual(4.5);
    }
  });

  /* Typed text is printed on a page: a ghost field shows the page through, and
     even a solid one is a light wash. `--intent-color` is a fill colour and
     reads below 4.5:1 there for several intents -- warning at 3.06:1 in light,
     success, destructive (and so an invalid field), and info near 3.1-3.7:1 in
     dark -- so the text takes `--intent-strong`, measured here on the field's
     rendered ground for every intent, both themes, and each presentation. */
  test("prints typed text and placeholders at 4.5:1 on their field, on the page and on a plate", async ({ page }) => {
    await page.goto(FORMS_URL);

    for (const theme of ["light", "dark"]) {
      // oxlint-disable-next-line no-await-in-loop -- one theme, then the other, on one page.
      const fields = await page.evaluate((name) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(name);
        const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
        /* The nearest painted ancestor: the page the field shows through. */
        const ground = (element: Element) => {
          for (let node: Element | null = element; node; node = node.parentElement) {
            const color = getComputedStyle(node).backgroundColor;
            if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
              return color;
            }
          }
          return getComputedStyle(document.documentElement).backgroundColor;
        };
        const results: { label: string; color: string; background: string; page: string; hint?: string }[] = [];
        const intents = ["", "neutral", "primary", "secondary", "success", "warning", "destructive", "info"];
        const controls = {
          ipt: '<input class="ipt CLASSES" ATTRS value="Typed" placeholder="Hint" />',
          textarea: '<textarea class="textarea CLASSES" ATTRS placeholder="Hint">Typed</textarea>',
          select: '<select class="select CLASSES" ATTRS><option>Typed</option></select>',
        };

        /* A neutral field held by a solid surface prints in the surface's ink,
           and its placeholder has to as well: the page's grey read at 1 to 3:1
           on the surface's fill. */
        const plates = ["", "card solid primary", "card solid success", "card solid warning"];

        for (const [control, template] of Object.entries(controls)) {
          for (const presentation of ["ghost", "soft", "solid"]) {
            for (const state of [...intents, "invalid"]) {
              /* A field with an intent keeps its own ink, on a plate too. */
              for (const plate of state === "" || state === "neutral" ? plates : [""]) {
                const wrapper = document.createElement("div");
                wrapper.className = plate;
                const classes = `${presentation} ${state === "invalid" ? "" : state}`;
                wrapper.innerHTML = template
                  .replace("CLASSES", classes)
                  .replace("ATTRS", state === "invalid" ? 'aria-invalid="true"' : "");
                host.append(wrapper);
                const field = wrapper.firstElementChild!;
                const styles = getComputedStyle(field);
                results.push({
                  label: `${name} .${control}.${presentation}${state ? ` ${state}` : ""}${plate ? ` in .${plate.replaceAll(" ", ".")}` : ""}`,
                  color: styles.color,
                  background: styles.backgroundColor,
                  page: ground(wrapper),
                  hint: control === "select" ? undefined : getComputedStyle(field, "::placeholder").color,
                });
                wrapper.remove();
              }
            }
          }
        }

        return results;
      }, theme);

      for (const field of fields) {
        const ratio = getContrastRatio(field.color, flattenColor(field.background, field.page));
        expect.soft(ratio, `${field.label} typed text`).toBeGreaterThanOrEqual(4.5);
        if (field.hint) {
          const hint = getContrastRatio(field.hint, flattenColor(field.background, field.page));
          expect.soft(hint, `${field.label} placeholder`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  /* `none` is only valid as an entire `box-shadow` value. Composing a focus ring
     as `<ring>, var(--ui-shadow, none)` makes the whole declaration invalid, so
     the ring silently disappears. Asserted on a real focus because that is the
     only state where the composed list applies. */
  test("keeps a focus ring on text controls", async ({ page }) => {
    await page.goto(FORMS_URL);

    // Focus moves between controls, so these must be read one at a time.
    const readFocused = async (testId: string) => {
      await page.getByTestId(testId).focus();

      return page.getByTestId(testId).evaluate((element) => {
        const computed = getComputedStyle(element);

        return { borderColor: computed.borderTopColor, boxShadow: computed.boxShadow };
      });
    };

    const neutral = await readFocused("ipt-default-none");
    const intent = await readFocused("ipt-default-success");

    for (const [label, styles] of [
      ["neutral", neutral],
      ["success", intent],
    ] as const) {
      expect(styles.boxShadow, `${label} focus ring`).not.toBe("none");
      expect(styles.boxShadow, `${label} focus ring`).toContain("px");
      expect(isTransparent(styles.borderColor), `${label} focus border`).toBe(false);
    }
  });

  test("moves the control border on hover", async ({ page }) => {
    await page.goto(FORMS_URL);

    const resting = await page
      .getByTestId("ipt-default-success")
      .evaluate((element) => getComputedStyle(element).borderTopColor);

    await page.getByTestId("ipt-default-success").hover();

    await expect
      .poll(async () =>
        getColorDistance(
          await page.getByTestId("ipt-default-success").evaluate((element) => getComputedStyle(element).borderTopColor),
          resting,
        ),
      )
      .toBeGreaterThan(2);
  });

  /* Three fills, three boxes, told apart by the tint alone: `.ghost` fills
     nothing, `.soft` takes the 12% it names, `.solid` takes the 6% cap. All
     three keep their line, because the line is the edge axis's business and no
     fill class reaches it any more. `.soft` used to draw none, which was the
     package's other fill-decides-an-edge exception; the sunk field it produced
     is now spelled `.soft.edgeless`, asserted below.

     Alphas rather than colors, because every tint is mixed toward `transparent`
     and its strength *is* its alpha. */
  test("separates a text control's three fills by tint, and leaves every line alone", async ({ page }) => {
    await page.goto(FORMS_URL);

    const read = await page.evaluate(() => {
      const host = document.createElement("div");

      host.innerHTML = `
        <input class="ipt ghost" type="text" />
        <input class="ipt soft" type="text" />
        <input class="ipt solid" type="text" />
        <input class="ipt success solid" type="text" />`;
      document.body.append(host);

      const values = [...host.querySelectorAll("input")].map((input) => {
        const styles = getComputedStyle(input);

        return { fill: styles.backgroundColor, line: styles.borderTopColor, width: styles.borderTopWidth };
      });

      host.remove();

      return values;
    });

    const [ghost, soft, solid, colored] = read.map((entry) => ({ ...entry, alpha: readSrgb(entry.fill).alpha }));

    /* The three fills are ordered, which they were not until each named its own
       cap. `.soft` used to bypass the cap and take 12% while `.solid` was left on
       the 6% one written for a container's cascade, so the louder name rendered
       the quieter box. The ordering is the assertion; the values are in the
       registry. */
    expect(ghost.alpha, "ghost fills nothing").toBe(0);
    expect(soft.alpha, "soft tints").toBeGreaterThan(0);
    expect(solid.alpha, "solid tints more than soft").toBeGreaterThan(soft.alpha);
    /* One cap for every intent, where the text family used to land lower. */
    expect(colored.alpha, "a colored solid takes the same cap").toBeCloseTo(solid.alpha, 2);
    /* Nowhere near a filled chip, which is what the cap is for. */
    expect(solid.alpha, "and stays far below a real fill").toBeLessThan(0.5);

    /* Every fill keeps its line, and every one keeps its width, so the geometry
       never moves between them. */
    for (const entry of [ghost, soft, solid, colored]) {
      expect(isTransparent(entry.line), `${entry.fill} line`).toBe(false);
    }

    for (const entry of [ghost, soft, solid, colored]) {
      expect(Number.parseFloat(entry.width), `${entry.fill} width`).toBeGreaterThan(0);
    }
  });

  /* The fill axis has the same element-versus-cascade split the edge axis has,
     and this is the half of it nothing else measures. A `.soft` toolbar reaching
     a field nobody classed is our own cascade, so the 6% cap answers it; `.soft`
     written on the field is a consumer naming the tint they want, so it takes the
     published 12% whole.

     Getting this backwards is not a cosmetic difference. The cap exists because a
     container's `.solid` would otherwise fill a field 100% with its own text
     colour, which is text the same colour as its background. */
  test("caps a cascaded fill on a text control and honours the element's own", async ({ page }) => {
    await page.goto(FORMS_URL);

    const values = await page.evaluate(() => {
      const host = document.createElement("div");

      host.innerHTML = `
        <div class="soft"><input class="ipt cascaded" type="text" /></div>
        <div class="solid"><input class="ipt flooded" type="text" /></div>
        <input class="ipt own soft" type="text" />`;
      document.body.append(host);

      const read = (selector: string) => {
        const styles = getComputedStyle(host.querySelector(selector)!);

        return { fill: styles.backgroundColor, line: styles.borderTopColor };
      };
      const result = { cascaded: read(".cascaded"), flooded: read(".flooded"), own: read(".own") };

      host.remove();

      return result;
    });

    const alpha = (color: string) => readSrgb(color).alpha;

    /* The element's own `.soft` outruns anything a container cascades. */
    expect(alpha(values.own.fill), "own .soft takes the published tint").toBeGreaterThan(alpha(values.cascaded.fill));
    /* And a container's `.solid` gets the cap, not a filled field. */
    expect(alpha(values.flooded.fill), "a cascaded .solid is capped").toBeLessThan(0.2);

    /* No fill class touches the line any more, in either direction. */
    for (const [source, measured] of Object.entries(values)) {
      expect(isTransparent(measured.line), `${source} keeps its line`).toBe(false);
    }
  });

  /* `text-control` used to carry `&:focus { @apply outline-none }`, which reads
     as "no ring when clicked". A rule nested in `@utility` lands in the
     utilities layer, `reset.css` declares `:focus-visible` in `@layer base`, and
     utilities beat base -- so it took the keyboard ring with it and a text
     control was the only classed thing in the package that focused with no ring
     at all. Both signals are asserted, because the border alone is what the bug
     left behind and it passed for a focus indicator. */
  test("rings a focused text control and moves its line to the intent", async ({ page }) => {
    await page.goto(FORMS_URL);

    const expected = await page.evaluate(() => {
      const probe = document.createElement("div");

      probe.style.color = "var(--focus-ring, color-mix(in srgb, var(--color-primary) 64%, transparent))";
      document.body.append(probe);

      const value = getComputedStyle(probe).color;

      probe.remove();

      return value;
    });

    const input = page.getByTestId("field-email-standard");
    const restingLine = await input.evaluate((element) => getComputedStyle(element).borderTopColor);

    await input.focus();
    const readFocused = () =>
      input.evaluate((element) => {
        const styles = getComputedStyle(element);

        return {
          line: styles.borderTopColor,
          outlineColor: styles.outlineColor,
          outlineStyle: styles.outlineStyle,
          outlineWidth: styles.outlineWidth,
        };
      });

    await expect
      .poll(async () => (await readFocused()).line, { message: "focused control line" })
      .not.toBe(restingLine);
    const focused = await readFocused();

    expect(focused.outlineStyle, "the ring is drawn").toBe("solid");
    expect(Number.parseFloat(focused.outlineWidth), "at the token width").toBeGreaterThanOrEqual(2);
    expectSameColor(focused.outlineColor, expected, "focus ring color");
    expect(focused.line, "and the line moves off its resting tone").not.toBe(restingLine);
  });

  /* A text control rests transparent, so its border is the only thing marking
     where typing goes. It rests quiet on purpose and does not clear the 3:1 WCAG
     1.4.11 asks of a control boundary -- that tone reads as a box drawn on the
     page. What is asserted is the shape of the decision rather than the number:
     the resting line is heavier than the plain border token it used to take, and
     the pointer brings a line far heavier still, so the field answers when it is
     reached for. Measured in both themes because one choice has to work on both
     grounds. */
  test("rests a control line quiet and brings a much heavier one on hover", async ({ page }) => {
    const expectALine = async (theme: string) => {
      await page.goto(FORMS_URL);

      const ground = await page.evaluate((name) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(name);

        const host = document.createElement("div");

        host.id = "line-probe";
        host.innerHTML = `<input class="ipt" type="text" />`;
        document.body.append(host);

        return {
          page: getComputedStyle(document.body).backgroundColor,
          resting: getComputedStyle(host.querySelector("input")!).borderTopColor,
        };
      }, theme);

      const restingRatio = getContrastRatio(flattenColor(ground.resting, ground.page), ground.page);

      await page.locator("#line-probe input").hover();
      const input = page.locator("#line-probe input");
      const readHovered = () => input.evaluate((element) => getComputedStyle(element).borderTopColor);

      /* Flattened against the page before measuring. The resting line is drawn
         at `--_line-rest` of the intent, so it carries an alpha, and a contrast
         ratio taken on the unflattened value reports the tone the line would be
         at full strength -- which is the thing this test exists to show it is
         not. */
      await expect
        .poll(async () => getContrastRatio(flattenColor(await readHovered(), ground.page), ground.page), {
          message: `${theme} hovered line`,
        })
        .toBeGreaterThan(restingRatio * 1.5);
      await page.locator("#line-probe").evaluate((element) => element.remove());
    };

    await expectALine("light");
    await expectALine("dark");
  });

  test("applies intent classes to checked toggles", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const read = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      const intents = ["primary", "secondary", "success", "warning", "destructive", "info"];
      const tokens: Record<string, string> = {
        destructive: resolveToken("destructive"),
        info: resolveToken("info"),
        primary: resolveToken("primary"),
        secondary: resolveToken("accent"),
        success: resolveToken("success"),
        warning: resolveToken("warning"),
      };

      return intents.flatMap((intent) =>
        ["checkbox", "switch"].map((component) => {
          const styles = read(`${component}-default-${intent}-checked`);

          return {
            /* Both fill with the intent, because the checked state is one rule
               on `text-control` rather than two per-component ones. The radio
               opts out of the fill and is measured in its own test. */
            intentColor: styles.backgroundColor,
            label: `${component} ${intent}`,
            token: tokens[intent]!,
          };
        }),
      );
    });

    for (const { intentColor, label, token } of styles) {
      expectSameColor(intentColor, token, label);
    }
  });

  test("uses the neutral text token for a checked toggle with no intent", async ({ page }) => {
    await page.goto(FORMS_URL);

    const values = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "var(--color-text)";
      document.body.append(probe);
      const tokenText = getComputedStyle(probe).color;
      probe.remove();

      const background = (testId: string) =>
        getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!).backgroundColor;

      return {
        checkbox: background("checkbox-default-none-checked"),
        switch: background("switch-default-none-checked"),
        tokenText,
      };
    });

    expectSameColor(values.checkbox, values.tokenText, "checked checkbox background");
    expectSameColor(values.switch, values.tokenText, "checked switch background");
  });

  /* The mark has to read on the fill it is printed on, and the two intents that
     resolve to the neutral family are where that stopped being true: pointing
     neutral's `--intent-contrast` at the ink -- correct for a capped plate --
     made a checked box a black square with a black tick, because a checked
     toggle lifts the cap by definition. Both themes, both spellings of neutral.

     3:1 is the bound for a graphical object (WCAG 1.4.11) rather than the 4.5:1
     a label would owe. The failure it exists to catch measured 1.0. */
  test("keeps a checked toggle's mark legible on its own fill", async ({ page }) => {
    await page.goto(FORMS_URL);

    const marks = await page.evaluate(() => {
      const intents = ["none", "neutral", "primary", "secondary", "success", "warning", "destructive", "info"];

      return intents.flatMap((intent) =>
        ["checkbox", "switch"].map((component) => {
          const styles = getComputedStyle(
            document.querySelector(`[data-testid="${component}-default-${intent}-checked"]`)!,
          );

          return { fill: styles.backgroundColor, label: `${component} ${intent}`, mark: styles.color };
        }),
      );
    });

    for (const { fill, label, mark } of marks) {
      expect(readSrgb(fill).alpha, `${label} fill`).toBe(1);
      expect(getContrastRatio(mark, fill), `${label} mark`).toBeGreaterThanOrEqual(3);
    }
  });

  /* `:checked` declares a full fill and full contrast ink, and `box` ramps the
     ink against the bounded fill before `--ui-bg-alpha` thins it. Ramped after,
     `.glass`'s 0.8 would print the mark 60% of the way to the contrast tone on
     an 80% plate, from a quiet presentation that asked for no ink at all. The
     alpha is set inline rather than through `.glass`, because Chromium here
     reports reduced transparency and glass then goes opaque. */
  test("keeps a checked toggle's full contrast ink on a thinned plate", async ({ page }) => {
    await page.goto(FORMS_URL);

    const marks = await page.evaluate(() =>
      ["none", "primary", "success"].flatMap((intent) =>
        ["checkbox", "switch"].map((component) => {
          const opaque = document.querySelector<HTMLInputElement>(
            `[data-testid="${component}-default-${intent}-checked"]`,
          )!;
          const region = document.createElement("div");
          region.className = "ghost";
          region.style.setProperty("--ui-bg-alpha", "0.8");
          const thinned = opaque.cloneNode() as HTMLInputElement;
          thinned.checked = true;
          region.append(thinned);
          document.body.append(region);

          const result = {
            label: `${component} ${intent}`,
            opaqueMark: getComputedStyle(opaque).color,
            thinnedFill: getComputedStyle(thinned).backgroundColor,
            thinnedMark: getComputedStyle(thinned).color,
          };
          region.remove();
          return result;
        }),
      ),
    );

    for (const { label, opaqueMark, thinnedFill, thinnedMark } of marks) {
      expect(readSrgb(thinnedFill).alpha, `${label} fill`).toBeCloseTo(0.8, 2);
      expectSameColor(thinnedMark, opaqueMark, `${label} mark`);
    }
  });

  /* A switch's three resting fills used to render as two looks, so the
     component varied its *line* per fill class instead -- the only place in
     the package where a fill class decided an edge, and the reason `.soft`
     meant something different on a switch than on anything else. Raising the
     fill cap to 40% retired it.

     This is the assertion that rule is gone: the resting fills separate as
     fills, and the line is drawn under every one of them. `axes.spec.ts`
     measures how far apart the fills land; this measures that each is
     distinct and that none of them reaches the line.

     The checked track is measured under each because a fill class leaking into
     the edge would cut a page-colored ring out of a filled track. It is the
     same track under all of them: `:checked` pins the fill rather than lifting
     the bounds and letting presentation keep composing through it (the
     stress-test pass's reversal, see model.md#a-state-declares-inputs-and-lifts-bounds-it-does-not-write-results),
     so `.solid` and `.soft` both reach the pinned plate the default does. */
  test("separates a switch's presentations by its fill and keeps the line under all of them", async ({ page }) => {
    await page.goto(FORMS_URL);

    const read = async (presentation: string) => {
      const cell = (suffix: string) =>
        page.getByTestId(`switch-${slug(presentation)}-none${suffix}`).evaluate((element) => {
          const styles = getComputedStyle(element);

          return { edge: styles.borderTopColor, fill: styles.backgroundColor };
        });

      return { checked: await cell("-checked"), resting: await cell("") };
    };

    /* A switch reads both axes, so the matrix renders a fill and an edge per
       row. `.ghost` is not among them: no toggle supports it. */
    const fallback = await read("default");
    const solid = await read("solid");
    const soft = await read("soft edged");

    /* The registry rests a switch at soft, so the two are the same element. */
    expectSameColor(fallback.resting.fill, soft.resting.fill, "resting switch fill");
    expectSameColor(fallback.resting.edge, soft.resting.edge, "resting switch line");

    /* Two fills, two tracks. The pairwise distances are measured in
       `axes.spec.ts`; what matters here is that they are not the same colour. */
    expect(isTransparent(solid.resting.fill), "solid switch track").toBe(false);
    expect(isTransparent(soft.resting.fill), "soft switch track").toBe(false);
    expect(getColorDistance(soft.resting.fill, solid.resting.fill), "soft vs solid track").toBeGreaterThan(2);

    /* The edge floor, under every fill. This is what the removed exception used
       to break: `.soft` and `.ghost` each pinned the line transparent. */
    for (const { label, resting } of [
      { label: "solid", resting: solid.resting },
      { label: "soft", resting: soft.resting },
    ]) {
      expect(isTransparent(resting.edge), `${label} switch line`).toBe(false);
    }

    /* The checked track is pinned now, so `.solid` and `.soft` both match the
       default rather than `.soft` staying a quieter track of its own. */
    expect(
      getColorDistance(soft.checked.fill, solid.checked.fill),
      "a checked soft switch is the same plate as a checked solid one",
    ).toBeLessThanOrEqual(2);

    for (const { checked, label } of [
      { checked: solid.checked, label: "solid" },
      { checked: soft.checked, label: "soft" },
    ]) {
      expectSameColor(checked.fill, fallback.checked.fill, `checked ${label} switch track`);
      expectSameColor(checked.edge, fallback.checked.edge, `checked ${label} switch line`);
    }

    /* Hover moves the line tone to `--intent-hover` for every fill now, where it
       used to reveal a line on `.soft` and do nothing at all on `.bare`. The line
       transitions, so this polls rather than reading the first frame.

       Both probes are edged rows. A `.soft.edgeless` switch has no line at rest
       -- that is the element's own `.edgeless` lowering the floor, working -- so
       there is nothing there for a hover to move.

       Sequential by necessity rather than by oversight: there is one pointer, so
       the two cannot be hovered at once. */
    const control = (presentation: string) => page.getByTestId(`switch-${slug(presentation)}-none`);
    const readEdge = (presentation: string) =>
      control(presentation).evaluate((element) => getComputedStyle(element).borderTopColor);
    const expectHoverMoves = async (presentation: string) => {
      const resting = await readEdge(presentation);

      await control(presentation).hover();
      await expect
        .poll(async () => getColorDistance(await readEdge(presentation), resting), {
          message: `hovered ${presentation} switch line moves`,
        })
        .toBeGreaterThan(2);
    };

    await expectHoverMoves("soft edged");
    await expectHoverMoves("solid");
  });

  /* A checkbox states itself by filling and cutting a tick out of the ground; a
     radio states itself with a dot inside a ring, thickened to twice the
     resting line. That ring still takes the intent whole regardless of
     presentation -- it always has, `:checked` sets `--_line-tone` directly on
     `radio` rather than composing it from a fill class. The plate behind the
     dot no longer varies by presentation the way it used to (a `.soft` radio
     used to stay a light ring-and-dot, `.solid` a filled circle): `:checked`
     now pins the fill the same way it does on a checkbox or a switch, so
     `.soft` reaches the same filled circle `.solid` does, and the dot -- which
     takes `box`'s composed foreground rather than a color pinned to the
     intent -- stays readable against it either way. */
  test("thickens and colors a checked radio's ring by intent, and pins its plate whatever the presentation", async ({
    page,
  }) => {
    await page.goto(FORMS_URL);

    const radios = await page.evaluate(() => {
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const tokens: Record<string, string> = {
        destructive: resolveToken("destructive"),
        info: resolveToken("info"),
        neutral: resolveToken("text"),
        none: resolveToken("text"),
        primary: resolveToken("primary"),
        secondary: resolveToken("accent"),
        success: resolveToken("success"),
        warning: resolveToken("warning"),
      };

      return Object.keys(tokens).flatMap((intent) =>
        ["soft", "solid"].map((presentation) => {
          const checked = getComputedStyle(
            document.querySelector(`[data-testid="radio-${presentation}-${intent}-checked"]`)!,
          );
          const resting = getComputedStyle(document.querySelector(`[data-testid="radio-${presentation}-${intent}"]`)!);

          return {
            dot: checked.color,
            fill: checked.backgroundColor,
            label: `radio ${presentation} ${intent}`,
            restingWidth: Number.parseFloat(resting.borderTopWidth),
            ring: checked.borderTopColor,
            ringWidth: Number.parseFloat(checked.borderTopWidth),
            token: tokens[intent]!,
          };
        }),
      );
    });

    for (const radio of radios) {
      /* The pin, not a tint: `.soft` and `.solid` both reach the same, near-full
         plate once checked. */
      expect(readSrgb(radio.fill).alpha, `${radio.label} fill`).toBeGreaterThan(0.9);
      expect(getColorDistance(radio.fill, radio.dot), `${radio.label} dot is not its own ground`).toBeGreaterThan(20);
      expectSameColor(radio.ring, radio.token, `${radio.label} ring`);
      expect(radio.ringWidth, `${radio.label} ring width`).toBeGreaterThan(radio.restingWidth);
    }
  });

  /* `text-control` is documented as usable on its own, and until it joined the
     intent reset it resolved no intent at all: every slot it reads was an
     undefined `var()` inside a `color-mix()`, so `--_edge` was invalid at
     computed-value time and the `border` shorthand collapsed to `none`. The
     element that showed it was the one that sets two of the slots itself --
     an invalid control kept its line at rest and lost it on hover, because
     `--intent-hover` was the one the state does not set. */
  test("resolves an intent on a bare text control at rest and on hover", async ({ page }) => {
    await page.goto(FORMS_URL);
    /* The hovered line itself: a line that faded to `none` on hover would
       still move off the resting value for the length of the fade. */
    await stopTransitions(page);

    /* One pointer, so the two controls are measured one after the other rather
       than in parallel. */
    const expectALine = async (testId: string) => {
      const control = page.getByTestId(testId);
      const read = () => control.evaluate((element) => getComputedStyle(element).borderTopColor);
      const width = await control.evaluate((element) => getComputedStyle(element).borderTopWidth);
      const resting = await read();

      expect(Number.parseFloat(width), `${testId} border width`).toBeGreaterThan(0);
      expect(isTransparent(resting), `${testId} resting border`).toBe(false);

      await control.hover();
      const hovered = await read();

      expect(hovered, `${testId} hovered border`).not.toBe(resting);
      expect(isTransparent(hovered), `${testId} hovered border is drawn`).toBe(false);
    };

    await expectALine("text-control");
    await expectALine("text-control-invalid");
  });

  /* A toggle's closed silhouette is the only visible unchecked affordance, so a
     tint must not take it away -- directly or through the cascade. */
  test("keeps unchecked toggle boundaries under direct and inherited fills", async ({ page }) => {
    await page.goto(FORMS_URL);

    const boundaries = await page.evaluate(() => {
      const results: { borderColor: string; borderWidth: string; label: string }[] = [];
      const host = document.querySelector('[data-testid="preview-root"]')!;

      for (const component of ["checkbox", "radio"]) {
        for (const fill of ["soft", "ghost"]) {
          /* `.ghost` is unsupported on a toggle, so there is no matrix cell for
             it and only the cascade case exists. That case is the one that
             matters here: a container can still hand a toggle a fill it does not
             support, and the silhouette has to survive it. */
          const direct = document.querySelector(`[data-testid="${component}-${fill}-none"]`);
          const inheritedHost = document.createElement("div");
          const inherited = document.createElement("input");

          inheritedHost.className = fill;
          inherited.className = component;
          inherited.type = component;
          inheritedHost.append(inherited);
          host.append(inheritedHost);

          for (const [mode, element] of [
            ["direct", direct],
            ["inherited", inherited],
          ] as const) {
            if (!element) {
              continue;
            }

            const styles = getComputedStyle(element);

            results.push({
              borderColor: styles.borderTopColor,
              borderWidth: styles.borderTopWidth,
              label: `${component} ${mode} ${fill}`,
            });
          }

          inheritedHost.remove();
        }
      }

      return results;
    });

    for (const boundary of boundaries) {
      expect(Number.parseFloat(boundary.borderWidth), `${boundary.label} width`).toBeGreaterThan(0);
      expect(isTransparent(boundary.borderColor), `${boundary.label} color`).toBe(false);
    }
  });

  /* A toggle's ring is a shadow, and the reset's outline was drawn over it a
     pixel apart, so the two blotched into one band. Under `.pixel` the inset
     focus layers -- a seven-pixel ring and a two-pixel line inside it -- covered
     all but a dot of a 16px box, so a focused unchecked box read as a filled
     one. The inset is capped two pixels past the edge, as the edge is capped. */
  test("rings a focused toggle once, and leaves its face showing under pixel", async ({ page }) => {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addStyleTag({ url: `${ORIGIN}/shared/entry-vanilla.css` });
    await stopTransitions(page);

    const read = (wrapper: string) =>
      page.evaluate(async (className) => {
        document.body.innerHTML = `<div class="${className}"><button>start</button><input type="checkbox" class="checkbox" /><input type="radio" class="radio" /><input type="checkbox" class="switch" /></div>`;

        return [...document.querySelectorAll<HTMLInputElement>("input")].map((control) => {
          control.focus({ focusVisible: true } as FocusOptions);
          const styles = getComputedStyle(control);
          const insets = [...styles.boxShadow.matchAll(/(\d+(?:\.\d+)?)px inset/g)].map((match) =>
            Number.parseFloat(match[1]!),
          );

          return {
            control: control.className,
            focusVisible: control.matches(":focus-visible"),
            outline: styles.outlineStyle,
            deepestInset: Math.max(0, ...insets),
            half: Math.min(control.offsetWidth, control.offsetHeight) / 2,
          };
        });
      }, wrapper);

    for (const toggle of await read("")) {
      expect(toggle.focusVisible, toggle.control).toBe(true);
      expect(toggle.outline, `${toggle.control}: the ring is the shadow alone`).toBe("none");
    }

    for (const toggle of await read("pixel")) {
      expect(toggle.focusVisible, toggle.control).toBe(true);
      expect(toggle.deepestInset, `${toggle.control}: the pixel focus layers stop short of the centre`).toBeLessThan(
        toggle.half - 1,
      );
      expect(toggle.deepestInset, `${toggle.control}: and are still drawn`).toBeGreaterThan(0);
    }
  });

  /* A toggle lifted the intent's cap to fill to its own, which also read as an
     intent, so on a solid surface it kept the page's ink: an unchecked box drew
     its line at 1.03 to 2.3:1 against the surface, focused it changed to the
     page's ink again, and a switch's knob was the page's grey. */
  test("draws an unchecked toggle in a solid surface's ink, at rest and focused", async ({ page }) => {
    await page.setContent('<!doctype html><html data-motion="none"><body></body></html>');
    await page.addStyleTag({
      url: `${ORIGIN}/shared/entry-vanilla.css`,
    });

    /* oxlint-disable no-await-in-loop -- one fixture on the page at a time. */
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });

      for (const intent of ["primary", "secondary", "success", "destructive", "info", "warning"]) {
        for (const component of ["checkbox", "radio", "switch"]) {
          const label = `${scheme} ${intent} ${component}`;
          await page.evaluate(
            ([name, type]) => {
              document.body.innerHTML = `<div class="card solid ${name}" id="plate"><input type="${type === "radio" ? "radio" : "checkbox"}" class="${type}" /></div>`;
            },
            [intent, component],
          );
          const read = () =>
            page.evaluate(async () => {
              await new Promise(requestAnimationFrame);
              await new Promise(requestAnimationFrame);
              const plate = getComputedStyle(document.getElementById("plate")!);
              const toggle = getComputedStyle(document.querySelector("#plate > input")!);

              return {
                ground: plate.backgroundColor,
                fill: toggle.backgroundColor,
                line: toggle.borderTopColor,
                knob: getComputedStyle(document.querySelector("#plate > input")!, "::after").backgroundColor,
              };
            });
          const ratio = (state: Awaited<ReturnType<typeof read>>, color: string) => {
            const fill = flattenColor(state.fill, state.ground);
            const ink = flattenColor(color, fill);

            return Math.min(getContrastRatio(ink, state.ground), getContrastRatio(ink, fill));
          };

          const rest = await read();
          expect(ratio(rest, rest.line), `${label} line at rest`).toBeGreaterThanOrEqual(3);
          if (component === "switch") {
            expect(ratio(rest, rest.knob), `${label} knob`).toBeGreaterThanOrEqual(3);
          }

          await page.keyboard.press("Tab");
          const focused = await read();
          expect(ratio(focused, focused.line), `${label} line focused`).toBeGreaterThanOrEqual(3);
        }
      }
    }
    /* oxlint-enable no-await-in-loop */
  });

  /* The same affordance against the other half of the axis. `text-control`
     floors the edge, so a container's `.edgeless` reaches the toggle and the
     boundary survives it -- which is the whole reason the three toggles are on
     that utility rather than on `box` directly. */
  test("keeps the unchecked toggle boundary under an edgeless container", async ({ page }) => {
    await page.goto(FORMS_URL);

    const borderColors = await page.evaluate(() =>
      ["checkbox", "radio"].map((component) => {
        const host = document.createElement("div");
        const toggle = document.createElement("input");

        host.className = "edgeless";
        toggle.className = component;
        toggle.type = component;
        host.append(toggle);
        document.querySelector('[data-testid="preview-root"]')!.append(host);

        const color = getComputedStyle(toggle).borderTopColor;

        host.remove();

        return { color, component };
      }),
    );

    for (const { color, component } of borderColors) {
      expect(isTransparent(color), `${component} edgeless boundary`).toBe(false);
    }
  });

  test("renders checkbox and switch with correct appearance and transitions", async ({ page }) => {
    await page.goto(FORMS_URL);

    const checkbox = page.getByTestId("checkbox-default-none");
    const switchElement = page.getByTestId("switch-default-none");

    await expect(checkbox).toBeVisible();
    await expect(switchElement).toBeVisible();

    const checkboxStyles = await checkbox.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        appearance: styles.appearance,
        width: styles.width,
        height: styles.height,
        cursor: styles.cursor,
      };
    });

    expect(checkboxStyles.appearance).toBe("none");
    expect(checkboxStyles.width).toBe("16px");
    expect(checkboxStyles.height).toBe("16px");
    expect(checkboxStyles.cursor).toBe("pointer");

    const switchStyles = await switchElement.evaluate((element) => {
      const styles = getComputedStyle(element);
      return {
        appearance: styles.appearance,
        width: styles.width,
        height: styles.height,
        cursor: styles.cursor,
      };
    });

    expect(switchStyles.appearance).toBe("none");
    expect(switchStyles.width).toBe("40px");
    expect(switchStyles.height).toBe("20px");
    expect(switchStyles.cursor).toBe("pointer");
  });

  test("stops a disabled toggle reacting to hover", async ({ page }) => {
    await page.goto(FORMS_URL);
    // Read after any change would have landed, not on the first frame of one.
    await stopTransitions(page);

    const expectUnmoved = async (testId: string) => {
      const element = page.getByTestId(testId);
      const before = await element.evaluate((node) => getComputedStyle(node).borderColor);

      await element.hover();

      const after = await element.evaluate((node) => getComputedStyle(node).borderColor);

      expect(after, testId).toBe(before);
    };

    await expectUnmoved("checkbox-default-none-disabled");
    await expectUnmoved("switch-default-none-disabled");
  });

  /* `box` dims a `.disabled` control like the other three spellings, so its
     line has to hold still under the pointer like theirs. */
  test("stops a field disabled by class reacting to hover", async ({ page }) => {
    await page.goto(FORMS_URL);

    const field = page.getByTestId("ipt-default-none");

    await field.evaluate((node) => {
      node.classList.add("disabled");
      node.style.transition = "none";
    });

    const before = await field.evaluate((node) => getComputedStyle(node).borderColor);

    await field.hover();

    expect(await field.evaluate((node) => getComputedStyle(node).borderColor)).toBe(before);
  });

  /* No icons ship. `.input-group` is the wrapper that owns the field box so a
     control can carry an icon element beside it -- any element, from
     `@codenhub/icons` or an inline `<svg>`. These build the markup and read what
     the group draws against what the control inside it does. */
  test("draws the box on the group and flushes the control inside it", async ({ page }) => {
    await page.goto(FORMS_URL);

    const measured = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
      const group = document.createElement("div");

      group.className = "input-group";
      group.innerHTML = `<span class="probe-affix">i</span><input class="ipt" type="email" />`;
      host.append(group);

      const groupStyles = getComputedStyle(group);
      const inputStyles = getComputedStyle(group.querySelector("input")!);
      const affixStyles = getComputedStyle(group.querySelector(".probe-affix")!);
      const values = {
        groupBorder: groupStyles.borderTopWidth,
        groupBorderColor: groupStyles.borderTopColor,
        inputBorder: inputStyles.borderTopWidth,
        inputBg: inputStyles.backgroundColor,
        inputShadow: inputStyles.boxShadow,
        inputPadLeft: inputStyles.paddingLeft,
        inputGrows: inputStyles.flexGrow,
        affixGrows: affixStyles.flexGrow,
      };

      group.remove();

      return values;
    });

    /* The group draws the boundary. */
    expect(Number.parseFloat(measured.groupBorder), "group border").toBeGreaterThan(0);
    expect(isTransparent(measured.groupBorderColor), "group border colour").toBe(false);
    /* The control inside paints none of it and gives its horizontal padding up. */
    expect(measured.inputBorder, "input border").toBe("0px");
    expect(isTransparent(measured.inputBg), "input background").toBe(true);
    expect(measured.inputShadow, "input shadow").toBe("none");
    expect(measured.inputPadLeft, "input horizontal padding").toBe("0px");
    /* The control stretches; the adornment does not. */
    expect(measured.inputGrows, "input grows").toBe("1");
    expect(measured.affixGrows, "affix does not grow").toBe("0");
  });

  /* The group floors its own line at full, so a container's `.edgeless` cannot
     erase the field. That floor once inherited into a button nested in the
     group: a ghost clear button, which rests edgeless, drew the field's line
     around itself. These read the painted border of the button against the
     same button standing alone, and the group's own line under an edgeless
     container, which is the floor the fix keeps. */
  test("keeps a nested button's own edge inside a group that floors its line", async ({ page }) => {
    await page.goto(FORMS_URL);

    const measured = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
      const read = (markup: string) => {
        const wrapper = document.createElement("div");

        wrapper.innerHTML = markup;
        host.append(wrapper);

        const paint = (selector: string) => {
          const styles = getComputedStyle(wrapper.querySelector(selector)!);
          return { color: styles.borderTopColor, width: styles.borderTopWidth };
        };
        const values = { button: paint(".btn"), group: paint(".input-group") };

        wrapper.remove();

        return values;
      };
      const group = (button: string, container = "") =>
        read(`<div class="${container}"><div class="input-group"><input class="ipt" />${button}</div></div>`);
      const alone = (button: string) => read(`<div class="input-group"></div>${button}`).button;

      return {
        ghost: {
          grouped: group('<button class="btn ghost">x</button>').button,
          alone: alone('<button class="btn ghost">x</button>'),
        },
        edgeless: {
          grouped: group('<button class="btn ghost edgeless">x</button>').button,
          alone: alone('<button class="btn ghost edgeless">x</button>'),
        },
        edged: {
          grouped: group('<button class="btn ghost edged">x</button>').button,
          alone: alone('<button class="btn ghost edged">x</button>'),
        },
        groupUnderEdgeless: group('<button class="btn ghost">x</button>', "edgeless").group,
        groupAlone: group('<button class="btn ghost">x</button>').group,
      };
    });

    for (const variant of ["ghost", "edgeless"] as const) {
      expect(isTransparent(measured[variant].alone.color), `${variant} button alone draws no line`).toBe(true);
      expect(isTransparent(measured[variant].grouped.color), `${variant} button in a group draws no line`).toBe(true);
    }
    /* An edged button still draws its own line in the group. */
    expect(getColorDistance(measured.edged.grouped.color, measured.edged.alone.color), "edged button").toBeLessThan(2);
    expect(isTransparent(measured.edged.grouped.color), "edged button in a group").toBe(false);
    /* A colour computes whatever the width, so a drawn line needs both. */
    expect(Number.parseFloat(measured.edged.grouped.width), "edged button in a group width").toBeGreaterThan(0);
    /* The group keeps its floor under a container's `.edgeless`. */
    expect(isTransparent(measured.groupUnderEdgeless.color), "group under an edgeless container").toBe(false);
    expect(
      Number.parseFloat(measured.groupUnderEdgeless.width),
      "group under an edgeless container width",
    ).toBeGreaterThan(0);
    expect(
      getColorDistance(measured.groupUnderEdgeless.color, measured.groupAlone.color),
      "the group's line is the one it draws alone",
    ).toBeLessThan(2);
  });

  test("rings the group on focus-within and does not double the ring on the control", async ({ page }) => {
    await page.goto(FORMS_URL);

    const measured = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
      const group = document.createElement("div");

      group.className = "input-group";
      group.innerHTML = `<input class="ipt" type="text" />`;
      host.append(group);

      const input = group.querySelector("input")!;
      const rest = getComputedStyle(group).outlineStyle;

      input.focus();

      const values = {
        rest,
        groupFocused: getComputedStyle(group).outlineStyle,
        inputFocused: getComputedStyle(input).outlineStyle,
      };

      group.remove();

      return values;
    });

    expect(measured.rest, "group outline at rest").toBe("none");
    expect(measured.groupFocused, "the group rings on focus-within").toBe("solid");
    expect(measured.inputFocused, "the inner control's own ring is suppressed").toBe("none");
  });

  test("propagates an inner control's invalid and disabled state to the group", async ({ page }) => {
    await page.goto(FORMS_URL);

    const measured = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;

      const read = (className: string, inner: string) => {
        const element = document.createElement("div");

        element.className = className;
        element.innerHTML = inner;
        host.append(element);

        const styles = getComputedStyle(element);
        /* What a reader sees is the product of the group's opacity and the
           control's, so a group and a control both dimmed is dimmed twice. */
        const control = element.firstElementChild;
        const effectiveOpacity =
          Number.parseFloat(styles.opacity) * (control ? Number.parseFloat(getComputedStyle(control).opacity) : 1);
        const values = { border: styles.borderTopColor, cursor: styles.cursor, effectiveOpacity };

        element.remove();

        return values;
      };

      /* The group's line is `text-control`'s -- the intent drawn at
         `--_line-rest` -- so a lone `.ipt.destructive` is the reference for what
         a reddened line looks like, no fraction to reconstruct. */
      return {
        destructiveLine: read("ipt destructive", "").border,
        neutralLine: read("ipt", "").border,
        plain: read("input-group", `<input class="ipt" />`),
        invalid: read("input-group", `<input class="ipt" aria-invalid="true" />`),
        disabled: read("input-group", `<input class="ipt" disabled />`),
        loneDisabled: read("field", `<input class="ipt" disabled />`),
      };
    });

    expect(
      getColorDistance(measured.invalid.border, measured.destructiveLine),
      "an inner aria-invalid reddens the group line",
    ).toBeLessThan(2);
    expect(
      getColorDistance(measured.invalid.border, measured.neutralLine),
      "and the reddened line is not the neutral one",
    ).toBeGreaterThan(2);
    expect(
      getColorDistance(measured.plain.border, measured.neutralLine),
      "a valid group keeps the neutral line",
    ).toBeLessThan(2);
    expect(measured.disabled.effectiveOpacity, "an inner disabled dims the group once").toBeCloseTo(
      measured.loneDisabled.effectiveOpacity,
      2,
    );
    expect(measured.disabled.effectiveOpacity, "and does dim it").toBeLessThan(1);
    expect(measured.disabled.cursor, "and shows the not-allowed cursor").toBe("not-allowed");

    /* A dimmed group does not answer the pointer, as a disabled lone field
       does not: its line once darkened on hover anyway. Hovered for real and
       read once the line's transition settles, against an enabled group that
       does darken, so the probe is shown to move a line that can move. A
       `<select>` with a disabled option is a control, not a group, and keeps
       its hover. */
    await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;

      host.insertAdjacentHTML(
        "beforeend",
        `<div class="input-group" data-hover-probe="enabled"><input class="ipt" /></div>
         <div class="input-group" data-hover-probe="disabled"><input class="ipt" disabled /></div>
         <select class="select" data-hover-probe="select"><option disabled>Off</option><option>On</option></select>`,
      );
    });

    const hoverLine = async (probe: string) => {
      const element = page.locator(`[data-hover-probe="${probe}"]`);
      const settled = () =>
        element.evaluate(async (node) => {
          await Promise.allSettled(node.getAnimations().map((animation) => animation.finished));
          return getComputedStyle(node).borderTopColor;
        });

      await page.mouse.move(0, 0);
      const rest = await settled();
      await element.hover({ force: true });
      const hovered = await settled();

      return { rest, hovered };
    };

    const enabled = await hoverLine("enabled");
    const disabled = await hoverLine("disabled");
    const select = await hoverLine("select");

    expect(getColorDistance(enabled.hovered, enabled.rest), "an enabled group's line moves").toBeGreaterThan(2);
    expect(getColorDistance(disabled.hovered, disabled.rest), "a disabled group's line holds").toBeLessThan(2);
    expect(getColorDistance(select.hovered, select.rest), "a select with a disabled option moves").toBeGreaterThan(2);
  });

  test("styles only destructive hints as field helper text", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
      const field = document.querySelector('[data-testid="field-error"]')!.parentElement!;
      const bareError = document.createElement("span");

      bareError.className = "destructive";
      bareError.textContent = "Bare destructive intent";
      field.append(bareError);

      const hintError = get("field-error");
      const bare = getComputedStyle(bareError);

      return {
        bareFontSize: bare.fontSize,
        buttonBackground: get("field-error-button").backgroundColor,
        errorColor: hintError.color,
        errorFontSize: hintError.fontSize,
        errorFontWeight: hintError.fontWeight,
      };
    });

    expect(isTransparent(styles.buttonBackground)).toBe(false);
    expect(isTransparent(styles.errorColor)).toBe(false);
    expect(styles.errorFontSize).toBe("14px");
    expect(styles.errorFontWeight).toBe("400");
    expect(styles.errorFontSize).not.toBe(styles.bareFontSize);
  });

  /* A number field keeps the browser's spin buttons and a search field its
     clear button, so the native behaviour is there by default. `.unadorned`
     removes them -- on the control, or on an `.input-group` for the control
     inside -- for a consumer who draws their own adornments. Each field is
     shot beside a reference of the same type whose decorations this test hides
     with its own stylesheet, so a decoration is the only thing that can tell
     the two apart. Hovered and focused, because Chromium draws the spin
     buttons and the clear button only then. */
  test("keeps native field decorations unless the field is unadorned", async ({ page }) => {
    await page.goto(FORMS_URL);

    await page.evaluate(() => {
      const hidden = [
        "search-decoration",
        "search-cancel-button",
        "search-results-button",
        "search-results-decoration",
        "calendar-picker-indicator",
        "inner-spin-button",
        "outer-spin-button",
        "clear-button",
      ]
        .map((part) => `.reference::-webkit-${part}`)
        .join(",");
      const style = document.createElement("style");
      style.textContent = `${hidden} { -webkit-appearance: none; display: none; } .reference[type="number"] { appearance: textfield; }`;
      document.head.append(style);

      const host = document.createElement("div");
      host.style.cssText = "width: 16rem; display: grid; gap: 0.5rem; caret-color: transparent";
      host.innerHTML = [
        '<input class="ipt reference" type="number" value="3" data-probe="number-reference">',
        '<input class="ipt" type="number" value="3" data-probe="number">',
        '<input class="ipt unadorned" type="number" value="3" data-probe="number-unadorned">',
        '<div class="input-group" data-probe="group-reference"><input class="ipt reference" type="number" value="3"></div>',
        '<div class="input-group unadorned" data-probe="group-unadorned"><input class="ipt" type="number" value="3"></div>',
        '<input class="ipt reference" type="search" value="3" data-probe="search-reference">',
        '<input class="ipt" type="search" value="3" data-probe="search">',
        '<input class="ipt unadorned" type="search" value="3" data-probe="search-unadorned">',
      ].join("");
      document.body.prepend(host);
    });

    const shoot = async (probe: string) => {
      const element = page.locator(`[data-probe="${probe}"]`);
      const control = element.locator("xpath=self::input | .//input").first();
      await control.focus();
      await control.hover();
      const box = (await element.boundingBox())!;

      /* The interior only: a decoration draws inside the padding, and the
         rounded corners' anti-aliasing varies with the element's position. */
      return page.screenshot({
        animations: "disabled",
        clip: { x: box.x + 4, y: box.y + 4, width: box.width - 8, height: box.height - 8 },
      });
    };

    const number = await shoot("number-reference");
    const group = await shoot("group-reference");
    const search = await shoot("search-reference");

    expect((await shoot("number")).equals(number), "a plain number field keeps its spin buttons").toBe(false);
    expect((await shoot("number-unadorned")).equals(number), "an unadorned number field draws none").toBe(true);
    expect((await shoot("group-unadorned")).equals(group), "an unadorned group reaches its control").toBe(true);
    expect((await shoot("search-unadorned")).equals(search), "an unadorned search field draws no clear button").toBe(
      true,
    );
  });

  /* A hint wraps, and at a line height equal to its size the lines touched.
     It takes the text-sm leading every other 14px text in the package has. */
  test("leads a wrapped hint like the rest of the package's small text", async ({ page }) => {
    await page.goto(FORMS_URL);

    const hint = await page.evaluate(() => {
      const element = document.createElement("p");
      element.className = "hint";
      element.style.width = "8rem";
      element.textContent = "A hint long enough to wrap onto several lines";
      document.body.append(element);
      const style = getComputedStyle(element);
      const result = { fontSize: style.fontSize, lineHeight: style.lineHeight };
      element.remove();

      return result;
    });

    expect(hint).toEqual({ fontSize: "14px", lineHeight: "20px" });
  });

  /* A mixed checkbox -- some of a group checked -- is a state of its own: the
     checked plate, so it reads as "on" in part, with a dash for a mark rather
     than a tick. Indeterminate wins over checked when both are set, as the
     browser's own checkbox draws it. */
  test("draws an indeterminate checkbox as the checked plate with a dash", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML =
        '<input type="checkbox" class="checkbox success" checked><input type="checkbox" class="checkbox success"><input type="checkbox" class="checkbox success" checked>';
      document.body.append(host);
      const [checked, mixed, both] = [...host.querySelectorAll("input")] as HTMLInputElement[];
      mixed!.indeterminate = true;
      both!.indeterminate = true;
      const read = (element: Element) => ({
        background: getComputedStyle(element).backgroundColor,
        mark: getComputedStyle(element, "::after").maskImage || getComputedStyle(element, "::after").webkitMaskImage,
        opacity: getComputedStyle(element, "::after").opacity,
      });
      const result = { both: read(both!), checked: read(checked!), mixed: read(mixed!) };
      host.remove();

      return result;
    });

    expect(styles.mixed.background).toBe(styles.checked.background);
    expect(styles.mixed.opacity).toBe("1");
    expect(styles.mixed.mark).not.toBe(styles.checked.mark);
    expect(styles.both.mark).toBe(styles.mixed.mark);
  });

  /* A select showing several rows is a list box, not a drop-down: it draws no
     chevron, grows to its rows, and gives back the room kept for the chevron.
     A one-row select keeps all three. */
  test("draws a multi-row select as a list box", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const options = "<option>One</option><option>Two</option><option>Three</option><option>Four</option>";
      const host = document.createElement("div");
      host.innerHTML = [
        `<select class="select">${options}</select>`,
        `<select class="select" multiple>${options}</select>`,
        `<select class="select" size="4">${options}</select>`,
        `<select class="select" size="1">${options}</select>`,
      ].join("");
      document.body.append(host);
      const result = [...host.querySelectorAll("select")].map((select) => {
        const style = getComputedStyle(select);

        return {
          chevron: style.backgroundImage !== "none",
          height: select.getBoundingClientRect().height,
          symmetric: style.paddingLeft === style.paddingRight,
        };
      });
      host.remove();

      return result;
    });
    const [single, multiple, sized, sizedOne] = styles;

    expect(single).toEqual({ chevron: true, height: 40, symmetric: false });
    expect(sizedOne).toEqual(single);
    for (const listBox of [multiple!, sized!]) {
      expect(listBox.chevron).toBe(false);
      expect(listBox.symmetric).toBe(true);
      expect(listBox.height).toBeGreaterThan(40);
    }
  });

  /* The chevron sits at the inline end, with the room kept for it, so under
     `dir="rtl"` both move to the left and the value starts at the right. */
  test("mirrors a select's chevron and its room under right-to-left", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const read = (dir: string) => {
        const host = document.createElement("div");
        host.dir = dir;
        host.style.width = "16rem";
        host.innerHTML = '<select class="select"><option>One</option></select>';
        document.body.append(host);
        const style = getComputedStyle(host.firstElementChild!);
        const result = {
          chevronX: style.backgroundPositionX,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
        };
        host.remove();

        return result;
      };

      return { ltr: read("ltr"), rtl: read("rtl") };
    });

    expect(styles.ltr.paddingRight).toBe("40px");
    expect(styles.ltr.paddingLeft).toBe("12px");
    expect(styles.rtl.paddingLeft).toBe(styles.ltr.paddingRight);
    expect(styles.rtl.paddingRight).toBe(styles.ltr.paddingLeft);
    expect(styles.rtl.chevronX).not.toBe(styles.ltr.chevronX);
    expect(styles.rtl.chevronX).not.toContain("100%");
  });

  /* The group takes its control's inline padding, but a drop-down's chevron is
     the select's own background, drawn inside the select's box: with no end
     padding a long label ran 21px under it. This resolves the chevron's two
     tiles from the used background position and checks that the label's
     content box ends before the nearer one, in both directions. A list box draws
     no chevron and is left as it was. */
  test("keeps a long select label clear of its chevron inside a group", async ({ page }) => {
    await page.goto(FORMS_URL);

    const label = "A very long option label that cannot fit inside the select at this width";
    const measured = await page.evaluate((text) => {
      const read = (dir: string, markup: string) => {
        const host = document.createElement("div");
        host.dir = dir;
        host.style.width = "20rem";
        host.innerHTML = markup;
        document.body.append(host);
        const select = host.querySelector("select")!;
        const style = getComputedStyle(select);
        const rect = select.getBoundingClientRect();
        const border = parseFloat(style.borderLeftWidth);
        const paddingBox = rect.width - border - parseFloat(style.borderRightWidth);
        const tile = parseFloat(style.backgroundSize);
        /* Each position is `calc(100% - Npx)`, a length, or a percentage of the
           room left once the tile is placed. */
        const tileStart = (value: string) => {
          const fromEnd = /calc\(100% - ([\d.]+)px\)/.exec(value);
          if (fromEnd) {
            return paddingBox - tile - parseFloat(fromEnd[1]!);
          }
          if (value.endsWith("%")) {
            return ((paddingBox - tile) * parseFloat(value)) / 100;
          }
          return parseFloat(value);
        };
        const starts = style.backgroundPositionX.split(",").map((value) => tileStart(value.trim()));
        const contentStart = parseFloat(style.paddingLeft);
        const contentEnd = paddingBox - parseFloat(style.paddingRight);
        const result = {
          chevron: style.backgroundImage === "none" ? null : [Math.min(...starts), Math.max(...starts) + tile],
          content: [contentStart, contentEnd],
          paddingInline: [style.paddingLeft, style.paddingRight],
        };
        host.remove();

        return result;
      };
      const option = `<option>${text}</option>`;
      const grouped = (attributes = "") =>
        `<div class="input-group"><span>i</span><select class="select"${attributes}>${option}</select></div>`;

      return {
        ltr: read("ltr", grouped()),
        rtl: read("rtl", grouped()),
        listBox: read("ltr", grouped(" multiple")),
        alone: read("ltr", `<select class="select">${option}</select>`),
      };
    }, label);

    const { ltr, rtl } = measured;
    expect(ltr.chevron, "ltr group draws its chevron").not.toBeNull();
    expect(rtl.chevron, "rtl group draws its chevron").not.toBeNull();
    expect(ltr.content[1], "ltr label ends before the chevron").toBeLessThanOrEqual(ltr.chevron![0]!);
    expect(rtl.content[0], "rtl label ends before the chevron").toBeGreaterThanOrEqual(rtl.chevron![1]!);
    expect(ltr.paddingInline[0], "ltr start stays flush to the group").toBe("0px");
    expect(rtl.paddingInline[1], "rtl start stays flush to the group").toBe("0px");
    expect(measured.listBox.chevron, "a list box draws no chevron").toBeNull();
    expect(measured.alone.paddingInline, "a lone select keeps its own room").toEqual(["12px", "40px"]);
  });

  /* A checked knob travels to the inline end. The mirrored travel was once
     nested as `:dir(rtl) &` inside `&:checked::after`, which compiled to an
     empty `:is()` and matched nothing: a checked right-to-left knob kept the
     positive travel and left the track past its right edge. The travel token
     was right all along, so this reads where the knob lands inside the track,
     resolved from the knob's own used offset and translation, under each
     direction and under a direction an inner element changes back. */
  test("keeps a checked switch's knob inside the track at the inline end in either direction", async ({ page }) => {
    await page.goto(FORMS_URL);

    const knobs = await page.evaluate(() => {
      const read = (markup: string) => {
        const host = document.createElement("div");
        host.innerHTML = markup;
        document.body.append(host);
        const track = host.querySelector<HTMLInputElement>(".switch")!;
        const knob = getComputedStyle(track, "::after");
        /* Offsets are from the padding box, which starts inside the border. */
        const start = track.clientLeft + parseFloat(knob.left) + parseFloat(knob.translate || "0");
        const result = {
          start,
          end: start + parseFloat(knob.width),
          inner: { start: track.clientLeft, end: track.clientLeft + track.clientWidth },
        };
        host.remove();

        return result;
      };
      const control = (attributes = "") => `<input type="checkbox" class="switch" checked ${attributes} />`;

      return {
        ltr: read(`<div dir="ltr">${control()}</div>`),
        rtl: read(`<div dir="rtl">${control()}</div>`),
        ltrInsideRtl: read(`<div dir="rtl"><div dir="ltr">${control()}</div></div>`),
        rtlInsideLtr: read(`<div dir="ltr"><div dir="rtl">${control()}</div></div>`),
        rtlOnControl: read(`<div dir="ltr">${control('dir="rtl"')}</div>`),
      };
    });

    for (const [label, knob] of Object.entries(knobs)) {
      expect(knob.start, `${label} knob start`).toBeGreaterThanOrEqual(knob.inner.start);
      expect(knob.end, `${label} knob end`).toBeLessThanOrEqual(knob.inner.end);
    }

    /* Checked, the knob sits against the inline end: the right in left-to-right,
       the left in right-to-left, the same gap from that edge either way. */
    const gapLtr = knobs.ltr.inner.end - knobs.ltr.end;
    const gapRtl = knobs.rtl.start - knobs.rtl.inner.start;

    expect(gapLtr).toBeLessThan(knobs.ltr.start - knobs.ltr.inner.start);
    expect(gapRtl).toBeCloseTo(gapLtr, 1);
    expect(knobs.ltrInsideRtl).toEqual(knobs.ltr);
    expect(knobs.rtlInsideLtr).toEqual(knobs.rtl);
    expect(knobs.rtlOnControl).toEqual(knobs.rtl);
  });

  /* A hint is text on the page, so an intent hint prints the intent's readable
     tone, `--intent-strong`, as typed text does. `.hint.destructive` once
     printed `--intent-color`, a fill colour, at 3.28:1 on the dark page, and
     only destructive was wired at all: `.hint.success` stayed secondary grey. */
  test("prints an intent hint in the intent's readable tone at 4.5:1 in both themes", async ({ page }) => {
    await page.goto(FORMS_URL);

    for (const theme of ["light", "dark"]) {
      // oxlint-disable-next-line no-await-in-loop -- one theme, then the other, on one page.
      const hints = await page.evaluate(
        ({ name, intents }) => {
          document.documentElement.classList.remove("light", "dark");
          document.documentElement.classList.add(name);
          const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
          const ground = (element: Element) => {
            for (let node: Element | null = element; node; node = node.parentElement) {
              const color = getComputedStyle(node).backgroundColor;
              if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
                return color;
              }
            }
            return getComputedStyle(document.documentElement).backgroundColor;
          };

          return intents.map(({ className, tokenName }) => {
            const hint = document.createElement("span");
            const probe = document.createElement("span");

            hint.className = `hint ${className}`;
            hint.textContent = "Helper text";
            probe.style.color = `var(--color-${tokenName}-strong)`;
            host.append(hint, probe);

            const result = {
              label: `${name} .hint.${className}`,
              color: getComputedStyle(hint).color,
              strong: getComputedStyle(probe).color,
              page: ground(hint),
            };

            hint.remove();
            probe.remove();

            return result;
          });
        },
        { name: theme, intents: BUTTON_INTENT_TOKENS },
      );

      for (const hint of hints) {
        expectSameColor(hint.color, hint.strong, `${hint.label} prints --intent-strong`);
        expect.soft(getContrastRatio(hint.color, hint.page), `${hint.label} contrast`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  /* Helper text kept the page's secondary grey on a solid surface, where the
     placeholder already took the surface's ink: a hint, and a group's text
     affix and icon, read at 1.0 to 3.24:1 on `.card.solid.<intent>`. */
  test("prints a hint and a group's adornments at 4.5:1 on a solid surface", async ({ page }) => {
    await page.goto(FORMS_URL);

    for (const theme of ["light", "dark"]) {
      // oxlint-disable-next-line no-await-in-loop -- one theme, then the other, on one page.
      const samples = await page.evaluate((name) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(name);
        const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
        const probe = document.createElement("div");

        probe.style.backgroundColor = "var(--color-background)";
        host.append(probe);
        const page = getComputedStyle(probe).backgroundColor;
        probe.remove();
        const plates = ["", "neutral", "primary", "secondary", "success", "warning", "destructive", "info"];

        return plates.flatMap((plate) => {
          const card = document.createElement("div");

          card.className = `card solid ${plate}`;
          card.innerHTML = `
            <span class="hint">Helper text</span>
            <span class="hint neutral">Helper text</span>
            <div class="input-group"><span>https://</span><input class="ipt" /><svg width="16" height="16" fill="currentColor"><rect width="16" height="16" /></svg></div>`;
          host.append(card);

          const group = card.querySelector(".input-group")!;
          const read = (element: Element, label: string, ground: Element) => ({
            label: `${name} ${label} on .card.solid${plate ? `.${plate}` : ""}`,
            color: getComputedStyle(element).color,
            ground: getComputedStyle(ground).backgroundColor,
            card: getComputedStyle(card).backgroundColor,
            page,
          });
          const [hint, neutral] = card.querySelectorAll(".hint");
          const result = [
            read(hint, ".hint", card),
            read(neutral, ".hint.neutral", card),
            read(group.querySelector("span")!, "group text affix", group),
            read(group.querySelector("svg")!, "group icon", group),
          ];

          card.remove();

          return result;
        });
      }, theme);

      for (const sample of samples) {
        const card = flattenColor(sample.card, sample.page);
        const ground = flattenColor(sample.ground, card);

        expect
          .soft(getContrastRatio(flattenColor(sample.color, ground), ground), sample.label)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  /* The group reads intent the way a lone field does, typed text included. The
     control inside resets its own intent to neutral at its root, like every
     component, so an `.input-group.success` once drew a success line around
     neutral text, and an invalid group a red line around grey text. */
  test("prints a group's intent and invalid state in the typed text of the control inside", async ({ page }) => {
    await page.goto(FORMS_URL);

    const measured = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
      const read = (html: string, selector: string) => {
        const wrapper = document.createElement("div");

        wrapper.innerHTML = html;
        host.append(wrapper);

        const color = getComputedStyle(wrapper.querySelector(selector)!).color;

        wrapper.remove();

        return color;
      };

      return {
        lone: read('<input class="ipt" value="abc" />', "input"),
        loneSuccess: read('<input class="ipt success" value="abc" />', "input"),
        loneInvalid: read('<input class="ipt" aria-invalid="true" value="abc" />', "input"),
        groupSuccess: read('<div class="input-group success"><input class="ipt" value="abc" /></div>', "input"),
        groupInvalid: read(
          '<div class="input-group" aria-invalid="true"><input class="ipt" value="abc" /></div>',
          "input",
        ),
        innerInvalid: read(
          '<div class="input-group"><input class="ipt" aria-invalid="true" value="abc" /></div>',
          "input",
        ),
        groupSelect: read(
          '<div class="input-group warning"><select class="select"><option>abc</option></select></div>',
          "select",
        ),
        loneSelect: read('<select class="select warning"><option>abc</option></select>', "select"),
      };
    });

    expect(getColorDistance(measured.loneSuccess, measured.lone), "the probe tells the intents apart").toBeGreaterThan(
      2,
    );
    expectSameColor(measured.groupSuccess, measured.loneSuccess, ".input-group.success text");
    expectSameColor(measured.groupInvalid, measured.loneInvalid, "an invalid group's text");
    expectSameColor(measured.innerInvalid, measured.loneInvalid, "an invalid control's text in a group");
    expectSameColor(measured.groupSelect, measured.loneSelect, ".input-group.warning select text");
  });

  /* An invalid toggle is destructive whatever else it was asked to be, so it
     has to look like a destructive one, mark included. The invalid rule once
     redirected only the line and fill slots, so a checked invalid checkbox in
     the dark theme drew the neutral near-black mark on a red plate (3.28:1)
     where `.checkbox.destructive` draws a light one. */
  test("draws an invalid toggle exactly as a destructive one, checked or not", async ({ page }) => {
    await page.goto(FORMS_URL);

    for (const theme of ["light", "dark"]) {
      // oxlint-disable-next-line no-await-in-loop -- one theme, then the other, on one page.
      const pairs = await page.evaluate((name) => {
        document.documentElement.classList.remove("light", "dark");
        document.documentElement.classList.add(name);
        const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
        const toggles = [
          ["checkbox", 'type="checkbox"'],
          ["radio", 'type="radio"'],
          ["switch", 'type="checkbox" role="switch"'],
        ];
        const read = (html: string) => {
          const wrapper = document.createElement("div");

          wrapper.innerHTML = html;
          host.append(wrapper);

          const control = wrapper.firstElementChild!;
          const styles = getComputedStyle(control);
          const values = {
            background: styles.backgroundColor,
            border: styles.borderTopColor,
            color: styles.color,
            mark: getComputedStyle(control, "::after").backgroundColor,
          };

          wrapper.remove();

          return values;
        };

        return toggles.flatMap(([className, type]) =>
          ["", "checked"].map((checked) => ({
            label: `${name} .${className}${checked ? ":checked" : ""}`,
            invalid: read(`<input class="${className}" ${type} ${checked} aria-invalid="true" />`),
            destructive: read(`<input class="${className} destructive" ${type} ${checked} />`),
          })),
        );
      }, theme);

      for (const { label, invalid, destructive } of pairs) {
        for (const part of ["background", "border", "color", "mark"] as const) {
          expectSameColor(invalid[part], destructive[part], `${label} invalid ${part}`);
        }
      }
    }
  });

  /* The invalid state wrote the destructive slots but not the cap, so the
     control stayed neutral under the reset's 20% and, on a solid surface, took
     the surface's ink in place of the red: an invalid field's line read
     159,147,147 against a valid one's 143,143,143 on `.card.solid.primary`.
     Held to `.destructive` on every solid surface, by class, in a group, and
     on the bare elements `/native` styles. */
  for (const [route, fixtures] of [
    [
      FORMS_URL,
      [
        ['<input class="ipt" ATTR />', "ipt"],
        ['<textarea class="textarea" ATTR></textarea>', "textarea"],
        ['<select class="select" ATTR><option>A</option></select>', "select"],
        ['<input class="checkbox" type="checkbox" ATTR />', "checkbox"],
        ['<input class="checkbox" type="checkbox" checked ATTR />', "checkbox:checked"],
        ['<input class="radio" type="radio" ATTR />', "radio"],
        ['<input class="switch" type="checkbox" role="switch" ATTR />', "switch"],
        ['<input class="switch" type="checkbox" role="switch" checked ATTR />', "switch:checked"],
        ['<div class="input-group GROUP"><input class="ipt" ATTR /></div>', "input-group"],
      ],
    ],
    [
      `${ORIGIN}/native/?env=vanilla`,
      [
        ["<input ATTR />", "input"],
        ["<textarea ATTR></textarea>", "textarea"],
        ['<input type="checkbox" ATTR />', "checkbox"],
        ['<input type="checkbox" checked ATTR />', "checkbox:checked"],
      ],
    ],
  ] as const) {
    test(`draws an invalid control as a destructive one on a solid surface, ${route.includes("native") ? "bare" : "by class"}`, async ({
      page,
    }) => {
      await page.goto(route);

      for (const theme of ["light", "dark"]) {
        // oxlint-disable-next-line no-await-in-loop -- one theme, then the other, on one page.
        const pairs = await page.evaluate(
          ([name, list]) => {
            document.documentElement.classList.remove("light", "dark");
            document.documentElement.classList.add(name);
            const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
            const plates = ["", "neutral", "primary", "secondary", "success", "warning", "destructive", "info"];
            const read = (plate: string, html: string) => {
              const wrapper = document.createElement("div");

              wrapper.className = `card solid ${plate}`;
              wrapper.innerHTML = html;
              host.append(wrapper);

              const control = wrapper.firstElementChild!;
              const field = control.querySelector("input") ?? control;
              const styles = getComputedStyle(control);
              const values = {
                background: styles.backgroundColor,
                border: styles.borderTopColor,
                color: getComputedStyle(field).color,
                mark: getComputedStyle(control, "::after").backgroundColor,
              };

              wrapper.remove();

              return values;
            };

            return plates.flatMap((plate) =>
              list.map(([html, label]) => {
                /* A group takes its intent on the group, and its invalid state
                   from the control inside: that is the pair the docs promise. */
                const invalid = html.replace("ATTR", 'aria-invalid="true"').replace(" GROUP", "");
                const destructive = html.includes("GROUP")
                  ? html.replace("ATTR", "").replace("GROUP", "destructive")
                  : html.includes("class=")
                    ? html.replace("ATTR", "").replace(/class="([^"]+)"/u, 'class="$1 destructive"')
                    : html.replace("ATTR", 'class="destructive"');

                return {
                  label: `${name} ${label} on .card.solid${plate ? `.${plate}` : ""}`,
                  invalid: read(plate, invalid),
                  destructive: read(plate, destructive),
                };
              }),
            );
          },
          [theme, fixtures] as const,
        );

        for (const { label, invalid, destructive } of pairs) {
          for (const part of ["background", "border", "color", "mark"] as const) {
            expectSameColor(invalid[part], destructive[part], `${label} invalid ${part}`);
          }
        }
      }
    });
  }

  /* A group is a field, so it is a field's height and lines up with the fields
     and buttons beside it. The control inside once kept its own
     `--control-height` inside a box that adds its own line, and the group was
     42px next to 40px. */
  test("sizes a group to the control height, like the fields and buttons beside it", async ({ page }) => {
    await page.goto(FORMS_URL);

    const heights = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
      const read = (html: string) => {
        const wrapper = document.createElement("div");

        wrapper.innerHTML = html;
        host.append(wrapper);

        const height = wrapper.firstElementChild!.getBoundingClientRect().height;

        wrapper.remove();

        return height;
      };

      return {
        btn: read('<button class="btn" type="button">Go</button>'),
        ipt: read('<input class="ipt" />'),
        group: read('<div class="input-group"><span>@</span><input class="ipt" /></div>'),
        groupSelect: read('<div class="input-group"><select class="select"><option>One</option></select></div>'),
        groupBare: read('<div class="input-group"><input /></div>'),
      };
    });

    expect(heights.ipt, "a lone field").toBeCloseTo(heights.btn, 1);
    expect(heights.group, "a group").toBeCloseTo(heights.ipt, 1);
    expect(heights.groupSelect, "a group around a select").toBeCloseTo(heights.ipt, 1);
    expect(heights.groupBare, "a group around a bare input").toBeCloseTo(heights.ipt, 1);
  });

  /* One ring per focus. Under forced colours the field's own Highlight ring is
     unlayered, so it once beat the group's layered suppression and a focused
     field in a group drew two. A button in the group -- the docs' clear button
     -- is a different target: Enter presses it rather than typing into the
     field, so it keeps its own ring and the group drops the field's. */
  test("draws one focus ring in a group, on the field or on a button inside it", async ({ page }) => {
    const readRings = () =>
      page.evaluate(() => {
        const group = document.querySelector("[data-ring-probe]")!;
        const input = group.querySelector("input")!;
        const button = group.querySelector("button")!;
        const outline = (element: Element) => getComputedStyle(element).outlineStyle;
        const focused = document.activeElement;

        return {
          focused: focused === input ? "input" : focused === button ? "button" : "other",
          group: outline(group),
          input: outline(input),
          button: outline(button),
        };
      });
    const setUp = async () => {
      await page.goto(FORMS_URL);
      await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;

        host.insertAdjacentHTML(
          "beforeend",
          `<div class="input-group" data-ring-probe>
             <input class="ipt" type="search" />
             <button class="btn icon ghost p-xs" type="button" aria-label="Clear">x</button>
           </div>`,
        );
      });
      await page.locator("[data-ring-probe] input").focus();
    };

    await setUp();
    const field = await readRings();
    await page.keyboard.press("Tab");
    const button = await readRings();

    expect(field.focused).toBe("input");
    expect(field.group, "the group rings for its field").toBe("solid");
    expect(field.input, "and the field draws none of its own").toBe("none");
    expect(button.focused).toBe("button");
    expect(button.button, "a focused button keeps its own ring").toBe("solid");
    expect(button.group, "and the group drops the field's").toBe("none");

    await page.emulateMedia({ forcedColors: "active" });
    await setUp();
    const forced = await readRings();

    expect(forced.group, "forced colours: the group rings").toBe("solid");
    expect(forced.input, "forced colours: the field draws none of its own").toBe("none");
  });

  /* A checkbox is an `<input>`, and four of the group's rules took any
     `<input>` for its field where the rest named only the text fields: a
     focused checkbox drew its ring inside the group's, an invalid one reddened
     the group's line around neutral text, and a disabled one stopped the group
     answering the pointer without dimming it. A toggle beside the field is the
     group's other content, as a button is. */
  /* A lone field hovered while focused keeps its focus line; the group's hover
     tone outweighed its focus one, so pointing at the field being typed in
     faded the line to the hover tone. */
  test("keeps a focused group's line through a hover, as a lone field's", async ({ page }) => {
    await page.goto(FORMS_URL);
    await stopTransitions(page);
    await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;

      host.insertAdjacentHTML(
        "beforeend",
        '<div class="input-group" data-box="group"><input class="ipt" /></div><input class="ipt" data-box="lone" />',
      );
    });

    const read = async (name: string) => {
      const box = page.locator(`[data-box="${name}"]`);
      const field = name === "group" ? box.locator(".ipt") : box;
      const line = () => box.evaluate((element) => getComputedStyle(element).borderTopColor);

      await field.focus();
      const focused = await line();
      await field.hover();

      return { focused, hovered: await line(), hover: await box.evaluate((element) => element.matches(":hover")) };
    };

    const group = await read("group");
    await page.mouse.move(0, 0);
    const lone = await read("lone");

    expect(lone.hover && group.hover).toBe(true);
    expect(lone.hovered, "a hovered lone field keeps its focus line").toBe(lone.focused);
    expect(group.hovered, "and so does a hovered group").toBe(group.focused);
  });

  test("keeps a toggle in a group apart from the group's field", async ({ page }) => {
    const setUp = async () => {
      await page.goto(FORMS_URL);
      await stopTransitions(page);
      await page.evaluate(() => {
        const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;

        host.insertAdjacentHTML(
          "beforeend",
          `<div class="input-group" data-group="focus"><input class="ipt" /><input class="checkbox" type="checkbox" /></div>
           <div class="input-group" data-group="plain"><input class="ipt" /><input class="checkbox" type="checkbox" /></div>
           <div class="input-group" data-group="invalid"><input class="ipt" /><input class="checkbox" type="checkbox" aria-invalid="true" /></div>
           <div class="input-group" data-group="disabled"><input class="ipt" /><input class="checkbox" type="checkbox" disabled /></div>`,
        );
      });
      await page.locator('[data-group="focus"] .ipt').focus();
      await page.keyboard.press("Tab");
    };
    const readRings = () =>
      page.evaluate(() => {
        const group = document.querySelector('[data-group="focus"]')!;
        const toggle = group.querySelector(".checkbox")!;

        /* A toggle draws its ring as a shadow, a spread of the ring width; under
           forced colours, which drop shadows, as the important outline. */
        const width = getComputedStyle(document.documentElement).getPropertyValue("--focus-ring-width").trim();
        const styles = getComputedStyle(toggle);

        return {
          focused: document.activeElement === toggle,
          group: getComputedStyle(group).outlineStyle,
          toggleRing: new RegExp(String.raw`0px 0px 0px ${width}(?! inset)`).test(styles.boxShadow),
          toggleOutline: styles.outlineStyle,
        };
      });
    const line = (name: string) =>
      page.locator(`[data-group="${name}"]`).evaluate((element) => getComputedStyle(element).borderTopColor);

    await setUp();
    expect(await readRings()).toEqual({ focused: true, group: "none", toggleRing: true, toggleOutline: "none" });
    expectSameColor(await line("invalid"), await line("plain"), "an invalid toggle leaves the group's line neutral");

    const disabled = page.locator('[data-group="disabled"]');
    const rest = await line("disabled");

    expect(
      await disabled.evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)),
      "a disabled toggle does not dim the group",
    ).toBe(1);
    await disabled.locator(".ipt").hover();
    expect(await disabled.evaluate((element) => element.matches(":hover"))).toBe(true);
    expect(await line("disabled"), "so the group still answers the pointer").not.toBe(rest);

    await page.emulateMedia({ forcedColors: "active" });
    await setUp();
    const forced = await readRings();

    expect(forced.focused).toBe(true);
    expect(forced.group, "forced colours: the group drops the field's ring").toBe("none");
    expect(forced.toggleOutline, "forced colours: and the toggle keeps its own").toBe("solid");
  });

  /* Forced colours ring a focused lone field in Highlight, two pixels outside
     its border. The group kept its layered ring, drawn over its own border
     in the forced text colour, so a focused group read as a resting one. */
  test("rings a focused group in forced colours as it rings a lone field", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(FORMS_URL);
    test.skip(
      !(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)),
      "engine cannot emulate forced colors",
    );
    await stopTransitions(page);
    await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;

      host.insertAdjacentHTML(
        "afterbegin",
        `<button data-ring="before">.</button><input class="ipt" data-ring="lone" />
         <div class="input-group" data-ring="group"><span>@</span><input class="ipt" /></div>`,
      );
    });

    const ring = async (selector: string, target: string) => {
      await page.locator(selector).focus();
      await page.keyboard.press("Tab");

      return page.locator(target).evaluate((element) => {
        const styles = getComputedStyle(element);

        return {
          focused: element.matches(":focus-visible, :focus-within"),
          style: styles.outlineStyle,
          width: styles.outlineWidth,
          offset: styles.outlineOffset,
          color: styles.outlineColor,
        };
      });
    };
    const lone = await ring('[data-ring="before"]', '[data-ring="lone"]');
    const group = await ring('[data-ring="lone"]', '[data-ring="group"]');

    expect(lone).toMatchObject({ focused: true, style: "solid", width: "2px", offset: "2px" });
    expect(group, "the group rings as the lone field does").toEqual(lone);
  });

  /* The text controls take the button's size steps, so a `.btn.sm` and an
     `.ipt.sm` line up in a row: height, text size, and the corner the size
     step scales. Heights are read under every aesthetic and under a 2px
     border, the preset in docs/usage/presets.md: `.btn.lg` once kept its
     padding whole while the controls gave the line back, and stood 49.5px to
     their 48px wherever the border was 2px. */
  test("sizes text controls and groups with the button's size steps", async ({ page }) => {
    await page.goto(FORMS_URL);

    const sizes = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]') ?? document.body;
      const read = (html: string) => {
        const wrapper = document.createElement("div");

        wrapper.innerHTML = html;
        host.append(wrapper);

        const element = wrapper.firstElementChild!;
        const styles = getComputedStyle(element);
        const inner = element.querySelector("input");
        const values = {
          height: element.getBoundingClientRect().height,
          fontSize: (inner ? getComputedStyle(inner) : styles).fontSize,
          radius: styles.borderTopLeftRadius,
          paddingStart: Number.parseFloat(styles.paddingInlineStart),
        };

        wrapper.remove();

        return values;
      };

      return Object.fromEntries(
        ["", "sm", "lg"].map((size) => [
          size || "default",
          {
            btn: read(`<button class="btn ${size}" type="button">Go</button>`),
            ipt: read(`<input class="ipt ${size}" />`),
            select: read(`<select class="select ${size}"><option>One</option></select>`),
            textarea: read(`<textarea class="textarea ${size}"></textarea>`),
            group: read(`<div class="input-group ${size}"><span>@</span><input class="ipt" /></div>`),
          },
        ]),
      );
    });

    for (const [size, controls] of Object.entries(sizes)) {
      for (const control of ["ipt", "select", "group"] as const) {
        expect(controls[control].height, `${size} .${control} height`).toBeCloseTo(controls.btn.height, 1);
      }
      for (const control of ["ipt", "select", "textarea", "group"] as const) {
        expect(controls[control].fontSize, `${size} .${control} text`).toBe(controls.btn.fontSize);
        expect(controls[control].radius, `${size} .${control} corner`).toBe(controls.btn.radius);
      }
    }

    expect(sizes.sm.btn.height, "the steps differ").toBeLessThan(sizes.default.btn.height);
    expect(sizes.lg.btn.height, "the steps differ").toBeGreaterThan(sizes.default.btn.height);

    const regions = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="preview-root"]') ?? document.body;
      const regionsToRead = [
        ["2px border", "", "--border-width: 2px"],
        ["chunky-tile", "chunky-tile", ""],
        ["cyber", "cyber", ""],
        ["glass", "glass", ""],
        ["neobrutalism", "neobrutalism", ""],
        ["pixel", "pixel", ""],
        ["sketch", "sketch", ""],
        ["sketch-rounded", "sketch sketch-rounded", ""],
      ] as const;

      return regionsToRead.flatMap(([label, classes, style]) => {
        const host = document.createElement("div");

        host.className = classes;
        host.setAttribute("style", style);
        host.innerHTML = ["", "sm", "lg"]
          .map(
            (size) =>
              `<div data-size="${size || "default"}">` +
              `<button class="btn ${size}" type="button">Go</button>` +
              `<input class="ipt ${size}" />` +
              `<select class="select ${size}"><option>One</option></select>` +
              `<div class="input-group ${size}"><span>@</span><input class="ipt" /></div></div>`,
          )
          .join("");
        root.append(host);

        const rows = [...host.children].map((row) => ({
          label: `${label} ${(row as HTMLElement).dataset.size}`,
          heights: [...row.children].map((element) => ({
            name: element.className.split(" ")[0],
            height: element.getBoundingClientRect().height,
          })),
        }));

        host.remove();

        return rows;
      });
    });

    for (const { heights, label } of regions) {
      const button = heights[0]!.height;

      for (const { height, name } of heights.slice(1)) {
        expect.soft(height, `${label} .${name} height`).toBeCloseTo(button, 1);
      }
    }

    for (const control of ["ipt", "select", "textarea", "group"] as const) {
      expect(sizes.sm[control].paddingStart, `.${control}.sm pads less`).toBeLessThan(
        sizes.default[control].paddingStart,
      );
      expect(sizes.lg[control].paddingStart, `.${control}.lg pads more`).toBeGreaterThan(
        sizes.default[control].paddingStart,
      );
    }
  });
});

/* An input group's rules for "the control inside" matched any `<input>`, and
   its rule for "anything else" outranked that thing's own colour. A checkbox in
   a group lost its box and its line; a link button stretched like a field and
   printed secondary text; a badge's own colour lost to the adornment grey. */
test("an input group leaves what is not a text field alone", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: `${ORIGIN}/shared/entry-components.css` });

  const read = () =>
    page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("[id]")].map((element) => {
          const styles = getComputedStyle(element);

          return [
            element.id,
            [styles.borderTopWidth, styles.backgroundColor, styles.color, styles.flexGrow, styles.paddingLeft].join(
              " | ",
            ),
          ];
        }),
      ),
    );
  const markup = (wrapper: string) =>
    `<div class="${wrapper}">` +
    '<input type="checkbox" class="checkbox" id="checkbox" />' +
    '<input type="checkbox" class="switch" id="switch" />' +
    '<input type="radio" class="radio" id="radio" checked />' +
    '<a class="btn primary" href="#" id="link">Go</a>' +
    '<span class="badge success" id="badge">New</span>' +
    "</div>";

  await page.evaluate((html) => (document.body.innerHTML = html), markup("cluster"));
  const alone = await read();

  await page.evaluate((html) => (document.body.innerHTML = html), markup("input-group"));

  expect(await read()).toEqual(alone);
});

const FULL_STYLES_URL = `${ORIGIN}/shared/entry-vanilla.css`;
const NATIVE_STYLES_URL = `${ORIGIN}/native/entry-vanilla.css`;

/* Constraint validation the user has run into is an error the page did not
   have to script: an email field left at "ada@" stayed neutral. A control the
   user has edited, or every control after a submit attempt, matches
   `:user-invalid` and paints as `aria-invalid="true"` does; `aria-invalid="false"`
   is the page saying it knows better. Read on the classes and, under `/native`,
   on the bare elements. */
for (const [entry, url, classed] of [
  ["the classes", FULL_STYLES_URL, true],
  ["/native", NATIVE_STYLES_URL, false],
] as const) {
  test(`paints a natively invalid control as an aria-invalid one, from ${entry}`, async ({ page }) => {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addStyleTag({ url });
    await stopTransitions(page);

    const cls = (name: string) => (classed ? `class="${name}"` : "");
    const controls: [string, (attributes: string) => string][] = [
      ["ipt", (a) => `<input ${cls("ipt")} type="email" ${a} />`],
      ["textarea", (a) => `<textarea ${cls("textarea")} ${a}></textarea>`],
      ["select", (a) => `<select ${cls("select")} ${a}><option value="">Choose</option><option>a</option></select>`],
      ["checkbox", (a) => `<input ${cls("checkbox")} type="checkbox" ${a} />`],
      ["switch", (a) => `<input class="switch" type="checkbox" role="switch" ${a} />`],
      ["radio", (a) => `<input ${cls("radio")} type="radio" ${a} />`],
    ];

    await page.evaluate(
      (rows) => {
        for (const [name, user, aria, optOut, plain] of rows) {
          const form = document.createElement("form");
          form.innerHTML = `<div data-user="${name}">${user}</div><div data-aria="${name}">${aria}</div><div data-opt-out="${name}">${optOut}</div><div data-plain="${name}">${plain}</div>`;
          document.body.append(form);
          /* A submit attempt marks every control in the form as interacted with. */
          form.requestSubmit();
        }
        /* The failed submit focuses the form's first invalid control, which then
           draws the focus line its twin does not. */
        (document.activeElement as HTMLElement | null)?.blur();
      },
      controls.map(([name, html], index) => [
        name,
        html(`required name="u${index}"`),
        html(`aria-invalid="true" name="a${index}"`),
        html(`required aria-invalid="false" name="o${index}"`),
        html(`name="p${index}"`),
      ]),
    );

    const read = (selector: string) =>
      page.locator(selector).evaluate((element) => {
        const styles = getComputedStyle(element);
        return [styles.borderTopColor, styles.color, styles.backgroundColor].join(" | ");
      });

    /* oxlint-disable no-await-in-loop -- one page, read in turn. */
    for (const [name] of controls) {
      expect(
        await page.locator(`[data-user="${name}"] > *`).evaluate((element) => element.matches(":user-invalid")),
        `${name} is user-invalid`,
      ).toBe(true);
      expect(await read(`[data-user="${name}"] > *`), `${name} paints as aria-invalid`).toBe(
        await read(`[data-aria="${name}"] > *`),
      );
      expect(await read(`[data-opt-out="${name}"] > *`), `${name} with aria-invalid="false" stays valid`).toBe(
        await read(`[data-plain="${name}"] > *`),
      );
    }
    /* oxlint-enable no-await-in-loop */
  });
}

/* The case from the audit: a typed value the browser rejects, then focus
   leaves. The group's line follows its field, as it does for `aria-invalid`. */
test("paints a typed, rejected email and its group as invalid once focus leaves", async ({ page }) => {
  await page.setContent(
    `<!doctype html><html><body>
       <input class="ipt" type="email" data-testid="lone" />
       <div class="input-group" data-testid="group"><span>@</span><input class="ipt" type="email" data-testid="inner" /></div>
       <input class="ipt" type="email" aria-invalid="true" data-testid="aria" />
       <div class="input-group" data-testid="aria-group"><span>@</span><input class="ipt" aria-invalid="true" /></div>
       <button>after</button></body></html>`,
  );
  await page.addStyleTag({ url: FULL_STYLES_URL });
  await stopTransitions(page);

  for (const testId of ["lone", "inner"]) {
    // oxlint-disable-next-line no-await-in-loop -- one field at a time.
    await page.getByTestId(testId).fill("ada@");
    // oxlint-disable-next-line no-await-in-loop -- one field at a time.
    await page.getByRole("button").focus();
  }

  const line = (testId: string) =>
    page.getByTestId(testId).evaluate((element) => getComputedStyle(element).borderTopColor);

  expect(await line("lone")).toBe(await line("aria"));
  expect(await line("group")).toBe(await line("aria-group"));
});

/* A read-only field can be focused and its value selected, so it keeps its
   ring, but nothing about it answers the pointer: it rests on the quiet field
   tone, `--color-background-subtle`, and its text stays at full strength. */
for (const [entry, url, classed] of [
  ["the classes", FULL_STYLES_URL, true],
  ["/native", NATIVE_STYLES_URL, false],
] as const) {
  test(`rests a read-only field on the quiet tone with no hover and a focus ring, from ${entry}`, async ({ page }) => {
    await page.setContent('<!doctype html><html><body><button data-testid="before">.</button></body></html>');
    await page.addStyleTag({ url });
    await stopTransitions(page);
    await page.evaluate((isClassed) => {
      const cls = (name: string) => (isClassed ? `class="${name}"` : "");
      document.body.insertAdjacentHTML(
        "beforeend",
        `<input ${cls("ipt")} readonly value="ada" data-testid="ipt" />
         <button data-testid="between">.</button>
         <textarea ${cls("textarea")} readonly data-testid="textarea">ada</textarea>
         <input ${cls("ipt")} value="ada" data-testid="ipt-editable" />
         <span data-testid="quiet" style="background: color-mix(in oklab, var(--color-background-subtle) 100%, transparent)">.</span>`,
      );
    }, classed);

    const quiet = await page.getByTestId("quiet").evaluate((element) => getComputedStyle(element).backgroundColor);
    const editable = await page.getByTestId("ipt-editable").evaluate((element) => getComputedStyle(element).color);

    for (const [testId, before] of [
      ["ipt", "before"],
      ["textarea", "between"],
    ] as const) {
      const control = page.getByTestId(testId);
      const read = () =>
        control.evaluate((element) => {
          const styles = getComputedStyle(element);
          return {
            line: styles.borderTopColor,
            fill: styles.backgroundColor,
            color: styles.color,
            opacity: styles.opacity,
          };
        });

      // oxlint-disable-next-line no-await-in-loop -- one control at a time.
      const rest = await read();
      expect(rest.fill, `${testId} rests on the quiet tone`).toBe(quiet);
      expect(rest.color, `${testId} keeps the editable field's text`).toBe(editable);
      expect(rest.opacity, `${testId} is not dimmed`).toBe("1");

      // oxlint-disable-next-line no-await-in-loop -- one control at a time.
      await control.hover();
      // oxlint-disable-next-line no-await-in-loop -- one control at a time.
      expect(await read(), `${testId} does not answer the pointer`).toEqual(rest);
      // oxlint-disable-next-line no-await-in-loop -- one control at a time.
      await page.mouse.move(0, 0);

      // oxlint-disable-next-line no-await-in-loop -- one control at a time.
      await page.getByTestId(before).focus();
      // oxlint-disable-next-line no-await-in-loop -- one control at a time.
      await page.keyboard.press("Tab");
      // oxlint-disable-next-line no-await-in-loop -- one control at a time.
      const ring = await control.evaluate((element) => ({
        focused: element.matches(":focus-visible"),
        style: getComputedStyle(element).outlineStyle,
      }));
      expect(ring, `${testId} keeps its focus ring`).toEqual({ focused: true, style: "solid" });
    }
  });
}

/* The group is the field boundary, so a group whose field is read-only rests
   on the quiet tone and ignores the pointer as the lone field does. */
test("rests an input group on the quiet tone when its field is read-only", async ({ page }) => {
  await page.setContent(
    `<!doctype html><html><body>
       <div class="input-group" data-testid="group"><input class="ipt" readonly value="ada" /></div>
       <span data-testid="quiet" style="background: color-mix(in oklab, var(--color-background-subtle) 100%, transparent)">.</span>
     </body></html>`,
  );
  await page.addStyleTag({ url: FULL_STYLES_URL });
  await stopTransitions(page);

  const quiet = await page.getByTestId("quiet").evaluate((element) => getComputedStyle(element).backgroundColor);
  const group = page.getByTestId("group");
  const read = () =>
    group.evaluate((element) => {
      const styles = getComputedStyle(element);
      return { line: styles.borderTopColor, fill: styles.backgroundColor };
    });

  const rest = await read();
  expect(rest.fill).toBe(quiet);
  await group.hover();
  expect(await read()).toEqual(rest);
});

/* A toggle and its label on a narrow screen: the label's text wraps beside
   the control, never under it, and the control sits on the first line. On a
   wrapping `.cluster` the text dropped below the switch and read as the next
   control's. */
test("keeps a toggle label's wrapped text beside its control, on the first line", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.setContent(
    `<!doctype html><html><body style="margin: 0; padding: 16px">
       <label class="choice" data-testid="switch"><input class="switch primary" type="checkbox" role="switch" /> Show my profile to anyone with the link</label>
       <label class="choice" data-testid="checkbox"><input class="checkbox" type="checkbox" /> Email me when an invoice is ready, and again a week before it is due</label>
       <label class="choice" data-testid="radio"><input class="radio" type="radio" /> Yearly, two months free, billed once a year on the day you signed up</label>
     </body></html>`,
  );
  await page.addStyleTag({ url: FULL_STYLES_URL });

  for (const testId of ["switch", "checkbox", "radio"]) {
    // oxlint-disable-next-line no-await-in-loop -- one label at a time.
    const layout = await page.getByTestId(testId).evaluate((label) => {
      const control = label.querySelector("input")!.getBoundingClientRect();
      const text = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim())!;
      const range = document.createRange();
      range.selectNodeContents(text);
      const lines = [...range.getClientRects()].filter((rect) => rect.width > 1);
      const first = lines[0]!;

      return {
        lines: new Set(lines.map((rect) => Math.round(rect.top))).size,
        textLeft: Math.min(...lines.map((rect) => rect.left)),
        controlRight: control.right,
        controlCentre: control.top + control.height / 2,
        firstLineCentre: first.top + first.height / 2,
      };
    });

    expect(layout.lines, `${testId} wraps`).toBeGreaterThan(1);
    expect(layout.textLeft, `${testId} text stays beside the control`).toBeGreaterThan(layout.controlRight);
    expect(Math.abs(layout.controlCentre - layout.firstLineCentre), `${testId} sits on the first line`).toBeLessThan(
      2.5,
    );
  }
});

/* A rendered legend is not one of its fieldset's flex items, so a `.stack`
   gap never reached it and it sat flush against the first option. */
test("spaces a fieldset's legend from its first option as the stack spaces the rest", async ({ page }) => {
  await page.setContent(
    `<!doctype html><html><body>
       <fieldset class="stack tight" data-testid="set">
         <legend class="label">Billing period</legend>
         <label class="choice"><input class="radio" type="radio" name="p" /> Monthly</label>
         <label class="choice"><input class="radio" type="radio" name="p" /> Yearly</label>
       </fieldset></body></html>`,
  );
  await page.addStyleTag({ url: FULL_STYLES_URL });

  const gaps = await page.getByTestId("set").evaluate((set) => {
    const [legend, first, second] = [...set.children].map((element) => element.getBoundingClientRect());
    return { legend: first!.top - legend!.bottom, options: second!.top - first!.bottom };
  });

  expect(gaps.options).toBeCloseTo(8, 1);
  expect(gaps.legend).toBeCloseTo(gaps.options, 1);
});

/* docs/usage/forms.md, "Sizes": the example promises a small field and a
   small button in one row, and `.ipt` is full width, so the button wrapped. */
test("lines the sizes example's small field and button up in one row at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const docs = await readFile(new URL("../../docs/usage/forms.md", import.meta.url), "utf8");
  const example = docs.split("### Sizes")[1]!.split("```html")[1]!.split("```")[0]!;

  await page.setContent(`<!doctype html><html><body style="margin: 0; padding: 16px">${example}</body></html>`);
  await page.addStyleTag({ url: FULL_STYLES_URL });

  const [field, button] = await page.evaluate(() =>
    [document.querySelector("input")!, document.querySelector("button")!].map((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, height: rect.height, right: rect.right };
    }),
  );

  expect(button!.top, "the button shares the field's row").toBe(field!.top);
  expect(button!.height).toBe(field!.height);
  expect(button!.right).toBeLessThanOrEqual(304);
});
