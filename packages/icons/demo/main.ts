import { generateIconSetCss, IconRegistry, renderSvg, setStrokeWidth } from "@codenhub/icons";
import type { IconFamilyData } from "@codenhub/icons";

import "./style.css";

import { createModal } from "./modal.ts";
import { renderPagination } from "./pagination.ts";
import { showToast } from "./toast.ts";
import type { IconEntry } from "./types.ts";

const CLASS_PREFIX = "ic";
const DEFAULT_STROKE_WIDTH = 2;
const TARGET_ROWS = 10;
const CARD_SIZE = 64;
const GRID_GAP = 8;

// Every generated family, loaded only when someone selects it. This is the same
// on-demand path a consuming app uses through `registerLoader`.
const familyModules = import.meta.glob<IconFamilyData>("../data/*/icons.json", { import: "default" });

const registry = new IconRegistry();
const prefixes: string[] = [];

for (const [path, load] of Object.entries(familyModules)) {
  const prefix = path.replace("../data/", "").replace("/icons.json", "");
  registry.registerLoader(prefix, load);
  prefixes.push(prefix);
}
prefixes.sort((first, second) => first.localeCompare(second));

const state = {
  entries: [] as IconEntry[],
  family: undefined as IconFamilyData | undefined,
  page: 1,
  query: "",
  strokeWidth: DEFAULT_STROKE_WIDTH,
};

const iconStyleElement = document.createElement("style");
iconStyleElement.id = "demo-icon-styles";
document.head.appendChild(iconStyleElement);

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function initTheme(): void {
  const stored = localStorage.getItem("theme");
  const isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

function toggleTheme(): void {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const next = isDark ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
}

function isStrokeConfigurable(): boolean {
  return state.family?.info.strokeWidth !== undefined;
}

/**
 * Ranks a match so a name beats a keyword.
 *
 * Searching "heart" should not lead with an icon that merely carries
 * "heartbeat" among its keywords while `heart` itself sits further down.
 */
function scoreEntry(entry: IconEntry, query: string): number {
  if (entry.name === query) {
    return 0;
  }
  if (entry.name.startsWith(query)) {
    return 1;
  }
  if (entry.name.includes(query)) {
    return 2;
  }
  return entry.tags.some((tag) => tag.includes(query)) ? 3 : Number.POSITIVE_INFINITY;
}

function filterEntries(): IconEntry[] {
  const query = state.query.trim().toLowerCase();
  if (!query) {
    return state.entries;
  }

  return state.entries
    .flatMap((entry) => {
      const score = scoreEntry(entry, query);
      return Number.isFinite(score) ? [{ entry, score }] : [];
    })
    .sort((first, second) => first.score - second.score || first.entry.name.localeCompare(second.entry.name))
    .map(({ entry }) => entry);
}

/**
 * Generates mask rules for the icons on screen only.
 *
 * A family holds thousands of icons and each rule carries an encoded SVG, so
 * generating the whole family would produce megabytes of CSS to show sixty
 * icons.
 */
function injectPageStyles(entries: IconEntry[]): void {
  const { css } = generateIconSetCss(
    entries.map((entry) => entry.className),
    registry,
    { injectBase: false, prefix: CLASS_PREFIX, strokeWidth: state.strokeWidth },
  );
  iconStyleElement.textContent = css;
}

function readItemsPerPage(grid: HTMLElement): number {
  const columns = Math.floor((grid.getBoundingClientRect().width + GRID_GAP + 0.5) / CARD_SIZE) || 8;
  return columns * TARGET_ROWS;
}

function renderGrid(): void {
  const grid = element<HTMLElement>("icon-grid");
  const pagination = element<HTMLElement>("pagination-controls");
  if (!grid) {
    return;
  }

  const filtered = filterEntries();
  const itemsPerPage = readItemsPerPage(grid);
  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  state.page = Math.min(state.page, totalPages);

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state">No icon matches "${state.query}"</div>`;
    if (pagination) {
      pagination.innerHTML = "";
    }
    return;
  }

  const start = (state.page - 1) * itemsPerPage;
  const pageEntries = filtered.slice(start, start + itemsPerPage);
  injectPageStyles(pageEntries);

  const fragment = document.createDocumentFragment();
  for (const entry of pageEntries) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "icon-card";
    card.title = entry.name;
    card.setAttribute("aria-label", `View ${entry.name}`);
    card.innerHTML = `<span class="icon-preview"><i class="${entry.className}"></i></span>`;
    card.addEventListener("click", () => openIcon(entry));
    fragment.appendChild(card);
  }

  grid.replaceChildren(fragment);

  if (pagination) {
    renderPagination(pagination, state.page, totalPages, (page) => {
      state.page = page;
      renderGrid();
      window.scrollTo({ behavior: "smooth", top: 0 });
    });
  }
}

const modal = createModal({
  onCopyHtml: (entry) => {
    void copy(`<i class="${entry.className}"></i>`, "Copied HTML");
  },
  onCopySvg: (entry) => {
    void copy(readSvg(entry), "Copied SVG");
  },
  onDownload: (entry) => {
    downloadSvg(entry);
  },
});

function readSvg(entry: IconEntry): string {
  const resolved = registry.resolve(`${state.family?.prefix}:${entry.name}`);
  if (!resolved) {
    return "";
  }
  const svg = renderSvg(resolved);
  return resolved.strokeWidth === undefined ? svg : setStrokeWidth(svg, state.strokeWidth);
}

async function copy(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(message);
  } catch {
    showToast("Clipboard unavailable");
  }
}

function downloadSvg(entry: IconEntry): void {
  const blob = new Blob([readSvg(entry)], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${entry.name}.svg`;
  link.click();
  URL.revokeObjectURL(url);
  showToast(`Downloaded ${entry.name}.svg`);
}

function openIcon(entry: IconEntry): void {
  if (!state.family) {
    return;
  }
  modal.open(entry, state.family);
}

function updateSearchPlaceholder(): void {
  const search = element<HTMLInputElement>("search-input");
  if (search && state.family) {
    search.placeholder = `Search ${state.family.info.total.toLocaleString("en-US")} icons...`;
  }
}

function updateStrokeAvailability(): void {
  const button = element<HTMLButtonElement>("stroke-width-btn");
  if (!button) {
    return;
  }
  const enabled = isStrokeConfigurable();
  button.disabled = !enabled;
  button.dataset.tooltip = enabled ? "Stroke width" : "This family is drawn as filled paths";
  if (!enabled) {
    element<HTMLElement>("stroke-width-popover")?.classList.remove("open");
  }
}

async function selectFamily(prefix: string): Promise<void> {
  const grid = element<HTMLElement>("icon-grid");
  if (grid) {
    grid.innerHTML = `<div class="empty-state">Loading ${prefix}…</div>`;
  }

  const family = await registry.load(prefix);
  state.family = family;
  state.page = 1;
  state.entries = Object.entries(family.icons).map(([name, icon]) => ({
    className: `${CLASS_PREFIX}-${prefix}-${name}`,
    name,
    tags: (icon.tags ?? []).map((tag) => tag.toLowerCase()),
  }));

  localStorage.setItem("family", prefix);
  updateSearchPlaceholder();
  updateStrokeAvailability();
  renderGrid();
}

function initFamilySelect(): void {
  const select = element<HTMLSelectElement>("family-select");
  if (!select) {
    return;
  }

  select.replaceChildren(
    ...prefixes.map((prefix) => {
      const option = document.createElement("option");
      option.value = prefix;
      option.textContent = prefix;
      return option;
    }),
  );

  const stored = localStorage.getItem("family");
  const initial = stored && prefixes.includes(stored) ? stored : (prefixes.find((p) => p === "lucide") ?? prefixes[0]);
  select.value = initial;
  select.addEventListener("change", () => {
    void selectFamily(select.value);
  });

  void selectFamily(initial);
}

function initControls(): void {
  element<HTMLInputElement>("search-input")?.addEventListener("input", (event) => {
    state.query = (event.target as HTMLInputElement).value;
    state.page = 1;
    renderGrid();
  });

  element<HTMLInputElement>("icon-color-picker")?.addEventListener("input", (event) => {
    document.documentElement.style.setProperty("--demo-icon-color", (event.target as HTMLInputElement).value);
  });

  element<HTMLButtonElement>("color-reset-btn")?.addEventListener("click", () => {
    document.documentElement.style.setProperty("--demo-icon-color", "currentColor");
    showToast("Icon color follows currentColor");
  });

  const strokeButton = element<HTMLButtonElement>("stroke-width-btn");
  const strokePopover = element<HTMLElement>("stroke-width-popover");
  strokeButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    strokePopover?.classList.toggle("open");
  });
  document.addEventListener("click", (event) => {
    const target = event.target as Node;
    if (
      strokePopover?.classList.contains("open") &&
      !strokePopover.contains(target) &&
      !strokeButton?.contains(target)
    ) {
      strokePopover.classList.remove("open");
    }
  });

  element<HTMLInputElement>("stroke-width-slider")?.addEventListener("input", (event) => {
    state.strokeWidth = Number.parseFloat((event.target as HTMLInputElement).value);
    const label = element<HTMLElement>("stroke-width-value");
    if (label) {
      label.textContent = `${state.strokeWidth.toFixed(2)}px`;
    }
    renderGrid();
    modal.refresh();
  });

  element<HTMLButtonElement>("theme-toggle")?.addEventListener("click", toggleTheme);

  window.addEventListener("resize", () => renderGrid());
}

initTheme();
document.addEventListener("DOMContentLoaded", () => {
  initControls();
  initFamilySelect();
});
