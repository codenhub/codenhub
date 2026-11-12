/* The tree-shaker behind `chs build`: it reads the stylesheet this package
   compiled and keeps the rules that can match the classes a project uses.

   It parses only what `scripts/build-styles.mjs` writes: minified CSS with no
   nesting, where every block is a style rule, a grouping at-rule that holds
   rules (`@layer`, `@media`, `@supports`), or an at-rule whose body is kept
   whole (`@property`, `@keyframes`). `tests/integration/purge.test.ts` holds
   that: parsing and writing the stylesheet back gives the same bytes.

   The syntax here is erasable TypeScript only, because `scripts/build-purge.mjs`
   imports this file as it is. */

export type Node =
  | { kind: "statement"; text: string }
  | { kind: "group"; prelude: string; children: Node[] }
  | { kind: "block"; prelude: string; body: string; isRule: boolean };

const GROUPS = new Set(["@media", "@supports", "@layer", "@container", "@scope", "@starting-style"]);
const IDENT = /^(?:\\[0-9a-fA-F]{1,6}\s?|\\.|[\w-]|\P{ASCII})+/u;
/** The classes a project uses: anything that answers whether a class name is one of them. */
export interface ClassSet {
  has(name: string): boolean;
}

// The pseudo-classes whose argument is a list of selectors, any one of which may match.
const ANY_OF = new Set(["is", "where", "has"]);

/** Returns the index just past the string or comment that starts at `index`, or `index` when none does. */
function skipInert(css: string, index: number): number {
  const char = css[index];

  if (char === '"' || char === "'") {
    for (let i = index + 1; i < css.length; i++) {
      if (css[i] === "\\") {
        i++;
      } else if (css[i] === char) {
        return i + 1;
      }
    }

    return css.length;
  }

  if (char === "/" && css[index + 1] === "*") {
    const end = css.indexOf("*/", index + 2);

    return end === -1 ? css.length : end + 2;
  }

  return index;
}

/** Returns the index of the first `stop` character at bracket depth zero from `from`, or `end` when there is none. */
function findTop(css: string, from: number, end: number, stop: string): number {
  let depth = 0;

  for (let i = from; i < end; i++) {
    const next = skipInert(css, i);

    if (next !== i) {
      i = next - 1;
      continue;
    }

    const char = css[i]!;

    if (char === "\\") {
      i++;
    } else if (depth === 0 && stop.includes(char)) {
      return i;
    } else if (char === "(" || char === "[" || char === "{") {
      depth++;
    } else if (char === ")" || char === "]" || char === "}") {
      depth--;
    }
  }

  return end;
}

function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let from = 0;

  while (from <= text.length) {
    const at = findTop(text, from, text.length, separator);

    parts.push(text.slice(from, at));
    from = at + 1;
  }

  return parts;
}

export function parse(css: string, start = 0, end = css.length): Node[] {
  const nodes: Node[] = [];
  let index = start;

  while (index < end) {
    /* A comment between rules, such as Tailwind's licence banner, is kept as it
       is rather than read as part of the next prelude, together with the
       whitespace before it: the package's own notice follows the banner on a
       new line, and read into the prelude it hid the at-rule after it. */
    let comment = index;

    while (comment < end && /\s/.test(css[comment]!)) {
      comment++;
    }

    if (css.startsWith("/*", comment)) {
      const after = skipInert(css, comment);

      nodes.push({ kind: "statement", text: css.slice(index, after) });
      index = after;
      continue;
    }

    const open = findTop(css, index, end, "{;");

    if (open >= end || css[open] === ";") {
      nodes.push({ kind: "statement", text: css.slice(index, Math.min(open + 1, end)) });
      index = open + 1;
      continue;
    }

    const close = findTop(css, open + 1, end, "}");
    const prelude = css.slice(index, open);
    const atRule = /^\s*(@[\w-]+)/.exec(prelude)?.[1];

    if (atRule !== undefined && GROUPS.has(atRule)) {
      nodes.push({ kind: "group", prelude, children: parse(css, open + 1, close) });
    } else {
      nodes.push({ kind: "block", prelude, body: css.slice(open + 1, close), isRule: atRule === undefined });
    }

    index = close + 1;
  }

  return nodes;
}

export function serialize(nodes: readonly Node[]): string {
  let css = "";

  for (const node of nodes) {
    if (node.kind === "statement") {
      css += node.text;
    } else if (node.kind === "group") {
      css += `${node.prelude}{${serialize(node.children)}}`;
    } else {
      css += `${node.prelude}{${node.body}}`;
    }
  }

  return css;
}

/** Writes the tree one declaration to a line, for `--no-minify`. */
export function format(nodes: readonly Node[], indent = ""): string {
  let css = "";

  for (const node of nodes) {
    if (node.kind === "statement") {
      css += `${indent}${node.text.trim()}\n`;
    } else if (node.kind === "group") {
      css += `${indent}${node.prelude.trim()} {\n${format(node.children, `${indent}  `)}${indent}}\n`;
    } else if (node.isRule) {
      const selectors = splitTop(node.prelude, ",").map((selector) => selector.trim());
      const declarations = splitTop(node.body, ";").filter((declaration) => declaration.trim() !== "");

      css += `${indent}${selectors.join(`,\n${indent}`)} {\n`;
      css += declarations.map((declaration) => `${indent}  ${declaration.trim()};\n`).join("");
      css += `${indent}}\n`;
    } else {
      css += `${indent}${node.prelude.trim()} { ${node.body} }\n`;
    }
  }

  return css;
}

function unescapeIdent(raw: string): string {
  return raw.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_, hex: string | undefined, char: string) => {
    if (hex === undefined) {
      return char;
    }

    const code = Number.parseInt(hex, 16);

    // CSS Syntax 4.3.7: zero, a surrogate, or a code point past Unicode reads as U+FFFD.
    return code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff ? "�" : String.fromCodePoint(code);
  });
}

/**
 * Says whether a selector can match in markup whose classes are all in `used`.
 * Every class the selector requires has to be there. A class inside `:not()` is
 * never required, and of the selectors inside `:is()`, `:where()`, and `:has()`
 * one is enough. `onClass`, when given, is told every class name it reads.
 */
export function canMatch(selector: string, used: ClassSet, onClass?: (name: string) => void): boolean {
  let isMatch = true;

  for (let i = 0; i < selector.length; i++) {
    const next = skipInert(selector, i);

    if (next !== i) {
      i = next - 1;
      continue;
    }

    const char = selector[i];

    if (char === "\\") {
      i++;
    } else if (char === "[") {
      i = findTop(selector, i + 1, selector.length, "]");
    } else if (char === ".") {
      const raw = IDENT.exec(selector.slice(i + 1))?.[0];

      if (raw !== undefined) {
        const name = unescapeIdent(raw);

        onClass?.(name);
        isMatch &&= used.has(name);
        i += raw.length;
      }
    } else if (char === ":") {
      const pseudo = /^::?([\w-]+)\(/.exec(selector.slice(i));

      if (pseudo !== null) {
        const open = i + pseudo[0].length;
        const close = findTop(selector, open, selector.length, ")");
        const branches = splitTop(selector.slice(open, close), ",");

        if (ANY_OF.has(pseudo[1]!)) {
          // Every branch is read even after one matches, so `onClass` sees them all.
          const results = branches.map((branch) => canMatch(branch, used, onClass));

          isMatch &&= results.includes(true);
        } else if (onClass !== undefined) {
          for (const branch of branches) {
            canMatch(branch, used, onClass);
          }
        }

        i = close;
      }
    }

    if (!isMatch && onClass === undefined) {
      return false;
    }
  }

  return isMatch;
}

/** Every class name a selector in the tree reads, required or not. */
export function classesOf(nodes: readonly Node[], names = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.kind === "group") {
      classesOf(node.children, names);
    } else if (node.kind === "block" && node.isRule) {
      canMatch(node.prelude, names, (name) => names.add(name));
    }
  }

  return names;
}

function isLayer(node: Node): boolean {
  return node.kind === "group" && /^\s*@layer\b/.test(node.prelude);
}

function isEmptyLayer(node: Node): boolean {
  return node.kind === "group" && isLayer(node) && node.children.every(isEmptyLayer);
}

/**
 * Returns the tree without the rules that cannot match `used`. A selector list
 * keeps only its selectors that can. A `@layer` block emptied this way stays,
 * because where it first stands fixes the layer's place in the cascade, unless
 * it is all that is left of a `@media` or `@supports` block: those hold a
 * variant's rules, which come after the layer's first block.
 */
export function purge(nodes: readonly Node[], used: ClassSet): Node[] {
  const kept: Node[] = [];

  for (const node of nodes) {
    if (node.kind === "group") {
      const children = purge(node.children, used);

      if (isLayer(node) ? true : children.some((child) => !isEmptyLayer(child))) {
        kept.push({ ...node, children });
      }
    } else if (node.kind === "block" && node.isRule) {
      const selectors = splitTop(node.prelude, ",").filter((selector) => canMatch(selector, used));

      if (selectors.length > 0) {
        kept.push({ ...node, prelude: selectors.join(",") });
      }
    } else {
      kept.push(node);
    }
  }

  return kept;
}
