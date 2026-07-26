import type { Plugin } from "vite";

import { generateIconSetCss, setSvgStrokeWidth } from "../generator/css-generator.js";
import { lucideProvider } from "../registry/providers/lucide/index.js";
import { IconRegistry } from "../registry/registry.js";
import { scanFiles, scanIconClasses } from "../scanner/class-scanner.js";

/**
 * Options for configuring the Vite icons plugin.
 */
export interface ViteIconsOptions {
  /**
   * List of file paths or glob patterns to scan for icon class names.
   */
  content?: string[];

  /**
   * Prefix for icon class names (e.g. `"ic"` for `.ic-close`). Defaults to `"ic"`.
   */
  prefix?: string;

  /**
   * Custom `IconRegistry` instance used to resolve icons.
   * Defaults to a registry instance initialized with `lucideProvider`.
   */
  registry?: IconRegistry;

  /**
   * Default stroke width for configurable icons.
   */
  strokeWidth?: number | string;

  /**
   * Delivery mode for icon rendering.
   * - `"css"` (default): Serves generated CSS rules via `virtual:icons.css` using CSS masks.
   * - `"svg"`: Replaces `<i class="...ic-<name>...">` tags directly with inline SVG elements at build time.
   */
  mode?: "css" | "svg";
}

const VIRTUAL_ID = "virtual:icons.css";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_ID;

const defaultRegistry = new IconRegistry();
defaultRegistry.registerProvider(lucideProvider);

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

function replaceIconTagsWithSvg(
  source: string,
  registry: IconRegistry,
  options: { prefix: string; strokeWidth?: number | string; isJsContext?: boolean },
): string {
  const { prefix, strokeWidth, isJsContext = false } = options;
  const prefixDash = `${prefix}-`;
  const strokePrefix = `${prefixDash}stroke-`;

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
      let foundIconName: string | null = null;
      let strokeValFromClass: string | null = null;
      const leftoverClasses: string[] = [];

      for (const cls of classes) {
        if (cls === prefix) {
          continue;
        }
        if (cls.startsWith(strokePrefix)) {
          const valStr = cls.slice(strokePrefix.length);
          if (/^[0-9]+(?:\.[0-9]+)?$/.test(valStr)) {
            strokeValFromClass = valStr;
            continue;
          }
        }
        if (!foundIconName && cls.startsWith(prefixDash)) {
          const candidateName = cls.slice(prefixDash.length);
          if (registry.has(candidateName)) {
            foundIconName = candidateName;
            continue;
          }
        }
        leftoverClasses.push(cls);
      }

      if (!foundIconName) {
        return match;
      }

      const resolved = registry.resolve(foundIconName);
      if (!resolved) {
        return match;
      }

      let svg = resolved.svg.trim();
      const effectiveStrokeWidth = strokeValFromClass ?? strokeWidth ?? registry.options?.strokeWidth;
      if (resolved.strokeConfigurable && effectiveStrokeWidth !== undefined) {
        svg = setSvgStrokeWidth(svg, effectiveStrokeWidth);
      }

      const extraClassesStr = leftoverClasses.join(" ");
      const passthroughAttrs = [before.trim(), after.trim()].filter(Boolean).join(" ");
      const passthroughStr = passthroughAttrs ? ` ${passthroughAttrs}` : "";

      const hasClassInSvg = /^(<svg\b[^>]*?\b(class|className))=/i.test(svg);
      if (hasClassInSvg) {
        if (extraClassesStr) {
          svg = svg.replace(
            /^(<svg\b[^>]*?\b(class|className))=((['"])(.*?)\4|([^\s>]+))/i,
            (_, attrPrefix, _name, _q, qChar, existing) => {
              const quoteChar = qChar || '"';
              return `${attrPrefix}=${quoteChar}${existing ? existing + " " : ""}${extraClassesStr}${quoteChar}`;
            },
          );
        }
      } else if (extraClassesStr) {
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
          svg = svg.replace(/`/g, "\\`").replace(/\${/g, "\\${");
        }
      }

      return svg;
    },
  );
}

/**
 * Vite plugin that serves generated icon CSS through virtual module `virtual:icons.css`
 * or replaces `@import "@codenhub/icons";` / `@import "@codenhub/icons/style.css";` directives,
 * or embeds inline SVG elements directly into markup when `options.mode === "svg"`.
 *
 * @param options - Configuration options for content scanning, class prefix, delivery mode, and icon registry.
 * @returns Vite plugin object.
 */
export function viteIcons(options: ViteIconsOptions = {}): Plugin {
  const prefix = options.prefix ?? "ic";
  const registry = options.registry ?? defaultRegistry;
  const contentPaths = options.content ?? [];
  const mode = options.mode ?? "css";

  const scannedFiles = new Set<string>();
  const inMemoryClasses = new Set<string>();
  const resolvedVirtualIds = new Set<string>();

  function generateCssFromContent(): string {
    const foundClasses = new Set<string>(inMemoryClasses);

    // 1. Scan files specified in options.content
    scanFiles(contentPaths, { prefix }, foundClasses);

    // 2. Scan tracked runtime files in Vite project
    scanFiles(scannedFiles, { prefix }, foundClasses);

    return generateIconSetCss(foundClasses, registry, {
      prefix,
      injectBase: true,
      strokeWidth: options.strokeWidth,
    });
  }

  return {
    name: "codenhub-icons",
    enforce: "pre",

    resolveId(id: string) {
      const rawId = id.replace(/^\//, "").replace(/^@id\//, "");
      if (
        rawId === "virtual:icons.css" ||
        rawId === "virtual:codenhub-icons.css" ||
        rawId === "virtual:@codenhub/icons.css" ||
        rawId === "@codenhub/icons/style.css" ||
        id.endsWith("virtual:icons.css") ||
        id.endsWith("@codenhub/icons/style.css")
      ) {
        const resolvedId = "\0" + rawId;
        resolvedVirtualIds.add(resolvedId);
        return resolvedId;
      }
      return null;
    },

    load(id: string) {
      if (
        resolvedVirtualIds.has(id) ||
        id.startsWith("\0virtual:") ||
        id.startsWith("\0@codenhub/icons/") ||
        id === RESOLVED_VIRTUAL_ID
      ) {
        return mode === "svg" ? "" : generateCssFromContent();
      }
      return null;
    },

    transformIndexHtml(html, ctx) {
      if (mode === "svg") {
        return replaceIconTagsWithSvg(html, registry, {
          prefix,
          strokeWidth: options.strokeWidth,
          isJsContext: false,
        });
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
        if (id && /\.(css|scss|sass|less)$/i.test(id)) {
          const importPattern =
            /@import\s+["'](?:@codenhub\/icons|@codenhub\/icons\/style\.css|virtual:icons\.css)["'];?/g;
          if (code.includes("@codenhub/icons") || code.includes("virtual:icons.css")) {
            return {
              code: code.replace(importPattern, ""),
              map: null,
            };
          }
          return null;
        }

        if (id && !id.includes("node_modules") && !id.startsWith("\0") && /\.(html|jsx?|tsx?|vue|svelte)$/i.test(id)) {
          const replaced = replaceIconTagsWithSvg(code, registry, {
            prefix,
            strokeWidth: options.strokeWidth,
            isJsContext: true,
          });
          if (replaced !== code) {
            return {
              code: replaced,
              map: null,
            };
          }
        }
        return null;
      }

      const scanned = scanIconClasses(code, { prefix });
      for (const cls of scanned) {
        inMemoryClasses.add(cls);
      }

      // Track source files for scanning if id is provided
      if (
        id &&
        !id.includes("node_modules") &&
        !id.startsWith("\0") &&
        /\.(html|jsx?|tsx?|vue|svelte|css|scss|sass|less)$/i.test(id)
      ) {
        scannedFiles.add(id);
      }

      // Replace `@import "@codenhub/icons";` or `@import "@codenhub/icons/style.css";`
      if (id && /\.(css|scss|sass|less)$/i.test(id)) {
        const importPattern =
          /@import\s+["'](?:@codenhub\/icons|@codenhub\/icons\/style\.css|virtual:icons\.css)["'];?/g;
        if (code.includes("@codenhub/icons") || code.includes("virtual:icons.css")) {
          const generated = generateCssFromContent();
          return {
            code: code.replace(importPattern, generated),
            map: null,
          };
        }
      }

      return null;
    },

    configureServer(server) {
      const handleFileChange = (filePath: string) => {
        if (filePath.includes("node_modules") || !/\.(html|jsx?|tsx?|vue|svelte|css|scss|sass|less)$/i.test(filePath)) {
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
 * Named alias for `viteIcons` plugin creator.
 */
export const viteIconsPlugin = viteIcons;

export default viteIcons;
