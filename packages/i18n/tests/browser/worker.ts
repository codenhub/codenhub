import { createI18n } from "../../dist/index.js";

const dictionaries = {
  en: { greeting: "Hello" },
  fr: { greeting: "Bonjour" },
} as const;

const i18n = createI18n({
  defaultLocale: "en",
  locales: ["en", "fr"] as const,
  loadLocale: (locale) => dictionaries[locale],
  getLocaleDirection: () => "ltr",
});

await i18n.init({ locale: "fr" });

self.postMessage({
  direction: i18n.direction,
  isReady: i18n.isReady,
  locale: i18n.locale,
  translation: i18n.translate("greeting"),
});
