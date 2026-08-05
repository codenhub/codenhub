import { getThemeClass } from "./class-resolver";
import { DEFAULT_OPTIONS } from "./constants";
import type { ThemeOptions, ThemeDefinition } from "./types";

/**
 * Generates a synchronous inline IIFE script string to inject into document `<head>`.
 * Prevents Flash of Unstyled Content (FOUC) by applying storage or system theme before render.
 *
 * @param options - Configuration options used to determine storage keys, attributes, default/system themes, custom class resolvers, and token schemas.
 * @returns Minified JavaScript script string.
 */
export function getPrePaintScript<TSchema extends Record<string, string> = Record<string, string>>(
  options: ThemeOptions<TSchema> = {},
): string {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    systemTheme: { ...DEFAULT_OPTIONS.systemTheme, ...options.systemTheme },
  };

  const themes = opts.themes || DEFAULT_OPTIONS.themes;
  const themeMap: Record<
    string,
    {
      colorScheme: "light" | "dark";
      className: string | null;
      vars?: Record<string, string>;
    }
  > = {};

  for (const t of themes) {
    const className = getThemeClass(t as unknown as ThemeDefinition<TSchema>, opts.shouldApplyClass);
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

  const jsonKey = JSON.stringify(opts.storageKey);
  const jsonAttr = JSON.stringify(opts.attribute);
  const jsonDef = JSON.stringify(opts.defaultTheme);
  const jsonSysLight = JSON.stringify(opts.systemTheme.light);
  const jsonSysDark = JSON.stringify(opts.systemTheme.dark);
  const jsonThemes = JSON.stringify(themeMap);
  const jsonTailwind = JSON.stringify(opts.isTailwindCss);

  return `!(function(){try{var k=${jsonKey},a=${jsonAttr},d=${jsonDef},sl=${jsonSysLight},sd=${jsonSysDark},tm=${jsonThemes},tw=${jsonTailwind},s=localStorage.getItem(k),m=window.matchMedia("(prefers-color-scheme: dark)").matches,n=(s&&tm[s])?s:(m?sd:sl);if(!tm[n])n=d;var t=tm[n],r=document.documentElement;r.setAttribute(a,n);if(t&&t.colorScheme)r.style.colorScheme=t.colorScheme;if(t&&t.className)r.classList.add(t.className);if(tw)r.classList.toggle("dark",t&&t.colorScheme==="dark");if(t&&t.vars)for(var v in t.vars)r.style.setProperty(v,t.vars[v])}catch(e){}})()`;
}
