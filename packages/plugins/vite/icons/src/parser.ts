import { ICON_MARKER_PREFIX, ICON_TAG_REGEX } from "./constants";

interface ResolvedIcon {
  iconClass: string;
  markup: string;
}

interface SvgReplacementOptions {
  iconMarkupMap: Map<string, string>;
  match: string;
  attrsBeforeClass: string;
  attrName: string;
  quote: string;
  classValue: string;
  attrsAfterClass: string;
  isJsContext: boolean;
  source: string;
  offset: number;
}

interface ReplaceIconTagsOptions {
  iconMarkupMap: Map<string, string>;
  source: string;
  isJsContext?: boolean;
}

/**
 * Replaces comment characters with spaces to preserve character indices
 * while removing comments so they do not confuse regex and quote tracking.
 */
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
        // Scan to end of regex literal
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
              i = j; // advance outer loop index
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

export function getEnclosingQuote(code: string, matchIndex: number): string | null {
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
        // Scan to end of regex literal
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
              i = j; // advance outer loop index
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

function splitClasses(classValue: string): string[] {
  return classValue.split(/\s+/).filter(Boolean);
}

function resolveIcon(iconMarkupMap: Map<string, string>, classValue: string): ResolvedIcon | null {
  const classes = splitClasses(classValue);

  for (const className of classes) {
    if (!className.startsWith(ICON_MARKER_PREFIX)) {
      continue;
    }

    const iconNameCandidate = className.slice(ICON_MARKER_PREFIX.length);
    const markup = iconMarkupMap.get(iconNameCandidate);
    if (!markup) {
      continue;
    }

    return { iconClass: className, markup };
  }

  return null;
}

function stripIconClass(classValue: string, iconClass: string): string | null {
  const remaining = splitClasses(classValue)
    .filter((className) => className !== iconClass)
    .join(" ");
  return remaining || null;
}

function joinPassthroughAttributes(attrsBeforeClass: string, attrsAfterClass: string): string {
  const segments = [attrsBeforeClass.trim(), attrsAfterClass.trim()].filter(Boolean);
  return segments.length > 0 ? ` ${segments.join(" ")}` : "";
}

function createIconTagRegex(): RegExp {
  return new RegExp(ICON_TAG_REGEX.source, ICON_TAG_REGEX.flags);
}

function mergeSvgClasses(markup: string, extraClasses: string | null): string {
  if (!extraClasses) {
    return markup;
  }

  const svgClassRegex = /^(<svg\b[^>]*?\b(class|className))=((['"])(.*?)\4|([^\s>]+))/i;
  const match = markup.match(svgClassRegex);

  if (match) {
    const quote = match[4] || '"';
    const existingClasses = match[5] || match[6] || "";
    const merged = `${existingClasses} ${extraClasses}`;
    const replacement = `${match[1]}=${quote}${merged}${quote}`;
    return markup.replace(svgClassRegex, replacement);
  }

  return markup;
}

function buildSvgReplacement(options: SvgReplacementOptions): string {
  const {
    iconMarkupMap,
    match,
    attrsBeforeClass,
    attrName,
    quote,
    classValue,
    attrsAfterClass,
    isJsContext,
    source,
    offset,
  } = options;

  const icon = resolveIcon(iconMarkupMap, classValue);
  if (!icon) {
    return match;
  }

  const extraClasses = stripIconClass(classValue, icon.iconClass);
  const passthroughAttrStr = joinPassthroughAttributes(attrsBeforeClass, attrsAfterClass);

  let markup = icon.markup.trim();
  const hasClass = /^(<svg\b[^>]*?\b(class|className))=/i.test(markup);

  if (hasClass) {
    markup = mergeSvgClasses(markup, extraClasses);
  }

  const classAttr = !hasClass && extraClasses ? ` ${attrName}=${quote}${extraClasses}${quote}` : "";

  if (isJsContext) {
    const enclosingQuote = getEnclosingQuote(source, offset);
    if (enclosingQuote === '"') {
      markup = markup.replace(/"/g, '\\"');
    } else if (enclosingQuote === "'") {
      markup = markup.replace(/'/g, "\\'");
    } else if (enclosingQuote === "`") {
      markup = markup.replace(/`/g, "\\`").replace(/\${/g, "\\${");
    }
  }

  return markup.replace(/^<svg\b/i, `<svg${classAttr}${passthroughAttrStr}`);
}

export function replaceIconTags(options: ReplaceIconTagsOptions): string {
  const { iconMarkupMap, source, isJsContext = false } = options;
  const iconTagRegex = createIconTagRegex();

  const cleanSource = isJsContext ? stripComments(source) : source;

  return source.replace(
    iconTagRegex,
    (
      match,
      before: string,
      attrName: string,
      backslash: string,
      quote: string,
      classValue: string,
      after: string,
      offset: number,
    ) =>
      buildSvgReplacement({
        iconMarkupMap,
        match,
        attrsBeforeClass: before,
        attrName,
        quote: backslash + quote,
        classValue,
        attrsAfterClass: after,
        isJsContext,
        source: cleanSource,
        offset,
      }),
  );
}
