import { createTheme } from "@codenhub/theme";
import type { Theme } from "@codenhub/theme";

import { createSchemaDialog } from "./schema-dialog";
import { createThemeDialog } from "./theme-dialog";
import { loadThemeStore, saveThemeStore, type StoredTheme } from "./theme-store";
import { renderThemesList } from "./themes-list";

/** Elements a chrome layer (e.g. `demo/chrome.ts`) needs handed off once the header is wired. */
export interface ThemePlaygroundReadyDetail {
  header: HTMLElement;
  themeToggle: HTMLButtonElement;
}

const STORAGE_KEY = "playground-theme-pref";

const store = loadThemeStore();
let themeManager: Theme<Record<string, string>> | null = null;
let unsubscribe: (() => void) | null = null;

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = text;
  }
}

function updateStateDisplay(): void {
  if (!themeManager) {
    return;
  }

  const active = themeManager.get();
  const system = themeManager.getSystem();

  setText("state-active", active.name);
  setText("state-scheme", active.colorScheme);
  setText("state-system", `${system.name} (${system.colorScheme})`);
  setText("state-stored", themeManager.getStored() ?? "None");

  renderThemesList(store.themes, active.name, {
    onActivate: (name) => themeManager?.set(name),
    onEdit: (index) => {
      const theme = store.themes[index];
      if (theme) {
        themeDialog.open(store.schema, theme, index);
      }
    },
    onDelete: (index) => {
      store.themes.splice(index, 1);
      saveThemeStore(store);
      initThemeManager();
    },
  });
}

function initThemeManager(): void {
  unsubscribe?.();
  themeManager?.destroy();

  themeManager = createTheme({
    themes: store.themes,
    tokenSchema: store.schema,
    defaultTheme: "light",
    storageKey: STORAGE_KEY,
    isTailwindCss: true,
  });
  themeManager.init();
  unsubscribe = themeManager.subscribe(updateStateDisplay);
  updateStateDisplay();
}

const schemaDialog = createSchemaDialog({
  onAdd: (key, cssVariable) => {
    store.schema[key] = cssVariable;
    saveThemeStore(store);
    schemaDialog.renderList(store.schema);
    initThemeManager();
  },
  onDelete: (key) => {
    delete store.schema[key];
    for (const theme of store.themes) {
      delete theme.tokens[key];
    }
    saveThemeStore(store);
    schemaDialog.renderList(store.schema);
    initThemeManager();
  },
});

const themeDialog = createThemeDialog({
  onSave: (theme: StoredTheme, editIndex: number) => {
    if (editIndex >= 0) {
      store.themes[editIndex] = theme;
    } else {
      store.themes.push(theme);
    }
    saveThemeStore(store);
    initThemeManager();
  },
});

document.getElementById("btn-add-token")?.addEventListener("click", () => {
  schemaDialog.renderList(store.schema);
  schemaDialog.open();
});

document.getElementById("btn-new-theme")?.addEventListener("click", () => {
  themeDialog.open(store.schema);
});

document.getElementById("btn-toggle")?.addEventListener("click", () => {
  themeManager?.toggle();
});

document.getElementById("btn-clear")?.addEventListener("click", () => {
  themeManager?.clearPreference();
});

document.addEventListener("DOMContentLoaded", () => {
  initThemeManager();

  const header = document.querySelector<HTMLElement>(".playground-header");
  const themeToggle = document.getElementById("btn-toggle") as HTMLButtonElement | null;
  if (!header || !themeToggle) {
    return;
  }

  /* The explicit hand-off a chrome layer (e.g. `demo/chrome.ts`) waits on to
     swap `.playground-header` for branded chrome. This page has no
     dynamically-built nav to hand over, unlike the styles package's
     playground -- just the already-wired header and the toggle a chrome
     layer relocates into its own header. Configure Tokens stays put in the
     Themes section; it isn't part of this hand-off. */
  document.dispatchEvent(
    new CustomEvent<ThemePlaygroundReadyDetail>("theme-playground:ready", {
      detail: { header, themeToggle },
    }),
  );
});
