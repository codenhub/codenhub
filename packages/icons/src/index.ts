export { IconRegistry } from "./core/registry.js";
export { resolveIconClassName } from "./core/class-names.js";
export { renderSvg, setStrokeWidth } from "./core/render.js";
export type { RenderSvgOptions } from "./core/render.js";
export type {
  IconAlias,
  IconAttribution,
  IconData,
  IconFamilyAuthor,
  IconFamilyData,
  IconFamilyInfo,
  IconFamilyLicense,
  IconFamilyLoader,
  IconFamilyTier,
  IconFamilyUpstream,
  IconRegistryOptions,
  ResolvedIcon,
} from "./core/types.js";

export {
  collectAttributedFamilies,
  renderAttributionBanner,
  renderAttributionNotice,
  renderSuppressedAttributionWarning,
} from "./catalog/attribution.js";
export type { AttributionMode } from "./catalog/attribution.js";

export { adoptIconifySet } from "./adapters/iconify.js";
export type { IconifyAdapterOptions, IconifyJson } from "./adapters/iconify.js";

export {
  escapeSelectorClass,
  generateBaseCss,
  generateIconCss,
  generateIconSetCss,
  getIconCssProps,
  getIconMaskUrl,
} from "./generator/css-generator.js";
export type {
  BaseCssOptions,
  GenerateIconCssOptions,
  GenerateIconSetCssOptions,
  IconSetCssResult,
} from "./generator/css-generator.js";
export { svgToDataUri } from "./generator/svg-encoder.js";

export { scanFiles, scanIconClasses } from "./scanner/class-scanner.js";
export type { ScanIconClassesOptions } from "./scanner/class-scanner.js";
