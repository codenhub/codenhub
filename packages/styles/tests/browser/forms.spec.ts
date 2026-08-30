import { expect, test } from "./fixtures";
import {
  expectSameColor,
  flattenColor,
  getColorDistance,
  getContrastRatio,
  isTransparent,
  readSrgb,
} from "./test-utils";

const FORMS_URL = "http://localhost:5184/forms/?env=vanilla";

/* Matrix rows name a fill and an edge, and the test id joins them with a dash the
   way `playground/shared/matrix.js` does. */
const slug = (presentation: string) => presentation.replace(/\s+/gu, "-");

test.describe("forms", () => {
  /* An invalid control is destructive, and it has to be destructive over an
     intent class rather than under one. The rule that says so cannot live inside
     `@utility text-control`: a rule nested there lands in the utilities layer,
     the intent reset lands in no layer at all, and unlayered beats layered at
     any specificity. It did not matter until the control classes joined the
     reset, at which point every invalid field drew a plain grey line and the
     only thing still marking the error was the hint underneath it. Asserting
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

      probe.style.color = "var(--focus-ring)";
      document.body.append(probe);

      const value = getComputedStyle(probe).color;

      probe.remove();

      return value;
    });

    const input = page.getByTestId("field-email-icon-left");
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

  /* A switch's three fills used to render as two looks, so the component varied
     its *line* per fill class instead -- the only place in the package where a
     fill class decided an edge, and the reason `.soft` meant something different
     on a switch than on anything else. Raising the fill cap to 40% retired it.

     This is the assertion that rule is gone: the fills separate as fills, and the
     line is drawn under every one of them. `axes.spec.ts` measures how far apart
     the fills land; this measures that each is distinct and that none of them
     reaches the line.

     The checked track is measured under each because a fill class leaking into
     the edge would cut a page-colored ring out of a filled track. It is no
     longer the same track under all of them: `:checked` lifts the fill bounds
     rather than pinning a fill, so `.solid` reaches full and `.soft` keeps the
     tint it named. */
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

    /* The registry rests a switch at solid, so the two are the same element. */
    expectSameColor(fallback.resting.fill, solid.resting.fill, "resting switch fill");
    expectSameColor(fallback.resting.edge, solid.resting.edge, "resting switch line");

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

    /* The checked track follows the fill class now, so `.solid` is the one that
       matches the default and `.soft` is deliberately quieter than both. */
    expect(
      getColorDistance(soft.checked.fill, solid.checked.fill),
      "a checked soft switch is not a checked solid one",
    ).toBeGreaterThan(20);

    for (const { checked, label } of [{ checked: solid.checked, label: "solid" }]) {
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
     radio states itself with a dot inside a ring. `.soft` is where that reads
     most clearly, because the tint stays light enough for the ring to carry the
     intent whole. The dot is no longer pinned to the intent -- it takes `box`'s
     composed foreground, so it stays readable when a `.solid` radio fills. */
  test("rings a soft checked radio in its intent instead of filling it", async ({ page }) => {
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

      return Object.keys(tokens).map((intent) => {
        const checked = getComputedStyle(document.querySelector(`[data-testid="radio-soft-${intent}-checked"]`)!);
        const resting = getComputedStyle(document.querySelector(`[data-testid="radio-soft-${intent}"]`)!);

        return {
          dot: checked.color,
          fill: checked.backgroundColor,
          label: `radio ${intent}`,
          restingWidth: Number.parseFloat(resting.borderTopWidth),
          ring: checked.borderTopColor,
          ringWidth: Number.parseFloat(checked.borderTopWidth),
          token: tokens[intent]!,
        };
      });
    });

    for (const radio of radios) {
      /* A tint rather than a fill: `.soft` asks for 12% and the checked state
         lifts the cap without changing what the class asked for. */
      expect(readSrgb(radio.fill).alpha, `${radio.label} fill`).toBeLessThan(0.5);
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
      await expect.poll(read, { message: `${testId} hovered border` }).not.toBe(resting);
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

  /* A data URI is a document of its own and inherits nothing from the page, so
     the artwork cannot read `currentColor` or a custom property and ships one
     copy per theme. What the copies buy is that the icon is painted by the
     control itself: no wrapper element, and nothing between a field and its
     glyph. */
  test("paints a field icon on the control itself and swaps it with the theme", async ({ page }) => {
    await page.goto(FORMS_URL);

    const read = (testId: string) =>
      page.getByTestId(testId).evaluate((node) => {
        const styles = getComputedStyle(node);

        return { image: styles.backgroundImage, position: styles.backgroundPosition };
      });

    const email = await read("field-email-icon-left");
    const password = await read("field-password-icon-left");
    const right = await read("field-email-icon-right");
    const standard = await read("field-search-standard");

    expect(email.image, "email artwork").toContain("data:image/svg+xml");
    /* One picture per type, and the type is what chooses it. */
    expect(password.image, "password artwork").not.toBe(email.image);
    /* `.right` moves the same artwork rather than swapping it. */
    expect(right.image, "right artwork").toBe(email.image);
    expect(right.position, "right position").not.toBe(email.position);
    /* A typed control with no `.icon` paints nothing, so the class stays opt-in
       and a field never reserves room for artwork it will not draw. */
    expect(standard.image, "a control that did not opt in").toBe("none");

    /* The copies are the whole reason the theme blocks exist: a colour would
       resolve at the point of use through `light-dark()`, an image cannot. */
    await page.evaluate(() => document.documentElement.classList.add("dark"));

    const dark = await read("field-email-icon-left");

    expect(dark.image, "the dark copy").toContain("data:image/svg+xml");
    expect(dark.image, "the theme picks between two copies").not.toBe(email.image);
  });

  /* Seven typed rules set `--ipt-icon-src`, and `.icon` can be written on a
     control outside those seven. Without a fallback the declaration is invalid
     at computed-value time, which lands on the same `none` -- the fallback is
     there so the rule says what it does rather than relying on that. Either way
     the control must paint no artwork while still reserving its room. */
  test("paints no artwork on a control the seven typed rules do not name", async ({ page }) => {
    await page.goto(FORMS_URL);

    const uncovered = await page.evaluate(() => {
      const host = document.createElement("div");

      host.innerHTML = `<input type="text" class="ipt icon" />`;
      document.body.append(host);

      const styles = getComputedStyle(host.querySelector("input")!);
      const values = { image: styles.backgroundImage, paddingLeft: styles.paddingLeft };

      host.remove();

      return values;
    });

    expect(uncovered.image, "an uncovered control paints nothing").toBe("none");
    expect(Number.parseFloat(uncovered.paddingLeft), "and still reserves its room").toBeGreaterThan(12);
  });

  test("reserves room for a field icon only when the control opts in", async ({ page }) => {
    await page.goto(FORMS_URL);

    const padding = await page.evaluate(() => {
      const read = (testId: string) => {
        const styles = getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

        return { left: styles.paddingLeft, right: styles.paddingRight };
      };

      return {
        left: read("field-email-icon-left"),
        right: read("field-email-icon-right"),
        standard: read("field-search-standard"),
      };
    });

    // A search input without `.icon` keeps the plain control padding.
    expect(padding.standard.left).toBe("12px");
    expect(Number.parseFloat(padding.left.left)).toBeGreaterThan(12);
    expect(Number.parseFloat(padding.right.right)).toBeGreaterThan(12);
    expect(padding.right.left).toBe("12px");
  });

  test("styles only hint error messages as field helper text", async ({ page }) => {
    await page.goto(FORMS_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
      const field = document.querySelector('[data-testid="field-error"]')!.parentElement!;
      const bareError = document.createElement("span");

      bareError.className = "error";
      bareError.textContent = "Bare error intent";
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
});
