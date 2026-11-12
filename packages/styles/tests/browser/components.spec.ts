import { expect, test } from "./fixtures";
import { expectSameColor } from "./test-utils";

/* Contracts that belong to no single component, asserted on elements this spec
   builds itself so it does not depend on which page holds a given fixture. */
const PLAYGROUND_URL = "http://localhost:5184/?env=vanilla";

/* A component that reads `--intent-*` without joining the reset list fails
   silently: the undefined property makes every `color-mix()` referencing it
   invalid at computed-value time, so the whole declaration is dropped and the
   element falls back to a preflight value. This asserts the slots resolve on
   every class that reads them. */
test("defines every intent slot on each component that reads them", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const missing = await page.evaluate(() => {
    const classNames = [
      "btn",
      "alert",
      "badge",
      "card",
      "panel",
      "checkbox",
      "radio",
      "switch",
      "progress",
      "skeleton",
      "ipt",
      "textarea",
      "select",
      "data-table",
      "kbd",
      "code",
      "pre",
      "quote",
      "divider",
      "tooltip-bubble",
      "tooltip-icon",
    ];
    const slots = [
      "--intent-color",
      "--intent-contrast",
      "--intent-hover",
      "--intent-strong",
      "--intent-subtle",
      "--intent-border",
    ];

    const gaps: string[] = [];

    for (const className of classNames) {
      const element = document.createElement("div");
      element.className = className;
      document.body.append(element);

      const styles = getComputedStyle(element);
      for (const slot of slots) {
        if (styles.getPropertyValue(slot).trim() === "") {
          gaps.push(`.${className} is missing ${slot}`);
        }
      }

      element.remove();
    }

    return gaps;
  });

  expect(missing).toEqual([]);
});

/* The shared `--intent-*` contract only works because a component's neutral
   reset carries zero specificity: an intent class on the element must beat it,
   while an inherited value from a container must not. Both directions are
   asserted here because breaking either one is silent. */
test("applies intent on the element without cascading it from a container", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const values = await page.evaluate(() => {
    const resolveColor = (value: string) => {
      const probe = document.createElement("span");
      probe.style.color = value;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };
    const resolveToken = (tokenName: string) => resolveColor(`var(--color-${tokenName})`);

    const host = document.createElement("section");
    host.className = "success";
    document.body.append(host);

    const inherited = document.createElement("button");
    inherited.className = "btn";
    const explicit = document.createElement("button");
    explicit.className = "btn destructive";
    const badge = document.createElement("span");
    badge.className = "badge";
    host.append(inherited, explicit, badge);

    const results = {
      // Inside a `.success` container, but carrying no intent of their own.
      inheritedButtonBg: getComputedStyle(inherited).backgroundColor,
      inheritedBadgeFg: getComputedStyle(badge).color,
      // Carrying its own intent, which must win over the container.
      explicitButtonBg: getComputedStyle(explicit).backgroundColor,
      tokenDestructive: resolveToken("destructive"),
      tokenSuccess: resolveToken("success"),
      tokenText: resolveToken("text"),
      tokenTextStrong: resolveToken("text-strong"),
      /* The neutral fill stops at its intent's cap, so the no-intent button is a
         plate of the ink over the page rather than the ink itself. */
      neutralFill: resolveColor(
        `color-mix(in oklab, var(--color-text) ${getComputedStyle(inherited).getPropertyValue("--intent-fill-max").trim()}, var(--color-background))`,
      ),
    };

    host.remove();

    return results;
  });

  expectSameColor(values.inheritedButtonBg, values.neutralFill, "button ignores container intent");
  expectSameColor(values.inheritedBadgeFg, values.tokenTextStrong, "badge ignores container intent");
  expectSameColor(values.explicitButtonBg, values.tokenDestructive, "element intent wins");

  expect(values.tokenSuccess).not.toBe(values.tokenText);
});

/* `.danger` and `.error` were destructive aliases until 0.5.0. `.error` is a
   class an application or a form library often writes already, and an alias
   set an intent wherever it landed; removed, both are just class names. */
test("gives the removed destructive aliases no intent", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const resolved = await page.evaluate(() =>
    ["", "danger", "error", "destructive"].map((intent) => {
      const element = document.createElement("div");
      element.className = `badge ${intent}`;
      document.body.append(element);

      const value = getComputedStyle(element).getPropertyValue("--intent-color");

      element.remove();

      return value;
    }),
  );
  const [plain, danger, error, destructive] = resolved;

  expect(danger).toBe(plain);
  expect(error).toBe(plain);
  expect(destructive).not.toBe(plain);
});

/* The public component tokens are inputs a page sets once, on a form or a
   section, for every component below it. A component that declared its own
   default for one ignored any value set above it. */
test("takes each public component token from an ancestor", async ({ page }) => {
  await page.setContent(
    '<!doctype html><html data-theme="light"><body><div style="' +
      "--switch-width: 3rem; --switch-height: 2rem; --field-gap: 1rem; --tooltip-gap: 1rem; " +
      "--tooltip-linger: 700ms; --input-group-gap: 3px; --input-group-pad: 2rem; " +
      "--divider-color: rgb(255, 0, 0); --divider-width: 5px; --skeleton-base: rgb(255, 0, 0); " +
      '--skeleton-sheen: rgb(0, 0, 255); --quote-width: 7px">' +
      '<input type="checkbox" class="switch" id="switch">' +
      '<div class="field" id="field"><label>Name</label><input class="ipt"></div>' +
      '<span class="tooltip"><button>Trigger</button><span class="tooltip-bubble" id="bubble">Tip</span></span>' +
      '<div class="input-group" id="group"><span>@</span><input></div>' +
      '<div class="divider" id="divider"></div>' +
      '<div class="skeleton" id="skeleton"></div>' +
      '<blockquote class="quote" id="quote">Quoted</blockquote>' +
      "</div></body></html>",
  );
  await page.addStyleTag({ url: "http://localhost:5184/shared/entry-vanilla.css" });

  const read = await page.evaluate(() => {
    const style = (id: string) => getComputedStyle(document.getElementById(id)!);

    return {
      "--switch-width": style("switch").width,
      "--switch-height": style("switch").height,
      "--field-gap": style("field").rowGap,
      "--tooltip-gap": style("bubble").top,
      "--tooltip-linger": style("bubble").transitionDelay.split(",")[0],
      "--input-group-gap": style("group").columnGap,
      "--input-group-pad": style("group").paddingLeft,
      "--divider-color": style("divider").borderTopColor,
      "--divider-width": style("divider").borderTopWidth,
      "--skeleton-base": style("skeleton").backgroundImage.includes("rgb(255, 0, 0)"),
      "--skeleton-sheen": style("skeleton").backgroundImage.includes("rgb(0, 0, 255)"),
      "--quote-width": style("quote").borderLeftWidth,
    };
  });

  expect(read).toEqual({
    "--switch-width": "48px",
    "--switch-height": "32px",
    "--field-gap": "16px",
    "--tooltip-gap": "-16px",
    "--tooltip-linger": "0.7s",
    "--input-group-gap": "3px",
    "--input-group-pad": "32px",
    "--divider-color": "rgb(255, 0, 0)",
    "--divider-width": "5px",
    "--skeleton-base": true,
    "--skeleton-sheen": true,
    "--quote-width": "7px",
  });
});
