import { createTheme } from "@codenhub/theme";
import type { Theme, ThemeDefinition } from "@codenhub/theme";

// Interfaces
interface CustomThemeDefinition extends ThemeDefinition<Record<string, string>> {
  name: string;
  colorScheme: "light" | "dark";
  tokens: Record<string, string>;
}

// Storage keys
const STORAGE_THEMES_KEY = "playground-themes-list";
const STORAGE_SCHEMA_KEY = "playground-token-schema";

// Defaults
const defaultTokenSchema: Record<string, string> = {
  primary: "--color-primary",
  accent: "--color-accent",
  background: "--color-background",
  surface: "--color-surface",
  text: "--color-text",
  textSecondary: "--color-text-secondary",
  textStrong: "--color-text-strong",
  success: "--color-success",
  warning: "--color-warning",
  destructive: "--color-destructive",
};

const defaultThemes: CustomThemeDefinition[] = [
  {
    name: "light",
    colorScheme: "light",
    tokens: {
      primary: "#171717",
      accent: "#4b5563",
      background: "#f9fafb",
      surface: "#f3f4f6",
      text: "#111827",
      textSecondary: "#4b5563",
      textStrong: "#171717",
      success: "#059669",
      warning: "#d97706",
      destructive: "#b91c1c",
    },
  },
  {
    name: "dark",
    colorScheme: "dark",
    tokens: {
      primary: "#f9fafb",
      accent: "#9ca3af",
      background: "#111827",
      surface: "#1f2937",
      text: "#f3f4f6",
      textSecondary: "#9ca3af",
      textStrong: "#f9fafb",
      success: "#10b981",
      warning: "#f59e0b",
      destructive: "#ef4444",
    },
  },
  {
    name: "emerald-dream",
    colorScheme: "light",
    tokens: {
      primary: "#047857",
      accent: "#065f46",
      background: "#ecfdf5",
      surface: "#d1fae5",
      text: "#064e3b",
      textSecondary: "#047857",
      textStrong: "#022c22",
      success: "#10b981",
      warning: "#f59e0b",
      destructive: "#ef4444",
    },
  },
  {
    name: "sunset-glow",
    colorScheme: "dark",
    tokens: {
      primary: "#f97316",
      accent: "#f43f5e",
      background: "#1c1917",
      surface: "#292524",
      text: "#fafaf9",
      textSecondary: "#fb7185",
      textStrong: "#fff1f2",
      success: "#10b981",
      warning: "#f59e0b",
      destructive: "#ef4444",
    },
  },
];

// App State
let tokenSchema: Record<string, string> = { ...defaultTokenSchema };
let themes: CustomThemeDefinition[] = [...defaultThemes];
let themeManager: Theme<Record<string, string>> | null = null;
let unsubscribe: (() => void) | null = null;

// Initialize state from storage
const initStorage = (): void => {
  try {
    const storedSchema = localStorage.getItem(STORAGE_SCHEMA_KEY);
    if (storedSchema) {
      tokenSchema = JSON.parse(storedSchema) as Record<string, string>;
    }

    const storedThemes = localStorage.getItem(STORAGE_THEMES_KEY);
    if (storedThemes) {
      themes = JSON.parse(storedThemes) as CustomThemeDefinition[];
    }

    // Migration: ensure new text tokens are present
    if (!tokenSchema.textSecondary || !tokenSchema.textStrong) {
      tokenSchema.textSecondary = defaultTokenSchema.textSecondary;
      tokenSchema.textStrong = defaultTokenSchema.textStrong;
      themes = themes.map((t) => {
        const defaultMatch = defaultThemes.find((dt) => dt.name === t.name);
        if (defaultMatch) {
          return {
            ...t,
            tokens: {
              ...t.tokens,
              textSecondary: defaultMatch.tokens.textSecondary,
              textStrong: defaultMatch.tokens.textStrong,
            },
          };
        }
        return t;
      });
      saveStorage();
    }
  } catch (err) {
    console.error("Failed to read schema/themes from storage", err);
  }
};

const saveStorage = (): void => {
  localStorage.setItem(STORAGE_SCHEMA_KEY, JSON.stringify(tokenSchema));
  localStorage.setItem(STORAGE_THEMES_KEY, JSON.stringify(themes));
};

// Theme manager lifecycle
const initThemeManager = (): void => {
  if (unsubscribe) {
    unsubscribe();
  }
  if (themeManager) {
    themeManager.destroy();
  }

  themeManager = createTheme({
    themes,
    tokenSchema,
    defaultTheme: "light",
    storageKey: "playground-theme-pref",
    isTailwindCss: true,
  });

  themeManager.init();

  unsubscribe = themeManager.subscribe(() => {
    updateStateDisplay();
  });

  updateStateDisplay();
};

// UI updates
const updateStateDisplay = (): void => {
  if (!themeManager) {
    return;
  }

  const active = themeManager.get();
  const stored = themeManager.getStored();
  const system = themeManager.getSystem();

  const stateActiveEl = document.getElementById("state-active");
  const stateSchemeEl = document.getElementById("state-scheme");
  const stateSystemEl = document.getElementById("state-system");
  const stateStoredEl = document.getElementById("state-stored");

  if (stateActiveEl) {
    stateActiveEl.textContent = active.name;
  }
  if (stateSchemeEl) {
    stateSchemeEl.textContent = active.colorScheme;
  }
  if (stateSystemEl) {
    stateSystemEl.textContent = `${system.name} (${system.colorScheme})`;
  }
  if (stateStoredEl) {
    stateStoredEl.textContent = stored ?? "None";
  }

  // Highlight active theme in the list
  const themeItems = document.querySelectorAll("[data-theme-item]");
  themeItems.forEach((item) => {
    const name = item.getAttribute("data-theme-item");
    if (name === active.name) {
      item.classList.add("bg-surface", "ring-1", "ring-primary");
      item.classList.remove("bg-background");
    } else {
      item.classList.remove("bg-surface", "ring-1", "ring-primary");
      item.classList.add("bg-background");
    }
  });
};

const renderTokenSchema = (): void => {
  const container = document.getElementById("token-schema-list");
  if (!container) {
    return;
  }

  container.innerHTML = "";

  Object.entries(tokenSchema).forEach(([key, value]) => {
    const div = document.createElement("div");
    div.className = "flex items-center justify-between p-2 bg-background rounded-md text-xs";
    div.innerHTML = `
      <div class="flex flex-col">
        <span class="font-semibold text-text-strong">${key}</span>
        <code class="text-[10px] text-text-secondary">${value}</code>
      </div>
      <button class="btn destructive sm flex items-center justify-center p-1.5" style="height: auto;" data-delete-schema="${key}">
        <i class="ic-trash-2 size-3.5"></i>
      </button>
    `;
    container.appendChild(div);
  });
};

const renderThemesList = (): void => {
  const container = document.getElementById("themes-list");
  if (!container) {
    return;
  }

  container.innerHTML = "";

  themes.forEach((theme, index) => {
    const div = document.createElement("div");
    div.className =
      "p-3 bg-background rounded-md flex flex-col gap-2 cursor-pointer hover:bg-surface/50 transition-colors";
    div.setAttribute("data-theme-item", theme.name);

    // Header
    const header = document.createElement("div");
    header.className = "flex justify-between items-center";
    header.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-text-strong">${theme.name}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded ${theme.colorScheme === "dark" ? "bg-neutral-800 text-neutral-200" : "bg-neutral-200 text-neutral-800"}">${theme.colorScheme}</span>
      </div>
      <div class="flex gap-1" data-actions>
        <button class="btn secondary sm flex items-center justify-center p-1.5" style="height: auto;" data-edit-theme="${index}">
          <i class="ic-pencil size-3.5"></i>
        </button>
        <button class="btn destructive sm flex items-center justify-center p-1.5" style="height: auto;" data-delete-theme="${index}">
          <i class="ic-trash-2 size-3.5"></i>
        </button>
      </div>
    `;

    // Click handler to activate theme (excluding actions)
    div.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-actions]")) {
        themeManager?.set(theme.name);
      }
    });

    div.appendChild(header);

    // Show a small preview of the colors
    const colors = document.createElement("div");
    colors.className = "flex gap-1.5 mt-1";
    ["primary", "accent", "background", "surface", "text"].forEach((tk) => {
      const val = theme.tokens[tk];
      if (val) {
        const dot = document.createElement("span");
        dot.className = "h-3 w-3 rounded-full border border-border inline-block";
        dot.style.backgroundColor = val;
        dot.title = `${tk}: ${val}`;
        colors.appendChild(dot);
      }
    });
    div.appendChild(colors);

    container.appendChild(div);
  });
};

const renderThemeEditorValues = (): void => {
  const container = document.getElementById("theme-token-values");
  if (!container) {
    return;
  }

  container.innerHTML = "";

  Object.keys(tokenSchema).forEach((key) => {
    const div = document.createElement("div");
    div.className = "grid grid-cols-3 gap-2 items-center text-xs";
    div.innerHTML = `
      <label class="text-text-secondary truncate">${key}</label>
      <input type="text" data-token-key="${key}" class="col-span-2 w-full" placeholder="#ffffff or rgb(...)" />
    `;
    container.appendChild(div);
  });
};

// Forms setup
const setupForms = (): void => {
  // Schema token addition
  const btnAddToken = document.getElementById("btn-add-token");
  const formAddToken = document.getElementById("form-add-token");
  const btnCancelToken = document.getElementById("btn-cancel-token");

  btnAddToken?.addEventListener("click", () => {
    formAddToken?.classList.remove("hidden");
  });

  btnCancelToken?.addEventListener("click", () => {
    formAddToken?.classList.add("hidden");
    if (formAddToken instanceof HTMLFormElement) {
      formAddToken.reset();
    }
  });

  formAddToken?.addEventListener("submit", (e) => {
    e.preventDefault();
    const keyInput = document.getElementById("new-token-key") as HTMLInputElement;
    const varInput = document.getElementById("new-token-var") as HTMLInputElement;
    if (keyInput && varInput) {
      const key = keyInput.value.trim();
      const cssVar = varInput.value.trim();
      if (key && cssVar) {
        tokenSchema[key] = cssVar;
        saveStorage();
        renderTokenSchema();
        renderThemeEditorValues();
        initThemeManager();
        formAddToken.classList.add("hidden");
        formAddToken.reset();
      }
    }
  });

  // Schema token deletion
  document.getElementById("token-schema-list")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest("[data-delete-schema]");
    const key = btn?.getAttribute("data-delete-schema");
    if (key) {
      delete tokenSchema[key];
      // Also delete from all themes
      themes = themes.map((theme) => {
        const nextTokens = { ...theme.tokens };
        delete nextTokens[key];
        return { ...theme, tokens: nextTokens };
      });
      saveStorage();
      renderTokenSchema();
      renderThemeEditorValues();
      renderThemesList();
      initThemeManager();
    }
  });

  // Theme Creation / Editing
  const btnNewTheme = document.getElementById("btn-new-theme");
  const formTheme = document.getElementById("form-theme");
  const btnCancelTheme = document.getElementById("btn-cancel-theme");
  const formThemeTitle = document.getElementById("form-theme-title");

  btnNewTheme?.addEventListener("click", () => {
    formThemeTitle!.textContent = "Create New Theme";
    (document.getElementById("theme-edit-index") as HTMLInputElement).value = "-1";
    if (formTheme instanceof HTMLFormElement) {
      formTheme.reset();
    }

    // Clear token inputs
    const inputs = formTheme?.querySelectorAll("[data-token-key]") as NodeListOf<HTMLInputElement>;
    inputs.forEach((input) => {
      input.value = "";
    });

    formTheme?.classList.remove("hidden");
  });

  btnCancelTheme?.addEventListener("click", () => {
    formTheme?.classList.add("hidden");
    if (formTheme instanceof HTMLFormElement) {
      formTheme.reset();
    }
  });

  formTheme?.addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("theme-name") as HTMLInputElement;
    const schemeSelect = document.getElementById("theme-scheme") as HTMLSelectElement;
    const editIndexInput = document.getElementById("theme-edit-index") as HTMLInputElement;

    if (!nameInput || !schemeSelect || !editIndexInput) {
      return;
    }

    const name = nameInput.value.trim();
    const colorScheme = schemeSelect.value as "light" | "dark";
    const editIndex = parseInt(editIndexInput.value, 10);

    const tokenValues: Record<string, string> = {};
    const inputs = formTheme.querySelectorAll("[data-token-key]") as NodeListOf<HTMLInputElement>;
    inputs.forEach((input) => {
      const key = input.getAttribute("data-token-key")!;
      tokenValues[key] = input.value.trim();
    });

    const newTheme: CustomThemeDefinition = {
      name,
      colorScheme,
      tokens: tokenValues,
    };

    if (editIndex >= 0) {
      themes[editIndex] = newTheme;
    } else {
      themes.push(newTheme);
    }

    saveStorage();
    renderThemesList();
    initThemeManager();
    formTheme.classList.add("hidden");
    formTheme.reset();
  });

  // Themes list click actions (Edit/Delete)
  document.getElementById("themes-list")?.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest("[data-edit-theme]");
    const deleteBtn = target.closest("[data-delete-theme]");
    const editIndexStr = editBtn?.getAttribute("data-edit-theme");
    const deleteIndexStr = deleteBtn?.getAttribute("data-delete-theme");

    if (editIndexStr) {
      const index = parseInt(editIndexStr, 10);
      const theme = themes[index];
      formThemeTitle!.textContent = `Edit Theme: ${theme.name}`;
      (document.getElementById("theme-edit-index") as HTMLInputElement).value = editIndexStr;
      (document.getElementById("theme-name") as HTMLInputElement).value = theme.name;
      (document.getElementById("theme-scheme") as HTMLSelectElement).value = theme.colorScheme;

      // Populate token inputs
      const inputs = formTheme?.querySelectorAll("[data-token-key]") as NodeListOf<HTMLInputElement>;
      inputs.forEach((input) => {
        const key = input.getAttribute("data-token-key")!;
        input.value = theme.tokens[key] ?? "";
      });

      formTheme?.classList.remove("hidden");
    }

    if (deleteIndexStr) {
      const index = parseInt(deleteIndexStr, 10);
      themes.splice(index, 1);
      saveStorage();
      renderThemesList();
      initThemeManager();
    }
  });

  // Header controls
  document.getElementById("btn-toggle")?.addEventListener("click", () => {
    themeManager?.toggle();
  });

  document.getElementById("btn-clear")?.addEventListener("click", () => {
    themeManager?.clearPreference();
  });
};

// Init everything
document.addEventListener("DOMContentLoaded", () => {
  initStorage();
  renderTokenSchema();
  renderThemeEditorValues();
  renderThemesList();
  setupForms();
  initThemeManager();
});
