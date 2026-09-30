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
  /**
   * Bare name of the type this member is inherited from, when it is not declared
   * in place. Set for a member reached through `extends`; the empty string when
   * the member is inherited but the source type could not be named. An inherited
   * member carries no `doc`, `signature`, or parameter docs — it is rendered as a
   * link to the type that declares it, per `docs/specs/packages-reference.md`.
   */
  inheritedFrom?: string;
  /** Rendered Markdown summary, when the member carries TSDoc. */
  doc?: string;
  /** `@deprecated` text, or `true` when the tag was present without one. */
  deprecated?: string | true;
  /** Parameter docs for a method or constructor. */
  parameters: ReferenceNamedDoc[];
  /** Declaration text sliced from the emitted `.d.ts`, attached after the model is built. */
  signature?: string;
}

/** The TSDoc-derived prose of a symbol or of one of its overloads. */
export interface ReferenceProse {
  /** Rendered Markdown summary and remarks, when the declaration carries TSDoc. */
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
  /** `@since` version text, when the declaration carries the tag. */
  since?: string;
}

/** One overload of a function whose overloads carry their own TSDoc. */
export interface ReferenceOverload extends ReferenceProse {
  /** This overload's declaration text from the emitted `.d.ts`, attached after the model is built. */
  signature?: string;
}

/** One public symbol reachable from an entrypoint. */
export interface ReferenceSymbol extends ReferenceProse {
  /** Symbol name as exported. `default` for an anonymous default export. */
  name: string;
  /** Declaration kind. */
  kind: ReferenceSymbolKind;
  /** `@defaultValue` text for a variable or property, when present. */
  defaultValue?: string;
  /**
   * Each overload, in source order, when the overloads carry different TSDoc; empty when
   * there is one signature or every overload shares one comment. When set, the symbol's
   * own prose fields repeat the first commented overload's, for consumers that read one.
   */
  overloads: ReferenceOverload[];
  /** Members of a class, interface, or enum; empty otherwise. */
  members: ReferenceMember[];
  /**
   * Symbols a namespace declares, ordered like entrypoint symbols. Set on a namespace,
   * and on any symbol merged with a namespace of the same name, such as an interface
   * that also carries a namespace of related types; empty otherwise.
   */
  namespaceMembers: ReferenceSymbol[];
  /** Source file (repo-relative POSIX) and 1-based line the declaration starts on. */
  source?: { fileName: string; line: number };
  /** Repo-relative source file the real declaration lives in, when this symbol is a re-export. */
  reexportedFrom?: string;
  /** Declaration text sliced from the emitted `.d.ts`, attached after the model is built. */
  signature?: string;
}

/**
 * An unexported type that a documented declaration names. It has no import path, so
 * it is listed for reading only, with its declaration text from the emitted `.d.ts`.
 */
export interface ReferenceInternalType {
  /** The type's name in its declaring file. */
  name: string;
  /** Its declaration text from the emitted `.d.ts`. */
  signature: string;
  /** Rendered Markdown from its TSDoc summary, when it has one. */
  doc?: string;
  /** Package-relative source files declaring it with this same text, such as `src/composition/object.ts`. */
  declaredIn: string[];
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
  /** Unexported types this entrypoint's declarations name, alphabetically; attached after the model is built. */
  internalTypes: ReferenceInternalType[];
}

/** An export the page model has no group for, so it was left undocumented. */
export interface UnsupportedExport {
  /** Entrypoint subpath it was exported from. */
  subpath: string;
  /** Export name. */
  name: string;
}

/** A same-package type a public declaration names, but no reference page documents. */
export interface UnresolvedTypeReference {
  /** Entrypoint subpath the naming symbol is documented on. */
  subpath: string;
  /** Qualified name of the documented symbol whose declaration names the type. */
  symbol: string;
  /** The type's name as written in the declaration. */
  name: string;
  /** Package-relative source file that declares the type, when TypeDoc recorded it. */
  declaredIn?: string;
}

/** A symbol or member section that would render nothing a reader can use. */
export interface EmptySection {
  /** Entrypoint subpath the section is on. */
  subpath: string;
  /** Dot-qualified section name, such as `Schema`, `Schema.Props`, or `Schema.Props.vendor`. */
  section: string;
  /** `no signature` when no declaration text was found; `no members` for a namespace that lists nothing. */
  reason: "no signature" | "no members";
}

/** A package's complete generated-reference data, before Markdown rendering. */
export interface ReferenceModel {
  /** Published package name. */
  packageName: string;
  /** Documented entrypoints, in the order their subpaths were supplied. */
  entrypoints: ReferenceEntrypoint[];
  /** Exports skipped because their declaration kind has no page group. */
  unsupported: UnsupportedExport[];
  /**
   * Same-package types named by documented declarations but documented nowhere, in page
   * order. Those later found as unexported declarations move to `internalTypes`.
   */
  unresolved: UnresolvedTypeReference[];
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

interface InheritedFrom {
  name?: unknown;
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
  inheritedFrom?: InheritedFrom;
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

/**
 * Reads `@param` / `@typeParam` descriptions for a function's parameters or type
 * parameters.
 *
 * TypeDoc resolves a `@param`/`@typeParam` tag it can match by name onto that
 * parameter reflection's own `comment`, not onto a `blockTags` entry on the
 * parent signature — so the declaration list is the primary source. A tag
 * TypeDoc could not match (a stale name, for instance) stays a `blockTags`
 * entry on the parent and is used only when the parameter has no comment of
 * its own.
 */
function namedDocs(declared: Reflection[] | undefined, comment: Comment | undefined, tag: string): ReferenceNamedDoc[] {
  const described = new Map<string, string>();
  for (const entry of comment?.blockTags ?? []) {
    if (entry.tag === tag && typeof entry.name === "string") {
      described.set(entry.name, renderParts(entry.content));
    }
  }

  // Overloads repeat names: keep each once, in first-seen order, with the first
  // description any overload gives it.
  const docs = new Map<string, string | undefined>();
  for (const reflection of declared ?? []) {
    const name = reflection.name;
    if (typeof name !== "string") {
      continue;
    }
    const own = renderParts(reflection.comment?.summary);
    const doc = own !== "" ? own : described.get(name);
    if (docs.get(name) === undefined) {
      docs.set(name, doc === "" ? undefined : doc);
    }
  }
  return [...docs].map(([name, doc]) => (doc === undefined ? { name } : { name, doc }));
}

/** Parameters or type parameters declared across every call signature, overloads included. */
function signatureParts(reflection: Reflection, part: "parameters" | "typeParameters"): Reflection[] | undefined {
  const signatures = reflection.signatures ?? [];
  return signatures.length === 0 ? undefined : signatures.flatMap((signature) => signature[part] ?? []);
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

/** The comment for a member or symbol: on the declaration, or on its first commented call signature. */
function declarationComment(reflection: Reflection): Comment | undefined {
  return reflection.comment ?? reflection.signatures?.find((signature) => signature.comment !== undefined)?.comment;
}

/**
 * The bare name of the type a member is inherited from, or `undefined` when the
 * member is declared in place. Returns the empty string when the member is
 * inherited but `inheritedFrom` carried no usable name.
 */
function inheritedTypeName(reflection: Reflection): string | undefined {
  if (reflection.flags?.isInherited !== true) {
    return undefined;
  }
  const qualified = reflection.inheritedFrom?.name;
  return typeof qualified === "string" && qualified !== "" ? (qualified.split(".")[0] ?? "") : "";
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

  const inheritedFrom = inheritedTypeName(reflection);
  if (inheritedFrom !== undefined) {
    // An inherited member is a pointer to its declaring type, not a second copy
    // of that type's documentation. The renderer turns it into a link.
    return {
      inheritedFrom,
      isOptional: reflection.flags?.isOptional === true,
      isReadonly: reflection.flags?.isReadonly === true,
      isStatic: reflection.flags?.isStatic === true,
      kind,
      name: reflection.name,
      parameters: [],
    };
  }

  const comment = declarationComment(reflection);
  return {
    deprecated: deprecation(comment),
    doc: renderComment(comment),
    isOptional: reflection.flags?.isOptional === true,
    isReadonly: reflection.flags?.isReadonly === true,
    isStatic: reflection.flags?.isStatic === true,
    kind,
    name: reflection.name,
    parameters: namedDocs(signatureParts(reflection, "parameters"), comment, "@param"),
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

function buildSource(sources: SourceReference[] | undefined): ReferenceSymbol["source"] {
  const first = sources?.[0];
  if (first === undefined || typeof first.fileName !== "string" || typeof first.line !== "number") {
    return undefined;
  }
  return { fileName: stripLeadingDotSlash(first.fileName), line: first.line };
}

/** A module or namespace child resolved to its declaration, following a re-export reference. */
interface ResolvedChild {
  name: string;
  kind: ReferenceSymbolKind;
  declaration: Reflection;
  exported: Reflection;
  reexportedFrom?: string;
}

function resolveChild(
  reflection: Reflection,
  resolve: (id: number) => Reflection | undefined,
): ResolvedChild | undefined {
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

  const kind = typeof declaration.kind === "number" ? SYMBOL_KIND_BY_REFLECTION.get(declaration.kind) : undefined;
  return kind === undefined ? undefined : { declaration, exported: reflection, kind, name, reexportedFrom };
}

/**
 * Builds one symbol from every declaration sharing its name.
 *
 * TypeScript merges an interface, class, function, or enum with a namespace of the
 * same name, and TypeDoc keeps them as separate reflections. A consumer imports one
 * name, so the reference documents one section: the kind, prose, and members come
 * from the declaration that sorts first by group, and the namespace's own symbols
 * become `namespaceMembers`.
 */
function buildSymbol(
  declarations: readonly ResolvedChild[],
  resolve: (id: number) => Reflection | undefined,
): ReferenceSymbol | undefined {
  const ordered = [...declarations].sort(
    (left, right) => SYMBOL_KIND_ORDER.indexOf(left.kind) - SYMBOL_KIND_ORDER.indexOf(right.kind),
  );
  const primary = ordered[0];
  if (primary === undefined) {
    return undefined;
  }
  const { declaration, kind, name } = primary;

  const comment = ordered
    .map((candidate) => declarationComment(candidate.declaration))
    .find((found) => found !== undefined);
  const members = sortMembers(
    ordered
      .filter((candidate) => candidate.kind === "class" || candidate.kind === "interface" || candidate.kind === "enum")
      .flatMap((candidate) => (candidate.declaration.children ?? []).flatMap((child) => buildMember(child) ?? [])),
  );
  const namespaceMembers = buildSymbols(
    ordered
      .filter((candidate) => candidate.kind === "namespace")
      .flatMap((candidate) => candidate.declaration.children ?? []),
    resolve,
  );

  return {
    deprecated: deprecation(comment),
    doc: renderComment(comment),
    defaultValue: optionalBlockTagText(comment, "@defaultValue"),
    examples: blockTags(comment, "@example"),
    kind,
    members,
    name,
    namespaceMembers,
    // Only a function's signatures are overloads with `.d.ts` lines to pair with; a
    // callable interface's call signatures sit inside its body.
    overloads: kind === "function" ? overloadsOf(declaration) : [],
    parameters: namedDocs(signatureParts(declaration, "parameters"), comment, "@param"),
    reexportedFrom: primary.reexportedFrom,
    returns: optionalBlockTagText(comment, "@returns"),
    see: blockTags(comment, "@see"),
    since: optionalBlockTagText(comment, "@since"),
    source: buildSource(declaration.sources ?? primary.exported.sources),
    throws: blockTags(comment, "@throws"),
    typeParameters: namedDocs(
      signatureParts(declaration, "typeParameters") ?? declaration.typeParameters,
      comment,
      "@typeParam",
    ),
  };
}

function proseOf(
  comment: Comment | undefined,
  parameters: Reflection[] | undefined,
  typeParameters: Reflection[] | undefined,
): ReferenceProse {
  return {
    deprecated: deprecation(comment),
    doc: renderComment(comment),
    examples: blockTags(comment, "@example"),
    parameters: namedDocs(parameters, comment, "@param"),
    returns: optionalBlockTagText(comment, "@returns"),
    see: blockTags(comment, "@see"),
    since: optionalBlockTagText(comment, "@since"),
    throws: blockTags(comment, "@throws"),
    typeParameters: namedDocs(typeParameters, comment, "@typeParam"),
  };
}

/**
 * Per-overload prose, when a declaration's overloads carry different TSDoc.
 *
 * TypeDoc copies one comment onto every overload it applies to, so identical comments
 * mean one description covers the whole overload set; only distinct ones are kept apart.
 */
function overloadsOf(declaration: Reflection): ReferenceOverload[] {
  const signatures = declaration.signatures ?? [];
  const comments = new Set(
    signatures.flatMap((signature) => (signature.comment === undefined ? [] : [JSON.stringify(signature.comment)])),
  );
  if (comments.size < 2) {
    return [];
  }
  return signatures.map((signature) => proseOf(signature.comment, signature.parameters, signature.typeParameters));
}

/** Groups a module's or namespace's children by exported name, resolving re-exports. */
function groupChildren(
  children: readonly Reflection[],
  resolve: (id: number) => Reflection | undefined,
): Map<string, ResolvedChild[]> {
  const byName = new Map<string, ResolvedChild[]>();
  for (const child of children) {
    const resolved = resolveChild(child, resolve);
    if (resolved !== undefined) {
      byName.set(resolved.name, [...(byName.get(resolved.name) ?? []), resolved]);
    }
  }
  return byName;
}

/** Builds the ordered symbols for a module's or namespace's children, merging same-name declarations. */
function buildSymbols(
  children: readonly Reflection[],
  resolve: (id: number) => Reflection | undefined,
): ReferenceSymbol[] {
  const groups = groupChildren(children, resolve).values();
  return sortSymbols([...groups].flatMap((declarations) => buildSymbol(declarations, resolve) ?? []));
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

// Keys whose references point at where a member came from, not at a type the
// declaration names; following them would report a base type's members twice.
const PROVENANCE_KEYS = new Set(["inheritedFrom", "overwrites", "implementationOf", "sources", "comment"]);

/** Names a declaration binds for its own use: type parameters, mapped-type keys, `infer` bindings. */
function boundTypeNames(node: unknown, names = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) {
      boundTypeNames(item, names);
    }
    return names;
  }
  if (!isRecord(node)) {
    return names;
  }
  if (node.type === "mapped" && typeof node.parameter === "string") {
    names.add(node.parameter);
  }
  if (node.type === "inferred" && typeof node.name === "string") {
    names.add(node.name);
  }
  if (Array.isArray(node.typeParameters)) {
    for (const parameter of node.typeParameters as unknown[]) {
      if (isRecord(parameter) && typeof parameter.name === "string") {
        names.add(parameter.name);
      }
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (!PROVENANCE_KEYS.has(key)) {
      boundTypeNames(value, names);
    }
  }
  return names;
}

/**
 * Same-package type references in a declaration that no reflection documents.
 *
 * TypeDoc points a reference at a numeric reflection id when the target is part of
 * the documented project, and at a symbol id naming its package otherwise. A symbol
 * id in this package means the declaration names a type a reader cannot look up.
 */
function unresolvedReferences(declaration: Reflection, packageName: string): { name: string; declaredIn?: string }[] {
  const bound = boundTypeNames(declaration);
  const found = new Map<string, string | undefined>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isRecord(node)) {
      return;
    }
    if (
      node.type === "reference" &&
      typeof node.name === "string" &&
      typeof node.target !== "number" &&
      node.package === packageName &&
      node.refersToTypeParameter !== true &&
      !bound.has(node.name) &&
      !found.has(node.name)
    ) {
      const target = isRecord(node.target) ? node.target : {};
      found.set(node.name, typeof target.packagePath === "string" ? target.packagePath : undefined);
    }
    for (const [key, value] of Object.entries(node)) {
      if (!PROVENANCE_KEYS.has(key)) {
        visit(value);
      }
    }
  };
  visit(declaration);
  return [...found].map(([name, declaredIn]) => (declaredIn === undefined ? { name } : { declaredIn, name }));
}

/**
 * Dot-qualified names of children whose declaration kind has no page group, including
 * those inside a namespace, whose supported children render as namespace members.
 */
function unsupportedNames(
  children: readonly Reflection[],
  resolve: (id: number) => Reflection | undefined,
  qualifier = "",
): string[] {
  return children.flatMap((child) => {
    if (typeof child.name !== "string" || typeof child.kind !== "number") {
      return [];
    }
    const qualified = qualifier === "" ? child.name : `${qualifier}.${child.name}`;
    if (child.kind !== KIND_REFERENCE && !SYMBOL_KIND_BY_REFLECTION.has(child.kind)) {
      return [qualified];
    }
    const declaration = resolveChild(child, resolve)?.declaration;
    return declaration?.kind === KIND_NAMESPACE ? unsupportedNames(declaration.children ?? [], resolve, qualified) : [];
  });
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
 * resolve. Members inherited from outside the package (`flags.isExternal`) are
 * dropped; members inherited from another type in the package are kept as a bare
 * reference to that type, without repeating its signature or prose.
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
  const unresolved: UnresolvedTypeReference[] = [];

  for (const [module, subpath] of Object.entries(subpathByModule)) {
    const reflection = modules.find((candidate) => candidate.name === module);
    const children = reflection?.children ?? [];
    for (const name of unsupportedNames(children, resolve)) {
      unsupported.push({ name, subpath });
    }
    const symbols = buildSymbols(children, resolve);
    entrypoints.push({
      description: moduleSummary(reflection?.comment),
      internalTypes: [],
      module,
      since: optionalBlockTagText(reflection?.comment, "@since"),
      subpath,
      symbols,
    });

    // Symbols follow page order, so findings do too; each name is reported once per symbol.
    const groups = groupChildren(children, resolve);
    for (const symbol of symbols) {
      const names = new Set<string>();
      for (const { declaration } of groups.get(symbol.name) ?? []) {
        for (const reference of unresolvedReferences(declaration, packageName)) {
          if (!names.has(reference.name)) {
            names.add(reference.name);
            unresolved.push({ ...reference, subpath, symbol: symbol.name });
          }
        }
      }
    }
  }

  return { entrypoints, packageName, unresolved, unsupported };
}

/**
 * Walks a symbol list depth-first with each symbol's dot-qualified name.
 * @param symbols Entrypoint symbols, or a symbol's `namespaceMembers`.
 * @param qualifier Names of the enclosing namespaces, dot-joined; empty at the top level.
 * @yields Each symbol followed by its namespace members, as `[qualifiedName, symbol]`.
 */
export function* walkSymbols(
  symbols: readonly ReferenceSymbol[],
  qualifier = "",
): Generator<[string, ReferenceSymbol]> {
  for (const symbol of symbols) {
    const qualified = qualifier === "" ? symbol.name : `${qualifier}.${symbol.name}`;
    yield [qualified, symbol];
    yield* walkSymbols(symbol.namespaceMembers, qualified);
  }
}

/**
 * Lists sections of a signature-attached model that would render nothing a reader can use.
 *
 * A symbol or declared member with no signature text renders as a bare heading, and a
 * namespace with no members renders a heading over nothing. An inherited member is
 * exempt: it links to the type that declares it instead of carrying a signature.
 * @param model Model after `attachSignatures`.
 * @returns Every empty section, in page order.
 */
export function findEmptySections(model: ReferenceModel): EmptySection[] {
  const empty: EmptySection[] = [];
  for (const entrypoint of model.entrypoints) {
    const { subpath } = entrypoint;
    for (const [section, symbol] of walkSymbols(entrypoint.symbols)) {
      if (symbol.signature === undefined) {
        empty.push({ reason: "no signature", section, subpath });
      } else if (symbol.overloads.some((overload) => overload.signature === undefined)) {
        // Overloads documented apart render their own blocks, so one that did not
        // line up with the `.d.ts` would render its prose under no signature.
        empty.push({ reason: "no signature", section: `${section} (overloads)`, subpath });
      }
      for (const member of symbol.members) {
        if (member.inheritedFrom === undefined && member.signature === undefined) {
          empty.push({ reason: "no signature", section: `${section}.${member.name}`, subpath });
        }
      }
      if (symbol.kind === "namespace" && symbol.namespaceMembers.length === 0) {
        empty.push({ reason: "no members", section, subpath });
      }
    }
  }
  return empty;
}
