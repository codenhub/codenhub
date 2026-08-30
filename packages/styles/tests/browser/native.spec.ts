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

/* A native mapping gives the control and its icon source, and stops there. The
   artwork is opt-in because a mapping that guessed would put a glyph on every
   typed input on the page, and a native mapping has no class in which to write
   the opt-in. */
test("paints a native input icon only where the author opted in", async ({ page }) => {
  await page.goto(NATIVE_URL);

  const icons = await page.evaluate(() => {
    const read = (id: string) => {
      const styles = getComputedStyle(document.querySelector(`#${id}`)!);

      return { image: styles.backgroundImage, position: styles.backgroundPosition };
    };

    return { bare: read("native-search-noicon"), left: read("native-email"), right: read("native-email-right") };
  });

  expect(icons.bare.image, "an input that did not opt in paints no artwork").toBe("none");
  expect(icons.left.image, "opted-in artwork").toContain("data:image/svg+xml");
  expect(icons.right.image, "right artwork is the same picture moved").toBe(icons.left.image);
  expect(icons.right.position, "right position").not.toBe(icons.left.position);
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
        `color-mix(in oklab, var(--color-text) ${getComputedStyle(host.querySelector("button:not(.destructive)")!).getPropertyValue("--intent-fill-max").trim()}, transparent)`,
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
