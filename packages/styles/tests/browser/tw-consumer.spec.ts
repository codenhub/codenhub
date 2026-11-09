import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { expect, test, type Page } from "./fixtures";

/* `/tw` ships no safelist, so a consumer's Tailwind build emits only the
   classes it finds in their files. This holds that tree-shaken build to the
   compiled `dist/index.css`, which safelists everything: a page compiled
   through `/tw` from nothing but its own markup has to render every element
   the same as that page on the compiled stylesheet. The composition helpers
   are covered both ways a consumer reaches them -- as a class in the markup
   (`box`, `surface`, `text-control`, `input-group`) and through `@apply` in
   the consumer's own CSS, which the compiled side stands in for with the
   class itself. */

const executeFile = promisify(execFile);
const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tailwindCliPath = fileURLToPath(
  new URL("./dist/index.mjs", import.meta.resolve("@tailwindcss/cli/package.json")),
);

/* `{tw|dist}` picks the class list for each side; anything else is shared. */
const FIXTURE = `
<main id="root" class="stack">
  <h1 class="text-title">Settings</h1>
  <p class="text-body">Body copy</p>
  <div class="cluster">
    <button class="btn primary">Save</button>
    <button class="btn soft destructive">Delete</button>
    <button class="btn ghost neutral">Cancel</button>
    <a class="btn secondary edged" href="#">Link</a>
  </div>
  <div class="alert warning"><span class="alert-icon"></span><p>Careful</p></div>
  <div class="alert">Neutral alert</div>
  <span class="badge success">New</span>
  <span class="badge">Plain</span>
  <div class="card raised"><p>Card</p></div>
  <div class="panel"><p>Panel</p></div>
  <label class="field">
    <span class="label">Name</span>
    <input class="ipt" value="Ada" />
    <span class="hint">Your full name</span>
  </label>
  <div class="input-group"><input class="ipt" /><button class="btn">Go</button></div>
  <textarea class="textarea">Text</textarea>
  <select class="select"><option>One</option></select>
  <input type="checkbox" class="checkbox" checked />
  <input type="radio" class="radio" checked />
  <input type="checkbox" class="switch" checked />
  <progress class="progress" value="40" max="100"></progress>
  <p>Press <kbd class="kbd">K</kbd> or run <code class="code">pnpm</code></p>
  <pre class="pre">code block</pre>
  <span class="tooltip">Help<span class="tooltip-bubble">Bubble</span></span>
  <table class="data-table"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
  <hr class="divider" />
  <div class="box info soft">Box</div>
  <div class="box box-hover neutral raised edged">Hoverable box</div>
  <div class="surface">Surface class</div>
  <input class="text-control" />
  <div class="{tw:my-surface|dist:surface}">Surface by @apply</div>
  <input class="{tw:my-control|dist:text-control}" data-known="apply-text-control" />
  <input class="{tw:my-control soft|dist:text-control soft}" data-known="apply-text-control" />
  <input class="{tw:my-control solid|dist:text-control solid}" data-known="apply-text-control" />
  <input class="{tw:my-control edgeless|dist:text-control edgeless}" data-known="apply-text-control" />
  <input class="{tw:my-control|dist:text-control}" aria-invalid="true" data-known="apply-text-control" />
  <input class="{tw:my-control success|dist:text-control success}" data-known="apply-text-control" />
  <div class="card success">
    <input class="{tw:my-control|dist:text-control}" data-known="apply-text-control" />
    <div class="{tw:my-surface|dist:surface}" data-known="apply-surface">Surface in a success card</div>
  </div>
  <div class="{tw:my-surface success|dist:surface success}" data-known="apply-surface">Success surface</div>
</main>`;

const fixtureFor = (side: "tw" | "dist") =>
  FIXTURE.replaceAll(/\{tw:([^|]*)\|dist:([^}]*)\}/g, (_, tw: string, dist: string) => (side === "tw" ? tw : dist));

const CONSUMER_CSS = (twEntry: string) => `@import "${twEntry}";

.my-surface {
  @apply surface;
}

.my-control {
  @apply text-control;
}
`;

let twCss = "";
let distCss = "";

test.beforeAll(async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "codenhub-styles-tw-consumer-"));

  try {
    /* The consumer's own directory is the working directory, so Tailwind's
       automatic detection scans the fixture page and nothing of this
       package's. */
    await writeFile(path.join(temporaryRoot, "page.html"), fixtureFor("tw"));
    await writeFile(
      path.join(temporaryRoot, "input.css"),
      CONSUMER_CSS(pathToFileURL(path.join(packageRoot, "tw", "index.css")).href),
    );
    await executeFile(process.execPath, [tailwindCliPath, "-i", "input.css", "-o", "output.css", "--minify"], {
      cwd: temporaryRoot,
    });
    twCss = await readFile(path.join(temporaryRoot, "output.css"), "utf8");
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }

  distCss = await readFile(path.join(packageRoot, "dist", "index.css"), "utf8");
});

type Side = "tw" | "dist";

/* Every element's computed style, and its `::before` and `::after`, after the
   page is styled by `css`. Custom properties are left out: a tree-shaken build
   drops the theme variables nothing reads, which changes no rendered value. */
const renderFixture = async (page: Page, theme: "light" | "dark", css: string, side: Side) => {
  /* The sheet is in the page before its first render. Added afterwards, it
     restyled every element: the reduced-motion transitions started from the
     browser defaults, and under load WebKit reported some elements' inherited
     values from before the restyle (`tab-size` 8 where both sheets set 4).
     Neither sheet contains `</style`; `exports.test.ts` holds that. The wait
     below still lets any transition the first render starts finish. */
  await page.setContent(
    `<!doctype html><html data-theme="${theme}"><head><meta charset="utf-8" /><style>${css}</style></head><body>${fixtureFor(side)}</body></html>`,
  );
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.all(document.getAnimations().map((animation) => animation.finished));
  });

  return page.evaluate(() => {
    const read = (element: Element, pseudo?: string) => {
      const styles = getComputedStyle(element, pseudo);
      const values: Record<string, string> = {};

      /* A `::before` or `::after` without content generates no box, so only
         that is compared. WebKit also reports such a pseudo's inherited
         `visibility` from before or after the tooltip bubble's delayed
         transition, at random, which no rendered pixel shows. */
      if (pseudo && ["none", "normal"].includes(styles.getPropertyValue("content"))) {
        return { content: "none" };
      }

      for (let index = 0; index < styles.length; index += 1) {
        const name = styles.item(index);

        if (!name.startsWith("--")) {
          values[name] = styles.getPropertyValue(name);
        }
      }

      return values;
    };

    return [document.body, ...document.querySelectorAll("#root, #root *")].map((element) => ({
      after: read(element, "::after"),
      before: read(element, "::before"),
      known: element.getAttribute("data-known") ?? undefined,
      label: `${element.tagName.toLowerCase()}${element.className ? `.${String(element.className).split(" ").join(".")}` : ""}`,
      own: read(element),
    }));
  });
};

/* Each computed value the `/tw` page renders differently, for the elements
   `include` selects. */
const differencesBetween = async (
  page: Page,
  theme: "light" | "dark",
  include: (known: string | undefined) => boolean,
) => {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const compiled = await renderFixture(page, theme, distCss, "dist");
  const treeShaken = await renderFixture(page, theme, twCss, "tw");
  const differences: string[] = [];

  expect(treeShaken).toHaveLength(compiled.length);

  for (const [index, expected] of compiled.entries()) {
    const actual = treeShaken[index]!;

    if (!include(expected.known)) {
      continue;
    }
    for (const part of ["own", "before", "after"] as const) {
      for (const [property, value] of Object.entries(expected[part])) {
        if (actual[part][property] !== value) {
          differences.push(
            `${actual.label}${part === "own" ? "" : `::${part}`} ${property}: /tw ${actual[part][property]} vs compiled ${value}`,
          );
        }
      }
    }
  }

  return differences;
};

test.describe("/tw consumer build", () => {
  /* The fixture uses nearly every component, so its size says little; the
     classes it never names say whether the build was tree-shaken. */
  test("is tree-shaken: classes the page never names are not emitted", () => {
    expect(twCss).toMatch(/(?:^|[{}])\.btn\{/);
    for (const unused of ["skeleton", "quote", "auto-grid", "section", "visually-hidden", "tooltip-icon"]) {
      expect(twCss, `.${unused} is unused`).not.toMatch(new RegExp(String.raw`(?:^|[{}])\.${unused}(?![\w-])`));
      expect(distCss, `the compiled sheet emits .${unused}`).toMatch(
        new RegExp(String.raw`(?:^|[{}])\.${unused}(?![\w-])`),
      );
    }
  });

  for (const theme of ["light", "dark"] as const) {
    test(`renders every element as the compiled stylesheet does, ${theme} theme`, async ({ page }) => {
      expect(await differencesBetween(page, theme, (known) => known === undefined)).toEqual([]);
    });
  }

  /* `@apply` copies the `@utility` body and nothing that names the class from
     outside it, so what a helper needs is carried inside the utility: both
     carry the neutral intent reset, and `text-control` its control line and
     class-keyed seams (`.soft`, `.solid`, `.edgeless`, `aria-invalid`) too.
     Each applied element has to match the class it stands in for: unclassed,
     under each seam, with an intent of its own, and with none inside a
     container that has one. */
  for (const [helper, known] of [
    ["text-control", "apply-text-control"],
    ["surface", "apply-surface"],
  ] as const) {
    for (const theme of ["light", "dark"] as const) {
      test(`@apply ${helper} renders as the class does, ${theme} theme`, async ({ page }) => {
        expect(await differencesBetween(page, theme, (element) => element === known)).toEqual([]);
      });
    }
  }

  /* Forced colours replace the focus ring's colour with the system's and keep
     its width, so the package draws a 2px `Highlight` outline on a focused
     control -- and none on a control inside an `.input-group`, which draws the
     field's ring. An applied control has to get the same ring, in the same
     places. */
  test("@apply text-control draws the forced-colours focus ring as the class does", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });

    const ringsFor = async (side: Side) => {
      const control = side === "tw" ? "my-control" : "text-control";

      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8" /><style>${side === "tw" ? twCss : distCss}</style></head><body>` +
          `<input class="${control}" id="lone" /><div class="input-group"><input class="${control}" id="grouped" /></div>` +
          `<span class="${control}" id="span" tabindex="0">Editable</span></body></html>`,
      );

      return page.evaluate(() =>
        ["lone", "grouped", "span"].map((id) => {
          const element = document.getElementById(id)!;

          element.focus();
          const styles = getComputedStyle(element);

          return {
            id,
            focusVisible: element.matches(":focus-visible"),
            outline: `${styles.outlineStyle} ${styles.outlineWidth} ${styles.outlineOffset}`,
          };
        }),
      );
    };

    const compiled = await ringsFor("dist");

    expect(compiled.map(({ focusVisible }) => focusVisible)).toEqual([true, true, true]);
    expect(compiled[0]!.outline, "the compiled control's ring").toBe("solid 2px 2px");
    expect(compiled[1]!.outline, "no ring on the control inside a group").toMatch(/^none /);
    expect(await ringsFor("tw")).toEqual(compiled);
  });
});
