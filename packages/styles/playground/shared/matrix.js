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
  /* One row, not two: `.solid` answers the edge question itself -- it fills the
     box and takes the line away -- so `.solid` and `.solid.edgeless` are the same
     box. `.solid.edged` is the documented way back to a line and is left off the
     grid, because the edge blend still runs that line toward the fill: for every
     intent whose fill is opaque the cell would repeat the row above. */
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

   `ghost` is on this list now. It used to be unsupported on all three toggles
   -- a checked one was a mark on nothing -- and stopped being once `:checked`
   started pinning the fill to one plate regardless of presentation: a checked
   `.ghost` toggle now renders the same filled mark every other checked toggle
   does, so its unchecked silhouette is a real, published look rather than a
   floored duplicate of `.soft`. */
const FILL_PRESENTATIONS = ["default", "solid", "soft", "ghost"];
/* The full grid minus the two `ghost` rows, for the components the registry
   marks `.ghost` unsupported on while still reading both axes: a key cap, a
   code chip and a code block rest on a ground, so `.ghost` draws the plate
   anyway and the row teaches that a class does nothing -- and at zero fill the
   plate is `--intent-subtle` alone, which renders four of the eight intents as
   the same near-page chip. No longer used for the switch, which used to be on
   this list for the toggle-wide ghost-unsupported reason `FILL_PRESENTATIONS`
   records above; that reason no longer applies to any toggle. */
const NO_GHOST_PRESENTATIONS = ["default", "solid", "soft edged", "soft edgeless"];
/* The full grid minus `.solid`, for `.progress`: a fully-filled track and the
   value fill it carries compose the same color, so the one thing the
   component exists to show -- how much is filled -- disappears. `registry.json`
   marks the fill axis unsupported for `.solid` there, and the playground is the
   support surface, so a row it draws is a claim. `.ghost.edgeless` stays on the
   grid: it renders, just with no visible frame at rest, a consumer's own
   combination rather than something the composition breaks. */
const NO_SOLID_PRESENTATIONS = ["default", "soft edged", "soft edgeless", "ghost edged", "ghost edgeless"];
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
    states: { disabled: { disabled: "" } },
  },
  badge: {
    tag: "span",
    text: (intent) => title(intent),
    states: {},
  },
  kbd: {
    presentations: NO_GHOST_PRESENTATIONS,
    tag: "kbd",
    text: (intent) => title(intent),
    states: {},
  },
  code: {
    presentations: NO_GHOST_PRESENTATIONS,
    tag: "code",
    text: (intent) => `${intent}()`,
    states: {},
  },
  pre: {
    presentations: NO_GHOST_PRESENTATIONS,
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
    /* No class: the package no longer picks an icon for `.alert`, so this state
       drops in a real `.alert-icon` child the same way a consumer would --
       `gap-3` on `.alert` spaces it with nothing to trigger. `@codenhub/icons`
       is already a playground dependency (see `.ic-mail` on the forms fixture),
       so this uses it rather than hand-rolled SVG. One glyph for every intent,
       since the point here is the composition, not a per-intent icon set. */
    states: {
      icon: {
        html: (intent) => `<i class="alert-icon ic-circle-alert" aria-hidden="true"></i>${title(intent)} alert`,
      },
    },
  },
  card: {
    tag: "div",
    layout: "grid",
    html: (intent) =>
      `<h4 class="text-title-sm">${title(intent)}</h4><p class="text-body">A surface reading this intent.</p>`,
    states: {
      interactive: { class: "interactive" },
      hoverable: { class: "hoverable" },
      pressable: { class: "pressable" },
    },
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
  /* A switch reads the edge axis where the other two floor it, so it takes
     most of the full grid -- but not `ghost edgeless`: `.ghost` already asks
     for zero fill, so with the line gone too there is nothing left to mark
     the track, just a knob floating with no bounds. `.switch.ghost.edgeless`
     (`form.css`) holds the floor up for that one pairing, so it renders
     identically to `ghost edged` -- a duplicate row that teaches nothing,
     the same reason `.solid`'s edge rows collapse to one above. */
  switch: toggle(
    "switch",
    "checkbox",
    PRESENTATIONS.filter((presentation) => presentation !== "ghost edgeless"),
  ),
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
    presentations: NO_SOLID_PRESENTATIONS,
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
  /* `.tooltip` is a wrapper around a real trigger and a real `.tooltip-bubble`
     now, not a single classed host -- see `docs/usage/tooltips.md`. The cell
     is the wrapper; intent lives on the bubble inside it. */
  tooltip: {
    tag: "span",
    presentations: INTENT_ONLY,
    wrapperOnly: true,
    html: (intent) => {
      const bubbleId = `tooltip-matrix-bubble-${intent}`;
      const intentClass = intent === "none" ? "" : intent;

      return (
        `<span class="tooltip-icon" tabindex="0" aria-label="${title(intent)} tooltip" aria-describedby="${bubbleId}">?</span>` +
        `<span class="tooltip-bubble ${intentClass}" role="tooltip" id="${bubbleId}">${title(intent)} tooltip</span>`
      );
    },
    states: {},
  },
};

const buildCell = (key, component, intent, presentation, state) => {
  const stateSpec = state === "rest" ? {} : (component.states[state] ?? {});
  const element = document.createElement(component.tag);

  /* A tooltip's cell is a wrapper around a real trigger and bubble now, not a
     single classed element -- intent and presentation belong on the bubble
     markup `component.html` builds, not on the host, so the host takes only
     its own structural class. */
  element.className = component.wrapperOnly
    ? key
    : classesFor(key, intent, presentation, [component.extra, stateSpec.class].filter(Boolean).join(" "));
  element.dataset.testid = `${key}-${slug(presentation)}-${intent}${state === "rest" ? "" : `-${state}`}`;

  for (const [name, value] of Object.entries(component.attrs?.(intent) ?? {})) {
    element.setAttribute(name, value);
  }

  for (const [name, value] of Object.entries(stateSpec)) {
    if (name !== "class" && name !== "remove" && name !== "html") {
      element.setAttribute(name, value);
    }
  }

  for (const name of stateSpec.remove ?? []) {
    element.removeAttribute(name);
  }

  if (stateSpec.html) {
    /* A state can replace the cell's own markup rather than just add an
       attribute -- `.alert`'s "icon" state needs a real `.alert-icon` child
       now that the package no longer paints one on its own. */
    element.innerHTML = stateSpec.html(intent);
  } else if (component.html) {
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

/* Input type is a second axis with nothing to do with intent. Every cell is a
   whole field -- label, control, and hint -- because that is the shape the
   package documents; the invalid cell swaps the hint for an error. Pages declare
   the axis the same way as a matrix:

     <div data-fields="email,password,search"></div>

   Cells are addressable as `field-<type>-<variant>`. Icons are not part of this
   axis: the package ships none, and `.input-group` composes any icon element
   beside a control -- shown in its own playground section. */
const FIELD_TYPES = {
  email: { value: "you@example.com", hint: "Used for build notifications." },
  password: { value: "correct horse battery", hint: "At least twelve characters." },
  url: { value: "https://coden.agency", hint: "Include the scheme." },
  tel: { value: "+55 11 90000-0000", hint: "Country code first." },
  search: { value: "styles", hint: "Matches package names." },
  date: { value: "2026-08-10", hint: "Native picker, unstyled." },
  "datetime-local": { value: "2026-08-10T09:30", hint: "Local time, no zone." },
  month: { value: "2026-08", hint: "Billing period." },
  week: { value: "2026-W33", hint: "ISO week number." },
  time: { value: "09:30", hint: "Twenty-four hour clock." },
  text: { value: "Plain text", hint: "The default type." },
  number: { value: "42", hint: "Numeric entry." },
};

const FIELD_VARIANTS = {
  standard: { label: "Standard", classes: "" },
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

    for (const variant of Object.keys(FIELD_VARIANTS)) {
      grid.append(buildField(type, variant));
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
