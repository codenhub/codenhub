import { posix } from "node:path";

import ts from "typescript";

import type { ReferenceEntrypoint, ReferenceModel, ReferenceSymbol } from "./reference-model.ts";

/** Declaration text sliced from one emitted `.d.ts` for a single exported symbol. */
export interface SymbolSignature {
  /**
   * The declaration text. A function keeps its full signature (a `.d.ts` function
   * has no body); a class or interface keeps only its header — modifiers, name,
   * type parameters, and heritage; a type alias, variable, or enum keeps the whole
   * declaration.
   */
  text: string;
  /** Extra overload declaration texts for a function, in source order; `text` is the first. */
  overloads?: string[];
  /** Member name to its one-line declaration text, for a class, interface, or enum. */
  members?: Map<string, string>;
}

/** Every exported symbol's signature from one `.d.ts`, keyed by symbol name. */
export type SignatureIndex = Map<string, SymbolSignature>;

const DEFAULT_EXPORT_NAME = "default";

function hasModifier(node: ts.HasModifiers, kind: ts.SyntaxKind): boolean {
  return ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false;
}

function isExported(node: ts.HasModifiers): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

function declaredName(name: ts.Identifier | undefined, node: ts.HasModifiers): string | undefined {
  if (name !== undefined) {
    return name.text;
  }
  return hasModifier(node, ts.SyntaxKind.DefaultKeyword) ? DEFAULT_EXPORT_NAME : undefined;
}

function typeParametersText(
  parameters: ts.NodeArray<ts.TypeParameterDeclaration> | undefined,
  source: ts.SourceFile,
): string {
  if (parameters === undefined || parameters.length === 0) {
    return "";
  }
  return `<${parameters.map((parameter) => parameter.getText(source)).join(", ")}>`;
}

/** Rebuilds the `export declare class Foo<T> extends Bar` header without the `{ ... }` body. */
function headerText(
  node: ts.ClassDeclaration | ts.InterfaceDeclaration | ts.FunctionDeclaration,
  source: ts.SourceFile,
): string {
  const modifiers = (ts.getModifiers(node) ?? []).map((modifier) => modifier.getText(source));
  const keyword = ts.isClassDeclaration(node) ? "class" : ts.isInterfaceDeclaration(node) ? "interface" : "function";
  const name = declaredName(node.name, node) ?? "";

  if (ts.isFunctionDeclaration(node)) {
    // A `.d.ts` function has no body, so its full text is already just the signature.
    return node.getText(source).replace(/;?\s*$/, ";");
  }

  const heritage = (node.heritageClauses ?? []).map((clause) => clause.getText(source));
  return [...modifiers, keyword, `${name}${typeParametersText(node.typeParameters, source)}`, ...heritage]
    .filter((part) => part !== "")
    .join(" ");
}

function memberEntries(members: ts.NodeArray<ts.ClassElement | ts.TypeElement | ts.EnumMember>, source: ts.SourceFile) {
  const entries = new Map<string, string>();
  for (const member of members) {
    const name = member.name;
    if (name === undefined || !(ts.isIdentifier(name) || ts.isStringLiteral(name))) {
      continue;
    }
    if (ts.canHaveModifiers(member) && hasModifier(member, ts.SyntaxKind.PrivateKeyword)) {
      continue;
    }
    entries.set(name.text, member.getText(source).replace(/\s+/g, " ").trim());
  }
  return entries;
}

function addSignature(index: SignatureIndex, name: string, signature: SymbolSignature): void {
  const existing = index.get(name);
  if (existing === undefined) {
    index.set(name, signature);
    return;
  }
  // A repeated name is a function overload set.
  existing.overloads = [...(existing.overloads ?? []), signature.text];
}

function collectDeclarations(source: ts.SourceFile): SignatureIndex {
  const index: SignatureIndex = new Map();

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && isExported(statement)) {
      const name = declaredName(statement.name, statement);
      if (name !== undefined) {
        addSignature(index, name, { text: headerText(statement, source) });
      }
      continue;
    }

    if ((ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && isExported(statement)) {
      const name = declaredName(statement.name, statement);
      if (name !== undefined) {
        index.set(name, { members: memberEntries(statement.members, source), text: headerText(statement, source) });
      }
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement) && isExported(statement)) {
      index.set(statement.name.text, { text: statement.getText(source) });
      continue;
    }

    if (ts.isEnumDeclaration(statement) && isExported(statement)) {
      index.set(statement.name.text, {
        members: memberEntries(statement.members, source),
        text: `${(ts.getModifiers(statement) ?? []).map((modifier) => modifier.getText(source)).join(" ")} enum ${statement.name.text}`.trim(),
      });
      continue;
    }

    if (ts.isVariableStatement(statement) && isExported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const keyword = statement.declarationList.flags & ts.NodeFlags.Const ? "const" : "let";
          const modifiers = (ts.getModifiers(statement) ?? []).map((modifier) => modifier.getText(source));
          index.set(declaration.name.text, {
            text: [...modifiers, keyword, declaration.getText(source)].filter((part) => part !== "").join(" "),
          });
        }
      }
      continue;
    }

    if (ts.isModuleDeclaration(statement) && isExported(statement) && ts.isIdentifier(statement.name)) {
      index.set(statement.name.text, { text: `namespace ${statement.name.text}` });
    }
  }

  return index;
}

/**
 * Slices exported declaration text out of one emitted `.d.ts`.
 *
 * The file is parsed on its own — no type program — because declaration files are
 * already resolved and only their text is wanted. `export ... from` re-export
 * statements are ignored here; {@link buildSignatureResolver} follows those across
 * files.
 * @param dtsText Contents of a single `.d.ts` file.
 * @param fileName Name used in parser diagnostics only.
 * @returns Signatures for every declaration in the file, keyed by name.
 */
export function extractSignatures(dtsText: string, fileName = "module.d.ts"): SignatureIndex {
  return collectDeclarations(ts.createSourceFile(fileName, dtsText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
}

/** One `export ... from "./other"` edge out of a `.d.ts`. */
interface ReexportEdge {
  /** The `from` module specifier, such as `./result.js`. */
  module: string;
  /** `true` for `export * from`. */
  all: boolean;
  /** Exported name to the name it has in the target module, for `export { a, b as c } from`. */
  names: Map<string, string>;
}

function collectReexports(source: ts.SourceFile): ReexportEdge[] {
  const edges: ReexportEdge[] = [];
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier === undefined) {
      continue;
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const module = statement.moduleSpecifier.text;
    if (statement.exportClause === undefined) {
      edges.push({ all: true, module, names: new Map() });
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) {
      continue;
    }
    const names = new Map<string, string>();
    for (const element of statement.exportClause.elements) {
      names.set(element.name.text, (element.propertyName ?? element.name).text);
    }
    edges.push({ all: false, module, names });
  }
  return edges;
}

/** Candidate `.d.ts` paths a module specifier could resolve to, relative to `fromPath`. */
function resolveDtsCandidates(fromPath: string, specifier: string): string[] {
  const base = posix.normalize(
    posix.join(posix.dirname(fromPath), specifier.replace(/\.d\.ts$/, "").replace(/\.js$/, "")),
  );
  return [`${base}.d.ts`, `${base}/index.d.ts`];
}

/** Resolves a symbol's signature to whichever `.d.ts` actually declares it, following re-exports. */
export interface SignatureResolver {
  /**
   * @param entryPath Key of the entrypoint `.d.ts` in the files given to {@link buildSignatureResolver}.
   * @param name Exported symbol name.
   * @returns Its signature, or `undefined` when no file in the set declares it.
   */
  lookup(entryPath: string, name: string): SymbolSignature | undefined;
}

/**
 * Builds a resolver over a package's emitted `.d.ts` files.
 *
 * A published entrypoint `.d.ts` is often a barrel that only re-exports from
 * sibling files, so a symbol's real declaration usually lives elsewhere. The
 * resolver walks `export { ... } from` and `export * from` edges to find it.
 * @param files Emitted `.d.ts` contents keyed by POSIX path (any consistent root).
 * @returns A resolver whose `lookup` keys are those same paths.
 */
export function buildSignatureResolver(files: ReadonlyMap<string, string>): SignatureResolver {
  const declarations = new Map<string, SignatureIndex>();
  const reexports = new Map<string, ReexportEdge[]>();
  for (const [path, text] of files) {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    declarations.set(path, collectDeclarations(source));
    reexports.set(path, collectReexports(source));
  }

  const resolveEdgeTarget = (fromPath: string, specifier: string): string | undefined =>
    resolveDtsCandidates(fromPath, specifier).find((candidate) => files.has(candidate));

  const lookup = (entryPath: string, name: string, seen: Set<string>): SymbolSignature | undefined => {
    if (seen.has(entryPath)) {
      return undefined;
    }
    seen.add(entryPath);

    const direct = declarations.get(entryPath)?.get(name);
    if (direct !== undefined) {
      return direct;
    }

    for (const edge of reexports.get(entryPath) ?? []) {
      const targetPath = resolveEdgeTarget(entryPath, edge.module);
      if (targetPath === undefined) {
        continue;
      }
      const targetName = edge.all ? name : edge.names.get(name);
      if (targetName === undefined) {
        continue;
      }
      const found = lookup(targetPath, targetName, seen);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  };

  return { lookup: (entryPath, name) => lookup(entryPath, name, new Set()) };
}

function withSignature(symbol: ReferenceSymbol, index: SignatureIndex | undefined): ReferenceSymbol {
  const found = index?.get(symbol.name);
  if (found === undefined) {
    return symbol;
  }
  return {
    ...symbol,
    members: symbol.members.map((member) => {
      const text = found.members?.get(member.name);
      return text === undefined ? member : { ...member, signature: text };
    }),
    signature: found.text,
  };
}

/**
 * Fills the `signature` fields of a reference model from per-module signature indexes.
 * @param model Model produced by `buildReferenceModel`.
 * @param signaturesByModule Signature index for each entrypoint, keyed by its `module` name.
 * @returns A new model with symbol and member `signature` text attached where a match was found.
 */
export function attachSignatures(
  model: ReferenceModel,
  signaturesByModule: Map<string, SignatureIndex>,
): ReferenceModel {
  const entrypoints: ReferenceEntrypoint[] = model.entrypoints.map((entrypoint) => ({
    ...entrypoint,
    symbols: entrypoint.symbols.map((symbol) => withSignature(symbol, signaturesByModule.get(entrypoint.module))),
  }));
  return { ...model, entrypoints };
}
