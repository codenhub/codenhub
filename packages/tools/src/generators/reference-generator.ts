import { matchesGlob, posix } from "node:path";

import { format, resolveConfig } from "prettier";
import { Application, normalizePath, TSConfigReader } from "typedoc";

import { parseReferenceConfig, type ReferenceConfig } from "../documentation/reference-config.ts";
import {
  emitDeclarations,
  readAmbientDeclarations,
  resolveEntrypoints,
  type EntrypointPlan,
} from "../documentation/reference-declarations.ts";
import { renderReferencePage, symbolSlug } from "../documentation/reference-markdown.ts";
import {
  buildReferenceModel,
  walkSymbols,
  type ReferenceEntrypoint,
  type ReferenceModel,
} from "../documentation/reference-model.ts";
import {
  attachInternalTypes,
  attachSignatures,
  buildDeclarationResolver,
  buildSignatureResolver,
  sourcePathOf,
  type SignatureIndex,
} from "../documentation/reference-signatures.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import type { Generator } from "./generator.ts";

const REFERENCE_DIR = "docs/reference";
const REFERENCE_GROUP = "Reference";
const KEBAB_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The `docs/reference/`-relative path for an entrypoint's page.
 * @param subpath The entrypoint's `exports` subpath.
 * @param allSubpaths Every documented subpath, to tell a leaf page from a folder.
 * @returns `index.md` for `"."`; `a/b.md`, or `a/b/index.md` when another subpath nests under it.
 */
export function referencePageRel(subpath: string, allSubpaths: readonly string[]): string {
  if (subpath === ".") {
    return "index.md";
  }
  const segments = subpath.replace(/^\.\//, "");
  const isFolder = allSubpaths.some((other) => other !== subpath && other.startsWith(`${subpath}/`));
  return isFolder ? `${segments}/index.md` : `${segments}.md`;
}

/**
 * The `docs/reference/`-relative path for a model entry's page, split pages included.
 * @param entry The entrypoint's own page, or one of its split pages.
 * @param entries Every page of the package, to tell a leaf page from a folder.
 * @returns `<page>.md` beside the entrypoint's page for a split page; otherwise the entrypoint's page,
 *   which is a folder `index.md` when the entrypoint has split pages or child entrypoints.
 */
export function referencePagePath(
  entry: Pick<ReferenceEntrypoint, "page" | "subpath">,
  entries: readonly Pick<ReferenceEntrypoint, "page" | "subpath">[],
): string {
  const folder = entry.subpath === "." ? "" : `${entry.subpath.slice(2)}/`;
  if (entry.page !== undefined) {
    return `${folder}${entry.page}.md`;
  }
  const isSplit = entries.some((other) => other.subpath === entry.subpath && other.page !== undefined);
  return isSplit
    ? `${folder}index.md`
    : referencePageRel(
        entry.subpath,
        entries.map((other) => other.subpath),
      );
}

/**
 * Moves each entrypoint's symbols onto the split pages `config.pages` declares for it.
 * A split page follows its entrypoint as an entry of its own, carrying `page`.
 * `declaredIn` gives the package-relative source file that declares an entrypoint's symbol.
 */
function splitEntrypoints(
  model: ReferenceModel,
  pages: ReferenceConfig["pages"] = {},
  declaredIn: (subpath: string, name: string) => string | undefined,
): ReferenceModel {
  for (const subpath of Object.keys(pages)) {
    if (!model.entrypoints.some((entrypoint) => entrypoint.subpath === subpath)) {
      throw new Error(`codenhub.docs.reference.pages["${subpath}"] is not a documented entrypoint.`);
    }
  }

  const entrypoints = model.entrypoints.flatMap((entrypoint) => {
    const split = Object.entries(pages[entrypoint.subpath]?.split ?? {});
    const pageOf = (file: string | undefined): string | undefined =>
      file === undefined
        ? undefined
        : split.find(([, page]) => page.source.some((glob) => matchesGlob(file, glob)))?.[0];
    const bySplit = Map.groupBy(entrypoint.symbols, (symbol) => pageOf(declaredIn(entrypoint.subpath, symbol.name)));
    return [
      { ...entrypoint, symbols: bySplit.get(undefined) ?? [] },
      ...split.map(([page]): ReferenceEntrypoint => {
        const symbols = bySplit.get(page);
        if (symbols === undefined) {
          throw new Error(`Reference split page "${page}" of "${entrypoint.subpath}" matches no symbol.`);
        }
        return {
          internalTypes: [],
          module: entrypoint.module,
          page,
          subpath: entrypoint.subpath,
          symbols,
        };
      }),
    ];
  });
  return { ...model, entrypoints };
}

/** Builds a `{@link}` resolver: for a page, an href to another page's symbol, or `undefined`. */
function linkResolverFor(pageRels: ReadonlyMap<ReferenceEntrypoint, string>) {
  // A symbol several entrypoints export is documented under each, so a name has a page per subpath.
  const pagesBySymbol = new Map<string, Map<string, string>>();
  for (const [entrypoint, pageRel] of pageRels) {
    for (const [qualifiedName] of walkSymbols(entrypoint.symbols)) {
      const bySubpath = pagesBySymbol.get(qualifiedName) ?? new Map<string, string>();
      pagesBySymbol.set(qualifiedName, bySubpath);
      if (!bySubpath.has(entrypoint.subpath)) {
        bySubpath.set(entrypoint.subpath, pageRel);
      }
    }
  }

  return (fromSubpath: string, fromRel: string) =>
    (name: string): string | undefined => {
      const bySubpath = pagesBySymbol.get(name);
      // The linking entrypoint's own copy first, then the first entrypoint that documents the name.
      const toRel = bySubpath?.get(fromSubpath) ?? bySubpath?.values().next().value;
      if (toRel === undefined || toRel === fromRel) {
        return undefined;
      }
      const relative = posix.relative(posix.dirname(fromRel), toRel);
      return `${relative}#${symbolSlug(name)}`;
    };
}

function assertKebabEntrypoints(plans: readonly EntrypointPlan[]): void {
  for (const plan of plans) {
    const bad = plan.subpath
      .replace(/^\.\/?/, "")
      .split("/")
      .filter((segment) => segment !== "" && !KEBAB_SEGMENT.test(segment));
    if (bad.length > 0) {
      throw new Error(`Reference entrypoint "${plan.subpath}" has a non-kebab-case segment: ${bad.join(", ")}.`);
    }
  }
}

async function convertProject(pkgDir: string, plans: readonly EntrypointPlan[]): Promise<unknown> {
  const application = await Application.bootstrap(
    {
      // Without this, TypeDoc collapses a single entry point's exports onto the
      // project root instead of a `Module` reflection, and `buildReferenceModel`'s
      // `root.children.filter(isModule)` finds nothing for it — every symbol on a
      // package with exactly one documented entrypoint would render as an empty page.
      alwaysCreateEntryPointModule: true,
      entryPoints: plans.map((plan) => `${pkgDir}/src/${plan.sourceRel}`),
      entryPointStrategy: "resolve",
      excludeInternal: true,
      logLevel: "Error",
      // The package's own `pnpm typecheck` is the type gate; here a test file that
      // self-imports the not-yet-built package must not abort the whole run.
      skipErrorChecking: true,
      tsconfig: `${pkgDir}/tsconfig.json`,
    },
    [new TSConfigReader()],
  );
  const project = await application.convert();
  if (project === undefined) {
    throw new Error(`TypeDoc could not analyse ${pkgDir}.`);
  }
  return application.serializer.projectToObject(project, normalizePath(pkgDir));
}

function withSignatures(model: ReferenceModel, plans: readonly EntrypointPlan[], declarations: Map<string, string>) {
  const resolver = buildSignatureResolver(declarations);
  const byModule = new Map<string, SignatureIndex>();
  for (const plan of plans) {
    const index: SignatureIndex = new Map();
    const entrypoint = model.entrypoints.find((candidate) => candidate.module === plan.module);
    for (const symbol of entrypoint?.symbols ?? []) {
      const signature = resolver.lookup(plan.entryDts, symbol.name);
      if (signature !== undefined) {
        index.set(symbol.name, signature);
      }
    }
    byModule.set(plan.module, index);
  }
  return attachSignatures(model, byModule);
}

/** An opted-in package's reference model and the Markdown pages it renders to. */
export interface ReferenceAnalysis {
  /** The model, with signatures attached. */
  model: ReferenceModel;
  /** The generated pages, formatted, ready to write. */
  files: { path: string; contents: string }[];
}

/**
 * Builds the reference model and pages for one opted-in package.
 * @param workspacePackage The package.
 * @param config Its parsed `codenhub.docs.reference`.
 * @returns The model and the rendered, formatted pages.
 * @throws When an entrypoint is unresolved, non-kebab-case, or collides with another.
 */
export async function analyzeReference(
  workspacePackage: WorkspacePackage,
  config: ReferenceConfig,
): Promise<ReferenceAnalysis> {
  const pkgDir = workspacePackage.directory.split("\\").join("/");
  const plans = resolveEntrypoints(workspacePackage.manifest.exports, config);
  assertKebabEntrypoints(plans);

  const subpathByModule = Object.fromEntries(plans.map((plan) => [plan.module, plan.subpath]));
  const declarations = emitDeclarations(pkgDir, plans);
  const entryDtsBySubpath = new Map(plans.map((plan) => [plan.subpath, plan.entryDts]));
  const resolver = buildDeclarationResolver(declarations);
  const model = attachInternalTypes(
    splitEntrypoints(
      withSignatures(buildReferenceModel(await convertProject(pkgDir, plans), subpathByModule), plans, declarations),
      config.pages,
      // The emitted declarations place a symbol where TypeDoc's source paths cannot: those are
      // relative to whatever directory the sources share, not to the package.
      (subpath, name) => {
        const [node] = resolver.lookup(entryDtsBySubpath.get(subpath) ?? "", name) ?? [];
        return node === undefined ? undefined : sourcePathOf(node.getSourceFile().fileName);
      },
    ),
    declarations,
    entryDtsBySubpath,
    readAmbientDeclarations(pkgDir),
  );

  const pageRels = new Map(
    model.entrypoints.map((entrypoint) => [entrypoint, referencePagePath(entrypoint, model.entrypoints)]),
  );
  const collisions = [...pageRels.values()].filter((rel, index, all) => all.indexOf(rel) !== index);
  if (collisions.length > 0) {
    throw new Error(`Reference pages collide on page path: ${[...new Set(collisions)].join(", ")}.`);
  }

  const resolveLinkFor = linkResolverFor(pageRels);
  const sourceRoot = `${workspacePackage.location}/src`;

  const files = await Promise.all(
    model.entrypoints.map(async (entrypoint, index) => {
      const pageRel = pageRels.get(entrypoint) ?? referencePagePath(entrypoint, model.entrypoints);
      const isIndex = pageRel === "index.md";
      const pages = config.pages?.[entrypoint.subpath];
      // A label is both the sidebar label and the H1. Without one, the sidebar label is
      // the package name, then what a consumer appends to it (`/registries/browser`),
      // and the H1 is the full specifier a consumer would `import` from.
      const label =
        entrypoint.page === undefined ? pages?.label : (pages?.split?.[entrypoint.page]?.label ?? entrypoint.page);
      const suffix = entrypoint.subpath.slice(1);
      const specifier = `${workspacePackage.name}${suffix}`;
      const filepath = `${pkgDir}/${REFERENCE_DIR}/${pageRel}`;
      const rendered = renderReferencePage(entrypoint, {
        description: entrypoint.description,
        group: isIndex ? REFERENCE_GROUP : undefined,
        heading: label ?? specifier,
        order: isIndex ? undefined : index,
        prose: config.prose,
        resolveLink: resolveLinkFor(entrypoint.subpath, pageRel),
        since: entrypoint.since,
        sourceRoot,
        title: label ?? (suffix === "" ? specifier : suffix),
      });
      // Run the same formatter `pnpm format` applies — resolveConfig folds in the
      // docs/reference/ override — so a generated page is never reported as needing
      // formatting and the drift check stays stable.
      const contents = await format(rendered, {
        ...(await resolveConfig(filepath)),
        filepath,
      });
      return {
        contents,
        path: `${workspacePackage.location}/${REFERENCE_DIR}/${pageRel}`,
      };
    }),
  );

  return { files, model };
}

/**
 * Creates the generator that writes each opted-in package's `docs/reference/`.
 *
 * A package opts in through `codenhub.docs.reference` (`docs/specs/packages-reference.md`).
 * For each one the generator runs TypeDoc over its entry sources, emits their
 * declarations in-process for signature text, and renders one Markdown page per
 * `exports` subpath.
 * @returns Generator ready for registration.
 */
export function createReferenceGenerator(): Generator {
  return {
    generate: async ({ packages }) => {
      const results = await Promise.all(
        packages.map(async (workspacePackage) => {
          const config = parseReferenceConfig(workspacePackage.manifest, `${workspacePackage.location}/package.json`);
          return config === null ? [] : (await analyzeReference(workspacePackage, config)).files;
        }),
      );
      return results.flat();
    },
    name: "reference",
    summary: "Generate each opted-in package's docs/reference/ from TypeDoc and its declarations.",
  };
}
