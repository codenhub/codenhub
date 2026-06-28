export const PLUGIN_NAME = "vite-plugin-icons";

export const ICON_MARKER_PREFIX = "ic-";

export const TRANSFORM_EXTENSIONS = /\.(html|js|ts|jsx|tsx)$/;

/**
 * Matches <i> tags with a class or className attribute (self-closing or explicit).
 *
 * Groups: 1 = attrs before class/className, 2 = attribute name (class|className),
 *         3 = quote char, 4 = class string, 5 = attrs after class/className
 */
export const ICON_TAG_REGEX = /<i\b([^>]*?)(class|className)=(\\?)(["'])([^"']*?)\3\4([^>]*?)(?:>\s*<\/i>|\s*\/?>)/gi;
