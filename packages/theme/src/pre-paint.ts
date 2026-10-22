import { getThemeClass } from "./class-resolver";
import { DEFAULT_OPTIONS } from "./constants";
import type { ThemeOptions, ResolvedThemeOptions } from "./types";
import { assertThemeConfig } from "./validation";

const INLINE_SCRIPT_UNSAFE = /[<\u2028\u2029]/g;

/**
 * Serializes a value as a JavaScript literal that is safe inside an inline `<script>` element.
 *
 * Escaping `<` keeps a value from closing the element or opening an HTML comment, and escaping
 * U+2028 and U+2029 keeps it a valid string literal in engines that predate ES2019.
 * @param value - Value to serialize.
 * @returns JavaScript literal with the same runtime value.
 */
function toInlineScriptLiteral(value: unknown): string {
  return String(JSON.stringify(value)).replace(
    INLINE_SCRIPT_UNSAFE,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

/**
 * Generates a synchronous inline IIFE script string to inject into document `<head>`.
 * Prevents Flash of Unstyled Content (FOUC) by applying storage or system theme before render.
 *
 * @param options - Configuration options used to determine storage keys, attributes, default/system themes, custom class resolvers, and token schemas.
 * @returns Minified JavaScript script string.
 * @throws {Error} When the options are invalid, under the same rules and with the same messages as `createTheme`, such as a `defaultTheme` or `systemTheme` naming a theme that is not configured.
 */
export function getPrePaintScript<TSchema extends Record<string, string> = Record<string, string>>(
  options: ThemeOptions<TSchema> = {},
): string {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    systemTheme: { ...DEFAULT_OPTIONS.systemTheme, ...options.systemTheme },
  } as ResolvedThemeOptions<TSchema>;
  assertThemeConfig(opts);
  return buildPrePaintScript(opts);
}

/**
 * Builds the pre-paint script from options that `assertThemeConfig` has already accepted.
 *
 * @internal
 */
export function buildPrePaintScript<TSchema extends Record<string, string>>(
  opts: ResolvedThemeOptions<TSchema>,
): string {
  const themes = opts.themes;
  // No prototype, so a theme named "__proto__" is an own key rather than the object's prototype.
  const themeMap: Record<
    string,
    {
      colorScheme: "light" | "dark";
      className: string | null;
      vars?: Record<string, string>;
    }
  > = Object.create(null);

  for (const t of themes) {
    const className = getThemeClass(t, opts.shouldApplyClass);
    let vars: Record<string, string> | undefined;

    if (opts.tokenSchema && t.tokens) {
      for (const [tokenKey, cssVarName] of Object.entries(opts.tokenSchema)) {
        const tokenValue = t.tokens[tokenKey];
        if (tokenValue !== undefined && tokenValue !== null) {
          vars ??= {};
          vars[cssVarName] = tokenValue;
        }
      }
    }

    themeMap[t.name] = {
      colorScheme: t.colorScheme,
      className,
      ...(vars ? { vars } : {}),
    };
  }

  const jsonKey = toInlineScriptLiteral(opts.storageKey);
  const jsonAttr = toInlineScriptLiteral(opts.attribute);
  const jsonDef = toInlineScriptLiteral(opts.defaultTheme);
  const jsonSysLight = toInlineScriptLiteral(opts.systemTheme.light);
  const jsonSysDark = toInlineScriptLiteral(opts.systemTheme.dark);
  // Parsed rather than written as an object literal, where a "__proto__" key would set the prototype.
  const jsonThemes = `JSON.parse(${toInlineScriptLiteral(JSON.stringify(themeMap))})`;
  const jsonTailwind = toInlineScriptLiteral(opts.isTailwindCss);

  return `!(function(){try{var k=${jsonKey},a=${jsonAttr},d=${jsonDef},sl=${jsonSysLight},sd=${jsonSysDark},tm=${jsonThemes},tw=${jsonTailwind},s=localStorage.getItem(k),h=function(x){return Object.prototype.hasOwnProperty.call(tm,x)},m=window.matchMedia("(prefers-color-scheme: dark)").matches,n=(s&&h(s))?s:(m?sd:sl);if(!h(n))n=d;var t=tm[n],r=document.documentElement;r.setAttribute(a,n);if(t&&t.colorScheme)r.style.colorScheme=t.colorScheme;if(t&&t.className)r.classList.add(t.className);if(tw)r.classList.toggle("dark",t&&t.colorScheme==="dark");if(t&&t.vars)for(var v in t.vars)r.style.setProperty(v,t.vars[v])}catch(e){}})()`;
}
