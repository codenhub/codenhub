import { posix } from "node:path";

import { format, resolveConfig } from "prettier";
import { Application, normalizePath, TSConfigReader } from "typedoc";
import ts from "typescript";

import { parseReferenceConfig, type ReferenceConfig } from "../documentation/reference-config.ts";
import { renderReferencePage } from "../documentation/reference-markdown.ts";
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
const ENTRY_EXTENSION = /\.(?:d\.m?ts|m?js|ts)$/;

/** One documented entrypoint, resolved from an `exports` subpath to its source and module. */
export interface EntrypointPlan {
  /** `exports` subpath key, such as `"."` or `"./registries/browser"`. */
  subpath: string;
  /** Source entry file, relative to the package `src/` directory: `index.ts`, `registries/browser.ts`. */
  sourceRel: string;
  /** TypeDoc module name for that entry: `index`, `registries`, `registries/browser`. */
  module: string;
  /** Emitted declaration file for that entry, relative to `src/`: `index.d.ts`, `registries/index.d.ts`. */
  entryDts: string;
}

function subpathTarget(entry: unknown): string | undefined {
  if (typeof entry === "string") {
    return entry;
  }
  if (entry !== null && typeof entry === "object") {
    const conditions = entry as Record<string, unknown>;
    const candidate = conditions.types ?? conditions.import ?? conditions.default;
    return typeof candidate === "string" ? candidate : undefined;
  }
  return undefined;
}

/** `./dist/registries/browser.d.ts` → `registries/browser`. */
function entryStem(target: string): string {
  return target
    .replace(/^\.\//, "")
    .replace(/^dist\//, "")
    .replace(ENTRY_EXTENSION, "");
}

/**
 * Resolves the entrypoints to document from a package's `exports` and its config.
 * @param exportsMap The manifest `exports` object.
 * @param config Parsed `codenhub.docs.reference`.
 * @returns One plan per documented entrypoint, in `exports` order (or `config.entrypoints` order).
 * @throws When a configured subpath is absent from `exports` or resolves to no file target.
 */
export function resolveEntrypoints(exportsMap: unknown, config: ReferenceConfig): EntrypointPlan[] {
  const map = exportsMap !== null && typeof exportsMap === "object" ? (exportsMap as Record<string, unknown>) : {};
  const explicit = config.entrypoints !== undefined;
  const subpaths = config.entrypoints ?? Object.keys(map).filter((key) => key === "." || key.startsWith("./"));

  return subpaths.flatMap((subpath) => {
    if (!(subpath in map)) {
      throw new Error(`codenhub.docs.reference entrypoint "${subpath}" is not in package exports.`);
    }
    const target = subpathTarget(map[subpath]);
    if (target === undefined || !ENTRY_EXTENSION.test(target)) {
      if (explicit) {
        throw new Error(`codenhub.docs.reference entrypoint "${subpath}" does not resolve to a TypeScript module.`);
      }
      return [];
    }
    const stem = entryStem(target);
    const module = stem === "index" ? "index" : stem.replace(/\/index$/, "");
    return [{ entryDts: `${stem}.d.ts`, module, sourceRel: `${stem}.ts`, subpath }];
  });
}

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
      return `${relative}#${name.toLowerCase()}`;
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

function emitDeclarations(pkgDir: string, plans: readonly EntrypointPlan[]): Map<string, string> {
  const configFile = ts.readConfigFile(`${pkgDir}/tsconfig.json`, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, pkgDir);
  const program = ts.createProgram({
    options: {
      ...parsed.options,
      composite: false,
      declaration: true,
      declarationDir: undefined,
      emitDeclarationOnly: true,
      incremental: false,
      noEmit: false,
      outDir: undefined,
      rootDir: `${pkgDir}/src`,
      skipLibCheck: true,
      tsBuildInfoFile: undefined,
    },
    rootNames: plans.map((plan) => `${pkgDir}/src/${plan.sourceRel}`),
  });

  const sourceRoot = `${pkgDir}/src/`;
  const declarations = new Map<string, string>();
  program.emit(
    undefined,
    (fileName, text) => {
      const posixName = fileName.split("\\").join("/");
      if (posixName.startsWith(sourceRoot)) {
        declarations.set(posixName.slice(sourceRoot.length), text);
      }
    },
    undefined,
    true,
  );
  return declarations;
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

async function generatePackage(workspacePackage: WorkspacePackage, config: ReferenceConfig) {
  const pkgDir = workspacePackage.directory.split("\\").join("/");
  const label = (workspacePackage.manifest as { codenhub?: { docs?: { label?: string } } }).codenhub?.docs?.label;
  const plans = resolveEntrypoints(workspacePackage.manifest.exports, config);
  assertKebabEntrypoints(plans);

  const subpathByModule = Object.fromEntries(plans.map((plan) => [plan.module, plan.subpath]));
  const model = withSignatures(
    buildReferenceModel(await convertProject(pkgDir, plans), subpathByModule),
    plans,
    emitDeclarations(pkgDir, plans),
  );

  const allSubpaths = plans.map((plan) => plan.subpath);
  const resolveLinkFor = linkResolverFor(model, allSubpaths);
  const sourceRoot = `${workspacePackage.location}/src`;

  return Promise.all(
    model.entrypoints.map(async (entrypoint, index) => {
      const pageRel = referencePageRel(entrypoint.subpath, allSubpaths);
      const isIndex = entrypoint.subpath === ".";
      const filepath = `${pkgDir}/${REFERENCE_DIR}/${pageRel}`;
      const rendered = renderReferencePage(entrypoint, {
        group: isIndex ? REFERENCE_GROUP : undefined,
        order: isIndex ? undefined : index,
        prose: config.prose,
        resolveLink: resolveLinkFor(entrypoint.subpath),
        sourceRoot,
        title: isIndex ? (label ?? workspacePackage.name) : entrypoint.subpath.replace(/^\.\//, ""),
      });
      // Run the same formatter `pnpm format` applies — resolveConfig folds in the
      // docs/reference/ override — so a generated page is never reported as needing
      // formatting and the drift check stays stable.
      const contents = await format(rendered, { ...(await resolveConfig(filepath)), filepath });
      return { contents, path: `${workspacePackage.location}/${REFERENCE_DIR}/${pageRel}` };
    }),
  );
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
          return config === null ? [] : generatePackage(workspacePackage, config);
        }),
      );
      return results.flat();
    },
    name: "reference",
    summary: "Generate each opted-in package's docs/reference/ from TypeDoc and its declarations.",
  };
}
