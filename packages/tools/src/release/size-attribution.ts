import { readFile } from "node:fs/promises";
import { extname, relative } from "node:path";

import type { OutputChunk } from "rolldown";
import { parseAst } from "rolldown/parseAst";

import type { SourceSize } from "./size-report.ts";

/** Key for bytes no source map points anywhere: code the bundler added. */
export const UNATTRIBUTED = "(unattributed)";

/** Key for a file's bytes outside every top-level declaration, such as a side-effect statement. */
export const TOP_LEVEL = "(top level)";

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const DEPENDENCY = /\/node_modules\/((?:@[^/]+\/)?[^/]+)\/(?!.*\/node_modules\/)/u;
const LANGUAGES: Record<string, "js" | "jsx" | "ts" | "tsx"> = {
  ".cjs": "js",
  ".cts": "ts",
  ".js": "js",
  ".jsx": "jsx",
  ".mjs": "js",
  ".mts": "ts",
  ".ts": "ts",
  ".tsx": "tsx",
};

function decodeVlq(segment: string): number[] {
  const values: number[] = [];
  let shift = 0;
  let value = 0;
  for (const character of segment) {
    const digit = BASE64.indexOf(character);
    value += (digit & 31) << shift;
    if ((digit & 32) === 0) {
      values.push((value & 1) === 1 ? -(value >>> 1) : value >>> 1);
      shift = 0;
      value = 0;
    } else {
      shift += 5;
    }
  }
  return values;
}

/** One source a chunk's map names: what it is called in `size.json`, and where to read it. */
interface Source {
  key: string;
  /** Absolute path, present only for the package's own files, which are broken down by declaration. */
  path?: string;
}

/**
 * Names a source the way `size.json` does: a dependency by package name, a
 * virtual module as unattributed, anything else by package-relative path.
 * @param source Absolute path, as the bundle's `sourcemapPathTransform` leaves it.
 */
function describeSource(source: string, packageDirectory: string): Source {
  if (source === "" || source.includes("\0")) {
    return { key: UNATTRIBUTED };
  }
  const path = source.replaceAll("\\", "/");
  const dependency = DEPENDENCY.exec(path);
  return dependency === null
    ? { key: relative(packageDirectory, source).replaceAll("\\", "/"), path: source }
    : { key: `node_modules/${dependency[1] ?? ""}` };
}

/** A top-level declaration's name and the span of source text it covers. */
interface Declaration {
  end: number;
  name: string;
  start: number;
}

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

function nameOf(node: Node | null | undefined, text: string): string | undefined {
  if (node === null || node === undefined) {
    return undefined;
  }
  return node.type === "Identifier" ? (node.name as string) : text.slice(node.start, node.end).slice(0, 60);
}

/**
 * Lists the top-level declarations of a module, in source order.
 *
 * An exported declaration counts as the declaration it exports, a variable
 * statement as one declaration per declarator, an anonymous default export as
 * `default`, and a class as one declaration per member (see {@link splitClass}).
 * Type-only declarations are listed too; they have no output, so no bytes ever
 * reach them.
 */
function listDeclarations(text: string, path: string): Declaration[] | undefined {
  const lang = LANGUAGES[extname(path)];
  if (lang === undefined) {
    return undefined;
  }
  let body: Node[];
  try {
    body = parseAst(text, { lang }, path).body as unknown as Node[];
  } catch {
    return undefined;
  }
  return body.flatMap((statement): Declaration[] => {
    const isDefault = statement.type === "ExportDefaultDeclaration";
    const inner =
      (statement.type === "ExportNamedDeclaration" || isDefault) && statement.declaration !== null
        ? (statement.declaration as Node)
        : statement;
    if (inner.type === "VariableDeclaration") {
      return (inner.declarations as Node[]).map((declarator) => ({
        end: declarator.end,
        name: nameOf(declarator.id as Node, text) ?? TOP_LEVEL,
        start: declarator.start,
      }));
    }
    const name = nameOf(inner.id as Node | null | undefined, text) ?? (isDefault ? "default" : undefined);
    if (name === undefined) {
      return [];
    }
    if (inner.type === "ClassDeclaration" || inner.type === "ClassExpression") {
      return splitClass(name, statement, (inner.body as Node).body as Node[], text);
    }
    return [{ end: statement.end, name, start: statement.start }];
  });
}

function memberName(member: Node, text: string): string {
  if (member.type === "StaticBlock") {
    return "static {}";
  }
  const key = member.key as Node | undefined;
  if (key === undefined) {
    return text.slice(member.start, member.end).slice(0, 60);
  }
  if (key.type === "PrivateIdentifier") {
    return `#${key.name as string}`;
  }
  return member.computed === true ? `[${text.slice(key.start, key.end).slice(0, 60)}]` : (nameOf(key, text) ?? "");
}

/**
 * Splits a class's span into one span per member, named `Class.member`, and
 * the spans between members, named after the class: its heading, braces, and
 * anything else that belongs to no single member.
 */
function splitClass(name: string, span: Node, members: Node[], text: string): Declaration[] {
  const declarations: Declaration[] = [];
  let cursor = span.start;
  for (const member of members) {
    if (member.start > cursor) {
      declarations.push({ end: member.start, name, start: cursor });
    }
    declarations.push({ end: member.end, name: `${name}.${memberName(member, text)}`, start: member.start });
    cursor = member.end;
  }
  if (span.end > cursor) {
    declarations.push({ end: span.end, name, start: cursor });
  }
  return declarations;
}

/** Finds which declaration a source position falls in, by line and UTF-16 column as source maps count them. */
class DeclarationIndex {
  private readonly lineStarts: number[] = [0];

  private readonly declarations: Declaration[];

  public constructor(text: string, declarations: Declaration[]) {
    this.declarations = declarations;
    for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
      this.lineStarts.push(index + 1);
    }
  }

  public find(line: number, column: number): string {
    const offset = (this.lineStarts[line] ?? Number.POSITIVE_INFINITY) + column;
    let [low, high] = [0, this.declarations.length - 1];
    while (low <= high) {
      const middle = (low + high) >>> 1;
      const declaration = this.declarations[middle];
      if (declaration === undefined) {
        break;
      }
      if (offset < declaration.start) {
        high = middle - 1;
      } else if (offset >= declaration.end) {
        low = middle + 1;
      } else {
        return declaration.name;
      }
    }
    return TOP_LEVEL;
  }
}

async function indexDeclarations(
  source: Source,
  content: string | null | undefined,
): Promise<DeclarationIndex | undefined> {
  if (source.path === undefined) {
    return undefined;
  }
  let text = content ?? undefined;
  if (text === undefined) {
    try {
      text = await readFile(source.path, "utf8");
    } catch {
      return undefined;
    }
  }
  const declarations = listDeclarations(text, source.path);
  return declarations === undefined ? undefined : new DeclarationIndex(text, declarations);
}

function sortByBytes<T>(entries: [string, T][], bytesOf: (value: T) => number): [string, T][] {
  return entries
    .filter(([, value]) => bytesOf(value) > 0)
    .sort(([a, x], [b, y]) => bytesOf(y) - bytesOf(x) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Attributes every byte of a chunk to the source and declaration its map points it at.
 *
 * A byte belongs to the mapping segment that starts at or before it on its
 * line, and within the package's own files to the top-level declaration whose
 * span holds that segment's original position. Bytes before a line's first
 * segment, in a segment with no source, and the line breaks themselves are
 * unattributed, so file counts sum to the chunk's byte length and each file's
 * declarations sum to the file. A dependency, or a file that cannot be read or
 * parsed, has no declarations.
 * @param chunk Chunk generated with a source map whose sources are absolute paths.
 * @param packageDirectory Directory the package's files are named relative to.
 * @returns Bytes by source, largest first.
 */
export async function attributeBytes(
  chunk: OutputChunk,
  packageDirectory: string,
): Promise<Record<string, SourceSize>> {
  const map = chunk.map;
  const sources = (map?.sources ?? []).map((source) => describeSource(source, packageDirectory));
  const indexes = await Promise.all(
    sources.map((source, index) => indexDeclarations(source, map?.sourcesContent?.[index])),
  );
  const files = new Map<string, { bytes: number; declarations?: Map<string, number> }>();
  const add = (sourceIndex: number | undefined, text: string, line = 0, column = 0): void => {
    const bytes = Buffer.byteLength(text, "utf8");
    const source = sourceIndex === undefined ? undefined : sources[sourceIndex];
    const key = source?.key ?? UNATTRIBUTED;
    const index = sourceIndex === undefined ? undefined : indexes[sourceIndex];
    const file = files.get(key) ?? { bytes: 0, declarations: index === undefined ? undefined : new Map() };
    files.set(key, file);
    file.bytes += bytes;
    if (file.declarations !== undefined && index !== undefined) {
      const name = index.find(line, column);
      file.declarations.set(name, (file.declarations.get(name) ?? 0) + bytes);
    }
  };

  const lines = chunk.code.split("\n");
  const mappings = map?.mappings.split(";") ?? [];
  // Source index, original line, and original column carry across lines; the
  // generated column restarts on each.
  let [sourceIndex, originalLine, originalColumn] = [0, 0, 0];
  lines.forEach((text, lineIndex) => {
    const segments: { column: number; line: number; originalColumn: number; source?: number }[] = [];
    let column = 0;
    for (const segment of mappings[lineIndex]?.split(",") ?? []) {
      if (segment === "") {
        continue;
      }
      const [columnDelta = 0, sourceDelta, lineDelta = 0, originalColumnDelta = 0] = decodeVlq(segment);
      column += columnDelta;
      if (sourceDelta === undefined) {
        segments.push({ column, line: 0, originalColumn: 0 });
        continue;
      }
      sourceIndex += sourceDelta;
      originalLine += lineDelta;
      originalColumn += originalColumnDelta;
      segments.push({ column, line: originalLine, originalColumn, source: sourceIndex });
    }
    add(undefined, text.slice(0, segments[0]?.column ?? text.length));
    segments.forEach((segment, index) => {
      const end = segments[index + 1]?.column ?? text.length;
      add(segment.source, text.slice(segment.column, end), segment.line, segment.originalColumn);
    });
    if (lineIndex < lines.length - 1) {
      add(undefined, "\n");
    }
  });

  return Object.fromEntries(
    sortByBytes([...files], ({ bytes }) => bytes).map(([key, { bytes, declarations }]) => [
      key,
      declarations === undefined
        ? { bytes }
        : { bytes, declarations: Object.fromEntries(sortByBytes([...declarations], (count) => count)) },
    ]),
  );
}
