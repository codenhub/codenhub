import iconsPlugin from "./index-plugin";

export { iconsPlugin };
/**
 * Vite plugin that replaces `<i class="ic-<name>">` marker elements with
 * inline SVG at build time, in both HTML and JS/TS/JSX/TSX files.
 *
 * This is the default export of the icons package.
 */
export default iconsPlugin;
export type { IconsPluginOptions } from "./index-plugin";
export type { IconDefinition, IconOptions } from "./data";
