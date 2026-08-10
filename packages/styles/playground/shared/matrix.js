/* Preview-only scaffolding; not part of @codenhub/styles.

   Variant matrices are rendered from a spec rather than written out by hand. A
   component crossed with every intent, presentation, and state is a few hundred
   nodes, and a new intent has to appear in every one of them at once.

   Pages stay declarative:

     <div data-matrix="btn"></div>
     <div data-matrix="badge" data-matrix-states="rest"></div>

   Every cell gets `data-testid="<component>-<presentation>-<intent>-<state>"`, so
   a test can address any single variant. */

/* `none` is no intent class at all, which is not the same as `.neutral`: an
   intent class on the element beats anything inherited or supplied by an
   aesthetic, so the two differ wherever something else is in scope. */
const INTENTS = ["none", "neutral", "primary", "secondary", "success", "warning", "destructive", "info"];
/* A presentation entry may be more than one class: `out fill` is a documented
   combination rather than a presentation of its own. */
const PRESENTATIONS = ["plain", "fill", "out", "out fill", "soft", "flat", "ghost"];
const STATES = ["rest", "disabled"];

const title = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const slug = (value) => value.replace(/\s+/gu, "-");

/* `plain` and `rest` are the absence of a class, not classes themselves. */
const classesFor = (base, intent, presentation, extra) =>
  [base, intent === "none" ? "" : intent, presentation === "plain" ? "" : presentation, extra]
    .filter(Boolean)
    .join(" ");

const COMPONENTS = {
  btn: {
    tag: "button",
    label: "Buttons",
    text: (intent) => title(intent),
    states: { disabled: { disabled: "" }, loading: { class: "loading" } },
  },
  badge: {
    tag: "span",
    label: "Badges",
    text: (intent) => title(intent),
    states: {},
  },
  kbd: {
    tag: "kbd",
    label: "Key caps",
    text: () => "Ctrl",
    states: {},
  },
  alert: {
    tag: "div",
    label: "Alerts",
    block: true,
    extra: "icon",
    text: (intent) => `${title(intent)} alert`,
    states: {},
  },
  card: {
    tag: "div",
    label: "Cards",
    block: true,
    html: (intent) =>
      `<h4 class="text-title-sm">${title(intent)}</h4><p class="text-body">A surface reading this intent.</p>`,
    states: { interactive: { class: "interactive" } },
  },
  panel: {
    tag: "div",
    label: "Panels",
    block: true,
    text: (intent) => `${title(intent)} panel`,
    states: {},
  },
  ipt: {
    tag: "input",
    label: "Text inputs",
    block: true,
    attrs: (intent) => ({
      type: "text",
      placeholder: `${title(intent)} input`,
      "aria-label": `${title(intent)} input`,
    }),
    states: { disabled: { disabled: "" } },
  },
  select: {
    tag: "select",
    label: "Selects",
    block: true,
    html: () => "<option>Ready</option><option>Running</option>",
    attrs: (intent) => ({ "aria-label": `${title(intent)} select` }),
    states: { disabled: { disabled: "" } },
  },
  textarea: {
    tag: "textarea",
    label: "Text areas",
    block: true,
    attrs: (intent) => ({
      rows: "2",
      placeholder: `${title(intent)} message`,
      "aria-label": `${title(intent)} message`,
    }),
    states: { disabled: { disabled: "" } },
  },
  table: {
    tag: "table",
    label: "Tables",
    block: true,
    html: (intent) =>
      `<thead><tr><th>${title(intent)}</th><th>Value</th></tr></thead>` +
      "<tbody><tr><td>First</td><td>1</td></tr><tr><td>Second</td><td>2</td></tr></tbody>",
    states: {},
  },
  progress: {
    tag: "div",
    label: "Progress",
    block: true,
    attrs: () => ({ style: "--progress-value: 60%", role: "progressbar", "aria-label": "Progress" }),
    states: { active: { class: "active" }, indeterminate: { class: "indeterminate" } },
  },
};

const buildCell = (key, component, intent, presentation, state) => {
  const stateSpec = state === "rest" ? {} : (component.states[state] ?? {});
  const element = document.createElement(component.tag);

  element.className = classesFor(
    key,
    intent,
    presentation,
    [component.extra, stateSpec.class].filter(Boolean).join(" "),
  );
  element.dataset.testid = `${key}-${slug(presentation)}-${intent}${state === "rest" ? "" : `-${state}`}`;

  for (const [name, value] of Object.entries(component.attrs?.(intent) ?? {})) {
    element.setAttribute(name, value);
  }

  for (const [name, value] of Object.entries(stateSpec)) {
    if (name !== "class") {
      element.setAttribute(name, value);
    }
  }

  if (component.html) {
    element.innerHTML = component.html(intent);
  } else if (component.text) {
    element.textContent = component.text(intent);
  }

  return element;
};

const buildRow = (key, component, presentation, state, intents) => {
  const row = document.createElement("div");
  const label = document.createElement("p");
  const cells = document.createElement("div");

  row.className = "stack tight";
  label.className = "text-label text-text-secondary";
  label.textContent = state === "rest" ? title(presentation) : `${title(presentation)} · ${state}`;
  cells.className = component.block ? "stack tight" : "cluster";

  for (const intent of intents) {
    cells.append(buildCell(key, component, intent, presentation, state));
  }

  row.append(label, cells);

  return row;
};

const readList = (value, fallback) =>
  value
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : fallback;

const renderMatrix = (host) => {
  const key = host.dataset.matrix;
  const component = COMPONENTS[key];

  if (!component) {
    throw new Error(`Unknown matrix component: ${key}`);
  }

  const intents = readList(host.dataset.matrixIntents, INTENTS);
  const presentations = readList(host.dataset.matrixPresentations, PRESENTATIONS);
  const states = readList(host.dataset.matrixStates, STATES).filter(
    (state) => state === "rest" || state in component.states,
  );

  host.classList.add("stack", "loose");
  host.replaceChildren();

  for (const state of states) {
    for (const presentation of presentations) {
      host.append(buildRow(key, component, presentation, state, intents));
    }
  }
};

document.addEventListener("DOMContentLoaded", () => {
  for (const host of document.querySelectorAll("[data-matrix]")) {
    renderMatrix(host);
  }
});
