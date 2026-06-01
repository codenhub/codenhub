import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { Plugin } from "vite";

const PLUGIN_NAME = "vite-plugin-i18n-validate";

/** Public files are served from the Vite public dir. */
const PUBLIC_DIR = "src/_public";
const LOCALES_DIR = "data/locales";

/** Captures the key from each `data-i18n="key"` attribute in an HTML file. */
const DATA_I18N_ATTRIBUTE_REGEX = /\bdata-i18n=(["'])(.*?)\1/gi;

interface LocaleKeys {
  file: string;
  keys: Set<string>;
}

interface LocaleManifestEntry {
  file: string;
}

interface I18nValidatePluginOptions {
  localeManifest: Record<string, LocaleManifestEntry>;
}

const getManifestLocaleFiles = (localeManifest: I18nValidatePluginOptions["localeManifest"]): string[] => {
  return Object.values(localeManifest).map(({ file }) => file.replace(/^\/+/, ""));
};

const readLocaleKeys = (localeManifest: I18nValidatePluginOptions["localeManifest"]): LocaleKeys[] => {
  const files = getManifestLocaleFiles(localeManifest);

  return files.map((file) => {
    const filePath = resolve(process.cwd(), PUBLIC_DIR, file);

    if (!existsSync(filePath)) {
      throw new Error(`[i18n] Locale file declared in LOCALE_MANIFEST was not found: "${file}".`);
    }

    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`[i18n] Locale file "${file}" must be a flat JSON object.`);
    }

    const nonStringKeys = Object.entries(parsed).flatMap(([key, value]) => (typeof value === "string" ? [] : [key]));

    if (nonStringKeys.length > 0) {
      throw new Error(`[i18n] Locale file "${file}" has non-string values: ${nonStringKeys.join(", ")}`);
    }

    return { file, keys: new Set(Object.keys(parsed)) };
  });
};

const validateNoUnsupportedLocaleFiles = (localeManifest: I18nValidatePluginOptions["localeManifest"]): string[] => {
  const dir = resolve(process.cwd(), PUBLIC_DIR, LOCALES_DIR);
  const manifestFiles = new Set(getManifestLocaleFiles(localeManifest));

  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => `${LOCALES_DIR}/${file}`)
    .filter((file) => !manifestFiles.has(file));
};

const readHtmlKeys = (htmlEntries: string[]): Set<string> => {
  const keys = new Set<string>();

  for (const entry of htmlEntries) {
    const html = readFileSync(resolve(process.cwd(), entry), "utf-8");

    for (const match of html.matchAll(DATA_I18N_ATTRIBUTE_REGEX)) {
      const key = match[2].trim();

      if (key.length > 0) {
        keys.add(key);
      }
    }
  }

  return keys;
};

const validateLocales = (options: {
  htmlEntries: string[];
  localeManifest: I18nValidatePluginOptions["localeManifest"];
}): void => {
  const locales = readLocaleKeys(options.localeManifest);

  if (locales.length === 0) {
    throw new Error("[i18n] No locales declared in LOCALE_MANIFEST.");
  }

  const errors: string[] = [];
  const unsupportedLocaleFiles = validateNoUnsupportedLocaleFiles(options.localeManifest);

  if (unsupportedLocaleFiles.length > 0) {
    errors.push(`Unsupported locale files not declared in LOCALE_MANIFEST: ${unsupportedLocaleFiles.join(", ")}`);
  }

  const [reference, ...others] = locales;

  // Every locale file must hold the exact same set of keys.
  for (const locale of others) {
    const missing = [...reference.keys].filter((key) => !locale.keys.has(key));
    const unknown = [...locale.keys].filter((key) => !reference.keys.has(key));

    if (missing.length > 0) {
      errors.push(`"${locale.file}" is missing keys: ${missing.join(", ")}`);
    }

    if (unknown.length > 0) {
      errors.push(`"${locale.file}" has keys absent from "${reference.file}": ${unknown.join(", ")}`);
    }
  }

  // Every key used in the HTML must exist in every locale file.
  const htmlKeys = readHtmlKeys(options.htmlEntries);

  for (const locale of locales) {
    const missing = [...htmlKeys].filter((key) => !locale.keys.has(key));

    if (missing.length > 0) {
      errors.push(`"${locale.file}" is missing keys used in HTML: ${missing.join(", ")}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`[i18n] Locale validation failed:\n  - ${errors.join("\n  - ")}`);
  }
};

const collectHtmlEntries = (input: unknown): string[] => {
  if (typeof input === "string") {
    return [input];
  }

  if (Array.isArray(input)) {
    return input.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof input === "object" && input !== null) {
    return Object.values(input).filter((entry): entry is string => typeof entry === "string");
  }

  return [];
};

/**
 * Fails the build when locale data drifts.
 *
 * Guarantees every locale file shares the same keys and that every `data-i18n`
 * key in the HTML exists in those files — which is what lets the runtime
 * translator skip per-key fallback. See `.docs/specs/i18n.md`.
 */
export default function i18nValidatePlugin(options: I18nValidatePluginOptions): Plugin {
  let htmlEntries: string[] = [];

  return {
    name: PLUGIN_NAME,
    configResolved(config) {
      htmlEntries = collectHtmlEntries(config.build.rollupOptions.input).filter((entry) => entry.endsWith(".html"));
    },
    buildStart() {
      validateLocales({ htmlEntries, localeManifest: options.localeManifest });
    },
  };
}
