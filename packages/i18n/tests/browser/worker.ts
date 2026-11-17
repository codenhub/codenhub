import { initializeBrowserI18n } from "../../dist/browser.js";
import { createI18n } from "../../dist/index.js";

const dictionaries = {
  en: { greeting: "Hello" },
  fr: { greeting: "Bonjour" },
} as const;

const createManager = () =>
  createI18n({
    defaultLocale: "en",
    locales: ["en", "fr"] as const,
    loadLocale: (locale) => dictionaries[locale],
    getLocaleDirection: () => "ltr",
  });

const i18n = createManager();
await i18n.init({ locale: "fr" });

// The call the browser guide documents for a worker: no page to sync, so the locale comes from navigator.languages.
const bound = createManager();
const binding = await initializeBrowserI18n({ i18n: bound, syncDocument: false });
const detected = bound.locale;
await bound.setLocale("en");
binding.disconnect();

self.postMessage({
  direction: i18n.direction,
  isReady: i18n.isReady,
  locale: i18n.locale,
  translation: i18n.translate("greeting"),
  bound: { detected, languages: [...navigator.languages], translation: bound.t("greeting") },
});
