import { expect, test } from "@playwright/test";

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
      "loader",
      "ipt",
      "textarea",
      "select",
      "data-table",
      "kbd",
      "code",
      "pre",
      "quote",
      "divider",
      "tooltip",
      "empty-state",
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
    const resolveToken = (tokenName: string) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--color-${tokenName})`;
      document.body.append(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    };

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
    };

    host.remove();

    return results;
  });

  expectSameColor(values.inheritedButtonBg, values.tokenText, "button ignores container intent");
  expectSameColor(values.inheritedBadgeFg, values.tokenText, "badge ignores container intent");
  expectSameColor(values.explicitButtonBg, values.tokenDestructive, "element intent wins");

  expect(values.tokenSuccess).not.toBe(values.tokenText);
});

/* An alias has to resolve to exactly the same tones as the intent it aliases,
   or a component styled with one drifts from a component styled with the
   other. */
test("resolves every destructive alias to the same tones", async ({ page }) => {
  await page.goto(PLAYGROUND_URL);

  const resolved = await page.evaluate(() =>
    ["destructive", "danger", "error"].map((intent) => {
      const element = document.createElement("div");
      element.className = `badge ${intent}`;
      document.body.append(element);

      const styles = getComputedStyle(element);
      const value = [
        styles.getPropertyValue("--intent-color"),
        styles.getPropertyValue("--intent-contrast"),
        styles.getPropertyValue("--intent-border"),
      ].join("|");

      element.remove();

      return value;
    }),
  );

  expect(new Set(resolved).size).toBe(1);
});
