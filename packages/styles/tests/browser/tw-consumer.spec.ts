import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
  <div class="glass glass-liquid">
    <div class="{tw:my-surface|dist:surface}" data-known="apply-surface">Liquid surface</div>
    <div class="neobrutalism"><div class="{tw:my-surface|dist:surface}" data-known="apply-surface">Nested</div></div>
  </div>
  <button class="{tw:my-save|dist:btn primary soft edged raised sm}">Applied button</button>
  <button class="{tw:my-large|dist:btn secondary lg cut-diagonal}">Applied large button</button>
  <button class="{tw:my-ghost|dist:btn destructive ghost flat}">Applied ghost button</button>
  <input class="{tw:my-small-field|dist:ipt sm}" />
  <input class="{tw:my-soft-field|dist:ipt soft}" />
  <input class="{tw:my-solid-field|dist:ipt solid primary}" />
  <input class="{tw:my-bare-field|dist:ipt soft edgeless}" />
  <span class="tooltip"><span class="{tw:my-bare-tip|dist:tooltip-bubble edgeless}">Tip</span></span>
  <select class="{tw:my-large-select|dist:select lg}"><option>One</option></select>
  <textarea class="{tw:my-small-area|dist:textarea sm}">Text</textarea>
  <div class="{tw:my-floating|dist:card floating solid info}">Applied card</div>
  <div class="card success solid">
    <button class="{tw:my-plain|dist:btn}">Applied button in a success card</button>
    <span class="{tw:my-badge|dist:badge}">Applied badge</span>
    <kbd class="{tw:my-kbd|dist:kbd}">K</kbd>
    <table class="{tw:my-table|dist:data-table}"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
    <div class="{tw:my-box|dist:box}">Applied box</div>
    <input class="{tw:my-control|dist:text-control}" />
  </div>
  <button class="btn primary raised"><span class="{tw:my-box|dist:box}">Box in a button</span></button>
  <input type="checkbox" class="{tw:my-check|dist:checkbox}" />
  <input type="checkbox" class="{tw:my-check|dist:checkbox}" checked />
  <input type="checkbox" class="{tw:my-check|dist:checkbox}" checked disabled />
  <input type="radio" class="{tw:my-radio|dist:radio}" checked />
  <input type="checkbox" class="{tw:my-switch|dist:switch}" />
  <input type="checkbox" class="{tw:my-switch|dist:switch}" checked />
  <div class="{tw:my-group|dist:input-group}"><span>@</span><input class="ipt" /></div>
  <dialog class="{tw:my-surface|dist:surface}" data-known="apply-surface">Closed sheet</dialog>
  <dialog class="{tw:my-surface|dist:surface}" data-known="apply-surface" open>Open sheet</dialog>
  <div class="{tw:my-tight|dist:stack tight}"><p>a</p><p>b</p></div>
  <div class="{tw:my-loose|dist:stack loose}"><p>a</p><p>b</p></div>
  <div class="{tw:my-row|dist:view horizontal tight}"><p>a</p><p>b</p></div>
  <div class="{tw:my-column|dist:view vertical loose}"><p>a</p><p>b</p></div>
  <div class="{tw:my-spread|dist:cluster between}"><p>a</p><p>b</p></div>
  <div class="{tw:my-tight-cluster|dist:cluster tight}"><p>a</p><p>b</p></div>
  <div class="{tw:my-loose-grid|dist:auto-grid loose}"><p>a</p><p>b</p></div>
  <div class="{tw:my-narrow|dist:section-content narrow}">Narrow</div>
  <div class="{tw:my-wide|dist:section-content wide}">Wide</div>
  <hr class="{tw:my-upright|dist:divider vertical}" />
  <button class="{tw:my-icon|dist:btn icon}">x</button>
  <button class="{tw:my-small-icon|dist:btn icon sm}">x</button>
  <button class="{tw:my-chip-icon|dist:btn icon p-xs}">x</button>
  <button class="{tw:my-snug-icon|dist:btn icon p-sm}">x</button>
  <button class="{tw:my-roomy-icon|dist:btn icon p-lg lg}">x</button>
  <button class="{tw:my-chip|dist:btn p-xs}">Chip</button>
  <button class="{tw:my-snug|dist:btn p-sm primary}">Snug</button>
  <button class="{tw:my-roomy|dist:btn p-lg}">Roomy</button>
  <button class="{tw:my-pill|dist:btn pill solid primary}">Pill</button>
  <div class="{tw:my-chip-card|dist:card p-xs}">Card</div>
  <div class="{tw:my-snug-card|dist:card p-sm raised}">Card</div>
  <div class="{tw:my-roomy-card|dist:card p-lg}">Card</div>
  <div class="{tw:my-flush-card|dist:card flush}">Card</div>
  <div class="{tw:my-chip-panel|dist:panel p-xs}">Panel</div>
  <div class="{tw:my-snug-panel|dist:panel p-sm}">Panel</div>
  <div class="{tw:my-roomy-panel|dist:panel p-lg}">Panel</div>
  <div class="{tw:my-flush-panel|dist:panel flush}">Panel</div>
  <div class="{tw:my-click-card|dist:card interactive}">Card</div>
  <div class="{tw:my-hover-card|dist:card hoverable soft}">Card</div>
  <div class="{tw:my-press-card|dist:card pressable}">Card</div>
  <div class="{tw:my-busy|dist:progress active}"></div>
  <div class="{tw:my-waiting|dist:progress indeterminate}"></div>
  <table class="{tw:my-ruled|dist:data-table ruled}"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>
  <table class="{tw:my-bare-table|dist:data-table ruleless}"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>
</main>`;

/* Read by the dialog test alone, and scanned by the consumer's build beside the
   fixture so the classes it names are emitted. */
const DIALOGS = `
<dialog class="my-surface" id="closed">Closed</dialog>
<dialog class="my-sheet flex" id="closed-flex">Closed</dialog>
<dialog class="my-surface" id="open">Open</dialog>
<dialog class="my-sheet flex" id="open-flex">Open</dialog>
<dialog class="my-sheet mt-8" id="placed">Placed</dialog>`;

/* Read by the custom-intent test alone, and scanned beside the fixture the
   same way. */
const CUSTOM_INTENTS = `
<input class="my-field beta" id="field-utility-intent" />
<input class="my-field gamma" id="field-plain-intent" />
<div class="my-sheet beta" id="sheet-utility-intent">Sheet</div>`;

/* Read by the override test alone, and scanned beside the fixture the same
   way. */
const OVERRIDES = `
<table class="data-table"><tbody><tr><td class="p-0 text-center" id="cell">1</td></tr></tbody></table>
<label class="label text-sm" id="label">Label</label>
<button class="btn sm px-8" id="button-padding">Wide</button>
<button class="btn lg text-xs" id="button-text">Small type</button>
<div class="view horizontal flex-col" id="view-direction"><p>a</p></div>
<button class="btn icon p-4" id="icon-padding">x</button>
<div class="card p-xs p-8" id="card-padding">Card</div>`;

const fixtureFor = (side: "tw" | "dist") =>
  FIXTURE.replaceAll(/\{tw:([^|]*)\|dist:([^}]*)\}/g, (_, tw: string, dist: string) => (side === "tw" ? tw : dist));

const CONSUMER_CSS = (twEntry: string, glassEntry: string) => `@import "${twEntry}";
@import "${glassEntry}";

.my-surface {
  @apply surface;
}

.my-control {
  @apply text-control;
}

/* A consumer's own component is a package component with its axis and modifier
   classes applied: every one of them is a utility. */
.my-save {
  @apply btn primary soft edged raised sm;
}

.my-large {
  @apply btn secondary lg cut-diagonal;
}

.my-ghost {
  @apply btn destructive ghost flat;
}

.my-small-field {
  @apply ipt sm;
}

/* A fill or an edge class applied with a field is the element's own, as the
   class on the element is: the field takes the soft tint whole and drops its
   line, where a container's class would be capped and floored. */
.my-soft-field {
  @apply ipt soft;
}

.my-solid-field {
  @apply ipt solid primary;
}

.my-bare-field {
  @apply ipt soft edgeless;
}

.my-bare-tip {
  @apply tooltip-bubble edgeless;
}

.my-large-select {
  @apply select lg;
}

.my-small-area {
  @apply textarea sm;
}

.my-floating {
  @apply card floating solid info;
}

.my-plain {
  @apply btn;
}

.my-badge {
  @apply badge;
}

.my-kbd {
  @apply kbd;
}

.my-table {
  @apply data-table;
}

.my-box {
  @apply box;
}

.my-check {
  @apply checkbox;
}

.my-radio {
  @apply radio;
}

.my-switch {
  @apply switch;
}

.my-group {
  @apply input-group;
}

/* Every modifier is a utility, so each applies with its component and renders
   as the classes do. */
.my-tight {
  @apply stack tight;
}

.my-loose {
  @apply stack loose;
}

.my-row {
  @apply view horizontal tight;
}

.my-column {
  @apply view vertical loose;
}

.my-spread {
  @apply cluster between;
}

.my-tight-cluster {
  @apply cluster tight;
}

.my-loose-grid {
  @apply auto-grid loose;
}

.my-narrow {
  @apply section-content narrow;
}

.my-wide {
  @apply section-content wide;
}

.my-upright {
  @apply divider vertical;
}

.my-icon {
  @apply btn icon;
}

.my-small-icon {
  @apply btn icon sm;
}

.my-chip-icon {
  @apply btn icon p-xs;
}

.my-snug-icon {
  @apply btn icon p-sm;
}

.my-roomy-icon {
  @apply btn icon p-lg lg;
}

.my-chip {
  @apply btn p-xs;
}

.my-snug {
  @apply btn p-sm primary;
}

.my-roomy {
  @apply btn p-lg;
}

.my-pill {
  @apply btn pill solid primary;
}

.my-chip-card {
  @apply card p-xs;
}

.my-snug-card {
  @apply card p-sm raised;
}

.my-roomy-card {
  @apply card p-lg;
}

.my-flush-card {
  @apply card flush;
}

.my-chip-panel {
  @apply panel p-xs;
}

.my-snug-panel {
  @apply panel p-sm;
}

.my-roomy-panel {
  @apply panel p-lg;
}

.my-flush-panel {
  @apply panel flush;
}

.my-click-card {
  @apply card interactive;
}

.my-hover-card {
  @apply card hoverable soft;
}

.my-press-card {
  @apply card pressable;
}

.my-busy {
  @apply progress active;
}

.my-waiting {
  @apply progress indeterminate;
}

.my-ruled {
  @apply data-table ruled;
}

.my-bare-table {
  @apply data-table ruleless;
}

@utility my-sheet {
  @apply surface;
}

@utility my-field {
  @apply text-control;
}

@utility beta {
  --intent-color: #7c3aed;
  --intent-contrast: #ffffff;
  --intent-hover: #6d28d9;
  --intent-strong: #5b21b6;
  --intent-subtle: #ede9fe;
  --intent-border: #7c3aed;
  --intent-fill-max: 100%;
}

.gamma {
  --intent-color: #0f766e;
  --intent-contrast: #ffffff;
  --intent-hover: #115e59;
  --intent-strong: #134e4a;
  --intent-subtle: #ccfbf1;
  --intent-border: #0f766e;
  --intent-fill-max: 100%;
}
`;

/* Tailwind's default palette, less what the package's own theme reads from
   it: the `neutral`, `emerald`, `amber`, `rose`, and `indigo` ramps and
   `white`. A consumer who wants only their own colours as utilities clears
   these. Clearing the whole `--color-*` namespace takes the package's tokens
   with it, declared in the same namespace, and the build fails; clearing a
   ramp the theme reads leaves that intent with no colour and no error, so
   `docs/usage/theming.md` lists the ones to keep. */
const CLEARED_HUES = [
  "red",
  "orange",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "sky",
  "blue",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "slate",
  "gray",
  "zinc",
  "stone",
];

const CLEARED_PALETTE_CSS = (twEntry: string) => `@import "${twEntry}";

@theme {
${CLEARED_HUES.map((hue) => `  --color-${hue}-*: initial;`).join("\n")}
  --color-black: initial;
  --color-brand: #7c3aed;
}
`;

const CLEARED_PALETTE_PAGE = `
<div id="root">
  <button class="btn primary solid bg-red-500" id="primary">Save</button>
  <button class="btn" id="neutral">Cancel</button>
  <div class="card soft success" id="card">Saved</div>
  <div class="alert destructive" id="alert">Failed</div>
  <p class="text-brand" id="brand">Brand</p>
</div>`;

/* A consumer who restates the neutral line in `@theme`. Tailwind merges that
   into the one theme rule, ahead of every rule this package layers after it. */
const OWN_BORDER_CSS = (twEntry: string) => `@import "${twEntry}";

@theme {
  --color-border: rgb(200 30 30);
}
`;

const OWN_BORDER_PAGE = `<div class="card" id="card">Card</div>`;

let twCss = "";
let clearedCss = "";
let ownBorderCss = "";
let distCss = "";

test.beforeAll(async () => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "codenhub-styles-tw-consumer-"));

  try {
    /* The consumer's own directory is the working directory, so Tailwind's
       automatic detection scans the fixture page and nothing of this
       package's. */
    await writeFile(path.join(temporaryRoot, "page.html"), fixtureFor("tw"));
    await writeFile(path.join(temporaryRoot, "dialogs.html"), DIALOGS);
    await writeFile(path.join(temporaryRoot, "intents.html"), CUSTOM_INTENTS);
    await writeFile(path.join(temporaryRoot, "overrides.html"), OVERRIDES);
    await writeFile(
      path.join(temporaryRoot, "input.css"),
      CONSUMER_CSS(
        pathToFileURL(path.join(packageRoot, "tw", "index.css")).href,
        pathToFileURL(path.join(packageRoot, "tw", "aesthetics", "glass.css")).href,
      ),
    );
    await executeFile(process.execPath, [tailwindCliPath, "-i", "input.css", "-o", "output.css", "--minify"], {
      cwd: temporaryRoot,
    });
    twCss = await readFile(path.join(temporaryRoot, "output.css"), "utf8");

    const clearedRoot = path.join(temporaryRoot, "cleared");

    await mkdir(clearedRoot);
    await writeFile(path.join(clearedRoot, "page.html"), CLEARED_PALETTE_PAGE);
    await writeFile(
      path.join(clearedRoot, "input.css"),
      CLEARED_PALETTE_CSS(pathToFileURL(path.join(packageRoot, "tw", "index.css")).href),
    );
    await executeFile(process.execPath, [tailwindCliPath, "-i", "input.css", "-o", "output.css", "--minify"], {
      cwd: clearedRoot,
    });
    clearedCss = await readFile(path.join(clearedRoot, "output.css"), "utf8");

    const ownBorderRoot = path.join(temporaryRoot, "own-border");

    await mkdir(ownBorderRoot);
    await writeFile(path.join(ownBorderRoot, "page.html"), OWN_BORDER_PAGE);
    await writeFile(
      path.join(ownBorderRoot, "input.css"),
      OWN_BORDER_CSS(pathToFileURL(path.join(packageRoot, "tw", "index.css")).href),
    );
    await executeFile(process.execPath, [tailwindCliPath, "-i", "input.css", "-o", "output.css", "--minify"], {
      cwd: ownBorderRoot,
    });
    ownBorderCss = await readFile(path.join(ownBorderRoot, "output.css"), "utf8");
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }

  distCss = [
    await readFile(path.join(packageRoot, "dist", "index.css"), "utf8"),
    await readFile(path.join(packageRoot, "dist", "aesthetics", "glass.css"), "utf8"),
  ].join("\n");
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

  /* A closed `<dialog>` stays hidden and an open one centred whichever class
     applies `surface`, and wherever the consumer applied it: unlayered, or as
     a utility of their own beside `flex`. The user agent's own rules lose to
     `surface`'s `display` and to Preflight's `margin: 0`. A consumer's
     margin utility still places an open one. */
  test("@apply surface keeps a dialog closed until opened, and centred once open", async ({ page }) => {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8" /><style>${twCss}</style></head><body>${DIALOGS}</body></html>`,
    );

    const dialogs = await page.evaluate(() => {
      for (const id of ["open", "open-flex", "placed"]) {
        (document.getElementById(id) as HTMLDialogElement).show();
      }
      const read = (id: string) => getComputedStyle(document.getElementById(id)!);

      return {
        closed: read("closed").display,
        closedFlex: read("closed-flex").display,
        open: read("open").marginLeft,
        openFlex: read("open-flex").marginLeft,
        openFlexDisplay: read("open-flex").display,
        placed: read("placed").marginTop,
      };
    });

    expect(dialogs.closed).toBe("none");
    expect(dialogs.closedFlex, "a closed dialog beside a display utility").toBe("none");
    expect(Number.parseFloat(dialogs.open), "centred over Preflight").toBeGreaterThan(0);
    expect(Number.parseFloat(dialogs.openFlex), "centred beside a display utility").toBeGreaterThan(0);
    expect(dialogs.openFlexDisplay, "an open dialog takes the consumer's display").toBe("flex");
    expect(dialogs.placed, "a consumer's margin utility").toBe("32px");
  });

  /* A helper applied in a utility of the consumer's own lands in `utilities`,
     as `class="text-control"` does, so its zero-specificity neutral reset
     loses to an intent class the consumer wrote as a utility or as plain
     CSS. Applied in unlayered CSS instead, the reset would be unlayered and
     beat every utility; customizing.md says so. */
  test("@apply in a consumer's utility takes the consumer's own intent", async ({ page }) => {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8" /><style>${twCss}</style></head><body>${CUSTOM_INTENTS}</body></html>`,
    );

    const intents = await page.evaluate(() =>
      ["field-utility-intent", "field-plain-intent", "sheet-utility-intent"].map((id) =>
        getComputedStyle(document.getElementById(id)!).getPropertyValue("--intent-color").trim(),
      ),
    );

    expect(intents).toEqual(["#7c3aed", "#0f766e", "#7c3aed"]);
  });

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

  /* The toggles' forced-colours rules name their classes from outside the
     utilities, so an applied checkbox kept none of them: `box`'s colours were
     forced to the system's with the checked state painted like the unchecked
     one. Each utility carries the rules for the element it is applied to. */
  test("draws applied toggles in system colours in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    test.skip(
      !(await page.evaluate(
        () => matchMedia("(forced-colors: active)").matches && CSS.supports("forced-color-adjust", "none"),
      )),
      "engine cannot emulate forced colors",
    );

    const paintFor = async (side: Side) => {
      const name = (control: string) => (side === "tw" ? `my-${control === "checkbox" ? "check" : control}` : control);

      await page.setContent(
        `<!doctype html><html><head><meta charset="utf-8" /><style>${side === "tw" ? twCss : distCss}</style></head><body>` +
          ["checkbox", "radio", "switch"]
            .map(
              (control) =>
                `<input type="${control === "radio" ? "radio" : "checkbox"}" class="${name(control)}" />` +
                `<input type="${control === "radio" ? "radio" : "checkbox"}" class="${name(control)}" checked />`,
            )
            .join("") +
          "</body></html>",
      );

      return page.evaluate(() =>
        [...document.querySelectorAll("input")].map((element) => {
          const styles = getComputedStyle(element);

          return [
            styles.forcedColorAdjust,
            styles.backgroundColor,
            styles.borderTopColor,
            getComputedStyle(element, "::after").backgroundColor,
          ].join(" | ");
        }),
      );
    };

    const compiled = await paintFor("dist");

    expect(compiled[0], "the compiled checkbox opts out of forced colours").toMatch(/^none /);
    expect(await paintFor("tw")).toEqual(compiled);
  });

  /* A component's inner rules are defaults. Written at 0-1-1 and 0-2-0 they
     outranked every Tailwind utility on the element: a cell kept its padding
     under `p-0`, and a small button its padding under `px-8`. */
  test("renders its own colours for a consumer who cleared Tailwind's palette", async ({ page }) => {
    const coloursFor = async (css: string) => {
      await page.setContent(
        `<!doctype html><html data-theme="light"><head><meta charset="utf-8" /><style>${css}</style></head><body>${CLEARED_PALETTE_PAGE}</body></html>`,
      );

      return page.evaluate(() =>
        ["primary", "neutral", "card", "alert"].map((id) => {
          const styles = getComputedStyle(document.getElementById(id)!);

          return [styles.backgroundColor, styles.color, styles.borderTopColor].join(" | ");
        }),
      );
    };

    expect(clearedCss, "a cleared hue is no longer a utility").not.toMatch(/\.bg-red-500/);
    expect(clearedCss, "the consumer's own colour is one").toMatch(/\.text-brand/);
    /* The compiled sheet has `bg-red-500` for the first button, so the three
       it cannot repaint are the ones compared with it. */
    expect((await coloursFor(clearedCss)).slice(1)).toEqual((await coloursFor(distCss)).slice(1));
  });

  test("keeps a --color-border set in @theme when more contrast is asked for", async ({ page }) => {
    await page.setContent(
      `<!doctype html><html data-theme="light"><head><meta charset="utf-8" /><style>${ownBorderCss}</style></head><body>${OWN_BORDER_PAGE}</body></html>`,
    );

    const line = () => page.evaluate(() => getComputedStyle(document.getElementById("card")!).borderTopColor);
    const resting = await line();

    await page.emulateMedia({ contrast: "more" });

    expect(await line()).toBe(resting);
  });

  test("@apply tooltip-bubble opens in a tooltip host, as the class does", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setContent(
      `<!doctype html><html data-theme="light"><head><meta charset="utf-8" /><style>${twCss}</style></head><body style="padding:80px"><span class="tooltip"><button type="button" id="trigger">Help</button><span class="my-bare-tip">Tip</span></span></body></html>`,
    );

    const bubble = page.locator(".my-bare-tip");

    await expect(bubble).toBeHidden();
    await page.locator("#trigger").hover();
    await expect(bubble).toBeVisible();
    await expect(bubble).toHaveCSS("opacity", "1");
  });

  test("a Tailwind utility on the element beats a component's inner default", async ({ page }) => {
    await page.setContent(
      `<!doctype html><html><head><meta charset="utf-8" /><style>${twCss}</style></head><body>${OVERRIDES}</body></html>`,
    );

    const read = (id: string, property: string) =>
      page.evaluate(
        ([elementId, name]) => getComputedStyle(document.getElementById(elementId!)!).getPropertyValue(name!),
        [id, property],
      );

    expect(await read("cell", "padding-left")).toBe("0px");
    expect(await read("cell", "padding-top")).toBe("0px");
    expect(await read("cell", "text-align")).toBe("center");
    expect(await read("label", "font-size")).toBe("14px");
    expect(await read("button-padding", "padding-left")).toBe("32px");
    expect(await read("button-text", "font-size")).toBe("12px");
    expect(await read("view-direction", "flex-direction")).toBe("column");
    expect(await read("icon-padding", "padding-left")).toBe("16px");
    expect(await read("card-padding", "padding-left")).toBe("32px");
  });

  /* The comparison above reads every element at rest; this is the one modifier
     whose job is a state. */
  test("@apply card interactive answers the pointer as the class does", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    const hovered = async (css: string, classes: string) => {
      await page.setContent(
        `<!doctype html><html data-theme="light"><head><meta charset="utf-8" /><style>${css}</style></head><body style="padding:40px"><div class="${classes}" id="target">Card</div></body></html>`,
      );

      /* The pointer stays where the last page left it, over the card. */
      await page.mouse.move(0, 0);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));

      const target = page.locator("#target");
      const rest = await target.evaluate((element) => getComputedStyle(element).backgroundColor);

      await target.hover();
      await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));

      return {
        rest,
        cursor: await target.evaluate((element) => getComputedStyle(element).cursor),
        hover: await target.evaluate((element) => getComputedStyle(element).backgroundColor),
      };
    };

    for (const [mine, classes] of [
      ["my-click-card", "card interactive"],
      ["my-hover-card", "card hoverable soft"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one page, loaded in turn.
      const applied = await hovered(twCss, mine);
      // oxlint-disable-next-line no-await-in-loop -- one page, loaded in turn.
      const classed = await hovered(distCss, classes);

      expect(applied, mine).toEqual(classed);
      expect(applied.hover, `${mine} changes on hover`).not.toBe(applied.rest);
    }
  });
});
