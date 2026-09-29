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
