import type { Plugin } from "vite";

import {
  renderAttributionBanner,
  renderAttributionNotice,
  renderSuppressedAttributionWarning,
} from "../catalog/attribution.js";
import type { AttributionMode } from "../catalog/attribution.js";
import { parseIconClass, resolveIconClassName } from "../core/class-names.js";
import { IconRegistry } from "../core/registry.js";
import { renderSvg } from "../core/render.js";
import type { IconFamilyData, ResolvedIcon } from "../core/types.js";
import { generateIconSetCss } from "../generator/css-generator.js";
import { scanFiles, scanIconClasses } from "../scanner/class-scanner.js";

/**
 * Options for configuring the Vite icons plugin.
 */
export interface ViteIconsOptions {
  /**
   * File paths or globs to scan for icon class names.
   */
  content?: string[];

  /**
   * Prefix for icon class names, as in `"ic"` for `.ic-close`. Defaults to `"ic"`.
   */
  prefix?: string;

  /**
   * Icon families to make resolvable, such as the default export of
   * `@codenhub/icons/data/lucide`.
   *
   * No family is bundled by default: a project declares the families it wants,
   * so nothing it did not ask for reaches its output.
   */
  families?: IconFamilyData[];

  /**
   * Family prefix that unqualified icon names resolve against.
   */
  defaultPrefix?: string;

  /**
   * Registry to resolve icons with, replacing the one built from
   * {@link ViteIconsOptions.families}.
   */
  registry?: IconRegistry;

  /**
   * Stroke width applied to icons of stroke-based families that carry no stroke
   * modifier of their own, as in `ic-heart/1.5`.
   */
  strokeWidth?: number | string;

  /**
   * Delivery mode.
   *
   * `"css"` serves generated mask rules through `virtual:icons.css`. `"svg"`
   * replaces `<i class="ic-...">` tags with inline SVG at build time.
   */
  mode?: "css" | "svg";

  /**
   * How license notices for the families used reach the build output.
   *
   * `"auto"` prepends a preserved CSS comment, `"file"` emits
   * `icons-attribution.txt` as an asset, and `"off"` emits nothing and warns
   * when a used family still requires a notice. Defaults to `"auto"`.
   */
  attribution?: AttributionMode;
}

const VIRTUAL_ID = "virtual:icons.css";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;
const ATTRIBUTION_FILE = "icons-attribution.txt";
// The trailing slash matters: without it this would also claim
// `virtual:@codenhub/icons.css`, which is the stylesheet, not an icon.
const ICON_MODULE_PREFIX = "virtual:@codenhub/icons/";
const RESOLVED_ICON_MODULE_PREFIX = "\0" + ICON_MODULE_PREFIX;
const SOURCE_FILE = /\.(html|jsx?|tsx?|vue|svelte|css|scss|sass|less)$/i;
const MARKUP_FILE = /\.(html|jsx?|tsx?|vue|svelte)$/i;

function resolveIconModule(registry: IconRegistry, request: string): ResolvedIcon {
  // `lucide/heart` names a family and an icon; a single segment goes through
  // the default prefix like any other unqualified name.
  const separatorIndex = request.indexOf("/");
  const name =
    separatorIndex === -1 ? request : `${request.slice(0, separatorIndex)}:${request.slice(separatorIndex + 1)}`;
  const icon = registry.resolve(name);
  if (!icon) {
    throw new Error(`Unknown icon "${request}" imported from ${ICON_MODULE_PREFIX}${request}.`);
  }
  return icon;
}

function renderIconModule(icon: ResolvedIcon, strokeWidth: number | string | undefined): string {
  const svg = renderSvg(icon, { strokeWidth });
  return `export const icon = ${JSON.stringify(icon)};
export const svg = ${JSON.stringify(svg)};
export default svg;
`;
}

function createRegistry(options: ViteIconsOptions): IconRegistry {
  if (options.registry) {
    return options.registry;
  }
  const registry = new IconRegistry({ defaultPrefix: options.defaultPrefix });
  for (const family of options.families ?? []) {
    registry.registerFamily(family);
  }
  return registry;
}

function isRegexStart(chars: string[] | string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /\s/.test(chars[i])) {
    i--;
  }
  if (i < 0) {
    return true;
  }
  const char = chars[i];
  if (!/[a-zA-Z0-9_$]/.test(char)) {
    return char !== ")" && char !== "]" && char !== "}";
  }
  let start = i;
  while (start >= 0 && /[a-zA-Z0-9_$]/.test(chars[start])) {
    start--;
  }
  let word = "";
  for (let k = start + 1; k <= i; k++) {
    word += chars[k];
  }
  const keywords = ["return", "throw", "yield", "case", "typeof", "delete", "void", "in", "instanceof"];
  return keywords.includes(word);
}

function stripComments(code: string): string {
  let isInsideDouble = false;
  let isInsideSingle = false;
  let isInsideBacktick = false;
  let isInsideLineComment = false;
  let isInsideBlockComment = false;
  let isEscaped = false;

  const chars = code.split("");

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const nextChar = chars[i + 1];

    if (isInsideLineComment) {
      if (char === "\n" || char === "\r") {
        isInsideLineComment = false;
      } else {
        chars[i] = " ";
      }
      continue;
    }
    if (isInsideBlockComment) {
      if (char === "*" && nextChar === "/") {
        isInsideBlockComment = false;
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
      } else {
        chars[i] = " ";
      }
      continue;
    }

    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (!isInsideDouble && !isInsideSingle && !isInsideBacktick) {
      if (char === "/" && nextChar === "/") {
        isInsideLineComment = true;
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
        continue;
      }
      if (char === "/" && nextChar === "*") {
        isInsideBlockComment = true;
        chars[i] = " ";
        chars[i + 1] = " ";
        i++;
        continue;
      }
      if (char === "/" && nextChar !== "/" && nextChar !== "*" && isRegexStart(chars, i)) {
        let j = i + 1;
        let isInsideCharClass = false;
        while (j < chars.length) {
          const c = chars[j];
          if (c === "\\") {
            j += 2;
            continue;
          }
          if (isInsideCharClass) {
            if (c === "]") {
              isInsideCharClass = false;
            }
          } else {
            if (c === "[") {
              isInsideCharClass = true;
            } else if (c === "/") {
              i = j;
              break;
            }
          }
          j++;
        }
        continue;
      }
    }

    if (char === '"' && !isInsideSingle && !isInsideBacktick) {
      isInsideDouble = !isInsideDouble;
    } else if (char === "'" && !isInsideDouble && !isInsideBacktick) {
      isInsideSingle = !isInsideSingle;
    } else if (char === "`" && !isInsideDouble && !isInsideSingle) {
      isInsideBacktick = !isInsideBacktick;
    }
  }

  return chars.join("");
}

function getEnclosingQuote(code: string, matchIndex: number): string | null {
  let isInsideDouble = false;
  let isInsideSingle = false;
  let isInsideBacktick = false;
  let isEscaped = false;

  for (let i = 0; i < matchIndex; i++) {
    const char = code[i];
    const nextChar = code[i + 1];

    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (!isInsideDouble && !isInsideSingle && !isInsideBacktick) {
      if (char === "/" && nextChar !== "/" && nextChar !== "*" && isRegexStart(code, i)) {
        let j = i + 1;
        let isInsideCharClass = false;
        while (j < matchIndex) {
          const c = code[j];
          if (c === "\\") {
            j += 2;
            continue;
          }
          if (isInsideCharClass) {
            if (c === "]") {
              isInsideCharClass = false;
            }
          } else {
            if (c === "[") {
              isInsideCharClass = true;
            } else if (c === "/") {
              i = j;
              break;
            }
          }
          j++;
        }
        continue;
      }
    }

    if (char === '"' && !isInsideSingle && !isInsideBacktick) {
      isInsideDouble = !isInsideDouble;
    } else if (char === "'" && !isInsideDouble && !isInsideBacktick) {
      isInsideSingle = !isInsideSingle;
    } else if (char === "`" && !isInsideDouble && !isInsideSingle) {
      isInsideBacktick = !isInsideBacktick;
    }
  }

  if (isInsideDouble) {
    return '"';
  }
  if (isInsideSingle) {
    return "'";
  }
  if (isInsideBacktick) {
    return "`";
  }
  return null;
}

interface ReplaceIconTagsOptions {
  prefix: string;
  strokeWidth?: number | string;
  isJsContext?: boolean;
  onFamilyUsed: (family: IconFamilyData) => void;
}

function replaceIconTagsWithSvg(source: string, registry: IconRegistry, options: ReplaceIconTagsOptions): string {
  const { isJsContext = false, onFamilyUsed, prefix, strokeWidth } = options;
  const prefixDash = `${prefix}-`;

  const tagRegex = /<i\b([^>]*?)(class|className)=(\\?)(["'])([^"']*?)\3\4([^>]*?)(?:>\s*<\/i>|\s*\/?>)/gi;
  const cleanSource = isJsContext ? stripComments(source) : source;

  return source.replace(
    tagRegex,
    (
      match: string,
      before: string,
      attrName: string,
      backslash: string,
      quote: string,
      classValue: string,
      after: string,
      offset: number,
    ) => {
      const classes = classValue.split(/\s+/).filter(Boolean);
      let icon: ReturnType<typeof resolveIconClassName>;
      let strokeValFromClass: string | undefined;
      const leftoverClasses: string[] = [];

      for (const cls of classes) {
        if (cls === prefix) {
          continue;
        }
        if (!icon && cls.startsWith(prefixDash)) {
          const parsed = parseIconClass(cls.slice(prefixDash.length));
          const resolved = resolveIconClassName(registry, parsed.name);
          if (resolved) {
            icon = resolved;
            strokeValFromClass = parsed.strokeWidth;
            continue;
          }
        }
        leftoverClasses.push(cls);
      }

      if (!icon) {
        return match;
      }

      const family = registry.getFamily(icon.prefix);
      if (family) {
        onFamilyUsed(family);
      }

      const effectiveStrokeWidth = strokeValFromClass ?? strokeWidth;
      let svg = renderSvg(icon, { strokeWidth: effectiveStrokeWidth });

      const extraClassesStr = leftoverClasses.join(" ");
      const passthroughAttrs = [before.trim(), after.trim()].filter(Boolean).join(" ");
      const passthroughStr = passthroughAttrs ? ` ${passthroughAttrs}` : "";

      if (extraClassesStr) {
        const fullQuote = backslash + quote;
        svg = svg.replace(/^<svg\b/i, `<svg ${attrName}=${fullQuote}${extraClassesStr}${fullQuote}`);
      }

      if (passthroughStr) {
        svg = svg.replace(/^<svg\b/i, `<svg${passthroughStr}`);
      }

      if (isJsContext) {
        const enclosingQuote = getEnclosingQuote(cleanSource, offset);
        if (enclosingQuote === '"') {
          svg = svg.replace(/"/g, '\\"');
        } else if (enclosingQuote === "'") {
          svg = svg.replace(/'/g, "\\'");
        } else if (enclosingQuote === "`") {
          svg = svg.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
        }
      }

      return svg;
    },
  );
}

/**
 * Vite plugin that turns icon utility classes into CSS mask rules, or into
 * inline SVG when `mode` is `"svg"`.
 *
 * In CSS mode it serves the generated stylesheet through `virtual:icons.css`
 * and injects it into every HTML entry point. It leaves
 * `@import "@codenhub/icons";` alone in both modes: that import is the base
 * stylesheet and means the same thing whether or not this plugin is in the
 * pipeline. In both modes it emits the license notices required by the families
 * the build actually used.
 *
 * @param options - Families, scanning, class prefix, delivery mode, and attribution.
 * @returns The Vite plugin.
 */
export function viteIcons(options: ViteIconsOptions = {}): Plugin {
  const prefix = options.prefix ?? "ic";
  const registry = createRegistry(options);
  const contentPaths = options.content ?? [];
  const mode = options.mode ?? "css";
  const attributionMode = options.attribution ?? "auto";

  const scannedFiles = new Set<string>();
  const inMemoryClasses = new Set<string>();
  const resolvedVirtualIds = new Set<string>();
  const usedFamilies = new Map<string, IconFamilyData>();
  const unreplacedClasses = new Map<string, string>();

  function rememberFamily(family: IconFamilyData): void {
    usedFamilies.set(family.prefix, family);
  }

  /**
   * Records icon classes that survived inline SVG replacement.
   *
   * `svg` mode rewrites `<i class="ic-...">` tags and nothing else, so a class
   * left on a button or a form control renders nothing at all: there is no
   * stylesheet in this mode to carry its mask. Silence is the worst outcome, so
   * every such class is reported once.
   */
  function collectUnreplacedClasses(source: string, file: string): void {
    for (const className of scanIconClasses(source, { prefix })) {
      if (unreplacedClasses.has(className)) {
        continue;
      }
      const parsed = parseIconClass(className.slice(prefix.length + 1));
      if (resolveIconClassName(registry, parsed.name)) {
        unreplacedClasses.set(className, file);
      }
    }
  }

  function renderUnreplacedWarning(): string | undefined {
    if (unreplacedClasses.size === 0) {
      return undefined;
    }
    const listed = [...unreplacedClasses].map(([className, file]) => `- ${className} in ${file}`);
    return [
      `Icon classes were found on elements that mode "svg" does not rewrite, so they render nothing:`,
      ...listed,
      `Inline SVG replacement covers <i class="${prefix}-..."> tags only. Use that form, or switch to mode "css", which serves mask rules that work on any element.`,
    ].join("\n");
  }

  function generateCssFromContent(): string {
    const foundClasses = new Set<string>(inMemoryClasses);
    scanFiles(contentPaths, { prefix }, foundClasses);
    scanFiles(scannedFiles, { prefix }, foundClasses);

    const { css, families } = generateIconSetCss(foundClasses, registry, {
      injectBase: true,
      prefix,
      strokeWidth: options.strokeWidth,
    });
    for (const family of families) {
      rememberFamily(family);
    }

    if (attributionMode !== "auto") {
      return css;
    }
    const banner = renderAttributionBanner(families);
    return banner === undefined ? css : `${banner}\n${css}`;
  }

  return {
    name: "codenhub-icons",
    enforce: "pre",

    resolveId(id: string) {
      const rawId = id.replace(/^\//, "").replace(/^@id\//, "");
      if (rawId.startsWith(ICON_MODULE_PREFIX)) {
        return "\0" + rawId;
      }
      // `@codenhub/icons/style.css` is deliberately absent: the package's own
      // base stylesheet resolves through its exports so the bare import means
      // the same thing with or without this plugin.
      if (
        rawId === "virtual:icons.css" ||
        rawId === "virtual:codenhub-icons.css" ||
        rawId === "virtual:@codenhub/icons.css" ||
        id.endsWith("virtual:icons.css")
      ) {
        const resolvedId = "\0" + rawId;
        resolvedVirtualIds.add(resolvedId);
        return resolvedId;
      }
      return null;
    },

    load(id: string) {
      if (id.startsWith(RESOLVED_ICON_MODULE_PREFIX)) {
        const icon = resolveIconModule(registry, id.slice(RESOLVED_ICON_MODULE_PREFIX.length));
        const family = registry.getFamily(icon.prefix);
        if (family) {
          rememberFamily(family);
        }
        return renderIconModule(icon, options.strokeWidth);
      }
      // Matched by the exact same fixed ids `resolveId` claims above, not by
      // the `\0virtual:` convention alone: that prefix is a generic Vite/Rollup
      // marker for "resolved virtual module" that other plugins use too (Astro's
      // own internal pages module among them), so matching it on its own hijacked
      // modules this plugin never resolved.
      if (
        resolvedVirtualIds.has(id) ||
        id === RESOLVED_VIRTUAL_ID ||
        id === "\0virtual:codenhub-icons.css" ||
        id === "\0virtual:@codenhub/icons.css" ||
        id.endsWith("virtual:icons.css") ||
        id.endsWith("@codenhub/icons/style.css")
      ) {
        return mode === "svg" ? "" : generateCssFromContent();
      }
      return null;
    },

    transformIndexHtml(html, ctx) {
      if (mode === "svg") {
        const replaced = replaceIconTagsWithSvg(html, registry, {
          isJsContext: false,
          onFamilyUsed: rememberFamily,
          prefix,
          strokeWidth: options.strokeWidth,
        });
        collectUnreplacedClasses(replaced, ctx.filename ?? "index.html");
        return replaced;
      }

      const scanned = scanIconClasses(html, { prefix });
      for (const cls of scanned) {
        inMemoryClasses.add(cls);
      }
      if (ctx.filename) {
        scannedFiles.add(ctx.filename);
      }

      return [
        {
          tag: "style",
          attrs: { id: "codenhub-icons" },
          children: generateCssFromContent(),
          injectTo: "head",
        },
      ];
    },

    transform(code, id) {
      if (mode === "svg") {
        if (id && !id.includes("node_modules") && !id.startsWith("\0") && MARKUP_FILE.test(id)) {
          const replaced = replaceIconTagsWithSvg(code, registry, {
            isJsContext: true,
            onFamilyUsed: rememberFamily,
            prefix,
            strokeWidth: options.strokeWidth,
          });
          collectUnreplacedClasses(replaced, id);
          if (replaced !== code) {
            return { code: replaced, map: null };
          }
        }
        return null;
      }

      const scanned = scanIconClasses(code, { prefix });
      for (const cls of scanned) {
        inMemoryClasses.add(cls);
      }

      if (id && !id.includes("node_modules") && !id.startsWith("\0") && SOURCE_FILE.test(id)) {
        scannedFiles.add(id);
      }

      return null;
    },

    generateBundle() {
      const unreplaced = renderUnreplacedWarning();
      if (unreplaced) {
        this.warn(unreplaced);
      }

      const families = [...usedFamilies.values()];
      if (attributionMode === "off") {
        const warning = renderSuppressedAttributionWarning(families);
        if (warning) {
          this.warn(warning);
        }
        return;
      }
      // Inline SVG output has no stylesheet to carry a banner, so the notice
      // becomes an asset in both explicit "file" mode and svg mode.
      if (attributionMode !== "file" && mode !== "svg") {
        return;
      }
      const notice = renderAttributionNotice(families);
      if (notice) {
        this.emitFile({ fileName: ATTRIBUTION_FILE, source: `${notice}\n`, type: "asset" });
      }
    },

    configureServer(server) {
      const handleFileChange = (filePath: string) => {
        if (filePath.includes("node_modules") || !SOURCE_FILE.test(filePath)) {
          return;
        }

        scannedFiles.add(filePath);

        const targets = new Set<string>([RESOLVED_VIRTUAL_ID, ...resolvedVirtualIds]);
        for (const targetId of targets) {
          const mod = server.moduleGraph.getModuleById(targetId);
          if (mod) {
            server.moduleGraph.invalidateModule(mod);
            server.ws.send({
              type: "update",
              updates: [
                {
                  type: "js-update",
                  path: mod.url,
                  acceptedPath: mod.url,
                  timestamp: Date.now(),
                },
              ],
            });
          }
        }
      };

      server.watcher.on("change", handleFileChange);
      server.watcher.on("add", handleFileChange);
    },
  };
}

/**
 * Named alias for {@link viteIcons}.
 */
export const viteIconsPlugin = viteIcons;

export default viteIcons;
