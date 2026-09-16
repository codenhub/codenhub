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

  const info = document.createElement("div");
  info.className = "flex items-center gap-2";
  const name = document.createElement("span");
  name.className = "text-sm font-semibold text-text-strong";
  name.textContent = theme.name;
  const badge = document.createElement("span");
  badge.className = "badge soft";
  badge.textContent = theme.colorScheme;
  info.append(name, badge);

  const actions = document.createElement("div");
  actions.className = "flex gap-1";
  actions.dataset.actions = "";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "btn secondary sm icon";
  editButton.dataset.editTheme = String(index);
  editButton.ariaLabel = `Edit ${theme.name}`;
  editButton.innerHTML = '<i class="ic-pencil size-3.5"></i>';

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn destructive sm icon";
  deleteButton.dataset.deleteTheme = String(index);
  deleteButton.ariaLabel = `Delete ${theme.name}`;
  deleteButton.innerHTML = '<i class="ic-trash-2 size-3.5"></i>';

  actions.append(editButton, deleteButton);
  header.append(info, actions);
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
