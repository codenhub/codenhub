import { DEFAULT_OPTIONS } from "./constants";
import type { ThemeOptions } from "./types";

/**
 * Generates a synchronous inline IIFE script string to inject into document `<head>`.
 * Prevents Flash of Unstyled Content (FOUC) by applying storage or system theme before render.
 *
 * @param options - Configuration options used to determine storage keys, attributes, and default/system themes.
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
  const themeMap: Record<string, { colorScheme: "light" | "dark"; className: string | null }> = {};

  for (const t of themes) {
    const className =
      typeof opts.shouldApplyClass === "function" ? null : opts.shouldApplyClass === false ? null : `theme-${t.name}`;
    themeMap[t.name] = { colorScheme: t.colorScheme, className };
  }

  const jsonKey = JSON.stringify(opts.storageKey);
  const jsonAttr = JSON.stringify(opts.attribute);
  const jsonDef = JSON.stringify(opts.defaultTheme);
  const jsonSysLight = JSON.stringify(opts.systemTheme.light);
  const jsonSysDark = JSON.stringify(opts.systemTheme.dark);
  const jsonThemes = JSON.stringify(themeMap);
  const jsonTailwind = JSON.stringify(opts.isTailwindCss);

  return `!(function(){try{var k=${jsonKey},a=${jsonAttr},d=${jsonDef},sl=${jsonSysLight},sd=${jsonSysDark},tm=${jsonThemes},tw=${jsonTailwind},s=localStorage.getItem(k),m=window.matchMedia("(prefers-color-scheme: dark)").matches,n=(s&&tm[s])?s:(m?sd:sl);if(!tm[n])n=d;var t=tm[n],r=document.documentElement;r.setAttribute(a,n);if(t&&t.colorScheme)r.style.colorScheme=t.colorScheme;if(t&&t.className)r.classList.add(t.className);if(tw)r.classList.toggle("dark",t&&t.colorScheme==="dark")}catch(e){}})()`;
}
