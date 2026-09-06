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

/** `import("../types").ReadonlyErrorRegistry` → `ReadonlyErrorRegistry`; adds a terminating `;`. */
function tidy(text: string, terminate: boolean): string {
  const stripped = text.replace(/import\((["'])[^"']*\1\)\./g, "").trim();
  return terminate && !stripped.endsWith(";") ? `${stripped};` : stripped;
}

function modifiersText(node: ts.HasModifiers, source: ts.SourceFile): string {
  return (ts.getModifiers(node) ?? []).map((modifier) => modifier.getText(source)).join(" ");
}

function collectDeclarations(source: ts.SourceFile): SignatureIndex {
  const index: SignatureIndex = new Map();

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const name = declaredName(statement.name, statement);
      if (name !== undefined) {
        addSignature(index, name, { text: tidy(headerText(statement, source), true) });
      }
      continue;
    }

    if (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      const name = declaredName(statement.name, statement);
      if (name !== undefined) {
        index.set(name, {
          members: memberEntries(statement.members, source),
          text: tidy(headerText(statement, source), false),
        });
      }
      continue;
    }

    if (ts.isTypeAliasDeclaration(statement)) {
      index.set(statement.name.text, { text: tidy(statement.getText(source), true) });
      continue;
    }

    if (ts.isEnumDeclaration(statement)) {
      index.set(statement.name.text, {
        members: memberEntries(statement.members, source),
        text: `${modifiersText(statement, source)} enum ${statement.name.text}`.trim(),
      });
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const keyword = statement.declarationList.flags & ts.NodeFlags.Const ? "const" : "let";
          const parts = [modifiersText(statement, source), keyword, declaration.getText(source)].filter(
            (part) => part !== "",
          );
          index.set(declaration.name.text, { text: tidy(parts.join(" "), true) });
        }
      }
      continue;
    }

    if (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name)) {
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

/** An imported binding: `import { orig as local } from "./m"`. */
interface ImportBinding {
  module: string;
  original: string;
}

/** How one `.d.ts` connects an exported name to a declaration elsewhere. */
interface ModuleGraph {
  /** `export ... from` edges. */
  reexports: ReexportEdge[];
  /** `export { local as public }` with no `from`: public name to the local binding it points at. */
  localAliases: Map<string, string>;
  /** `import { orig as local } from "./m"`: local binding to where it came from. */
  imports: Map<string, ImportBinding>;
}

/**
 * Reads declaration-barrel edges for signature and documentation analysis.
 * @param source Parsed declaration file.
 * @returns Re-exports, local aliases, and imported bindings.
 */
export function collectModuleGraph(source: ts.SourceFile): ModuleGraph {
  const reexports: ReexportEdge[] = [];
  const localAliases = new Map<string, string>();
  const imports = new Map<string, ImportBinding>();

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause?.name !== undefined) {
        imports.set(clause.name.text, { module: statement.moduleSpecifier.text, original: DEFAULT_EXPORT_NAME });
      }
      const bindings = clause?.namedBindings;
      for (const element of bindings !== undefined && ts.isNamedImports(bindings) ? bindings.elements : []) {
        imports.set(element.name.text, {
          module: statement.moduleSpecifier.text,
          original: (element.propertyName ?? element.name).text,
        });
      }
      continue;
    }

    if (ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression)) {
      localAliases.set(DEFAULT_EXPORT_NAME, statement.expression.text);
      continue;
    }

    if (!ts.isExportDeclaration(statement)) {
      continue;
    }
    if (statement.moduleSpecifier === undefined) {
      if (statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          localAliases.set(element.name.text, (element.propertyName ?? element.name).text);
        }
      }
      continue;
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const module = statement.moduleSpecifier.text;
    if (statement.exportClause === undefined) {
      reexports.push({ all: true, module, names: new Map() });
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) {
      continue;
    }
    const names = new Map<string, string>();
    for (const element of statement.exportClause.elements) {
      names.set(element.name.text, (element.propertyName ?? element.name).text);
    }
    reexports.push({ all: false, module, names });
  }

  return { imports, localAliases, reexports };
}

/**
 * Lists declaration paths a relative module specifier could resolve to.
 * @param fromPath Importing declaration's POSIX path.
 * @param specifier Relative module specifier.
 * @returns Candidates in declaration resolution order.
 */
export function resolveDtsCandidates(fromPath: string, specifier: string): string[] {
  const base = posix.normalize(
    posix.join(posix.dirname(fromPath), specifier.replace(/\.d\.[cm]?ts$/, "").replace(/\.[cm]?js$/, "")),
  );
  if (/\.(?:cjs|d\.cts)$/.test(specifier)) {
    return [`${base}.d.cts`];
  }
  return [
    `${base}.d.ts`,
    `${base}.d.mts`,
    `${base}.d.cts`,
    `${base}/index.d.ts`,
    `${base}/index.d.mts`,
    `${base}/index.d.cts`,
  ];
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
  return buildModuleResolver(files, collectDeclarations);
}

/** Original declaration nodes and exported names reachable through declaration barrels. */
export interface DeclarationResolver {
  /** Resolves an exported name to its original declarations, including overloads. */
  lookup(entryPath: string, name: string): readonly ts.Node[] | undefined;
  /** Lists only top-level public names, including aliases and star re-exports. */
  exports(entryPath: string): string[];
}

function collectDeclarationNodes(statements: readonly ts.Statement[]): Map<string, readonly ts.Node[]> {
  const nodes = new Map<string, readonly ts.Node[]>();
  const add = (name: string, node: ts.Node) => nodes.set(name, [...(nodes.get(name) ?? []), node]);
  for (const statement of statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          add(declaration.name.text, declaration);
        }
      }
    } else if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isModuleDeclaration(statement)
    ) {
      const name = statement.name?.text ?? DEFAULT_EXPORT_NAME;
      add(name, statement);
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword) && name !== DEFAULT_EXPORT_NAME) {
        add(DEFAULT_EXPORT_NAME, statement);
      }
    } else if (ts.isExportAssignment(statement) && !ts.isIdentifier(statement.expression)) {
      add(DEFAULT_EXPORT_NAME, statement);
    }
  }
  return nodes;
}

/**
 * Resolves top-level exports to their original AST nodes without creating a type program.
 * @param files Declaration contents keyed by consistent POSIX paths.
 * @returns Declaration lookup and public export enumeration using the signature resolver's barrel graph.
 */
export function buildDeclarationResolver(files: ReadonlyMap<string, string>): DeclarationResolver {
  return buildModuleResolver(files, (source) => collectDeclarationNodes(source.statements));
}

function collectExportNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (ts.canHaveModifiers(statement) && hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
        names.add(DEFAULT_EXPORT_NAME);
      } else {
        for (const name of collectDeclarationNodes([statement]).keys()) {
          names.add(name);
        }
      }
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      names.add(DEFAULT_EXPORT_NAME);
    }
    if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined) {
      const clause = statement.exportClause;
      for (const name of ts.isNamedExports(clause)
        ? clause.elements.map((element) => element.name.text)
        : [clause.name.text]) {
        names.add(name);
      }
    }
  }
  return names;
}

function buildModuleResolver<T>(
  files: ReadonlyMap<string, string>,
  collect: (source: ts.SourceFile) => Map<string, T>,
) {
  const declarations = new Map<string, Map<string, T>>();
  const graphs = new Map<string, ModuleGraph>();
  const exportedNames = new Map<string, Set<string>>();
  for (const [path, text] of files) {
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    declarations.set(path, collect(source));
    graphs.set(path, collectModuleGraph(source));
    exportedNames.set(path, collectExportNames(source));
  }

  const resolveEdgeTarget = (fromPath: string, specifier: string): string | undefined =>
    resolveDtsCandidates(fromPath, specifier).find((candidate) => files.has(candidate));

  const lookup = (entryPath: string, name: string, seen: Set<string>): T | undefined => {
    // Key the guard on the pair: a renamed edge reaches the same file under a
    // different name, and that second visit must not be blocked by the first.
    const visitKey = JSON.stringify([entryPath, name]);
    if (seen.has(visitKey)) {
      return undefined;
    }
    seen.add(visitKey);

    const graph = graphs.get(entryPath);
    const isRemoteExport = graph?.reexports.some((edge) => edge.names.has(name)) ?? false;
    const direct = declarations.get(entryPath)?.get(name);
    if (direct !== undefined && !isRemoteExport) {
      return direct;
    }

    const localBinding = graph?.localAliases.get(name);
    if (localBinding !== undefined && localBinding !== name) {
      const found = lookup(entryPath, localBinding, seen);
      if (found !== undefined) {
        return found;
      }
    }

    const imported = graph?.imports.get(name);
    if (imported !== undefined) {
      const targetPath = resolveEdgeTarget(entryPath, imported.module);
      const found = targetPath === undefined ? undefined : lookup(targetPath, imported.original, seen);
      if (found !== undefined) {
        return found;
      }
    }

    // Explicit re-exports shadow star exports, irrespective of statement order.
    const edges = graph?.reexports ?? [];
    for (const edge of [
      ...edges.filter((candidate) => !candidate.all),
      ...edges.filter((candidate) => candidate.all),
    ]) {
      if (edge.all && name === DEFAULT_EXPORT_NAME) {
        continue;
      }
      const targetPath = resolveEdgeTarget(entryPath, edge.module);
      if (targetPath === undefined) {
        continue;
      }
      if (edge.all && !listExports(targetPath, new Set()).has(name)) {
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

  const listExports = (entryPath: string, seen: Set<string>): Set<string> => {
    if (seen.has(entryPath)) {
      return new Set();
    }
    seen.add(entryPath);
    const names = new Set(exportedNames.get(entryPath));
    for (const edge of graphs.get(entryPath)?.reexports ?? []) {
      const target = resolveEdgeTarget(entryPath, edge.module);
      if (!edge.all || target === undefined) {
        continue;
      }
      for (const name of listExports(target, seen)) {
        if (name !== DEFAULT_EXPORT_NAME) {
          names.add(name);
        }
      }
    }
    return names;
  };

  return {
    exports: (entryPath: string) => [...listExports(entryPath, new Set())],
    lookup: (entryPath: string, name: string) => lookup(entryPath, name, new Set()),
  };
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
    // Overloads join the signature block as separate lines, in source order.
    signature: [found.text, ...(found.overloads ?? [])].join("\n"),
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
