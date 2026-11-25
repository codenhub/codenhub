import { expect, test } from "./fixtures";
import {
  expectSameColor,
  flattenColor,
  getColorDistance,
  getContrastRatio,
  isTransparent,
  ORIGIN,
  readSrgb,
  settleAnimations,
} from "./test-utils";

const FEEDBACK_URL = `${ORIGIN}/feedback/?env=vanilla`;
/* The forms page renders `@codenhub/icons` glyphs, which the alert-icon check needs. */
const FORMS_URL = `${ORIGIN}/forms/?env=vanilla`;

test.describe("feedback", () => {
  test("loads canonical compiled styles with tokens and components", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    await expect(page.getByTestId("preview-root")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Feedback", exact: true })).toBeVisible();

    const badgeStyles = await page.getByTestId("badge-default-primary").evaluate((element) => {
      const styles = getComputedStyle(element);

      return {
        backgroundColor: styles.backgroundColor,
        borderRadius: styles.borderRadius,
        color: styles.color,
      };
    });

    expect(badgeStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(badgeStyles.color).not.toBe(badgeStyles.backgroundColor);
    expect(badgeStyles.borderRadius).not.toBe("0px");
  });

  /* The package no longer paints an icon: `.alert-icon`'s own end margin
     spaces a real icon child from the message with nothing to trigger. */
  test("spaces an alert's icon from its message and keeps a readable border", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const alertStyles = await page.getByTestId("alert-default-success").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { borderWidth: styles.borderWidth, color: styles.color };
    });
    const iconLayout = await page.getByTestId("alert-default-success-icon").evaluate((element) => {
      const icon = element.querySelector(".alert-icon");
      if (!icon) {
        throw new Error("Expected the icon-state alert fixture to contain a .alert-icon child.");
      }
      return { gap: getComputedStyle(icon).marginInlineEnd, iconWidth: icon.getBoundingClientRect().width };
    });

    expect(alertStyles.borderWidth).not.toBe("0px");
    expect(alertStyles.color).not.toBe("rgba(0, 0, 0, 0)");
    expect(iconLayout.gap).not.toBe("0px");
    expect(iconLayout.iconWidth).toBe(20);
  });

  test("animates skeletons and styles progress tracks", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const skeletonAnimationName = await page
      .getByTestId("skeleton-default-none")
      .evaluate((element) => getComputedStyle(element).animationName);
    const progressStyles = await page.getByTestId("progress-default-none").evaluate((element) => {
      const styles = getComputedStyle(element);
      return { backgroundColor: styles.backgroundColor, overflow: styles.overflow };
    });

    expect(skeletonAnimationName).not.toBe("none");
    expect(progressStyles.overflow).toBe("hidden");
    expect(progressStyles.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  /* `.progress` cannot `@apply box` -- the value fill is a `::after`, not the
     element's own background -- so the track hand-reimplements the formula the
     way `.quote` does, and `composition: "none"` drops it from `axes.spec.ts`'s
     generic probe the same way it drops `.quote`. This is that component's own
     dedicated coverage instead. See docs/internal/model.md#components-that-do-not-take-the-whole-of-box. */
  test("renders every progress track presentation", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      return {
        defaultBackground: get("progress-default-primary").backgroundColor,
        defaultBorder: get("progress-default-primary").borderTopColor,
        defaultBorderWidth: get("progress-default-primary").borderTopWidth,
        ghostEdgedBackground: get("progress-ghost-edged-primary").backgroundColor,
        ghostEdgedBorder: get("progress-ghost-edged-primary").borderTopColor,
        ghostEdgelessBackground: get("progress-ghost-edgeless-primary").backgroundColor,
        ghostEdgelessBorder: get("progress-ghost-edgeless-primary").borderTopColor,
        softEdgedBackground: get("progress-soft-edged-primary").backgroundColor,
        softEdgedBorder: get("progress-soft-edged-primary").borderTopColor,
        softEdgedBorderWidth: get("progress-soft-edged-primary").borderTopWidth,
        softEdgelessBackground: get("progress-soft-edgeless-primary").backgroundColor,
        softEdgelessBorder: get("progress-soft-edgeless-primary").borderTopColor,
      };
    });

    /* The registry default is `.soft.edgeless`: tinted track, no line. */
    expect(isTransparent(styles.defaultBackground), "default track tints").toBe(false);
    expect(isTransparent(styles.defaultBorder), "default track draws no line").toBe(true);
    expectSameColor(styles.defaultBackground, styles.softEdgelessBackground, "default is soft edgeless");

    /* `.ghost` asks for zero fill, so the track stays on its `transparent`
       ground. `.ghost.edged` is an outline around the moving fill; pairing it
       with `.edgeless` -- discouraged, not unsupported -- leaves the track with
       neither fill nor line. */
    expect(isTransparent(styles.ghostEdgedBackground), "ghost edged track has no fill").toBe(true);
    expect(isTransparent(styles.ghostEdgedBorder), "ghost edged track draws a line").toBe(false);
    expect(isTransparent(styles.ghostEdgelessBackground), "ghost edgeless track has no fill").toBe(true);
    expect(isTransparent(styles.ghostEdgelessBorder), "ghost edgeless track draws no line").toBe(true);

    /* `.soft` tints the track either way; only `.edged` draws the line. P3
       blends the line toward the track's own background before the edge amount
       is applied, so `.edgeless` reads as no line at every fill, not only at
       zero -- the same property `.quote`'s equivalent test holds it to. */
    expect(isTransparent(styles.softEdgedBackground), "soft edged track has no fill").toBe(false);
    expect(isTransparent(styles.softEdgedBorder), "soft edged track draws no line").toBe(false);
    expect(isTransparent(styles.softEdgelessBorder), "soft edgeless track draws a line").toBe(true);

    /* No presentation scales the track's border, only whether it is drawn. */
    expect(Number.parseFloat(styles.defaultBorderWidth)).toBeGreaterThan(0);
    expect(styles.softEdgedBorderWidth).toBe(styles.defaultBorderWidth);
  });

  /* An indicator reads intent and no presentation token at all: it stands in for
     content rather than being a box with a look, so there is nothing a fill or an
     edge class has to say about it. The floor that used to keep an unfilled
     skeleton visible is gone with the `--ui-fill` read it was fighting. */
  test("renders a skeleton from its intent alone", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const host = document.querySelector('[data-testid="preview-root"]')!;
      const read = (className: string) => {
        const skeleton = document.createElement("div");

        skeleton.className = `skeleton ${className}`;
        host.append(skeleton);

        const computed = getComputedStyle(skeleton);
        const values = { border: computed.borderTopWidth, image: computed.backgroundImage };

        skeleton.remove();

        return values;
      };

      return {
        ghostEdgeless: read("primary ghost edgeless"),
        plain: read("primary"),
        secondary: read("secondary"),
        solidEdged: read("primary solid edged"),
      };
    });

    expect(styles.plain.image).not.toBe("none");
    /* Both ends of both axes land on the same pixels as no class at all. */
    expect(styles.solidEdged.image, "solid edged").toBe(styles.plain.image);
    expect(styles.ghostEdgeless.image, "ghost edgeless").toBe(styles.plain.image);
    expect(styles.solidEdged.border, "no edge to draw").toBe("0px");
    /* Intent is the one axis it does read. */
    expect(styles.secondary.image).not.toBe(styles.plain.image);
  });

  test("renders every alert fill", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const read = (testId: string) => {
        const element = getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

        return {
          background: element.backgroundColor,
          border: element.borderTopColor,
          color: element.color,
        };
      };

      const probe = document.createElement("span");

      probe.style.color = "var(--color-background)";
      document.body.append(probe);

      const ground = getComputedStyle(probe).color;

      probe.remove();

      return {
        ghost: read("alert-ghost-edged-info"),
        ground,
        softEdgeless: read("alert-soft-edgeless-warning"),
        solid: read("alert-solid-info"),
      };
    });

    /* Solid fills and flips the text to the contrast tone. */
    expect(isTransparent(styles.solid.background)).toBe(false);
    expect(getColorDistance(styles.solid.color, styles.solid.background)).toBeGreaterThan(2);
    /* Soft tints and keeps the intent tone; `.edgeless` drops the line. */
    expect(isTransparent(styles.softEdgeless.background)).toBe(false);
    expect(getColorDistance(styles.softEdgeless.color, styles.softEdgeless.background)).toBeGreaterThan(2);
    /* `.edgeless` zeroes the line, and P3 then blends what is left toward the
       fill: on a surface that leaves the fill's own twelve percent against the
       opaque line an `.edged` one draws. The border box sits over the alert's own
       background, so that reads as a seamless boundary rather than a gap. */
    expect(readSrgb(styles.softEdgeless.border).alpha, "edgeless alert line").toBeLessThanOrEqual(0.13);
    expect(readSrgb(styles.ghost.border).alpha, "edged alert line").toBe(1);
    /* Bare adds no fill, so what is left is the ground every surface rests on --
       an alert is a container, and a container is opaque. `.edged` still draws
       the line. */
    expectSameColor(styles.ghost.background, styles.ground, "ghost alert ground");
    expect(isTransparent(styles.ghost.border)).toBe(false);
  });

  test("renders every badge fill", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const read = (testId: string) => {
        const element = getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

        return {
          background: element.backgroundColor,
          border: element.borderTopColor,
          color: element.color,
        };
      };
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");

        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);

        const color = getComputedStyle(probe).color;

        probe.remove();

        return color;
      };

      /* The edge axis is not on the grid at `.solid` -- one row stands for both,
         because they render the same box -- so the pair is built here to prove
         that is true rather than assumed. */
      const probe = (className: string) => {
        const element = document.createElement("span");

        element.className = className;
        document.body.append(element);

        const styles = getComputedStyle(element);
        const values = { background: styles.backgroundColor, border: styles.borderTopColor };

        element.remove();

        return values;
      };

      return {
        edgedSolid: probe("badge info solid edged"),
        edgelessSolid: probe("badge info solid edgeless"),
        solidInfo: read("badge-solid-info"),
        solidPrimary: read("badge-solid-primary"),
        solidSecondary: read("badge-solid-secondary"),
        softSuccess: read("badge-soft-edgeless-success"),
        tokenAccent: resolveToken("accent"),
        tokenAccentContrast: resolveToken("accent-contrast"),
        tokenPrimary: resolveToken("primary"),
        tokenPrimaryContrast: resolveToken("primary-contrast"),
      };
    });

    /* A solid badge fills with the intent and reads in the contrast tone. */
    expect(isTransparent(styles.solidInfo.background)).toBe(false);
    expect(getColorDistance(styles.solidInfo.color, styles.solidInfo.background)).toBeGreaterThan(2);
    /* P3: a filled badge's edge fades out as the fill fills in, so at a full fill
       `.edged` and `.edgeless` both draw nothing and the border box shows the
       fill running under it. Two spellings, one box. */
    expect(isTransparent(styles.edgedSolid.border), "solid edged badge edge").toBe(true);
    expect(isTransparent(styles.edgelessSolid.border), "solid edgeless badge edge").toBe(true);
    expectSameColor(styles.edgelessSolid.background, styles.edgedSolid.background, "solid badge fill");

    expectSameColor(styles.solidPrimary.background, styles.tokenPrimary, "solid primary badge");
    expectSameColor(styles.solidPrimary.color, styles.tokenPrimaryContrast, "solid primary badge text");
    // Secondary maps to the accent token pair.
    expectSameColor(styles.solidSecondary.background, styles.tokenAccent, "solid secondary badge");
    expectSameColor(styles.solidSecondary.color, styles.tokenAccentContrast, "solid secondary badge text");

    /* An edgeless box draws no edge at all, so the border band shows the fill
       through it and the boundary is the fill rather than a ring. Asserting the
       colour matched the fill instead would pass on a band painted a second coat
       of a translucent tint, which is the ring it is meant to rule out. */
    expect(isTransparent(styles.softSuccess.background)).toBe(false);
    expect(isTransparent(styles.softSuccess.border), "soft badge edge").toBe(true);
  });

  /* The plate runs under the border, so a line blended toward the plate painted
     it a second time over itself. Invisible on an opaque plate; on a translucent
     one -- any fill `--ui-bg-alpha` thins, and a neutral fill capped at 20%
     until the cap came to rest on the page background -- it drew a ring 1.54:1
     against the plate in light. Measured as painted: the border band
     composited over the plate over the page must be the plate. */
  test("paints a filled edge as one coat of its own translucent plate", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const bands = await page.evaluate(() => {
      const pageColor = getComputedStyle(document.body).backgroundColor;
      const cases: [string, string, string, string][] = [
        ["thinned solid edged success badge", "span", "badge solid edged success", "--ui-bg-alpha: 0.8"],
        ["thinned solid edged success button", "button", "btn solid edged success", "--ui-bg-alpha: 0.8"],
        ["thinned solid success quote", "blockquote", "quote solid success", "--ui-bg-alpha: 0.8"],
      ];

      return cases.map(([label, tag, className, style]) => {
        const element = document.createElement(tag);
        element.className = className;
        element.setAttribute("style", style);
        element.textContent = "Band";
        document.body.append(element);

        const styles = getComputedStyle(element);
        const side = tag === "blockquote" ? "left" : "top";
        const result = {
          border: styles.getPropertyValue(`border-${side}-color`),
          label,
          pageColor,
          plate: styles.backgroundColor,
        };

        element.remove();
        return result;
      });
    });

    for (const { border, label, pageColor, plate } of bands) {
      const painted = flattenColor(plate, pageColor);
      expect(readSrgb(plate).alpha, `${label} plate is translucent`).toBeLessThan(1);
      expectSameColor(flattenColor(border, painted), painted, `${label} band`);
    }
  });

  test("uses the neutral text tokens when no intent is set", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const values = await page.evaluate(() => {
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };

      const read = (testId: string, pseudo?: string) =>
        getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!, pseudo);

      return {
        alertFg: read("alert-default-none").color,
        badgeFg: read("badge-default-none").color,
        progressBg: read("progress-default-none", "::after").backgroundColor,
        tokenText: resolveToken("text"),
        tokenTextStrong: resolveToken("text-strong"),
      };
    });

    /* Text on a page is the strong tone, which for the neutral intent is the ink.
       A progress fill is not text: it takes `--intent-color` directly, because an
       indicator is a shape rather than something to read. */
    expectSameColor(values.alertFg, values.tokenTextStrong, "no-intent alert text");
    expectSameColor(values.badgeFg, values.tokenTextStrong, "no-intent badge text");
    expectSameColor(values.progressBg, values.tokenText, "no-intent progress fill");
  });

  test("colors progress fills by intent", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const styles = await page.evaluate(() => {
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const fill = (testId: string) =>
        getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!, "::after").backgroundColor;

      return {
        progressDestructive: fill("progress-default-destructive"),
        progressInfo: fill("progress-default-info"),
        progressPrimary: fill("progress-default-primary"),
        progressSecondary: fill("progress-default-secondary"),
        progressSuccess: fill("progress-default-success"),
        progressWarning: fill("progress-default-warning"),
        tokenDestructive: resolveToken("destructive"),
        tokenInfo: resolveToken("info"),
        tokenPrimary: resolveToken("primary"),
        tokenSecondary: resolveToken("accent"),
        tokenSuccess: resolveToken("success"),
        tokenWarning: resolveToken("warning"),
      };
    });

    expect(styles.progressPrimary).toBe(styles.tokenPrimary);
    expect(styles.progressSecondary).toBe(styles.tokenSecondary);
    expect(styles.progressSuccess).toBe(styles.tokenSuccess);
    expect(styles.progressWarning).toBe(styles.tokenWarning);
    expect(styles.progressDestructive).toBe(styles.tokenDestructive);
    expect(styles.progressInfo).toBe(styles.tokenInfo);
  });

  test("renders active progress bar with skeleton animation on pseudo-element", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const activeProgressStyles = await page.evaluate(() => {
      const beforeStyles = getComputedStyle(
        document.querySelector('[data-testid="progress-default-none-active"]')!,
        "::before",
      );
      return {
        animationName: beforeStyles.animationName,
        display: beforeStyles.display,
        backgroundImage: beforeStyles.backgroundImage,
      };
    });

    expect(activeProgressStyles.animationName).toContain("anim-skeleton");
    expect(activeProgressStyles.display).toBe("block");
    expect(activeProgressStyles.backgroundImage).toContain("linear-gradient");
  });

  test("renders indeterminate progress bar with sliding animation", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const indeterminateProgressStyles = await page.evaluate(() => {
      const afterStyles = getComputedStyle(
        document.querySelector('[data-testid="progress-default-none-indeterminate"]')!,
        "::after",
      );
      return {
        animationName: afterStyles.animationName,
        display: afterStyles.display,
        width: afterStyles.width,
      };
    });

    expect(indeterminateProgressStyles.animationName).toContain("anim-progress-indeterminate");
    expect(indeterminateProgressStyles.display).toBe("block");
    expect(indeterminateProgressStyles.width).not.toBe("0px");
  });

  /* The bubble rests flat: no depth of its own with no aesthetic in scope.
     Depth is opt-in through the elevation modifier like any other component,
     and it is asked for on `.tooltip-bubble` directly now, the same as on any
     other component -- `.tooltip-bubble.floating`, two units against a raised
     card's one, is the pre-0.1.0 look. */
  test("rests a tooltip bubble flat and lifts it only when asked", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const offsets = await page.evaluate(() => {
      /* Every engine serialises a layer as `<colour> <x> <y> <blur> <spread>`, so
         the vertical offset is the second length after the colour closes. */
      const verticalOffset = (shadow: string) => Number.parseFloat(shadow.split(") ")[1]!.split(" ")[1]!);
      const host = document.querySelector('[data-testid="preview-root"]')!;

      const bubble = (bubbleClassName: string) => {
        const wrapper = document.createElement("span");
        const bubbleEl = document.createElement("span");
        wrapper.className = "tooltip";
        wrapper.dataset.state = "open";
        bubbleEl.className = bubbleClassName;
        bubbleEl.textContent = "Message";
        wrapper.append(bubbleEl);
        host.append(wrapper);
        return bubbleEl;
      };

      const flat = bubble("tooltip-bubble");
      const floating = bubble("tooltip-bubble floating");
      const card = document.createElement("div");
      card.className = "card raised";
      host.append(card);

      const values = {
        flat: verticalOffset(getComputedStyle(flat).boxShadow),
        floating: verticalOffset(getComputedStyle(floating).boxShadow),
        card: verticalOffset(getComputedStyle(card).boxShadow),
      };

      flat.closest(".tooltip")!.remove();
      floating.closest(".tooltip")!.remove();
      card.remove();

      return values;
    });

    expect(offsets.flat, "a bare tooltip bubble draws no depth of its own").toBe(0);
    expect(offsets.card, "a raised card draws a step of depth").toBeGreaterThan(0);
    expect(offsets.floating, "a floating tooltip is twice a raised card").toBe(offsets.card * 2);
  });

  test("uses a default tooltip position when no position attribute is set", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const tooltipStyles = await page.getByTestId("fallback-tooltip").evaluate((element) => {
      const bubbleEl = element.querySelector(".tooltip-bubble");
      if (!bubbleEl) {
        throw new Error("Expected the fallback tooltip fixture to contain a .tooltip-bubble child.");
      }
      const styles = getComputedStyle(bubbleEl);

      return {
        left: styles.left,
        top: styles.top,
        transformOrigin: styles.transformOrigin,
      };
    });

    expect(tooltipStyles.left).not.toBe("auto");
    expect(tooltipStyles.top).not.toBe("auto");
    expect(tooltipStyles.transformOrigin).not.toBe("");
  });

  /* The bubble used to pin its fill at solid so a container's `.ghost` could not
     reach it. It rests on a tinted ground now and reads presentation like
     anything else, which means this is the assertion the pin used to be, stated
     as a property rather than as a refusal: a bubble is opaque and its label
     reads, at every presentation, whether the presentation is its own or a
     container's.

     Both directions are covered because they fail differently. The bubble's own
     class is what a consumer writes; the container's is what our own cascade
     does to a bubble nobody classed, and that second one is the case that
     produced a boundaryless bubble floating over arbitrary content. */
  test("keeps a tooltip bubble opaque and legible at every presentation", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    const bubbles = await page.evaluate(() => {
      const host = document.createElement("div");
      document.body.append(host);

      /* "own" is a class read directly on the element that paints -- the bubble
         -- and "container" is the same class one level up, on an ancestor of
         the whole `.tooltip` wrapper. Both directions matter because they fail
         differently: "own" is what a consumer writes on the bubble itself,
         "container" is what our own cascade does to a bubble nobody classed,
         and the second one is the case that used to produce a boundaryless
         bubble floating over arbitrary content. */
      const read = ({ container, own }: { container: string; own: string }) => {
        const wrapper = document.createElement("div");
        wrapper.className = container;
        const tooltip = document.createElement("span");
        const bubble = document.createElement("span");
        tooltip.className = "tooltip";
        tooltip.dataset.state = "open";
        bubble.className = `tooltip-bubble ${own}`.trim();
        bubble.textContent = "Message";
        tooltip.append(bubble);
        wrapper.append(tooltip);
        host.append(wrapper);

        const styles = getComputedStyle(bubble);
        const values = { background: styles.backgroundColor, foreground: styles.color, label: `${container}>${own}` };

        wrapper.remove();

        return values;
      };

      const presentations = ["", "ghost", "soft", "solid", "primary", "destructive", "destructive solid"];
      const values = [
        ...presentations.map((own) => read({ container: "", own })),
        ...presentations.map((container) => read({ container, own: "" })),
      ];

      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const tokens = { page: getComputedStyle(document.body).backgroundColor, primary: resolveToken("primary") };

      host.remove();

      return { tokens, values };
    });

    for (const bubble of bubbles.values) {
      expect(readSrgb(bubble.background).alpha, `${bubble.label} bubble ground`).toBe(1);
      expect(
        getContrastRatio(bubble.foreground, bubble.background),
        `${bubble.label} bubble label`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    /* And the two looks themselves, because "legible" says neither "quiet" nor
       "coloured", and the bubble owes both. With no intent it is a quiet plate --
       the neutral fill stops at its cap, so it never reaches the page's ink,
       which in a dark theme would be a white slab. With one it is that intent's
       own colour at full strength, the way a filled button is. */
    const resting = bubbles.values.find((bubble) => bubble.label === ">")!;
    const primary = bubbles.values.find((bubble) => bubble.label === ">primary")!;

    expect(getContrastRatio(resting.background, bubbles.tokens.page), "resting bubble is quiet").toBeLessThan(3);
    expect(getContrastRatio(primary.background, bubbles.tokens.page), "primary bubble is not").toBeGreaterThan(5);
    expectSameColor(primary.background, bubbles.tokens.primary, "primary bubble ground");
  });

  /* WCAG 1.4.13: content shown on hover has to be hoverable itself. The bubble
     sits a gap away from its trigger, so it lingers long enough for the
     pointer to cross that gap, and once over the bubble the host is still
     hovered. A hidden bubble is out of the way: nothing under the pointer.
     Under reduced motion too: the bubble stops growing, but it still has to be
     there to land on while it lingers, so it cannot shrink away at once. */
  for (const motion of [
    { label: "", reducedMotion: "no-preference", attribute: null },
    { label: " under reduced motion", reducedMotion: "reduce", attribute: null },
    { label: ' under data-motion="reduce"', reducedMotion: "no-preference", attribute: "reduce" },
    { label: ' under data-motion="none"', reducedMotion: "no-preference", attribute: "none" },
  ] as const) {
    test(`keeps a tooltip open while the pointer crosses onto its bubble${motion.label}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion.reducedMotion });
      await page.goto(FEEDBACK_URL);

      await page.evaluate((attribute) => {
        if (attribute) {
          document.documentElement.dataset.motion = attribute;
        }
      }, motion.attribute);

      await page.evaluate(() => {
        const host = document.createElement("div");
        host.style.cssText = "padding: 6rem 2rem";
        host.innerHTML =
          '<span class="tooltip" data-probe="host"><button type="button">Trigger</button><span class="tooltip-bubble" data-probe="bubble">A message long enough to aim for</span></span>';
        document.body.prepend(host);
      });

      const trigger = page.locator('[data-probe="host"] button');
      const bubble = page.locator('[data-probe="bubble"]');

      expect(await bubble.evaluate((element) => getComputedStyle(element).visibility)).toBe("hidden");
      /* The default linger, read rather than raced. The cross below then runs
         under a linger no runner can outlast, so it proves the bubble can be
         reached at all, without the pause between moves ever counting. */
      expect(await bubble.evaluate((element) => getComputedStyle(element).transitionDelay.split(",")[0])).toBe("0.3s");
      await page.locator('[data-probe="host"]').evaluate((element) => {
        element.style.setProperty("--tooltip-linger", "60s");
      });

      await trigger.hover();
      await expect(bubble).toHaveCSS("opacity", "1");

      const triggerBox = (await trigger.boundingBox())!;
      const bubbleBox = (await bubble.boundingBox())!;
      const x = bubbleBox.x + bubbleBox.width / 2;

      /* Into the gap, then onto the bubble: only the linger keeps it there to
         land on. It lands by the bubble's near edge, the transform origin it
         shrinks toward while it fades. */
      await page.mouse.move(x, triggerBox.y + 1);
      await page.mouse.move(x, (triggerBox.y + bubbleBox.y + bubbleBox.height) / 2);
      await page.mouse.move(x, bubbleBox.y + bubbleBox.height - 2);

      await expect(bubble).toHaveCSS("opacity", "1");
      expect(await bubble.evaluate((element) => getComputedStyle(element).visibility)).toBe("visible");
      expect(await page.locator('[data-probe="host"]').evaluate((element) => element.matches(":hover"))).toBe(true);

      await page.locator('[data-probe="host"]').evaluate((element) => {
        element.style.setProperty("--tooltip-linger", "0s");
      });
      await page.mouse.move(0, 0);
      await expect(bubble).toHaveCSS("visibility", "hidden");
    });
  }

  /* The other half of WCAG 1.4.13: a hover message has to be dismissible
     without moving the pointer. CSS cannot hear Escape, so the consumer's
     handler writes `data-state="closed"`, and that wins over hover and focus. */
  test("hides a hovered tooltip that is marked closed", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    await page.evaluate(() => {
      const host = document.createElement("div");
      host.style.cssText = "padding: 6rem 2rem";
      host.innerHTML =
        '<span class="tooltip" data-probe="host"><button type="button">Trigger</button><span class="tooltip-bubble" data-probe="bubble">Message</span></span>';
      document.body.prepend(host);
    });

    const host = page.locator('[data-probe="host"]');
    const bubble = page.locator('[data-probe="bubble"]');

    await host.locator("button").focus();
    await host.locator("button").hover();
    await expect(bubble).toHaveCSS("visibility", "visible");

    await host.evaluate((element) => element.setAttribute("data-state", "closed"));
    await expect(bubble).toHaveCSS("visibility", "hidden");
    await expect(bubble).toHaveCSS("opacity", "0");
  });

  /* tooltips.md tells a consumer with a positioning library to give its message
     element the `.tooltip-bubble` classes for the look. Outside `.tooltip`
     the bubble is that look alone: the hidden resting state, the scale, and
     the position belong to `.tooltip`, so a popover the library opens shows. */
  test("shows a tooltip bubble outside a tooltip when its popover opens", async ({ page }) => {
    await page.goto(FEEDBACK_URL);

    await page.evaluate(() => {
      const bubble = document.createElement("div");
      bubble.popover = "manual";
      bubble.className = "tooltip-bubble primary";
      bubble.dataset.probe = "popover";
      bubble.textContent = "Message";
      document.body.append(bubble);
      bubble.showPopover();
    });

    const bubble = page.locator('[data-probe="popover"]');

    await expect(bubble).toHaveCSS("visibility", "visible");
    await expect(bubble).toHaveCSS("opacity", "1");
    await expect(bubble).toHaveCSS("transform", "none");
    const box = await bubble.boundingBox();
    expect(box?.width, "the bubble has a size").toBeGreaterThan(0);
    expect(box?.height, "the bubble has a size").toBeGreaterThan(0);
    const onTop = await bubble.evaluate((element) => {
      const rect = element.getBoundingClientRect();

      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === element;
    });
    expect(onTop, "the bubble is under its own centre").toBe(true);
  });

  /* `.alert-icon` sizes whatever icon is dropped in, including a glyph from
     `@codenhub/icons`, whose own sizing rule is unlayered. It does so through
     the icon set's `--ic-size` knob rather than `!important`, so a consumer's
     ordinary rule can still resize it. */
  test("sizes an alert icon without shutting out the consumer", async ({ page }) => {
    await page.goto(FORMS_URL);

    const sizes = await page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML =
        '<div class="alert"><i class="ic-mail alert-icon" aria-hidden="true"></i>Default</div>' +
        '<div class="alert"><svg class="alert-icon" viewBox="0 0 24 24" width="48" height="48" aria-hidden="true"></svg>Inline SVG</div>' +
        '<div class="alert"><i class="ic-mail alert-icon" aria-hidden="true" style="--ic-size: 2rem; width: 2rem; height: 2rem"></i>Resized</div>';
      document.body.append(host);
      const result = [...host.querySelectorAll(".alert-icon")].map((icon) => icon.getBoundingClientRect().width);
      host.remove();

      return result;
    });

    expect(sizes).toEqual([20, 20, 32]);
  });
});

const FULL_STYLES_URL = `${ORIGIN}/shared/entry-vanilla.css`;
const MESSAGE = 'Your card <a href="#">expires next month</a>. <strong>Update it</strong> to keep your plan.';

/* An alert's message is one paragraph whatever inline markup it holds. As a
   flex row, each text run and each link or `<strong>` was an item of its own,
   and at 320px the message read as five narrow columns. So the bare message
   has to lay out exactly as the same message wrapped in one block, with an
   icon before it or without one. */
test("flows an alert's inline markup as one message, wrapped or not, with or without an icon", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.setContent(
    `<!doctype html><html><body style="margin: 0; padding: 16px">
       <div class="alert warning" data-testid="bare">${MESSAGE}</div>
       <div class="alert warning" data-testid="wrapped"><p style="margin: 0">${MESSAGE}</p></div>
       <div class="alert warning" data-testid="icon-bare"><i class="alert-icon" aria-hidden="true"></i>${MESSAGE}</div>
       <div class="alert warning" data-testid="icon-wrapped"><i class="alert-icon" aria-hidden="true"></i><p style="margin: 0">${MESSAGE}</p></div>
     </body></html>`,
  );
  await page.addStyleTag({ url: FULL_STYLES_URL });

  const read = (testId: string) =>
    page.getByTestId(testId).evaluate((alert) => {
      const box = alert.getBoundingClientRect();
      const styles = getComputedStyle(alert);
      const link = alert.querySelector("a")!.getBoundingClientRect();
      const strong = alert.querySelector("strong")!.getBoundingClientRect();
      const icon = alert.querySelector(".alert-icon")?.getBoundingClientRect();
      const contentTop = box.top + Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.paddingTop);
      const contentLeft = box.left + Number.parseFloat(styles.borderLeftWidth) + Number.parseFloat(styles.paddingLeft);

      return {
        height: box.height,
        link: [Math.round(link.left - box.left), Math.round(link.top - box.top)],
        strong: [Math.round(strong.left - box.left), Math.round(strong.top - box.top)],
        icon: icon && { left: icon.left - contentLeft, top: icon.top - contentTop, width: icon.width },
      };
    });

  const bare = await read("bare");
  const wrapped = await read("wrapped");
  const iconBare = await read("icon-bare");
  const iconWrapped = await read("icon-wrapped");

  /* Three lines at 20px leading, inside 16px of padding and the border. */
  expect(bare.height, "the bare message wraps as a paragraph").toBeLessThan(110);
  expect(bare).toEqual(wrapped);
  expect(iconBare).toEqual(iconWrapped);
  expect(iconBare.icon, "the icon sits at the start of the first line").toEqual({ left: 0, top: 0, width: 20 });
  expect(iconBare.link[0], "the message starts after the icon and its gap").toBeGreaterThanOrEqual(20 + 12);
});

/* Under reduced motion the bubble stops growing, so it once rested at full
   size, hidden only by its fade: a hidden box still counts toward scrollable
   overflow, and the docs' help tooltip at the end of a row made a 320px page
   scroll sideways, 438px wide. */
for (const motion of [
  { label: "with no preference", reducedMotion: "no-preference", attribute: null },
  { label: "under reduced motion", reducedMotion: "reduce", attribute: null },
  { label: 'under data-motion="reduce"', reducedMotion: "no-preference", attribute: "reduce" },
  { label: 'under data-motion="none"', reducedMotion: "no-preference", attribute: "none" },
] as const) {
  test(`keeps a closed tooltip from widening the page ${motion.label}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ reducedMotion: motion.reducedMotion });
    await page.setContent(
      `<!doctype html><html${motion.attribute ? ` data-motion="${motion.attribute}"` : ""}><body style="margin: 0; padding: 16px">
         <div class="cluster between">
           <label class="cluster tight"><input class="switch primary" type="checkbox" role="switch" /> Public profile</label>
           <span class="tooltip">
             <button class="tooltip-icon" type="button" aria-label="About public profiles" aria-describedby="help">?</button>
             <span class="tooltip-bubble" role="tooltip" id="help">Anyone with the link can see your name, photo, and public projects.</span>
           </span>
         </div>
         <button data-testid="away">away</button>
       </body></html>`,
    );
    await page.addStyleTag({ url: FULL_STYLES_URL });
    await settleAnimations(page);

    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    expect(await overflow(), "at rest").toBe(0);

    /* Opened, then closed: once its linger and fade are over it is gone again. */
    await page.locator(".tooltip").evaluate((element) => element.style.setProperty("--tooltip-linger", "0s"));
    await page.locator(".tooltip-icon").hover();
    await expect(page.locator(".tooltip-bubble")).toHaveCSS("opacity", "1");
    await page.getByTestId("away").hover();
    await expect(page.locator(".tooltip-bubble")).toHaveCSS("visibility", "hidden");
    await expect.poll(overflow, { message: "after closing" }).toBe(0);
  });
}
