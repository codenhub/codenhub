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

/* Presentation is two independent closed sets -- a fill and an edge -- so every
   row names both. A row naming one leaves the other at the component's registry
   default, which makes two rows of the grid mean different things depending on
   which component they are under.

   Only combinations the package supports are rendered. A presentation whose
   tokens a component never reads, or reads to the same values as another,
   produces a row indistinguishable from its neighbour and teaches nothing; the
   playground is the support surface, so it must not imply otherwise. */
const PRESENTATIONS = [
  "default",
  /* One row, not two: at a full fill the edge blends all the way to the
     background, so `.solid.edged` and `.solid.edgeless` render the same box. */
  "solid",
  "soft edged",
  "soft edgeless",
  "ghost edged",
  "ghost edgeless",
];
/* `.checkbox` and `.radio` keep their line whatever the edge class says: an
   unchecked box is a transparent square and an unchecked radio a transparent
   circle, so removing the line removes the control (WCAG 1.4.11). Their edge
   rows would be duplicates of each other, so only the fill varies. The registry
   records the same fact as `axes: ["fill"]`, and `tests/browser/axes.spec.ts`
   asserts it in both directions.

   The three text inputs and the switch are no longer on this list. Their edge
   axis used to be inert -- `text-control` rewrote the composed edge and dropped
   `--ui-border` out of it -- and now that it composes, their edge rows show a
   real difference.

   No `ghost` row. The registry marks it unsupported on all three toggles, and
   the playground is the support surface: rendering a row the package does not
   maintain claims support for it. */
const FILL_PRESENTATIONS = ["default", "solid", "soft"];
/* Components that read intent but not presentation: the indicators, which stand
   in for content rather than being a box with a look, and the tooltip, whose
   cell is the trigger badge rather than the bubble. The bubble does read
   presentation, but it is a pseudo-element that only appears on hover, so a row
   per fill would render four identical badges. Spelling the axis out per
   component keeps a page from claiming a variant it ignores. */
const INTENT_ONLY = ["default"];
const STATES = ["rest", "disabled"];

const title = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const slug = (value) => value.replace(/\s+/gu, "-");

/* `default` and `rest` are the absence of a class, not classes themselves: a
   component with no presentation class renders the pair the registry publishes
   for it. */
const classesFor = (base, intent, presentation, extra) =>
  [base, intent === "none" ? "" : intent, presentation === "default" ? "" : presentation, extra]
    .filter(Boolean)
    .join(" ");

/* Toggles share an axis: the same intents, the same states, and the same
   unclassed cell. Only the input type, the label, and which axes the component
   reads differ -- `.checkbox` and `.radio` floor their edge absolutely, and a
   switch composes it like any other control. */
const toggle = (label, type, presentations = FILL_PRESENTATIONS) => ({
  tag: "input",
  presentations,
  attrs: (intent) => ({ type, "aria-label": `${title(intent)} ${label}` }),
  states: {
    checked: { checked: "" },
    disabled: { disabled: "" },
    "checked-disabled": { checked: "", disabled: "" },
  },
});

/* A text control caps its fill rather than taking a presentation at full
   strength, so it still reads every fill class -- and since the edge composes,
   it reads every edge class too. The full grid applies. */
const textControl = (tag, extra) => ({
  tag,
  layout: "grid",
  states: { disabled: { disabled: "" }, invalid: { "aria-invalid": "true" } },
  ...extra,
});

const COMPONENTS = {
  btn: {
    tag: "button",
    text: (intent) => title(intent),
    states: { disabled: { disabled: "" }, loading: { class: "loading" } },
  },
  badge: {
    tag: "span",
    text: (intent) => title(intent),
    states: {},
  },
  kbd: {
    tag: "kbd",
    text: (intent) => title(intent),
    states: {},
  },
  code: {
    tag: "code",
    text: (intent) => `${intent}()`,
    states: {},
  },
  pre: {
    tag: "pre",
    layout: "grid",
    text: (intent) => `const intent = "${intent}";`,
    states: {},
  },
  quote: {
    tag: "blockquote",
    layout: "grid",
    html: (intent) => `${title(intent)} quotation.<cite>Codenhub styles</cite>`,
    states: {},
  },
  alert: {
    tag: "div",
    layout: "grid",
    text: (intent) => `${title(intent)} alert`,
    states: { icon: { class: "icon" } },
  },
  card: {
    tag: "div",
    layout: "grid",
    html: (intent) =>
      `<h4 class="text-title-sm">${title(intent)}</h4><p class="text-body">A surface reading this intent.</p>`,
    states: { interactive: { class: "interactive" } },
  },
  panel: {
    tag: "div",
    layout: "grid",
    text: (intent) => `${title(intent)} panel`,
    states: {},
  },
  /* A rule is a line. There is no fill to vary and no edge beside the one it
     already is. */
  divider: {
    tag: "hr",
    layout: "stack",
    presentations: INTENT_ONLY,
    states: {},
  },
  ipt: textControl("input", {
    attrs: (intent) => ({
      type: "text",
      placeholder: `${title(intent)} input`,
      "aria-label": `${title(intent)} input`,
    }),
  }),
  select: textControl("select", {
    html: () => "<option>Ready</option><option>Running</option>",
    attrs: (intent) => ({ "aria-label": `${title(intent)} select` }),
  }),
  textarea: textControl("textarea", {
    attrs: (intent) => ({
      rows: "2",
      placeholder: `${title(intent)} message`,
      "aria-label": `${title(intent)} message`,
    }),
  }),
  checkbox: toggle("checkbox", "checkbox"),
  radio: toggle("radio", "radio"),
  /* A switch reads the edge axis where the other two floor it, so it takes the
     full grid minus the `ghost` rows no toggle supports. */
  switch: toggle("switch", "checkbox", ["default", "solid", "soft edged", "soft edgeless"]),
  "data-table": {
    tag: "table",
    layout: "grid",
    html: (intent) =>
      `<thead><tr><th>${title(intent)}</th><th>Value</th></tr></thead>` +
      "<tbody><tr><td>First</td><td>1</td></tr><tr><td>Second</td><td>2</td></tr></tbody>",
    states: {},
  },
  progress: {
    tag: "div",
    layout: "stack",
    presentations: INTENT_ONLY,
    attrs: (intent) => ({
      style: "--progress-value: 60%",
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": "60",
      "aria-label": `${title(intent)} progress`,
    }),
    states: {
      active: { class: "active" },
      /* An indeterminate bar has no value to report, and the class ignores
         `--progress-value`, so both have to go rather than sit there lying. */
      indeterminate: { class: "indeterminate", remove: ["aria-valuenow", "style"] },
    },
  },
  skeleton: {
    tag: "div",
    layout: "stack",
    presentations: INTENT_ONLY,
    attrs: () => ({ "aria-hidden": "true" }),
    states: {},
  },
  /* A loader is a coloured mask and nothing else: no fill, no edge, no
     silhouette. */
  loader: {
    tag: "span",
    presentations: INTENT_ONLY,
    attrs: (intent) => ({ role: "img", "aria-label": `${title(intent)} loader` }),
    states: {},
  },
  tooltip: {
    tag: "span",
    presentations: INTENT_ONLY,
    extra: "tooltip-icon",
    text: () => "?",
    attrs: (intent) => ({
      "data-tooltip": `${title(intent)} tooltip`,
      tabindex: "0",
      "aria-label": `${title(intent)} tooltip`,
    }),
    states: {},
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
    if (name !== "class" && name !== "remove") {
      element.setAttribute(name, value);
    }
  }

  for (const name of stateSpec.remove ?? []) {
    element.removeAttribute(name);
  }

  if (component.html) {
    element.innerHTML = component.html(intent);
  } else if (component.text) {
    element.textContent = component.text(intent);
  } else {
    /* Cells with no text of their own — a toggle, a loader, a divider — are told
       apart by position alone, so the intent has to be readable some other way. */
    element.title = title(intent);
  }

  return element;
};

const CELL_LAYOUTS = { cluster: "cluster", stack: "stack tight", grid: "auto-grid" };

const buildRow = (key, component, presentation, state, intents) => {
  const row = document.createElement("div");
  const label = document.createElement("p");
  const cells = document.createElement("div");

  row.className = "stack tight";
  label.className = "text-label text-text-secondary";
  label.textContent = state === "rest" ? title(presentation) : `${title(presentation)} · ${state}`;
  cells.className = CELL_LAYOUTS[component.layout ?? "cluster"];

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
  const presentations = readList(host.dataset.matrixPresentations, component.presentations ?? PRESENTATIONS);
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

/* Input type is a second axis with nothing to do with intent: each type brings
   its own icon, and some bring none. Every cell is a whole field -- label,
   control, and hint -- because that is the shape the package documents; the
   invalid cell swaps the hint for an error. Pages declare the axis the same way
   as a matrix:

     <div data-fields="email,password,search"></div>

   Cells are addressable as `field-<type>-<variant>`.

   `icon: false` drops the icon-left and icon-right cells. `text` and `number`
   have no artwork to show. Date and datetime-local opt themselves into `.icon`
   where the native picker button can be hidden and show nothing at all where it
   cannot, so an explicit alignment cell would be padding around an empty slot in
   one engine and a second calendar glyph in the other. Their standard cell is
   the whole supported surface. */
const FIELD_TYPES = {
  email: { value: "you@example.com", hint: "Used for build notifications." },
  password: { value: "correct horse battery", hint: "At least twelve characters." },
  url: { value: "https://coden.agency", hint: "Include the scheme." },
  tel: { value: "+55 11 90000-0000", hint: "Country code first." },
  search: { value: "styles", hint: "Matches package names." },
  date: { value: "2026-08-10", hint: "Native picker button, themed where it can be replaced.", icon: false },
  "datetime-local": { value: "2026-08-10T09:30", hint: "Local time, no zone.", icon: false },
  month: { value: "2026-08", hint: "Billing period." },
  week: { value: "2026-W33", hint: "ISO week number." },
  time: { value: "09:30", hint: "Twenty-four hour clock." },
  text: { value: "Plain text", hint: "No icon for this type.", icon: false },
  number: { value: "42", hint: "No icon for this type.", icon: false },
};

const FIELD_VARIANTS = {
  standard: { label: "Standard", classes: "" },
  "icon-left": { label: "Icon left", classes: "icon", icon: true },
  "icon-right": { label: "Icon right", classes: "icon right", icon: true },
  invalid: { label: "Invalid", classes: "", attrs: { "aria-invalid": "true" }, error: "Enter a valid value." },
  disabled: { label: "Disabled", classes: "", attrs: { disabled: "" } },
};

const buildField = (type, variant) => {
  const spec = FIELD_TYPES[type];
  const variantSpec = FIELD_VARIANTS[variant];
  const field = document.createElement("label");
  const label = document.createElement("span");
  const input = document.createElement("input");
  /* One message per cell. A field can carry a hint and an error at once -- the
     anatomy section shows that -- but here the grid exists to compare types, and
     a second line in one column only makes the rows harder to scan. */
  const message = document.createElement("span");
  const messageId = `field-${type}-${variant}-message`;

  field.className = "field";
  label.className = "label";
  label.textContent = variantSpec.label;

  input.className = ["ipt", variantSpec.classes].filter(Boolean).join(" ");
  input.type = type;
  input.value = spec.value;
  input.dataset.testid = `field-${type}-${variant}`;
  input.setAttribute("aria-describedby", messageId);

  for (const [name, value] of Object.entries(variantSpec.attrs ?? {})) {
    input.setAttribute(name, value);
  }

  message.className = variantSpec.error ? "hint error" : "hint";
  message.textContent = variantSpec.error ?? spec.hint;
  message.id = messageId;
  message.dataset.testid = `${messageId}`;

  field.append(label, input, message);

  return field;
};

const renderFields = (host) => {
  const types = readList(host.dataset.fields, Object.keys(FIELD_TYPES));

  host.classList.add("stack", "loose");
  host.replaceChildren();

  for (const type of types) {
    const spec = FIELD_TYPES[type];

    if (!spec) {
      throw new Error(`Unknown field type: ${type}`);
    }

    const group = document.createElement("div");
    const heading = document.createElement("h3");
    const grid = document.createElement("div");

    group.className = "stack tight";
    heading.className = "text-title-sm";
    heading.textContent = type;
    grid.className = "form-grid";

    for (const [variant, variantSpec] of Object.entries(FIELD_VARIANTS)) {
      if (!variantSpec.icon || spec.icon !== false) {
        grid.append(buildField(type, variant));
      }
    }

    group.append(heading, grid);
    host.append(group);
  }
};

document.addEventListener("DOMContentLoaded", () => {
  for (const host of document.querySelectorAll("[data-matrix]")) {
    renderMatrix(host);
  }

  for (const host of document.querySelectorAll("[data-fields]")) {
    renderFields(host);
  }
});
