// TypeDoc `ReflectionKind` values for the declaration kinds the reference covers.
const KIND_MODULE = 2;
const KIND_NAMESPACE = 4;
const KIND_ENUM = 8;
const KIND_ENUM_MEMBER = 16;
const KIND_VARIABLE = 32;
const KIND_FUNCTION = 64;
const KIND_CLASS = 128;
const KIND_INTERFACE = 256;
const KIND_CONSTRUCTOR = 512;
const KIND_PROPERTY = 1024;
const KIND_METHOD = 2048;
const KIND_ACCESSOR = 262144;
const KIND_TYPE_ALIAS = 2097152;
const KIND_REFERENCE = 4194304;

const SYMBOL_KIND_BY_REFLECTION: ReadonlyMap<number, ReferenceSymbolKind> = new Map([
  [KIND_FUNCTION, "function"],
  [KIND_CLASS, "class"],
  [KIND_INTERFACE, "interface"],
  [KIND_TYPE_ALIAS, "type-alias"],
  [KIND_ENUM, "enum"],
  [KIND_VARIABLE, "variable"],
  [KIND_NAMESPACE, "namespace"],
]);

// The order symbol groups appear on a page, per docs/specs/packages-reference.md.
const SYMBOL_KIND_ORDER: readonly ReferenceSymbolKind[] = [
  "function",
  "class",
  "interface",
  "type-alias",
  "enum",
  "variable",
  "namespace",
];

/** A declaration kind the reference renders as its own symbol section. */
export type ReferenceSymbolKind = "function" | "class" | "interface" | "type-alias" | "enum" | "variable" | "namespace";

/** A member kind inside a class, interface, or enum. */
export type ReferenceMemberKind = "constructor" | "property" | "method" | "accessor" | "enum-member";

/** A named entry documented from a `@param` or `@typeParam` tag. */
export interface ReferenceNamedDoc {
  /** Parameter or type-parameter name. */
  name: string;
  /** Rendered Markdown describing it, when the tag carried a description. */
  doc?: string;
}

/** One member of a class, interface, or enum. */
export interface ReferenceMember {
  /** Member name as declared. */
  name: string;
  /** Member kind. */
  kind: ReferenceMemberKind;
  /** Whether the member is optional (`?`). */
  isOptional: boolean;
  /** Whether the member is `readonly`. */
  isReadonly: boolean;
  /** Whether the member is `static`. */
  isStatic: boolean;
  /** Rendered Markdown summary, when the member carries TSDoc. */
  doc?: string;
  /** `@deprecated` text, or `true` when the tag was present without one. */
  deprecated?: string | true;
  /** Parameter docs for a method or constructor. */
  parameters: ReferenceNamedDoc[];
  /** Declaration text sliced from the emitted `.d.ts`, attached after the model is built. */
  signature?: string;
}

/** One public symbol reachable from an entrypoint. */
export interface ReferenceSymbol {
  /** Symbol name as exported. `default` for an anonymous default export. */
  name: string;
  /** Declaration kind. */
  kind: ReferenceSymbolKind;
  /** Rendered Markdown summary and remarks, when the symbol carries TSDoc. */
  doc?: string;
  /** `@deprecated` text, or `true` when the tag was present without one. */
  deprecated?: string | true;
  /** `@typeParam` docs, in declaration order. */
  typeParameters: ReferenceNamedDoc[];
  /** `@param` docs for a function, in declaration order. */
  parameters: ReferenceNamedDoc[];
  /** `@returns` text for a function, when present. */
  returns?: string;
  /** Every `@throws` entry, in source order. */
  throws: string[];
  /** Every `@example` block, in source order. */
  examples: string[];
  /** Every `@see` entry, in source order. */
  see: string[];
  /** `@defaultValue` text for a variable or property, when present. */
  defaultValue?: string;
  /** `@since` version text, when the symbol carries the tag. */
  since?: string;
  /** Members of a class, interface, or enum; empty otherwise. */
  members: ReferenceMember[];
  /** Source file (repo-relative POSIX) and 1-based line the declaration starts on. */
  source?: { fileName: string; line: number };
  /** Repo-relative source file the real declaration lives in, when this symbol is a re-export. */
  reexportedFrom?: string;
  /** Declaration text sliced from the emitted `.d.ts`, attached after the model is built. */
  signature?: string;
}

/** One documented entrypoint and its ordered symbols. */
export interface ReferenceEntrypoint {
  /** `package.json` `exports` subpath key, such as `"."` or `"./registries/browser"`. */
  subpath: string;
  /** TypeDoc module name the symbols came from, such as `index` or `registries/browser`. */
  module: string;
  /**
   * One-line summary from the entry module's `@packageDocumentation` TSDoc, for the
   * page `description` frontmatter. Absent when the entry file carries no such comment.
   */
  description?: string;
  /**
   * Version the entrypoint first shipped in, from a `@since` tag on the entry module's
   * `@packageDocumentation` comment. Absent when the tag is not present.
   */
  since?: string;
  /** Symbols ordered by kind group, then alphabetically within a group. */
  symbols: ReferenceSymbol[];
}

/** An export the page model has no group for, so it was left undocumented. */
export interface UnsupportedExport {
  /** Entrypoint subpath it was exported from. */
  subpath: string;
  /** Export name. */
  name: string;
}

/** A package's complete generated-reference data, before Markdown rendering. */
export interface ReferenceModel {
  /** Published package name. */
  packageName: string;
  /** Documented entrypoints, in the order their subpaths were supplied. */
  entrypoints: ReferenceEntrypoint[];
  /** Exports skipped because their declaration kind has no page group. */
  unsupported: UnsupportedExport[];
}

interface CommentPart {
  kind: string;
  text?: string;
  tag?: string;
  target?: unknown;
}

interface Comment {
  summary?: CommentPart[];
  blockTags?: { tag?: string; name?: string; content?: CommentPart[] }[];
}

interface ReflectionFlags {
  isExternal?: boolean;
  isOptional?: boolean;
  isReadonly?: boolean;
  isStatic?: boolean;
  isInherited?: boolean;
}

interface SourceReference {
  fileName?: unknown;
  line?: unknown;
}

interface Reflection {
  id?: unknown;
  name?: unknown;
  kind?: unknown;
  variant?: unknown;
  flags?: ReflectionFlags;
  comment?: Comment;
  children?: Reflection[];
  signatures?: Reflection[];
  parameters?: Reflection[];
  typeParameters?: Reflection[];
  sources?: SourceReference[];
  groups?: unknown;
  target?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripLeadingDotSlash(fileName: string): string {
  const normalized = fileName.replaceAll("\\", "/");
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

/**
 * Flattens TypeDoc comment parts into a Markdown string.
 *
 * `{@link Target}` inline tags are kept verbatim; the Markdown renderer resolves
 * them to page links against the symbols it knows, falling back to inline code.
 */
function renderParts(parts: CommentPart[] | undefined): string {
  if (parts === undefined) {
    return "";
  }

  return parts
    .map((part) => {
      if (part.kind === "inline-tag") {
        const label = (part.text ?? "").trim();
        return label === "" ? "" : `{@link ${label}}`;
      }
      return part.text ?? "";
    })
    .join("")
    .trim();
}

function renderComment(comment: Comment | undefined): string | undefined {
  const summary = renderParts(comment?.summary);
  const remarks = blockTagText(comment, "@remarks");
  const body = [summary, remarks].filter((text) => text !== "").join("\n\n");
  return body === "" ? undefined : body;
}

/** The entry module's `@packageDocumentation` summary, collapsed to a single line for frontmatter. */
function moduleSummary(comment: Comment | undefined): string | undefined {
  const text = renderParts(comment?.summary).replace(/\s+/g, " ").trim();
  return text === "" ? undefined : text;
}

function blockTags(comment: Comment | undefined, tag: string): string[] {
  return (comment?.blockTags ?? [])
    .filter((entry) => entry.tag === tag)
    .map((entry) => renderParts(entry.content))
    .filter((text) => text !== "");
}

function blockTagText(comment: Comment | undefined, tag: string): string {
  return blockTags(comment, tag).join("\n\n");
}

function optionalBlockTagText(comment: Comment | undefined, tag: string): string | undefined {
  const text = blockTagText(comment, tag);
  return text === "" ? undefined : text;
}

function deprecation(comment: Comment | undefined): string | true | undefined {
  const present = (comment?.blockTags ?? []).some((entry) => entry.tag === "@deprecated");
  if (!present) {
    return undefined;
  }
  const text = blockTagText(comment, "@deprecated");
  return text === "" ? true : text;
}

/** Reads `@param` / `@typeParam` descriptions, keyed by the names the declaration provides. */
function namedDocs(declared: Reflection[] | undefined, comment: Comment | undefined, tag: string): ReferenceNamedDoc[] {
  const described = new Map<string, string>();
  for (const entry of comment?.blockTags ?? []) {
    if (entry.tag === tag && typeof entry.name === "string") {
      described.set(entry.name, renderParts(entry.content));
    }
  }

  return (declared ?? [])
    .map((reflection) => reflection.name)
    .filter((name): name is string => typeof name === "string")
    .map((name) => {
      const doc = described.get(name);
      return doc === undefined || doc === "" ? { name } : { name, doc };
    });
}

function memberKind(kind: number): ReferenceMemberKind | undefined {
  switch (kind) {
    case KIND_CONSTRUCTOR:
      return "constructor";
    case KIND_PROPERTY:
      return "property";
    case KIND_METHOD:
      return "method";
    case KIND_ACCESSOR:
      return "accessor";
    case KIND_ENUM_MEMBER:
      return "enum-member";
    default:
      return undefined;
  }
}

/** The comment for a member: on the declaration, or on its first call signature. */
function memberComment(reflection: Reflection): Comment | undefined {
  return reflection.comment ?? reflection.signatures?.[0]?.comment;
}

function buildMember(reflection: Reflection): ReferenceMember | undefined {
  if (typeof reflection.kind !== "number" || typeof reflection.name !== "string") {
    return undefined;
  }
  if (reflection.flags?.isExternal === true) {
    return undefined;
  }
  const kind = memberKind(reflection.kind);
  if (kind === undefined) {
    return undefined;
  }

  const comment = memberComment(reflection);
  const signature = reflection.signatures?.[0];
  return {
    deprecated: deprecation(comment),
    doc: renderComment(comment),
    isOptional: reflection.flags?.isOptional === true,
    isReadonly: reflection.flags?.isReadonly === true,
    isStatic: reflection.flags?.isStatic === true,
    kind,
    name: reflection.name,
    parameters: namedDocs(signature?.parameters, comment, "@param"),
  };
}

function sortMembers(members: ReferenceMember[]): ReferenceMember[] {
  const order: Record<ReferenceMemberKind, number> = {
    constructor: 0,
    "enum-member": 1,
    property: 2,
    accessor: 3,
    method: 4,
  };
  return [...members].sort(
    (left, right) => order[left.kind] - order[right.kind] || left.name.localeCompare(right.name),
  );
}

/** The comment for a symbol: on the declaration, or on its first call signature. */
function symbolComment(reflection: Reflection): Comment | undefined {
  return reflection.comment ?? reflection.signatures?.[0]?.comment;
}

function buildSource(sources: SourceReference[] | undefined): ReferenceSymbol["source"] {
  const first = sources?.[0];
  if (first === undefined || typeof first.fileName !== "string" || typeof first.line !== "number") {
    return undefined;
  }
  return { fileName: stripLeadingDotSlash(first.fileName), line: first.line };
}

function buildSymbol(
  reflection: Reflection,
  resolve: (id: number) => Reflection | undefined,
): ReferenceSymbol | undefined {
  const name = reflection.name;
  if (typeof name !== "string") {
    return undefined;
  }

  let declaration = reflection;
  let reexportedFrom: string | undefined;
  if (reflection.kind === KIND_REFERENCE) {
    const targetId = typeof reflection.target === "number" ? reflection.target : undefined;
    const target = targetId === undefined ? undefined : resolve(targetId);
    if (target === undefined) {
      return undefined;
    }
    reexportedFrom = sourceFileOf(target);
    declaration = target;
  }

  if (typeof declaration.kind !== "number") {
    return undefined;
  }
  const kind = SYMBOL_KIND_BY_REFLECTION.get(declaration.kind);
  if (kind === undefined) {
    return undefined;
  }

  const comment = symbolComment(declaration);
  const signature = declaration.signatures?.[0];
  const members =
    kind === "class" || kind === "interface" || kind === "enum"
      ? sortMembers((declaration.children ?? []).flatMap((child) => buildMember(child) ?? []))
      : [];

  return {
    deprecated: deprecation(comment),
    doc: renderComment(comment),
    defaultValue: optionalBlockTagText(comment, "@defaultValue"),
    examples: blockTags(comment, "@example"),
    kind,
    members,
    name,
    parameters: namedDocs(signature?.parameters, comment, "@param"),
    reexportedFrom,
    returns: optionalBlockTagText(comment, "@returns"),
    see: blockTags(comment, "@see"),
    since: optionalBlockTagText(comment, "@since"),
    source: buildSource(declaration.sources ?? reflection.sources),
    throws: blockTags(comment, "@throws"),
    typeParameters: namedDocs(signature?.typeParameters ?? declaration.typeParameters, comment, "@typeParam"),
  };
}

function sortSymbols(symbols: ReferenceSymbol[]): ReferenceSymbol[] {
  return [...symbols].sort(
    (left, right) =>
      SYMBOL_KIND_ORDER.indexOf(left.kind) - SYMBOL_KIND_ORDER.indexOf(right.kind) ||
      left.name.localeCompare(right.name),
  );
}

function indexReflections(project: Reflection): (id: number) => Reflection | undefined {
  const byId = new Map<number, Reflection>();
  const visit = (reflection: Reflection): void => {
    if (typeof reflection.id === "number") {
      byId.set(reflection.id, reflection);
    }
    for (const child of reflection.children ?? []) {
      visit(child);
    }
  };
  visit(project);
  return (id) => byId.get(id);
}

function isModule(reflection: Reflection): boolean {
  return Array.isArray(reflection.children) && reflection.kind === KIND_MODULE;
}

/** Repo-relative source file a re-exported declaration lives in, for `reexportedFrom`. */
function sourceFileOf(target: Reflection): string | undefined {
  const fileName = target.sources?.[0]?.fileName;
  return typeof fileName === "string" ? stripLeadingDotSlash(fileName) : undefined;
}

/**
 * Transforms a TypeDoc JSON project into the presentation-neutral reference model.
 *
 * Signature text is not produced here: {@link ReferenceSymbol.signature} and
 * {@link ReferenceMember.signature} are filled from the emitted `.d.ts` after this
 * model is built. `{@link Name}` inline tags are kept verbatim for the renderer to
 * resolve. Members inherited from outside the package (`flags.isExternal`) are dropped.
 * @param project Parsed `typedoc --json` output.
 * @param subpathByModule Maps each TypeDoc module name to its `exports` subpath key.
 * @returns The reference model, with entrypoints in the order `subpathByModule` iterates.
 * @throws When `project` is not an object or names a module with no mapped subpath.
 */
export function buildReferenceModel(project: unknown, subpathByModule: Record<string, string>): ReferenceModel {
  if (!isRecord(project)) {
    throw new Error("Invalid TypeDoc project: expected an object.");
  }

  const root = project as Reflection;
  const resolve = indexReflections(root);
  const packageName = typeof root.name === "string" ? root.name : "";

  const modules = (root.children ?? []).filter(isModule);
  const entrypoints: ReferenceEntrypoint[] = [];
  const unsupported: UnsupportedExport[] = [];

  for (const [module, subpath] of Object.entries(subpathByModule)) {
    const reflection = modules.find((candidate) => candidate.name === module);
    const children = reflection?.children ?? [];
    for (const child of children) {
      if (
        typeof child.name === "string" &&
        typeof child.kind === "number" &&
        child.kind !== KIND_REFERENCE &&
        !SYMBOL_KIND_BY_REFLECTION.has(child.kind)
      ) {
        unsupported.push({ name: child.name, subpath });
      }
    }
    entrypoints.push({
      description: moduleSummary(reflection?.comment),
      module,
      since: optionalBlockTagText(reflection?.comment, "@since"),
      subpath,
      symbols: sortSymbols(children.flatMap((child) => buildSymbol(child, resolve) ?? [])),
    });
  }

  return { entrypoints, packageName, unsupported };
}
