import { expect, test } from "./fixtures";

const FEEDBACK_URL = "http://localhost:5184/feedback/?env=vanilla";
const NATIVE_URL = "http://localhost:5184/native/?env=vanilla";
const COMPONENT_STYLES_URL = "http://localhost:5184/shared/entry-components.css";
const NATIVE_STYLES_URL = "http://localhost:5184/native/entry-vanilla.css";
const CONTROL_CLASSES = ["text-control", "ipt", "textarea", "select", "checkbox", "radio", "switch"] as const;

test("associates every native form label with its control", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const labels = page.locator(".native-label");
  await expect(labels).toHaveCount(14);
  expect(
    await labels.evaluateAll((elements) =>
      elements.every(
        (label) =>
          label instanceof HTMLLabelElement && label.control !== null && label.control === label.nextElementSibling,
      ),
    ),
  ).toBe(true);
});

/* A pseudo-element bubble's text was never reliably exposed to assistive tech
   and could not be the target of an `aria-describedby`, since that needs a
   real element with a real `id` -- see docs/usage/tooltips.md. This asserts
   the fixture actually wires that association: each trigger's
   `aria-describedby` has to resolve to the real `.tooltip-bubble` element
   carrying the message. The trigger is a real `<button>`, which is focusable
   and takes its `aria-label` as a name in every screen reader; a `<span>` with
   `tabindex` and no role is not reliably announced. */
test("makes tooltip examples keyboard-focusable and describes them with a real bubble element", async ({ page }) => {
  await page.goto(FEEDBACK_URL);

  const tooltips = page.locator(".tooltip-icon");
  await expect(tooltips.first()).toBeVisible();
  const tooltipAttributes = await tooltips.evaluateAll((elements) =>
    elements.map((tooltip) => {
      const describedById = tooltip.getAttribute("aria-describedby");
      const bubble = describedById ? document.getElementById(describedById) : null;

      return {
        accessibleName: tooltip.getAttribute("aria-label"),
        bubbleText: bubble?.textContent?.trim() ?? null,
        isBubble: bubble?.classList.contains("tooltip-bubble") ?? false,
        tagName: tooltip.tagName,
        type: tooltip.getAttribute("type"),
      };
    }),
  );

  for (const attributes of tooltipAttributes) {
    expect(attributes.tagName).toBe("BUTTON");
    expect(attributes.type).toBe("button");
    expect(attributes.isBubble).toBe(true);
    expect(attributes.accessibleName).toBe(attributes.bubbleText);
  }
});

test("exposes determinate and indeterminate progress semantics", async ({ page }) => {
  await page.goto(FEEDBACK_URL);

  const progressBars = page.getByRole("progressbar");
  await expect(progressBars.first()).toBeVisible();

  await expect(page.getByTestId("progress-default-none")).toHaveAttribute("aria-valuenow", "60");
  await expect(page.getByTestId("progress-default-success-active")).toHaveAttribute("aria-valuenow", "60");

  const semantics = await progressBars.evaluateAll((elements) =>
    elements.map((progressBar) => ({
      determinate: !progressBar.classList.contains("indeterminate"),
      label: progressBar.getAttribute("aria-label"),
      maximum: progressBar.getAttribute("aria-valuemax"),
      minimum: progressBar.getAttribute("aria-valuemin"),
      value: progressBar.getAttribute("aria-valuenow"),
    })),
  );

  for (const bar of semantics) {
    expect(bar.minimum).toBe("0");
    expect(bar.maximum).toBe("100");
    expect(bar.label, "every progress bar is named").toBeTruthy();
    /* An indeterminate bar reports no value at all; reporting one would claim
       progress it cannot know. */
    if (bar.determinate) {
      expect(bar.value, bar.label ?? "").toBe("60");
    } else {
      expect(bar.value, bar.label ?? "").toBeNull();
    }
  }
});

test("uses visible system-color outlines for form controls in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: COMPONENT_STYLES_URL });

  const focusStyles = await page.evaluate((controlClasses) => {
    const expectedColorProbe = document.createElement("span");
    expectedColorProbe.style.color = "Highlight";
    document.body.append(expectedColorProbe);
    const expectedOutlineColor = getComputedStyle(expectedColorProbe).color;
    expectedColorProbe.remove();

    return controlClasses.map((className) => {
      const control = document.createElement(
        className === "textarea" ? "textarea" : className === "select" ? "select" : "input",
      );

      if (control instanceof HTMLInputElement && ["checkbox", "radio", "switch"].includes(className)) {
        control.type = className === "radio" ? "radio" : "checkbox";
      }

      control.className = className;
      document.body.append(control);
      control.focus();
      const styles = getComputedStyle(control);
      const result = {
        boxShadow: styles.boxShadow,
        className,
        expectedOutlineColor,
        isFocusVisible: control.matches(":focus-visible"),
        outlineColor: styles.outlineColor,
        outlineStyle: styles.outlineStyle,
        outlineWidth: styles.outlineWidth,
      };
      control.remove();
      return result;
    });
  }, CONTROL_CLASSES);

  for (const styles of focusStyles) {
    expect(styles.isFocusVisible, styles.className).toBe(true);
    expect(styles.outlineStyle, styles.className).toBe("solid");
    expect(Number.parseFloat(styles.outlineWidth), styles.className).toBeGreaterThanOrEqual(2);
    expect(styles.outlineColor, styles.className).toBe(styles.expectedOutlineColor);
    expect(styles.boxShadow, styles.className).toBe("none");
  }
});

test("uses visible system-color outlines for unclassed native controls in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: NATIVE_STYLES_URL });

  const focusStyles = await page.evaluate(() => {
    const expectedColorProbe = document.createElement("span");
    expectedColorProbe.style.color = "Highlight";
    document.body.append(expectedColorProbe);
    const expectedOutlineColor = getComputedStyle(expectedColorProbe).color;
    expectedColorProbe.remove();

    const controls = [
      Object.assign(document.createElement("input"), { type: "text" }),
      document.createElement("select"),
      document.createElement("textarea"),
      Object.assign(document.createElement("input"), { type: "checkbox" }),
      Object.assign(document.createElement("input"), { type: "radio" }),
    ];

    return controls.map((control) => {
      document.body.append(control);
      control.focus();
      const styles = getComputedStyle(control);
      const result = {
        control: control instanceof HTMLInputElement ? `input[type=${control.type}]` : control.localName,
        expectedOutlineColor,
        isFocusVisible: control.matches(":focus-visible"),
        outlineColor: styles.outlineColor,
        outlineStyle: styles.outlineStyle,
        outlineWidth: styles.outlineWidth,
      };
      control.remove();
      return result;
    });
  });

  for (const styles of focusStyles) {
    expect(styles.isFocusVisible, styles.control).toBe(true);
    expect(styles.outlineStyle, styles.control).toBe("solid");
    expect(Number.parseFloat(styles.outlineWidth), styles.control).toBeGreaterThanOrEqual(2);
    expect(styles.outlineColor, styles.control).toBe(styles.expectedOutlineColor);
  }
});

/* The chevron is two gradients and forced colours drop every gradient, so a
   drop-down once showed no arrow at all and read as a text field. A computed
   `background-image` cannot show what replaces it -- the platform's own arrow
   -- so this reads paint: a screenshot of a select with an empty option, so no
   text is drawn, decoded in the page, and the arrow is ink in the inline-end
   strip the select keeps for it, against a middle strip that stays blank.
   Both the class and the `/native` element are read, and right-to-left. No
   baseline is stored: ink is counted against the select's own ground. */
test("keeps a drop-down indicator on a select in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });

  for (const [stylesUrl, markup] of [
    [COMPONENT_STYLES_URL, '<select class="select" dir="ltr"><option></option></select>'],
    [COMPONENT_STYLES_URL, '<select class="select" dir="rtl"><option></option></select>'],
    [NATIVE_STYLES_URL, '<select dir="ltr"><option></option></select>'],
  ] as const) {
    /* oxlint-disable no-await-in-loop -- one entrypoint at a time keeps the failure naming it. */
    await page.setContent(`<!doctype html><html><body style="padding:16px">${markup}</body></html>`);
    await page.addStyleTag({ url: stylesUrl });
    await page.addStyleTag({ content: "select { width: 240px; }" });

    const select = page.locator("select");
    const png = (await select.screenshot({ animations: "disabled" })).toString("base64");
    const ink = await page.evaluate(async (source) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
      const scale = width / 240;
      const at = (x: number, y: number) => data.slice((y * width + x) * 4, (y * width + x) * 4 + 3);
      const ground = at(Math.round(width / 2), Math.round(height / 2));
      /* Inside the border and the focus-free box: a strip 4px to 36px from an
         edge, rows clear of the top and bottom border. */
      const count = (from: number, to: number) => {
        let pixels = 0;
        for (let x = Math.round(from * scale); x < Math.round(to * scale); x += 1) {
          for (let y = Math.round(6 * scale); y < height - Math.round(6 * scale); y += 1) {
            const pixel = at(x, y);
            if (Math.max(...pixel.map((channel, index) => Math.abs(channel - ground[index]!))) > 64) {
              pixels += 1;
            }
          }
        }
        return pixels;
      };

      return { left: count(4, 36), middle: count(104, 136), right: count(204, 236) };
    }, png);
    /* oxlint-enable no-await-in-loop */

    const label = `${stylesUrl.includes("native") ? "native" : ".select"} ${markup.includes("rtl") ? "rtl" : "ltr"}`;
    const [end, start] = markup.includes("rtl") ? [ink.left, ink.right] : [ink.right, ink.left];

    expect(end, `${label}: ink where the arrow sits`).toBeGreaterThan(4);
    expect(ink.middle, `${label}: no ink in the middle of an empty select`).toBe(0);
    expect(start, `${label}: no ink at the inline start`).toBe(0);
  }
});

test("uses system colors to distinguish checked custom toggles in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });

  const expectSystemToggleColors = async (fixture: {
    checkboxClass: string;
    radioClass: string;
    stylesUrl: string;
  }) => {
    await page.setContent(`
      <!doctype html>
      <html>
        <body>
          <input class="${fixture.checkboxClass}" data-testid="checkbox" type="checkbox" checked>
          <input class="${fixture.checkboxClass}" data-testid="unchecked-checkbox" type="checkbox">
          <input class="${fixture.radioClass}" data-testid="radio" type="radio" checked>
          <input class="${fixture.radioClass}" data-testid="unchecked-radio" type="radio">
        </body>
      </html>
    `);
    await page.addStyleTag({ url: fixture.stylesUrl });

    const colors = await page.evaluate(() => {
      const resolveColor = (color: string) => {
        const probe = document.createElement("span");
        probe.style.color = color;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      };
      const checkbox = document.querySelector('[data-testid="checkbox"]')!;
      const uncheckedCheckbox = document.querySelector('[data-testid="unchecked-checkbox"]')!;
      const radio = document.querySelector('[data-testid="radio"]')!;
      const uncheckedRadio = document.querySelector('[data-testid="unchecked-radio"]')!;

      return {
        checkboxBackground: getComputedStyle(checkbox).backgroundColor,
        checkboxMark: getComputedStyle(checkbox, "::after").backgroundColor,
        expectedCanvas: resolveColor("Canvas"),
        expectedCanvasText: resolveColor("CanvasText"),
        expectedHighlight: resolveColor("Highlight"),
        expectedHighlightText: resolveColor("HighlightText"),
        radioBackground: getComputedStyle(radio).backgroundColor,
        radioBorder: getComputedStyle(radio).borderTopColor,
        radioMark: getComputedStyle(radio, "::after").backgroundColor,
        uncheckedCheckboxBackground: getComputedStyle(uncheckedCheckbox).backgroundColor,
        uncheckedCheckboxBorder: getComputedStyle(uncheckedCheckbox).borderTopColor,
        uncheckedRadioBackground: getComputedStyle(uncheckedRadio).backgroundColor,
        uncheckedRadioBorder: getComputedStyle(uncheckedRadio).borderTopColor,
      };
    });

    expect(colors.checkboxBackground).toBe(colors.expectedHighlight);
    expect(colors.checkboxMark).toBe(colors.expectedHighlightText);
    expect(colors.radioBackground).toBe(colors.expectedHighlight);
    expect(colors.radioBorder).toBe(colors.expectedHighlight);
    expect(colors.radioMark).toBe(colors.expectedHighlightText);
    expect(colors.uncheckedCheckboxBackground).toBe(colors.expectedCanvas);
    expect(colors.uncheckedCheckboxBorder).toBe(colors.expectedCanvasText);
    expect(colors.uncheckedRadioBackground).toBe(colors.expectedCanvas);
    expect(colors.uncheckedRadioBorder).toBe(colors.expectedCanvasText);
  };

  await expectSystemToggleColors({
    checkboxClass: "checkbox",
    radioClass: "radio",
    stylesUrl: COMPONENT_STYLES_URL,
  });
  /* The same look on both entrypoints: a checked radio is a filled disc with
     its dot, the way it draws with forced colours off. */
  await expectSystemToggleColors({ checkboxClass: "", radioClass: "", stylesUrl: NATIVE_STYLES_URL });
});

test("keeps the select arrow themed for every dark-mode path while light override wins", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto(FEEDBACK_URL);

  const explicitThemeImages = await page.evaluate(() => {
    const readArrowImage = ({ className = "", theme }: { className?: string; theme?: "dark" | "light" }) => {
      const select = document.createElement("select");
      select.className = `select ${className}`;
      if (theme) {
        select.dataset.theme = theme;
      }
      document.body.append(select);
      const image = getComputedStyle(select).backgroundImage;
      select.remove();
      return image;
    };

    return {
      dataDark: readArrowImage({ theme: "dark" }),
      light: readArrowImage({}),
      themeDark: readArrowImage({ className: "theme-dark" }),
    };
  });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  const systemThemeImages = await page.evaluate(() => {
    const readArrowImage = (theme?: "light") => {
      const select = document.createElement("select");
      select.className = "select";
      if (theme) {
        select.dataset.theme = theme;
      }
      document.body.append(select);
      const image = getComputedStyle(select).backgroundImage;
      select.remove();
      return image;
    };

    return {
      explicitLight: readArrowImage("light"),
      systemDark: readArrowImage(),
    };
  });

  expect(explicitThemeImages.light).not.toBe("none");
  expect(explicitThemeImages.themeDark).not.toBe(explicitThemeImages.light);
  expect(explicitThemeImages.dataDark).not.toBe(explicitThemeImages.light);
  expect(systemThemeImages.systemDark).not.toBe(explicitThemeImages.light);
  expect(systemThemeImages.explicitLight).toBe(explicitThemeImages.light);
});

test("allows document-level horizontal overflow instead of clipping it", async ({ page }) => {
  await page.goto(FEEDBACK_URL);

  const overflow = await page.evaluate(() => ({
    body: getComputedStyle(document.body).overflowX,
    html: getComputedStyle(document.documentElement).overflowX,
  }));

  expect(overflow.html).not.toMatch(/hidden|clip/);
  expect(overflow.body).not.toMatch(/hidden|clip/);
});

/* `/components` carries no reset, so every component that moves stops on its
   own under reduced motion. */
test("stops component motion under reduced motion without the reset", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: COMPONENT_STYLES_URL });
  await page.emulateMedia({ reducedMotion: "reduce" });

  const motion = await page.evaluate(() => {
    document.body.innerHTML = [
      '<button class="btn">Button</button>',
      '<div class="skeleton"></div>',
      '<div class="progress active" style="--progress-value: 40%"></div>',
      '<div class="progress indeterminate"></div>',
      '<span class="tooltip"><button>Trigger</button><span class="tooltip-bubble">Bubble</span></span>',
      '<input type="checkbox" class="checkbox"><input type="radio" class="radio"><input type="checkbox" class="switch">',
    ].join("");
    const longest = (value: string) => Math.max(...value.split(",").map((part) => Number.parseFloat(part) || 0));
    const transition = (selector: string, pseudo?: string) =>
      longest(getComputedStyle(document.querySelector(selector)!, pseudo).transitionDuration);
    const animation = (selector: string, pseudo?: string) =>
      getComputedStyle(document.querySelector(selector)!, pseudo).animationName;

    return {
      animations: [
        animation(".skeleton"),
        animation(".progress.active", "::before"),
        animation(".progress.indeterminate", "::after"),
      ],
      transitions: [
        transition(".btn"),
        transition(".progress.active", "::after"),
        transition(".tooltip-bubble"),
        transition(".checkbox", "::after"),
        transition(".radio", "::after"),
        transition(".switch", "::after"),
      ],
    };
  });

  expect(motion.animations).toEqual(["none", "none", "none"]);
  for (const duration of motion.transitions) {
    expect(duration).toBeLessThanOrEqual(0.001);
  }
});

/* The user agent hides a closed `<dialog>` and centres an open one, but both
   rules lose to any author rule, and `.card`'s own `display` and a margin reset
   beat them. The fix travels with the components it exists for, so it holds on
   `/components`, and reaches only dialogs carrying one of them.

   The centring is the package's default and nothing more: it beats a reset in
   `base` (Tailwind's Preflight puts `margin: 0` on every element there), and
   a consumer's own margin -- a utility beside the components, or unlayered CSS
   -- beats it, so a dialog can still be placed. */
test("keeps a component dialog closed until opened, and centred once open", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: COMPONENT_STYLES_URL });
  await page.addStyleTag({
    content: [
      "@layer base { * { margin: 0; } }",
      "@layer utilities { .mt-8 { margin-top: 2rem; } }",
      ".my-dialog { margin-inline-start: 3rem; }",
    ].join("\n"),
  });

  const dialogs = await page.evaluate(() => {
    document.body.innerHTML = [
      '<dialog class="card" id="closed">Closed</dialog>',
      '<dialog class="card" id="open">Open</dialog>',
      '<dialog class="card mt-8" id="utility">Utility</dialog>',
      '<dialog class="card my-dialog" id="unlayered">Unlayered</dialog>',
      '<dialog id="plain">Plain</dialog>',
    ].join("");
    for (const id of ["open", "utility", "unlayered"]) {
      (document.getElementById(id) as HTMLDialogElement).show();
    }
    (document.getElementById("plain") as HTMLDialogElement).show();
    const read = (id: string) => getComputedStyle(document.getElementById(id)!);

    return {
      closedDisplay: read("closed").display,
      openMarginLeft: read("open").marginLeft,
      plainMarginLeft: read("plain").marginLeft,
      unlayeredMarginLeft: read("unlayered").marginLeft,
      utilityMarginTop: read("utility").marginTop,
    };
  });

  expect(dialogs.closedDisplay).toBe("none");
  expect(Number.parseFloat(dialogs.openMarginLeft), "centred over a reset in base").toBeGreaterThan(0);
  expect(dialogs.plainMarginLeft, "a dialog the package does not style keeps the reset's margin").toBe("0px");
  expect(dialogs.utilityMarginTop, "a consumer's utility").toBe("32px");
  expect(dialogs.unlayeredMarginLeft, "a consumer's unlayered CSS").toBe("48px");
});

/* The reset's reduced-motion rule is `!important` in `base`, which beats any
   unlayered `!important`. The documented way back is a layer ordered before
   `base`, stated before the package loads; this holds the docs to it. */
test("lets a layer ordered before base keep an animation under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setContent(
    `<!doctype html><html><head>
      <style>@layer essential-motion, theme, base, components, utilities;
        @layer essential-motion {
          @media (prefers-reduced-motion: reduce) {
            .essential { animation-duration: 1s !important; animation-iteration-count: infinite !important; }
          }
        }
        @keyframes spin { to { rotate: 1turn; } }
        .essential, .ordinary { animation: spin 1s linear infinite !important; }
      </style>
      <link rel="stylesheet" href="http://localhost:5184/shared/entry-vanilla.css">
    </head><body><div class="essential"></div><div class="ordinary"></div></body></html>`,
    { waitUntil: "load" },
  );

  const durations = await page.evaluate(() =>
    [".essential", ".ordinary"].map(
      (selector) => getComputedStyle(document.querySelector(selector)!).animationDuration,
    ),
  );

  expect(Number.parseFloat(durations[0]!), "the essential animation keeps its duration").toBe(1);
  expect(Number.parseFloat(durations[1]!), "every other animation is still stopped").toBeLessThan(0.001);
});

/* The switch opts out of forced colors to keep its states apart, so every
   part of it has to name a system color itself: an unchecked knob left in the
   package grey could vanish on a dark high-contrast Canvas. */
test("draws a switch in system colors in forced colors, checked or not", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setContent(
    '<!doctype html><html><body><input type="checkbox" class="switch" id="off"><input type="checkbox" class="switch" id="on" checked></body></html>',
  );
  await page.addStyleTag({ url: COMPONENT_STYLES_URL });

  const colors = await page.evaluate(() => {
    const resolve = (color: string) => {
      const probe = document.createElement("span");
      probe.style.color = color;
      document.body.append(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    };
    const knob = (id: string) => getComputedStyle(document.getElementById(id)!, "::after").backgroundColor;

    return {
      canvasText: resolve("CanvasText"),
      highlightText: resolve("HighlightText"),
      offKnob: knob("off"),
      onKnob: knob("on"),
    };
  });

  expect(colors.offKnob).toBe(colors.canvasText);
  expect(colors.onKnob).toBe(colors.highlightText);
});

/* A mixed checkbox is "on" in part, and in forced colors it has to say so the
   way a checked one does: a Highlight plate and a HighlightText mark. */
test("draws an indeterminate checkbox in system colors in forced colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });

  for (const [stylesUrl, className] of [
    [COMPONENT_STYLES_URL, "checkbox"],
    [NATIVE_STYLES_URL, ""],
  ] as const) {
    /* One page, one entrypoint at a time: the two loads cannot share it. */
    // oxlint-disable-next-line no-await-in-loop -- one entrypoint at a time keeps the failure naming it.
    await page.setContent(
      `<!doctype html><html><body><input type="checkbox" class="${className}" id="mixed"></body></html>`,
    );
    // oxlint-disable-next-line no-await-in-loop -- one entrypoint at a time keeps the failure naming it.
    await page.addStyleTag({ url: stylesUrl });

    // oxlint-disable-next-line no-await-in-loop -- one entrypoint at a time keeps the failure naming it.
    const colors = await page.evaluate(() => {
      const resolve = (color: string) => {
        const probe = document.createElement("span");
        probe.style.color = color;
        document.body.append(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      };
      const mixed = document.getElementById("mixed") as HTMLInputElement;
      mixed.indeterminate = true;

      return {
        background: getComputedStyle(mixed).backgroundColor,
        highlight: resolve("Highlight"),
        highlightText: resolve("HighlightText"),
        mark: getComputedStyle(mixed, "::after").backgroundColor,
      };
    });

    expect(colors.background, stylesUrl).toBe(colors.highlight);
    expect(colors.mark, stylesUrl).toBe(colors.highlightText);
  }
});
