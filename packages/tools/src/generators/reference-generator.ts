import { posix } from "node:path";

import { format, resolveConfig } from "prettier";
import { Application, normalizePath, TSConfigReader } from "typedoc";

import { parseReferenceConfig, type ReferenceConfig } from "../documentation/reference-config.ts";
import { emitDeclarations, resolveEntrypoints, type EntrypointPlan } from "../documentation/reference-declarations.ts";
import { renderReferencePage, symbolSlug } from "../documentation/reference-markdown.ts";
import { buildReferenceModel, type ReferenceModel } from "../documentation/reference-model.ts";
import {
  attachSignatures,
  buildSignatureResolver,
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

/** Builds a `{@link}` resolver: for a page, an href to another page's symbol, or `undefined`. */
function linkResolverFor(model: ReferenceModel, allSubpaths: readonly string[]) {
  const pageBySymbol = new Map<string, string>();
  for (const entrypoint of model.entrypoints) {
    for (const symbol of entrypoint.symbols) {
      if (!pageBySymbol.has(symbol.name)) {
        pageBySymbol.set(symbol.name, entrypoint.subpath);
      }
    }
  }

  return (fromSubpath: string) =>
    (name: string): string | undefined => {
      const targetSubpath = pageBySymbol.get(name);
      if (targetSubpath === undefined || targetSubpath === fromSubpath) {
        return undefined;
      }
      const fromRel = referencePageRel(fromSubpath, allSubpaths);
      const toRel = referencePageRel(targetSubpath, allSubpaths);
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
  const model = withSignatures(
    buildReferenceModel(await convertProject(pkgDir, plans), subpathByModule),
    plans,
    emitDeclarations(pkgDir, plans),
  );

  const allSubpaths = plans.map((plan) => plan.subpath);
  const pageRels = new Map(allSubpaths.map((subpath) => [subpath, referencePageRel(subpath, allSubpaths)]));
  const collisions = [...pageRels.values()].filter((rel, index, all) => all.indexOf(rel) !== index);
  if (collisions.length > 0) {
    throw new Error(`Reference entrypoints collide on page path: ${[...new Set(collisions)].join(", ")}.`);
  }

  const resolveLinkFor = linkResolverFor(model, allSubpaths);
  const sourceRoot = `${workspacePackage.location}/src`;

  const files = await Promise.all(
    model.entrypoints.map(async (entrypoint, index) => {
      const pageRel = pageRels.get(entrypoint.subpath) ?? referencePageRel(entrypoint.subpath, allSubpaths);
      const isIndex = entrypoint.subpath === ".";
      // Sidebar label is the import subpath (`/`, `/registries/browser`); the H1 is
      // the full specifier a consumer would `import` from.
      const suffix = isIndex ? "" : entrypoint.subpath.slice(1);
      const filepath = `${pkgDir}/${REFERENCE_DIR}/${pageRel}`;
      const rendered = renderReferencePage(entrypoint, {
        description: entrypoint.description,
        group: isIndex ? REFERENCE_GROUP : undefined,
        heading: `${workspacePackage.name}${suffix}`,
        order: isIndex ? undefined : index,
        prose: config.prose,
        resolveLink: resolveLinkFor(entrypoint.subpath),
        since: entrypoint.since,
        sourceRoot,
        title: suffix === "" ? "/" : suffix,
      });
      // Run the same formatter `pnpm format` applies — resolveConfig folds in the
      // docs/reference/ override — so a generated page is never reported as needing
      // formatting and the drift check stays stable.
      const contents = await format(rendered, { ...(await resolveConfig(filepath)), filepath });
      return { contents, path: `${workspacePackage.location}/${REFERENCE_DIR}/${pageRel}` };
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
