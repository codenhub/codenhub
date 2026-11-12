import { expect, test } from "./fixtures";
import { expectSameColor } from "./test-utils";

const NATIVE_URL = "http://localhost:5184/native/?env=vanilla";

test("maps content utilities onto unclassed native elements", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const styles = await page.evaluate(() => ({
    dividerBorder: getComputedStyle(document.querySelector("hr")!).borderTopWidth,
    keyboardBorder: getComputedStyle(document.querySelector("kbd")!).borderTopWidth,
    quoteBorder: getComputedStyle(document.querySelector("blockquote")!).borderLeftWidth,
    tableCollapse: getComputedStyle(document.querySelector("table")!).borderCollapse,
  }));

  expect(styles.dividerBorder).not.toBe("0px");
  expect(styles.keyboardBorder).not.toBe("0px");
  expect(styles.quoteBorder).not.toBe("0px");
  expect(styles.tableCollapse).toBe("separate");
});

test("includes package reset behavior in the native entrypoint", async ({ page }) => {
  await page.goto(NATIVE_URL);

  await expect(page.getByTestId("native-root")).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("display", "flex");
  await expect(page.locator("body")).toHaveCSS("min-height", "720px");
});

test("avoids inline code decoration inside native preformatted blocks", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const code = page.getByTestId("native-pre-code");
  await expect(code).toBeVisible();
  await expect(code).toHaveCSS("padding", "0px");
  await expect(code).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("styles native forms and buttons without utility classes", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const input = page.locator('input[type="text"]');
  const button = page.getByRole("button", { name: "button element" });
  const untypedInputMinHeight = await page.evaluate(() => {
    const input = document.createElement("input");

    document.body.append(input);
    const minHeight = getComputedStyle(input).minHeight;
    input.remove();

    return minHeight;
  });
  const inputStyles = await input.evaluate((element) => {
    const styles = getComputedStyle(element);

    return {
      borderColor: styles.borderTopColor,
      borderStyle: styles.borderTopStyle,
      borderWidth: styles.borderTopWidth,
      intentBorder: styles.getPropertyValue("--intent-border"),
      expectedIntentBorder: getComputedStyle(document.documentElement).getPropertyValue("--color-control-border"),
      token: styles.getPropertyValue("--border-width").trim(),
    };
  });

  await expect(input).toHaveCSS("min-height", "40px");
  expect(inputStyles.token).toBe("1px");
  expect(inputStyles.borderStyle).toBe("solid");
  expect(inputStyles.borderWidth).toBe("1px");
  expect(inputStyles.borderColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(inputStyles.intentBorder.trim()).toBe(inputStyles.expectedIntentBorder.trim());
  expect(untypedInputMinHeight).toBe("40px");
  await expect(button).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(button).not.toHaveCSS("border-radius", "0px");
});

/* A bare checkbox or radio is `.checkbox` or `.radio` reached another way, so it
   takes the same control line. Left off the native list when the classed toggles
   joined it, a bare one drew `--color-border` at 2.48:1. */
test("gives native toggles the control line", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const borders = await page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML = `<input type="checkbox" /><input type="radio" />`;
    document.body.append(host);

    const read = (selector: string) =>
      getComputedStyle(host.querySelector(selector)!).getPropertyValue("--intent-border");
    const values = {
      checkbox: read('input[type="checkbox"]'),
      expected: getComputedStyle(document.documentElement).getPropertyValue("--color-control-border"),
      radio: read('input[type="radio"]'),
    };

    host.remove();
    return values;
  });

  expect(borders.checkbox.trim(), "checkbox").toBe(borders.expected.trim());
  expect(borders.radio.trim(), "radio").toBe(borders.expected.trim());
});

/* `native.css` re-declares border and background after `@apply`, which would
   defeat the intent contract if those declarations outranked the utilities.
   They sit in the base layer and the utilities win, so intent still reaches
   classless elements; this pins that ordering down. */
test("applies intent classes to classless native elements", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const styles = await page.evaluate(() => {
    const resolveColor = (value: string) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    const resolveToken = (tokenName: string) => resolveColor(`var(--color-${tokenName})`);

    const host = document.createElement("div");
    host.innerHTML = `
      <button class="destructive">Delete</button>
      <button>Plain</button>
      <input type="text" class="success" />
      <kbd class="warning">K</kbd>
    `;
    document.body.append(host);

    const values = {
      inputBorder: getComputedStyle(host.querySelector("input")!).borderTopColor,
      intentButtonBg: getComputedStyle(host.querySelector("button.destructive")!).backgroundColor,
      keyboardText: getComputedStyle(host.querySelector("kbd")!).color,
      plainButtonBg: getComputedStyle(host.querySelector("button:not(.destructive)")!).backgroundColor,
      neutralFill: resolveColor(
        `color-mix(in oklab, var(--color-text) ${getComputedStyle(host.querySelector("button:not(.destructive)")!).getPropertyValue("--intent-fill-max").trim()}, var(--color-background))`,
      ),
      tokenDestructive: resolveToken("destructive"),
      /* At the fraction a text control rests its line at, not the whole tone: a
         field rests quiet so the pointer has somewhere to go, and comparing
         against the whole tone reports that as the wrong color rather than a
         lighter one. */
      tokenSuccess: resolveColor(
        `color-mix(in oklab, var(--color-success) ${getComputedStyle(host.querySelector("input")!).getPropertyValue("--_line-rest").trim()}, transparent)`,
      ),
      tokenWarningStrong: resolveToken("warning-strong"),
    };

    host.remove();

    return values;
  });

  expectSameColor(styles.intentButtonBg, styles.tokenDestructive, "native button intent background");
  /* A `<button>` nobody has styled is the most visible element in the package, and
     the neutral cap is what keeps it a quiet plate instead of a slab of ink. */
  expectSameColor(styles.plainButtonBg, styles.neutralFill, "native button neutral background");
  expectSameColor(styles.inputBorder, styles.tokenSuccess, "native input intent border");
  expectSameColor(styles.keyboardText, styles.tokenWarningStrong, "native kbd intent text");
});

/* A link takes the text it sits in: mapped to body copy, one inside a heading
   printed at 14px and regular weight beside a 30px bold title. */
test("keeps a link at the size and weight of the text around it", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const styles = await page.evaluate(() => {
    const host = document.createElement("div");
    host.innerHTML = '<h2>Title <a href="#">link</a></h2><p>Body <a href="#">link</a></p>';
    document.body.append(host);
    const read = (selector: string) => {
      const style = getComputedStyle(host.querySelector(selector)!);

      return `${style.fontSize} ${style.fontWeight}`;
    };

    return { heading: read("h2"), headingLink: read("h2 a"), paragraph: read("p"), paragraphLink: read("p a") };
  });

  expect(styles.headingLink).toBe(styles.heading);
  expect(styles.paragraphLink).toBe(styles.paragraph);
});

/* Body copy is the page's text, set on `body`, so a container can resize or
   embolden the Markdown inside it. Pinned on `p` and `li`, a bold 20px
   container printed its paragraphs at 14px regular, and their tracking reached
   the button inside one; a control keeps its own tracking either way. */
test("lets paragraphs and list items take their container's type", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const styles = await page.evaluate(() => {
    const host = document.createElement("div");

    host.style.cssText = "font-weight: 700; font-size: 20px; letter-spacing: 1px";
    host.innerHTML = "<p>Paragraph <button>Action</button></p><ul><li>Item</li></ul>";
    document.body.append(host);

    const read = (selector: string) => {
      const style = getComputedStyle(host.querySelector(selector)!);

      return { size: style.fontSize, tracking: style.letterSpacing, weight: style.fontWeight };
    };
    const values = {
      body: getComputedStyle(document.body).fontSize,
      button: getComputedStyle(host.querySelector("button")!).letterSpacing,
      item: read("li"),
      paragraph: read("p"),
    };

    host.remove();

    return values;
  });

  expect(styles.paragraph).toEqual({ size: "20px", tracking: "1px", weight: "700" });
  expect(styles.item).toEqual({ size: "20px", tracking: "1px", weight: "700" });
  expect(styles.body, "body copy is the page's text").toBe("14px");
  expect(styles.button, "a button in a paragraph keeps its own tracking").toBe("normal");
});

/* Body copy's wider tracking is set on `body`, so every control inherited it:
   a `<button>`, a `.btn`, a `.badge`, and a submit printed 0.05em, and under
   `/tw` Preflight passed it to the text fields too. A label and typed text are
   their own material, so neither the page's tracking nor a container's reaches
   them. The built entry is `/tw`, which emits only the classes the page names,
   so it checks the native elements. */
const CONTROLS = {
  build:
    '<button>A</button><input type="submit" value="B"><input type="reset" value="C"><input type="button" value="D"><input type="text"><input><textarea></textarea><select></select>',
  vanilla:
    '<button>A</button><input type="submit" value="B"><input type="text"><textarea></textarea><select></select><button class="btn">E</button><a class="btn" href="#">F</a><span class="badge">G</span><input class="ipt"><textarea class="textarea"></textarea><select class="select"></select><input class="text-control">',
};

for (const [environment, markup] of Object.entries(CONTROLS)) {
  test(`keeps every control's tracking normal on the ${environment} entry`, async ({ page }) => {
    await page.goto(`http://localhost:5184/native/?env=${environment}`);

    const tracking = await page.evaluate((html) => {
      const read = (host: HTMLElement) =>
        [...host.children].map((element) => `${element.outerHTML}: ${getComputedStyle(element).letterSpacing}`);
      const page = document.createElement("div");
      const container = document.createElement("div");

      page.innerHTML = html;
      container.innerHTML = html;
      container.style.letterSpacing = "1px";
      document.body.append(page, container);

      const values = { container: read(container), page: read(page) };

      page.remove();
      container.remove();

      return values;
    }, markup);

    for (const line of [...tracking.page, ...tracking.container]) {
      expect(line).toMatch(/: normal$/);
    }
  });
}

/* `pre code` cleared the chip's fill and padding and kept the rest of it: under
   `.cyber` a glowing box sat inside the block, under `.neobrutalism` a 2px
   transparent border indented the first line, and `.pixel` drew an inset ring. */
for (const aesthetic of ["cyber", "neobrutalism", "pixel"]) {
  test(`draws no chip inside a native preformatted block under .${aesthetic}`, async ({ page }) => {
    await page.goto(`${NATIVE_URL}&aesthetic=${aesthetic}`);

    const code = page.getByTestId("native-pre-code");

    await expect(code).toBeVisible();
    await expect(code).toHaveCSS("border-top-width", "0px");
    await expect(code).toHaveCSS("border-left-width", "0px");
    await expect(code).toHaveCSS("box-shadow", "none");
    await expect(code).toHaveCSS("clip-path", "none");
    await expect(code).toHaveCSS("padding", "0px");
    await expect(code).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });
}

/* A button's label is the size of the text around it, whichever element and
   entrypoint draws it: the user agent's 13.33px applied to `<button>` alone,
   so a native button, a `.btn` button, and a `.btn` link all disagreed. */
test("sizes every button label like the text around it", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const sizes = await page.evaluate(() => {
    const host = document.createElement("div");
    host.style.fontSize = "16px";
    host.innerHTML =
      '<button>Native</button><button class="btn">Class</button><a class="btn" href="#">Link</a><input type="submit" value="Submit">';
    document.body.append(host);

    return [...host.children].map((element) => getComputedStyle(element).fontSize);
  });

  expect(sizes).toEqual(["16px", "16px", "16px", "16px"]);
});

/* `/components` carries no reset, so the components themselves have to take
   the surrounding font for a `.btn` and a text control to read the same there
   as on every other entry. */
test("sizes component labels like the text around them without the reset", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: "http://localhost:5184/shared/entry-components.css" });

  const sizes = await page.evaluate(() => {
    const host = document.createElement("div");
    host.style.fontSize = "16px";
    host.innerHTML =
      '<button class="btn">Class</button><a class="btn" href="#">Link</a><input class="ipt"><select class="select"></select><textarea class="textarea"></textarea>';
    document.body.append(host);

    return [...host.children].map((element) => getComputedStyle(element).fontSize);
  });

  expect(sizes).toEqual(["16px", "16px", "16px", "16px", "16px"]);
});

/* The tooltip trigger is a real `<button>` in the docs, and a bare `button`
   is a `.btn` under `/native` and carries the user agent's padding under
   `/components`. Either would stretch the 20px chip, so it sets its own. */
test("keeps a tooltip-icon button at its own size on every entry", async ({ page }) => {
  const measure = () =>
    page.evaluate(() => {
      const host = document.createElement("div");
      host.innerHTML = '<button type="button" class="tooltip-icon" aria-label="More details">?</button>';
      document.body.append(host);
      const { width, height } = host.firstElementChild!.getBoundingClientRect();
      host.remove();

      return { height, width };
    });

  await page.goto(NATIVE_URL);
  expect(await measure(), "under /native").toEqual({ height: 20, width: 20 });

  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: "http://localhost:5184/shared/entry-components.css" });
  expect(await measure(), "under /components").toEqual({ height: 20, width: 20 });
});

/* Sketch's dashed accents named the component classes, so the bare elements
   `/native` styles as those components drew solid lines beside them. */
test("draws sketch's dashed accents on bare elements as on their classes", async ({ page }) => {
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addStyleTag({ url: "http://localhost:5184/native/entry-vanilla.css" });

  const styles = await page.evaluate(() => {
    const table = (attributes: string) =>
      `<table ${attributes}><thead><tr><th>A</th></tr></thead><tbody><tr><td data-cell>1</td></tr><tr><td>2</td></tr></tbody></table>`;

    document.body.innerHTML =
      '<div class="sketch">' +
      '<hr id="bare-rule" /><div class="divider" id="class-rule"></div>' +
      '<input type="checkbox" id="bare-check" /><input type="checkbox" class="checkbox" id="class-check" />' +
      '<input type="checkbox" class="switch" id="switch" />' +
      table('id="bare-table" class="ruled"') +
      table('id="class-table" class="data-table ruled"') +
      "</div>";

    const read = (selector: string, property: string) =>
      getComputedStyle(document.querySelector(selector)!).getPropertyValue(property);

    return {
      bareRule: read("#bare-rule", "border-top-style"),
      classRule: read("#class-rule", "border-top-style"),
      bareCheck: read("#bare-check", "border-top-style"),
      classCheck: read("#class-check", "border-top-style"),
      switch: read("#switch", "border-top-style"),
      bareCell: read("#bare-table [data-cell]", "border-bottom-style"),
      classCell: read("#class-table [data-cell]", "border-bottom-style"),
    };
  });

  expect(styles.classRule).toBe("dashed");
  expect(styles.bareRule).toBe(styles.classRule);
  expect(styles.classCheck).toBe("dashed");
  expect(styles.bareCheck).toBe(styles.classCheck);
  expect(styles.switch, "a switch keeps its solid line").toBe("solid");
  expect(styles.classCell).toBe("dashed");
  expect(styles.bareCell).toBe(styles.classCell);
});

/* `/native` styles elements without classes, and a `<progress>` and a
   `<dialog>` were the two with a component and no mapping: each rendered as
   the user agent draws it, a system-blue bar and a black-bordered box, beside
   everything else in the package's look. */
test("draws a bare progress element as the progress bar", async ({ page }) => {
  await page.setContent(
    '<!doctype html><html><body style="padding:16px">' +
      '<progress id="bare" value="40" max="100" style="width:200px"></progress>' +
      '<div class="progress" id="class" style="width:200px;--progress-value:40%;margin-top:16px"></div>' +
      "</body></html>",
  );
  await page.addStyleTag({ url: "http://localhost:5184/native/entry-vanilla.css" });

  const sample = async (selector: string) => {
    const png = (await page.locator(selector).screenshot({ animations: "disabled" })).toString("base64");

    return page.evaluate(async (source) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const at = (fraction: number) => [
        ...context.getImageData(Math.round(image.width * fraction), Math.round(image.height / 2), 1, 1).data,
      ];

      return { filled: at(0.2), empty: at(0.7), height: image.height };
    }, png);
  };

  const bare = await sample("#bare");
  const classed = await sample("#class");
  const distance = (left: number[], right: number[]) =>
    Math.max(...left.map((channel, index) => Math.abs(channel - right[index]!)));

  expect(distance(classed.filled, classed.empty), "the classed bar shows its value").toBeGreaterThan(64);
  expect(bare.height).toBe(classed.height);
  expect(distance(bare.filled, classed.filled), "the value fill").toBeLessThanOrEqual(8);
  expect(distance(bare.empty, classed.empty), "the track").toBeLessThanOrEqual(8);
});

/* An indicator takes the colour it sits in, so a bar inside a filled
   container is drawn in that container's ink. The bare element's neutral reset
   gave it the page's text colour instead, and on a dark fill with light text
   the value was dark on dark: an empty-looking bar. */
test("draws a bare progress element in the colour it sits in, as the class does", async ({ page }) => {
  await page.setContent(
    '<!doctype html><html><body style="padding:16px">' +
      '<div style="background:rgb(0, 0, 0);color:rgb(255, 255, 255);padding:16px">' +
      '<progress id="bare" value="40" max="100" style="width:200px"></progress>' +
      '<div class="progress" id="class" style="width:200px;--progress-value:40%;margin-top:16px"></div>' +
      "</div></body></html>",
  );
  await page.addStyleTag({ url: "http://localhost:5184/native/entry-vanilla.css" });
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));

  const filled = async (selector: string) => {
    const png = (await page.locator(selector).screenshot({ animations: "disabled" })).toString("base64");

    return page.evaluate(async (source) => {
      const image = new Image();
      image.src = `data:image/png;base64,${source}`;
      await image.decode();

      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);

      return [...context.getImageData(Math.round(image.width * 0.2), Math.round(image.height / 2), 1, 1).data];
    }, png);
  };

  const bare = await filled("#bare");
  const classed = await filled("#class");

  expect(Math.min(...classed.slice(0, 3)), "the classed value is drawn in the light ink").toBeGreaterThan(200);
  expect(
    Math.max(...bare.map((channel, index) => Math.abs(channel - classed[index]!))),
    "the value fill",
  ).toBeLessThanOrEqual(8);
});

test("draws a bare dialog as a floating card, and keeps it closed until opened", async ({ page }) => {
  await page.setContent(
    "<!doctype html><html><body>" +
      '<dialog id="closed">Closed</dialog>' +
      '<dialog id="bare" open>Open</dialog>' +
      '<dialog class="card floating" id="class" open>Open</dialog>' +
      "</body></html>",
  );
  await page.addStyleTag({ url: "http://localhost:5184/native/entry-vanilla.css" });

  /* The sheet arrives after the first render, so every value transitions to
     it; Firefox reads them part-way. */
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));

  const read = (selector: string) =>
    page.evaluate((target) => {
      const styles = getComputedStyle(document.querySelector(target)!);

      return [
        "display",
        "background-color",
        "color",
        "border-top-color",
        "border-top-width",
        "border-top-left-radius",
        "padding-top",
        "box-shadow",
      ].map((property) => `${property}: ${styles.getPropertyValue(property)}`);
    }, selector);

  expect((await read("#closed"))[0]).toBe("display: none");
  expect(await read("#bare")).toEqual(await read("#class"));
});

test("sweeps a bare progress element with no value, and rests it under reduced motion", async ({ page }) => {
  const read = async () => {
    await page.setContent('<!doctype html><html><body><progress id="bare"></progress></body></html>');
    await page.addStyleTag({ url: "http://localhost:5184/native/entry-vanilla.css" });

    return page.evaluate(() => {
      const styles = getComputedStyle(document.getElementById("bare")!);

      return { animation: styles.animationName, image: styles.backgroundImage, size: styles.backgroundSize };
    });
  };

  const moving = await read();

  expect(moving.animation).toBe("anim-progress-sweep");
  expect(moving.image).toContain("linear-gradient");
  expect(moving.size).toBe("33% 100%");

  await page.emulateMedia({ reducedMotion: "reduce" });

  expect((await read()).animation).toBe("none");
});

test("sweeps a bare progress element from the start side under right-to-left text", async ({ page }) => {
  await page.setContent(
    '<!doctype html><html><body><progress id="ltr"></progress><div dir="rtl"><progress id="rtl"></progress></div></body></html>',
  );
  await page.addStyleTag({ url: "http://localhost:5184/native/entry-vanilla.css" });

  const direction = (id: string) =>
    page.evaluate((element) => getComputedStyle(document.getElementById(element)!).animationDirection, id);

  expect(await direction("ltr")).toBe("normal");
  expect(await direction("rtl")).toBe("reverse");
});

test("draws a bare progress element's track in system colours in forced colours", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await page.setContent(
    '<!doctype html><html><body><progress id="bare" value="40" max="100"></progress></body></html>',
  );
  await page.addStyleTag({ url: "http://localhost:5184/native/entry-vanilla.css" });

  const supported = await page.evaluate(
    () => matchMedia("(forced-colors: active)").matches && CSS.supports("forced-color-adjust", "none"),
  );

  test.skip(!supported, "This engine does not emulate forced colours.");

  const styles = await page.evaluate(() => {
    const bar = getComputedStyle(document.getElementById("bare")!);
    const probe = document.createElement("div");
    probe.style.cssText = "background-color: Canvas; border: 1px solid CanvasText";
    document.body.append(probe);
    const system = getComputedStyle(probe);

    return {
      adjust: bar.getPropertyValue("forced-color-adjust"),
      background: bar.backgroundColor,
      border: bar.borderTopColor,
      canvas: system.backgroundColor,
      canvasText: system.borderTopColor,
    };
  });

  expect(styles.adjust).toBe("none");
  expect(styles.background).toBe(styles.canvas);
  expect(styles.border).toBe(styles.canvasText);
});
