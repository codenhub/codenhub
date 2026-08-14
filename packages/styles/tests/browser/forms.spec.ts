import { expect, test } from "@playwright/test";

import { expectSameColor, getColorDistance, getContrastRatio, isTransparent, readSrgb } from "./test-utils";

const FEEDBACK_URL = "http://localhost:5184/feedback/?env=vanilla";
const FORMS_URL = "http://localhost:5184/forms/?env=vanilla";

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
      const probe = document.createElement("span");
      probe.style.color = "var(--color-destructive)";
      document.body.append(probe);
      const destructive = getComputedStyle(probe).color;
      probe.remove();

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
        bare: read("ipt-bare-none").backgroundColor,
        default: read("ipt-default-none").backgroundColor,
        inheritedBackground: inheritedStyles.backgroundColor,
        inheritedBorderColor: inheritedStyles.borderTopColor,
        inheritedBorderWidth: inheritedStyles.borderTopWidth,
        soft: read("ipt-soft-none").backgroundColor,
        solid: read("ipt-solid-none").backgroundColor,
      };

      host.remove();

      return result;
    });

    /* `.solid` clamps to the same tint as `.soft` rather than a saturated fill. */
    expectSameColor(styles.solid, styles.soft, "solid input clamps to the soft tint");
    expect(getColorDistance(styles.solid, styles.default)).toBeGreaterThan(1);
    /* `.bare` is the published resting fill, so it lands on the default. */
    expectSameColor(styles.bare, styles.default, "bare input is the resting fill");

    /* The cascade case: the clamp and the edge floor both hold on an input that
       declared nothing itself. */
    expectSameColor(styles.inheritedBackground, styles.soft, "inherited solid clamps");
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

  /* Both tints are mixed toward `transparent`, so their strength is their alpha.
     Comparing them against an opaque token instead would be dominated by that
     alpha gap and report every tint as equally distant. */
  test("caps a text control's tint at the published soft fill", async ({ page }) => {
    await page.goto(FORMS_URL);

    const solidInput = await page
      .getByTestId("ipt-solid-success")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    await page.goto(FEEDBACK_URL);

    const softBadge = await page
      .getByTestId("badge-soft-edgeless-success")
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    const solidBadge = await page
      .getByTestId("badge-solid-success")
      .evaluate((element) => getComputedStyle(element).backgroundColor);

    const inputAlpha = readSrgb(solidInput).alpha;

    /* The cap is the soft tint exactly, so a container's `.solid` puts a field at
       the same strength a soft chip carries and nowhere near a filled one. */
    expect(inputAlpha).toBeGreaterThan(0);
    expect(inputAlpha).toBeCloseTo(readSrgb(softBadge).alpha, 2);
    expect(inputAlpha).toBeLessThan(readSrgb(solidBadge).alpha / 2);
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

  /* A switch's three fills used to render as two looks. `text-control` caps every
     fill at 12% -- lifting it would make an unchecked `.solid` switch look
     checked -- so `.solid` and `.soft` land on the same tint and `.bare` landed
     on the resting default. The line is the only lever left, so the line is what
     separates them, and this measures the line rather than the fill.

     The checked track is measured under all four because that is the part
     presentation may not reach: a checked switch is filled with its intent and
     its line is that fill, so a rule that made the line transparent without
     excluding `:checked` would cut a page-colored ring out of a filled track. */
  test("separates a switch's presentations by its line and leaves the checked track alone", async ({ page }) => {
    await page.goto(FORMS_URL);

    const read = async (presentation: string) => {
      const cell = (suffix: string) =>
        page.getByTestId(`switch-${presentation}-none${suffix}`).evaluate((element) => {
          const styles = getComputedStyle(element);

          return { edge: styles.borderTopColor, fill: styles.backgroundColor };
        });

      return { checked: await cell("-checked"), resting: await cell("") };
    };

    const fallback = await read("default");
    const solid = await read("solid");
    const soft = await read("soft");
    const bare = await read("bare");

    /* The registry rests a switch at solid, so the two are the same element. */
    expectSameColor(fallback.resting.fill, solid.resting.fill, "resting switch fill");
    expectSameColor(fallback.resting.edge, solid.resting.edge, "resting switch line");

    expect(isTransparent(solid.resting.edge), "solid switch line").toBe(false);
    expect(isTransparent(solid.resting.fill), "solid switch track").toBe(false);

    expectSameColor(soft.resting.fill, solid.resting.fill, "soft switch track");
    expect(isTransparent(soft.resting.edge), "soft switch line").toBe(true);

    expect(isTransparent(bare.resting.fill), "bare switch track").toBe(true);
    expect(isTransparent(bare.resting.edge), "bare switch line").toBe(true);

    for (const { checked, label } of [
      { checked: solid.checked, label: "solid" },
      { checked: soft.checked, label: "soft" },
      { checked: bare.checked, label: "bare" },
    ]) {
      expectSameColor(checked.fill, fallback.checked.fill, `checked ${label} switch track`);
      expectSameColor(checked.edge, fallback.checked.edge, `checked ${label} switch line`);
    }

    /* One pointer, so the two are hovered in turn. Soft reveals the track it was
       carrying as a tint; bare has renounced the track and has nothing to show.

       The line transitions in, so this waits it out rather than reading the first
       frame -- which is transparent either way. For bare the same pause is the
       point: it gives a line the time to appear before the assertion says it
       never did. */
    const hoveredEdge = async (presentation: string) => {
      const control = page.getByTestId(`switch-${presentation}-none`);

      await control.hover();
      await page.waitForTimeout(500);

      return control.evaluate((element) => getComputedStyle(element).borderTopColor);
    };

    expect(isTransparent(await hoveredEdge("soft")), "hovered soft switch line").toBe(false);
    expect(isTransparent(await hoveredEdge("bare")), "hovered bare switch line").toBe(true);
  });

  /* A checkbox states itself by filling and cutting a tick out of the ground; a
     radio states itself with a dot inside a ring, and the dot is the same color
     as the ring. Filling the circle as well leaves a disc with an invisible dot
     in it, which is what the shared checked rule made of every radio. */
  test("rings a checked radio in its intent instead of filling it", async ({ page }) => {
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
        const checked = getComputedStyle(document.querySelector(`[data-testid="radio-default-${intent}-checked"]`)!);
        const resting = getComputedStyle(document.querySelector(`[data-testid="radio-default-${intent}"]`)!);

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
      expect(isTransparent(radio.fill), `${radio.label} fill`).toBe(true);
      expectSameColor(radio.ring, radio.token, `${radio.label} ring`);
      expectSameColor(radio.dot, radio.token, `${radio.label} dot`);
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
        for (const fill of ["soft", "bare"]) {
          const direct = document.querySelector(`[data-testid="${component}-${fill}-none"]`)!;
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

  /* A data URI cannot read `currentColor` or a custom property, which is why the
     icons used to ship a light, a dark, a focused-light and a focused-dark copy
     of the same paths. They are masks now: one picture per type, coloured by the
     element behind it. The wrapper is what makes that possible -- a text input is
     replaced content and generates no pseudo-element of its own. */
  test("paints a field icon from the control wrapper and colors it by state", async ({ page }) => {
    await page.goto(FORMS_URL);

    const icons = await page.evaluate(() => {
      const read = (testId: string) => {
        const wrapper = document.querySelector(`[data-testid="${testId}"]`)!;
        const styles = getComputedStyle(wrapper, "::before");

        return {
          background: styles.backgroundColor,
          content: styles.content,
          inlineStart: styles.insetInlineStart,
          inlineEnd: styles.insetInlineEnd,
          mask: styles.maskImage || styles.getPropertyValue("-webkit-mask-image"),
        };
      };

      return {
        email: read("control-email-icon-left"),
        password: read("control-password-icon-left"),
        right: read("control-email-icon-right"),
        standard: read("control-search-standard"),
      };
    });

    expect(icons.email.mask, "email artwork").toContain("data:image/svg+xml");
    /* One picture per type, not one per type per theme per state. */
    expect(icons.password.mask, "password artwork").not.toBe(icons.email.mask);
    /* `.right` moves the same artwork rather than swapping it. */
    expect(icons.right.mask, "right artwork").toBe(icons.email.mask);
    expect(icons.right.inlineEnd, "right position").not.toBe("auto");
    expect(icons.email.inlineStart, "left position").not.toBe("auto");
    /* A wrapper with no `.icon` inside paints nothing, so the class stays opt-in
       and a field never reserves room for artwork it will not draw. */
    expect(icons.standard.content, "no-icon wrapper").toBe("none");

    /* The mask takes the surrounding text colour at a fixed remove and goes to
       full strength while the control is focused, which is what the four
       baked-in variants were approximating. */
    const resting = icons.email.background;

    await page.getByTestId("field-email-icon-left").focus();

    expect(readSrgb(resting).alpha, "resting icon is dimmed").toBeLessThan(1);
    /* The icon colour is transitioned, so this polls for the settled value. */
    await expect
      .poll(
        async () =>
          readSrgb(
            await page
              .getByTestId("control-email-icon-left")
              .evaluate((element) => getComputedStyle(element, "::before").backgroundColor),
          ).alpha,
      )
      .toBe(1);
  });

  /* Seven typed rules set `--ipt-icon-src` and the artwork rule fires on any
     `.control` wrapping an `.icon`, so a control outside those seven resolves an
     undefined `var()`. With no fallback that declaration is invalid at
     computed-value time and `mask-image` takes its initial `none` -- no mask
     rather than an empty one -- and the box paints as a solid coloured square
     next to the text. The fallback has to be a transparent image, not `none`. */
  test("masks the icon box away on a control the artwork does not cover", async ({ page }) => {
    await page.goto(FORMS_URL);

    const uncovered = await page.evaluate(() => {
      const host = document.createElement("div");

      host.innerHTML = `<div class="control"><span class="icon"></span><input type="text" class="ipt" /></div>`;
      document.body.append(host);

      const styles = getComputedStyle(host.querySelector(".control")!, "::before");
      const values = {
        content: styles.content,
        mask: styles.maskImage || styles.getPropertyValue("-webkit-mask-image"),
      };

      host.remove();

      return values;
    });

    expect(uncovered.content, "the wrapper still generates the box").not.toBe("none");
    /* Pinned rather than merely not `none`. The contract is that the box is
       masked away, and an opaque fallback would satisfy `not none` while painting
       the solid square this test exists to catch. All three engines serialise the
       transparent gradient identically. */
    expect(uncovered.mask, "an uncovered control masks the box away").toBe(
      "linear-gradient(rgba(0, 0, 0, 0), rgba(0, 0, 0, 0))",
    );
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
