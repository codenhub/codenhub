/**
 * Localized URL paths: read the locale and canonical path from a URL, and build a page's path in another locale, with a
 * locale prefix, translated words, or both.
 *
 * @packageDocumentation
 */

export { createLocaleRouting } from "./routing/locale-routing";
export type { LocaleRouting, LocaleRoutingConfig, LocalizedPath, ParsedLocalePath } from "./routing/locale-routing";
