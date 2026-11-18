import { DARK_CLASS, PREFERS_DARK_QUERY } from "./constants";
import { getOppositePair, type ResolvedThemeOptions } from "./options";

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
 * Builds the pre-paint script from validated options and the resolved class of every theme.
 *
 * @internal
 */
export function buildPrePaintScript<TName extends string, TSchema extends Record<string, string>>(
  opts: ResolvedThemeOptions<TName, TSchema>,
  classes: ReadonlyMap<TName, string | null>,
): string {
  // No prototype, so a theme named "__proto__" is an own key rather than the object's prototype.
  const themeMap: Record<
    string,
    {
      colorScheme: "light" | "dark";
      className: string | null;
      pair?: string;
      vars?: Record<string, string>;
    }
  > = Object.create(null);

  for (const [name, theme] of opts.themes) {
    let vars: Record<string, string> | undefined;

    if (opts.tokenSchema) {
      for (const [tokenKey, cssVarName] of Object.entries(opts.tokenSchema)) {
        const tokenValue = Object.hasOwn(theme.tokens, tokenKey) ? theme.tokens[tokenKey] : undefined;
        if (tokenValue !== undefined) {
          vars ??= {};
          vars[cssVarName] = tokenValue;
        }
      }
    }

    const pair = getOppositePair(opts.themes, name);
    themeMap[name] = {
      colorScheme: theme.colorScheme,
      className: classes.get(name) ?? null,
      ...(pair === null ? {} : { pair }),
      ...(vars ? { vars } : {}),
    };
  }

  const key = toInlineScriptLiteral(opts.storageKey);
  const attribute = toInlineScriptLiteral(opts.attribute);
  const defaultTheme = toInlineScriptLiteral(opts.defaultTheme);
  const systemLight = toInlineScriptLiteral(opts.systemTheme.light);
  const systemDark = toInlineScriptLiteral(opts.systemTheme.dark);
  // Parsed rather than written as an object literal, where a "__proto__" key would set the prototype.
  const themes = `JSON.parse(${toInlineScriptLiteral(JSON.stringify(themeMap))})`;
  const darkClass = toInlineScriptLiteral(opts.darkClass ? DARK_CLASS : null);
  const query = toInlineScriptLiteral(PREFERS_DARK_QUERY);

  // Storage and matchMedia each fail on their own, as createTheme() treats them: blocked storage still applies the
  // system theme, and a missing matchMedia falls back to the default theme, or to the stored theme of a choice that
  // follows the system. The stored value is read as storage.ts reads it: a configured name first, then the
  // {"name","followSystem"} object, whose theme follows the OS only while it has a pair of the opposite scheme.
  return `!(function(){try{var tm=${themes},h=function(x){return Object.prototype.hasOwnProperty.call(tm,x)},s=null,m=null,f=false;try{s=localStorage.getItem(${key})}catch(e){}try{m=window.matchMedia(${query}).matches}catch(e){}if(s!==null&&!h(s)){var o=null;try{o=s.charAt(0)==="{"?JSON.parse(s):null}catch(e){}s=o!==null&&typeof o==="object"&&typeof o.name==="string"&&h(o.name)?o.name:null;f=s!==null&&o.followSystem===true}var n=s!==null?(f&&m!==null&&tm[s].pair&&tm[s].colorScheme!==(m?"dark":"light")?tm[s].pair:s):m===null?${defaultTheme}:m?${systemDark}:${systemLight},t=tm[n],r=document.documentElement,c=r.classList,dc=${darkClass};r.setAttribute(${attribute},n);r.style.colorScheme=t.colorScheme;for(var x in tm)if(tm[x].className&&tm[x].className!==t.className)c.remove(tm[x].className);if(t.className)c.add(t.className);if(dc)c.toggle(dc,t.colorScheme==="dark");if(t.vars)for(var v in t.vars)r.style.setProperty(v,t.vars[v])}catch(e){}})()`;
}
