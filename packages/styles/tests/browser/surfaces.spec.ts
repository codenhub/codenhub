import { expect, test } from "./fixtures";
import { expectSameColor, getColorDistance, isTransparent } from "./test-utils";

const SURFACES_URL = "http://localhost:5184/surfaces/?env=vanilla";

test.describe("surfaces", () => {
  test("keeps ordinary surfaces flat and reads intent and presentation", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };

      const neutral = get("card-default-none");
      const successSoft = get("card-soft-edged-success");
      const primaryOutline = get("card-ghost-edged-primary");
      const panel = get("panel-default-none");

      return {
        neutralBackground: neutral.backgroundColor,
        neutralShadowOffset: neutral.boxShadow.match(/-?\d+(?:\.\d+)?px(?:\s+-?\d+(?:\.\d+)?px){3}/g)?.join(", "),
        outlineBackground: primaryOutline.backgroundColor,
        outlineBorder: primaryOutline.borderTopColor,
        outlineBorderWidth: primaryOutline.borderTopWidth,
        panelShadowOffset: panel.boxShadow.match(/-?\d+(?:\.\d+)?px(?:\s+-?\d+(?:\.\d+)?px){3}/g)?.join(", "),
        softBackground: successSoft.backgroundColor,
        tokenBackground: resolveToken("background"),
        tokenPrimary: resolveToken("primary"),
      };
    });

    /* Neither ordinary surface opts into depth. The composed shadow remains a
       valid zero-length value rather than gaining structural elevation. */
    expect(styles.neutralShadowOffset).toBe("0px 0px 0px 0px");
    expect(styles.panelShadowOffset).toBe("0px 0px 0px 0px");

    expectSameColor(styles.neutralBackground, styles.tokenBackground, "neutral card background");
    expect(getColorDistance(styles.softBackground, styles.tokenBackground)).toBeGreaterThan(2);
    expectSameColor(styles.outlineBackground, styles.tokenBackground, "outlined card stays unfilled");
    expectSameColor(styles.outlineBorder, styles.tokenPrimary, "outlined card border");
    /* The edge width is the aesthetic's material alone: no presentation scales
       it, so a default card is one pixel however it is presented. */
    expect(styles.outlineBorderWidth).toBe("1px");
  });

  test("changes only padding for the density modifiers", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const padding = await page.evaluate(() =>
      [
        "card-dense",
        "card-compact",
        "card-default-padding",
        "card-spacious",
        "card-flush",
        "panel-dense",
        "panel-compact",
      ].map((testId) =>
        Number.parseFloat(getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!).paddingTop),
      ),
    );

    const [dense, compact, base, spacious, flush, panelDense, panelCompact] = padding as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];

    expect(flush).toBe(0);
    expect(dense).toBeLessThan(compact);
    expect(compact).toBeLessThan(base);
    expect(spacious).toBeGreaterThan(base);
    /* The alias resolves on a panel too, one step below `.compact`. */
    expect(panelDense).toBeGreaterThan(0);
    expect(panelDense).toBeLessThan(panelCompact);
  });

  /* `--_d-ground` is a custom property, so it inherits: a `surface` sets it to
     its own opaque plate and every box nested inside would resolve a partial
     fill over that plate rather than over what it visually sits on. `box`
     declares `--_d-ground: transparent` on itself so a nested control keeps its
     own ground -- without it a `.ghost` button in a card painted an opaque slab
     of the page colour, and the slab stayed put while the card tinted on hover. */
  test("a nested ghost control stays unfilled at rest and while the card is hovered", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const button = page.locator('[data-testid="card-nested-ghost-button"]');
    const card = page.locator('[data-testid="card-nested-ghost"]');

    const restBackground = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(isTransparent(restBackground), `ghost button at rest: ${restBackground}`).toBe(true);

    await card.hover();

    const hoveredCardBackground = await card.evaluate((element) => getComputedStyle(element).backgroundColor);
    const hoveredButtonBackground = await button.evaluate((element) => getComputedStyle(element).backgroundColor);

    expect(isTransparent(hoveredButtonBackground), `ghost button on card hover: ${hoveredButtonBackground}`).toBe(true);
    /* The card itself still responds to the hover, so the test is proving the
       button opted out rather than that nothing moved. */
    expect(isTransparent(hoveredCardBackground)).toBe(false);
  });

  /* A divider is an indicator: it reads intent and no presentation token at all.
     A rule is a line, and neither a fill class nor an edge class has anything to
     say about one -- while reading both used to mean a container's `.ghost.edgeless`
     made every `<hr>` inside it invisible. */
  test("colors a divider by intent and ignores presentation entirely", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);
      const resolveToken = (tokenName: string) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${tokenName})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const host = document.querySelector('[data-testid="preview-root"]')!;
      const read = (presentation: string) => {
        const divider = document.createElement("hr");

        divider.className = `divider primary ${presentation}`.trim();
        host.append(divider);

        const computed = getComputedStyle(divider);
        const result = {
          color: computed.borderTopColor,
          presentation: presentation || "default",
          width: computed.borderTopWidth,
        };

        divider.remove();

        return result;
      };

      return {
        infoColor: get("divider-default-info").borderTopColor,
        tokenInfo: resolveToken("info"),
        variants: ["", "solid edged", "soft edgeless", "ghost edged", "edgeless", "ghost edgeless"].map(read),
        verticalWidth: get("divider-vertical-primary").borderLeftWidth,
      };
    });

    expectSameColor(styles.infoColor, styles.tokenInfo, "divider intent color");
    expect(styles.verticalWidth).not.toBe("0px");

    for (const variant of styles.variants) {
      /* Same width and same colour on every row, including the one that used to
         turn the rule off. The width is the aesthetic's material and nothing
         scales it; the colour is the intent and nothing dilutes it. */
      expect(variant.width, `${variant.presentation} width`).toBe("1px");
      expect(isTransparent(variant.color), `${variant.presentation} divider`).toBe(false);
    }
  });

  test("renders every card fill against the surface ground", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      const probe = document.createElement("span");

      probe.style.color = "var(--color-background)";
      document.body.append(probe);

      const ground = getComputedStyle(probe).color;

      probe.remove();

      return {
        ghostEdgeless: get("card-ghost-edgeless-primary").backgroundColor,
        ghostEdgelessBorder: get("card-ghost-edgeless-primary").borderTopColor,
        defaultBorderWidth: get("card-default-primary").borderTopWidth,
        ground,
        softBackground: get("card-soft-edged-primary").backgroundColor,
        solidBackground: get("card-solid-primary").backgroundColor,
        solidColor: get("card-solid-primary").color,
      };
    });

    /* Bare adds no fill, so what shows is the ground every surface rests on. */
    expectSameColor(styles.ghostEdgeless, styles.ground, "ghost card ground");
    expect(getColorDistance(styles.softBackground, styles.ground)).toBeGreaterThan(2);
    expect(getColorDistance(styles.solidBackground, styles.ground)).toBeGreaterThan(2);
    expect(getColorDistance(styles.solidColor, styles.solidBackground)).toBeGreaterThan(2);
    expect(Number.parseFloat(styles.defaultBorderWidth)).toBeGreaterThanOrEqual(1);
    /* The two-pixel ceiling is gone with the edge scale that made it necessary.
       `.edgeless` mixes the line to nothing rather than narrowing it: the width is
       the aesthetic's material and presentation never touches it. */
    expect(isTransparent(styles.ghostEdgelessBorder), "edgeless card line").toBe(true);
  });

  /* Elevation had classes, a registry entry and a documented table, and nothing
     that read any of them: no fixture in the preview and no assertion here. The
     three classes could have stopped multiplying and the only symptom would have
     been a flat page.

     Every length is read off the composited `box-shadow` rather than off
     `--ui-elevation`, because the token being right is not the claim -- the claim
     is that one unitless number scales the geometry an aesthetic supplies, which
     is only observable after the multiplication. */
  test("multiplies the depth in scope by the elevation asked for", async ({ page }) => {
    await page.goto(SURFACES_URL);

    /* Every engine serialises a layer as `<colour> <x> <y> <blur> <spread>`, so
       the lengths start after the colour closes. */
    const lengths = (shadow: string) =>
      shadow
        .split(") ")[1]!
        .split(" ")
        .map((length) => Number.parseFloat(length));

    const shadows = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!).boxShadow;

      return {
        default: get("elevation-default"),
        flat: get("elevation-flat"),
        floating: get("elevation-floating"),
        inherited: get("elevation-inherited"),
        optedOut: get("elevation-opt-out"),
        panelFloating: get("elevation-panel-floating"),
        panelRaised: get("elevation-panel-raised"),
        raised: get("elevation-raised"),
      };
    });

    const raised = lengths(shadows.raised);
    const floating = lengths(shadows.floating);

    /* A page with no aesthetic and no modifier draws nothing. The geometry lives
       on the two classes that ask for depth, so a component resting at elevation
       1 still has nothing to multiply until something supplies it. */
    expect(
      lengths(shadows.default).every((length) => length === 0),
      "unasked card",
    ).toBe(true);
    expect(
      lengths(shadows.flat).every((length) => length === 0),
      ".flat card",
    ).toBe(true);

    expect(raised[1], ".raised offset").toBeGreaterThan(0);
    expect(raised[2], ".raised blur").toBeGreaterThan(0);
    /* Twice, exactly. `.floating` is the same geometry through a multiplier of
       two, which is the sentence the registry writes as `"floating": 2`. */
    expect(floating[1], ".floating offset").toBe(raised[1]! * 2);
    expect(floating[2], ".floating blur").toBe(raised[2]! * 2);
    /* Spread is deliberately left out of the multiplication: an aesthetic that
       draws its edge as an inset ring spends spread on it. */
    expect(floating[3], ".floating spread").toBe(lengths(shadows.raised)[3]);

    /* A panel rests at zero and a card at one, and neither rest level survives
       the modifier: the class supplies the geometry, so the two match. */
    expect(lengths(shadows.panelRaised).slice(0, 4), "raised panel").toEqual(raised.slice(0, 4));
    expect(lengths(shadows.panelFloating).slice(0, 4), "floating panel").toEqual(floating.slice(0, 4));

    /* The number is unitless, so it inherits: a container lifts its whole region
       and an element inside it still opts out on itself. */
    expect(lengths(shadows.inherited).slice(0, 4), "inherited from the container").toEqual(raised.slice(0, 4));
    expect(
      lengths(shadows.optedOut).every((length) => length === 0),
      "opted out of an inherited lift",
    ).toBe(true);
  });

  /* The division of labour the modifier exists for: the aesthetic decides what
     depth looks like and elevation decides how much of it this element takes.
     Neither knows the other, so the same class has to come out as a soft blur on
     a plain page and as a hard offset slab under `.neobrutalism`. */
  test("takes the aesthetic's depth rather than its own under an aesthetic", async ({ page }) => {
    await page.goto(`${SURFACES_URL}&aesthetic=neobrutalism`);

    const shadows = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!).boxShadow;

      return { flat: get("elevation-flat"), raised: get("elevation-raised") };
    });

    const raised = shadows.raised
      .split(") ")[1]!
      .split(" ")
      .map((length) => Number.parseFloat(length));

    /* Neobrutalism draws a hard slab: a horizontal offset the plain step never
       has, and no blur. */
    expect(raised[0], "slab x offset").toBeGreaterThan(0);
    expect(raised[1], "slab y offset").toBeGreaterThan(0);
    expect(raised[2], "slab blur").toBe(0);
    /* And `.flat` removes it without knowing what it was. */
    expect(
      shadows.flat
        .split(") ")[1]!
        .split(" ")
        .every((length) => Number.parseFloat(length) === 0),
      ".flat under an aesthetic",
    ).toBe(true);
  });

  /* Presentation cascades and intent does not, so a container sets the look of
     its subtree while any element opts out. Breaking either half is silent. */
  test("lets a container set the presentation while an element overrides it", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const styles = await page.evaluate(() => {
      const get = (testId: string) => getComputedStyle(document.querySelector(`[data-testid="${testId}"]`)!);

      return {
        inheritedFill: get("cascade-card-inherited").getPropertyValue("--ui-fill").trim(),
        overriddenFill: get("cascade-card-override").getPropertyValue("--ui-fill").trim(),
        panelFill: get("cascade-panel-inherited").getPropertyValue("--ui-fill").trim(),
      };
    });

    expect(styles.inheritedFill).toBe("12%");
    expect(styles.panelFill).toBe("12%");
    expect(styles.overriddenFill).toBe("0%");
  });

  /* `.card.interactive` applies `box-active`, so on the base look a press takes
     the `:root` `--ui-active-transform`. A plain `.card` opts out and stays put.
     `:active` needs a held pointer, which no keyboard move drives. */
  test("presses an interactive card on the base look and leaves a plain card alone", async ({ page }) => {
    await page.goto(SURFACES_URL);

    const readScale = (testId: string) =>
      page.getByTestId(testId).evaluate((node) => {
        const transform = getComputedStyle(node).transform;

        return transform === "none" ? 1 : Number.parseFloat(transform.slice("matrix(".length).split(",")[0]!);
      });

    const interactive = page.getByTestId("card-default-none-interactive");

    await interactive.hover();
    await page.mouse.down();
    try {
      /* The transform is transitioned, so this polls for the settled value. */
      await expect
        .poll(() => readScale("card-default-none-interactive"), "interactive card pressed")
        .toBeCloseTo(0.97, 2);
      expect(await readScale("card-default-none"), "plain card unmoved").toBe(1);
    } finally {
      await page.mouse.up();
    }
  });
});
