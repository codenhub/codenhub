import type { ThemeDefinition } from "@codenhub/theme";

/** A playground-authored theme: a name, color scheme, and token values keyed by the current schema. */
export interface StoredTheme extends ThemeDefinition<Record<string, string>> {
  name: string;
  colorScheme: "light" | "dark";
  tokens: Record<string, string>;
}

const SCHEMA_STORAGE_KEY = "playground-token-schema";
const THEMES_STORAGE_KEY = "playground-themes-list";

const DEFAULT_SCHEMA: Record<string, string> = {
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

const DEFAULT_THEMES: StoredTheme[] = [
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

/** Persisted playground state: the editable token schema and the list of authored themes. */
export interface ThemeStore {
  schema: Record<string, string>;
  themes: StoredTheme[];
}

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch (err) {
    console.error(`Failed to read "${key}" from storage`, err);
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Loads the persisted schema/themes, seeding defaults and backfilling any schema keys older data is missing. */
export function loadThemeStore(): ThemeStore {
  const schema = readJson<Record<string, string>>(SCHEMA_STORAGE_KEY) ?? { ...DEFAULT_SCHEMA };
  let themes = readJson<StoredTheme[]>(THEMES_STORAGE_KEY) ?? DEFAULT_THEMES.map((theme) => ({ ...theme }));

  const missingKeys = Object.keys(DEFAULT_SCHEMA).filter((key) => !(key in schema));
  if (missingKeys.length > 0) {
    for (const key of missingKeys) {
      schema[key] = DEFAULT_SCHEMA[key] as string;
    }
    themes = themes.map((theme) => {
      const defaultMatch = DEFAULT_THEMES.find((candidate) => candidate.name === theme.name);
      if (!defaultMatch) {
        return theme;
      }
      const backfilled = { ...theme.tokens };
      for (const key of missingKeys) {
        backfilled[key] = defaultMatch.tokens[key] as string;
      }
      return { ...theme, tokens: backfilled };
    });
  }

  const store: ThemeStore = { schema, themes };
  saveThemeStore(store);
  return store;
}

/** Persists the schema and themes as they currently stand. */
export function saveThemeStore(store: ThemeStore): void {
  writeJson(SCHEMA_STORAGE_KEY, store.schema);
  writeJson(THEMES_STORAGE_KEY, store.themes);
}
