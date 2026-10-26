import { createTheme } from "@codenhub/theme";
import type { Theme } from "@codenhub/theme";

import { createSchemaDialog } from "./schema-dialog";
import { createThemeDialog } from "./theme-dialog";
import {
  createDefaultThemeStore,
  loadThemeStore,
  saveThemeStore,
  type StoredTheme,
  type ThemeStore,
} from "./theme-store";
import { renderThemesList } from "./themes-list";

/** Elements a chrome layer (e.g. `demo/chrome.ts`) needs handed off once the header is wired. */
export interface ThemePlaygroundReadyDetail {
  header: HTMLElement;
  themeToggle: HTMLButtonElement;
}

const STORAGE_KEY = "playground-theme-pref";

function toThemeOptions(candidate: ThemeStore) {
  return {
    themes: Object.fromEntries(candidate.themes.map(({ name, ...definition }) => [name, definition])),
    tokenSchema: candidate.schema,
    defaultTheme: "light",
    storageKey: STORAGE_KEY,
    darkClass: true,
  };
}

/** Returns why `createTheme()` rejects the candidate, or `null` when it accepts it. Construction touches no DOM or storage. */
function findConfigError(candidate: ThemeStore): string | null {
  // Object.fromEntries keeps only the last of two same-named themes, so createTheme() would never see the duplicate.
  const names = candidate.themes.map((theme) => theme.name);
  const duplicate = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicate !== undefined) {
    return `Two themes are named "${duplicate}".`;
  }
  try {
    createTheme(toThemeOptions(candidate));
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** Loads the saved store, resetting it to the defaults when `createTheme()` rejects it, so the page cannot stay broken. */
function loadValidThemeStore(): ThemeStore {
  const loaded = loadThemeStore();
  const error = findConfigError(loaded);
  if (error === null) {
    return loaded;
  }
  console.error(`Saved playground themes were reset to the defaults: ${error}`);
  const defaults = createDefaultThemeStore();
  saveThemeStore(defaults);
  return defaults;
}

const store = loadValidThemeStore();
let themeManager: Theme | null = null;
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
  const system = themeManager.system;
  const systemScheme = store.themes.find((theme) => theme.name === system)?.colorScheme;

  setText("state-active", active.name);
  setText("state-scheme", active.colorScheme);
  setText("state-system", `${system} (${systemScheme})`);
  setText("state-stored", themeManager.preference ?? "None");

  renderThemesList(store.themes, active.name, {
    onActivate: (name) => themeManager?.set(name),
    onEdit: (index) => {
      const theme = store.themes[index];
      if (theme) {
        themeDialog.open(store.schema, theme, index);
      }
    },
    onDelete: (index) => {
      const theme = store.themes[index];
      if (!theme || theme.name === "light" || theme.name === "dark") {
        return;
      }
      store.themes.splice(index, 1);
      saveThemeStore(store);
      initThemeManager();
    },
  });
}

function initThemeManager(): void {
  unsubscribe?.();
  themeManager?.destroy();

  themeManager = createTheme(toThemeOptions(store));
  themeManager.init();
  unsubscribe = themeManager.subscribe(updateStateDisplay);
  updateStateDisplay();
}

/** Saves and applies the candidate when `createTheme()` accepts it; otherwise alerts why and keeps the store as it was. */
function commitThemeStore(candidate: ThemeStore): boolean {
  const error = findConfigError(candidate);
  if (error !== null) {
    window.alert(`Cannot save: ${error}`);
    return false;
  }
  store.schema = candidate.schema;
  store.themes = candidate.themes;
  saveThemeStore(store);
  initThemeManager();
  return true;
}

const schemaDialog = createSchemaDialog({
  onAdd: (key, cssVariable) => {
    if (!commitThemeStore({ ...store, schema: { ...store.schema, [key]: cssVariable } })) {
      return false;
    }
    schemaDialog.renderList(store.schema);
    return true;
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
    const isDuplicate = store.themes.some((existing, index) => index !== editIndex && existing.name === theme.name);
    if (isDuplicate) {
      window.alert(`A theme named "${theme.name}" already exists.`);
      return false;
    }
    const themes = editIndex >= 0 ? store.themes.with(editIndex, theme) : [...store.themes, theme];
    return commitThemeStore({ ...store, themes });
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
