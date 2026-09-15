import type { StoredTheme } from "./theme-store";

/** Actions the functional theme list hands back to the caller. */
export interface ThemesListHandlers {
  onActivate: (name: string) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

/** Token keys previewed as small color dots on a theme card, when present in its tokens. */
const SWATCH_KEYS = ["primary", "accent", "background", "surface", "text"];

function buildCard(theme: StoredTheme, index: number, isActive: boolean, handlers: ThemesListHandlers): HTMLElement {
  const card = document.createElement("div");
  card.className = "theme-card";
  card.dataset.themeItem = theme.name;
  if (isActive) {
    card.dataset.active = "true";
  }

  const header = document.createElement("div");
  header.className = "flex items-center justify-between";
  header.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="text-sm font-semibold text-text-strong">${theme.name}</span>
      <span class="badge soft">${theme.colorScheme}</span>
    </div>
    <div class="flex gap-1" data-actions>
      <button type="button" class="btn secondary sm icon" data-edit-theme="${index}" aria-label="Edit ${theme.name}">
        <i class="ic-pencil size-3.5"></i>
      </button>
      <button type="button" class="btn destructive sm icon" data-delete-theme="${index}" aria-label="Delete ${theme.name}">
        <i class="ic-trash-2 size-3.5"></i>
      </button>
    </div>
  `;
  card.appendChild(header);

  const swatches = document.createElement("div");
  swatches.className = "theme-card-swatches";
  for (const key of SWATCH_KEYS) {
    const value = theme.tokens[key];
    if (!value) {
      continue;
    }
    const dot = document.createElement("span");
    dot.className = "theme-card-swatch";
    dot.style.backgroundColor = value;
    dot.title = `${key}: ${value}`;
    swatches.appendChild(dot);
  }
  card.appendChild(swatches);

  card.addEventListener("click", (event) => {
    if ((event.target as HTMLElement).closest("[data-actions]")) {
      return;
    }
    handlers.onActivate(theme.name);
  });
  header.querySelector<HTMLButtonElement>("[data-edit-theme]")?.addEventListener("click", () => {
    handlers.onEdit(index);
  });
  header.querySelector<HTMLButtonElement>("[data-delete-theme]")?.addEventListener("click", () => {
    handlers.onDelete(index);
  });

  return card;
}

/** Renders the functional theme card grid, replacing whatever it previously held. */
export function renderThemesList(themes: StoredTheme[], activeName: string, handlers: ThemesListHandlers): void {
  const container = document.getElementById("themes-list");
  if (!container) {
    return;
  }
  container.replaceChildren(
    ...themes.map((theme, index) => buildCard(theme, index, theme.name === activeName, handlers)),
  );
}
