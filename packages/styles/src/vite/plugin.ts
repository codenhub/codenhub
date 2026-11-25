import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AliasOptions, Plugin, ViteDevServer } from "vite";

import {
  PURGE_SOURCE,
  MIN_NODE_MAJOR,
  readAestheticNames,
  readDroppable,
  readShippedSizes,
  resolveExport,
} from "../trim";
import { pluginError } from "./errors";
import { isInside } from "./ignore";
import { createOutputFolder } from "./output";
import { type FileEvent, ProjectScan } from "./scan";
import { type TrimmedImport, Trimmer } from "./trimmer";

/** Options for {@link viteStyles}. */
export interface ViteStylesOptions {
  /**
   * Files or globs outside Vite's `root` to read for class names as well. A
   * relative entry is read from the root.
   */
  content?: string[];
}

const PACKAGE = "@codenhub/styles";
/* Vite 6 and newer call `hotUpdate` once per environment for one change, so
   the first call's result is kept for the others. A change has as many calls
   as there are environments, and a few changes can overlap. */
const RECENT_CHANGES = 32;
// `(` starts every extglob, as `@codenhub/scan` reads them.
const GLOB_CHARACTERS = /[*?[\]{}(]/;
// Vite's test for a module it processes as CSS, which matches a Vue or Svelte style block by its `lang.css` query too.
const CSS_REQUEST = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

// The module graph each Vite has: one per environment on Vite 6 and newer, one for both on Vite 5.
interface ModuleGraphOf<Module> {
  getModulesByFile(file: string): Set<Module> | undefined;
  invalidateModule(module: Module, seen: Set<Module>, timestamp: number, isHmr: boolean): void;
}

/**
 * Returns a Vite plugin that trims `@codenhub/styles` and its aesthetics, as
 * the project imports them, to the StyleKit classes its files under Vite's
 * `root` and the files `content` names use, as `chs build` trims them.
 *
 * @throws Error when Node.js is older than 24, or when `content` is not an
 *   array of non-empty strings. Vite's start or build fails instead for a
 *   `content` entry that matches no file, a file the plugin cannot read, or a
 *   trimmed file it cannot write.
 */
export function viteStyles(options: ViteStylesOptions = {}): Plugin {
  assertNodeVersion(process.versions.node);

  const content = readContentOption(options);
  let imports: TrimmedImport[] = [];
  // The first trimmed import each of the project's aliases maps, which keeps that alias.
  let aliased: string[] = [];
  let cacheDir = "";
  // Vite's root, as Vite names it and as the system resolves it.
  let root = { vite: "", real: "" };
  let isServe = false;
  let trimmer: Trimmer | undefined;
  const recent = new Map<string, Promise<string[]>>();
  /* Whether a change rewrote a trimmed file since the build before, and so
     whether this build does. A change made during a build counts for the next. */
  const rewritten = { sinceBuild: false, forBuild: false };

  // A path Vite names, as the scan names it.
  const toScanPath = (file: string): string => {
    const resolved = path.resolve(file);

    return isInside(root.vite, resolved) ? path.join(root.real, path.relative(root.vite, resolved)) : resolved;
  };
  const changeOnce = (key: string, file: string, event: FileEvent): Promise<string[]> => {
    const pending = recent.get(key) ?? started().change(toScanPath(file), event);

    recent.set(key, pending);
    if (recent.size > RECENT_CHANGES) {
      recent.delete(recent.keys().next().value as string);
    }

    return pending;
  };
  const started = (): Trimmer => {
    if (trimmer === undefined) {
      throw pluginError("a file changed before the plugin read the project; restart Vite.");
    }

    return trimmer;
  };

  return {
    name: "codenhub-styles",
    config: {
      order: "post",
      handler(config) {
        const configuredRoot = path.resolve(config.root ?? process.cwd());

        cacheDir = findCacheDir(configuredRoot, config.cacheDir);

        const folder = path.join(cacheDir, "codenhub-styles", keyOf(configuredRoot, content));
        const output = createOutputFolder(folder);
        const every = [
          { specifier: PACKAGE, source: PURGE_SOURCE, file: path.join(output, "index.css") },
          {
            specifier: `${PACKAGE}/aesthetics`,
            source: resolveExport("./aesthetics"),
            file: path.join(output, "aesthetics", "index.css"),
          },
          ...readAestheticNames().map((name) => ({
            specifier: `${PACKAGE}/aesthetics/${name}`,
            source: resolveExport(`./aesthetics/${name}`),
            file: path.join(output, "aesthetics", `${name}.css`),
          })),
        ];
        const finds = findsOf(config.resolve?.alias);

        aliased = [
          ...new Set(
            finds.flatMap((find) => every.find(({ specifier }) => isAliasedBy(find, specifier))?.specifier ?? []),
          ),
        ];
        imports = every.filter(({ specifier }) => !finds.some((find) => isAliasedBy(find, specifier)));

        return {
          resolve: {
            alias: imports.map(({ specifier, file }) => ({
              find: new RegExp(`^${escapeRegExp(specifier)}(?=$|\\?)`),
              replacement: toPosix(file).replaceAll("$", "$$$$"),
            })),
          },
        };
      },
    },
    async configResolved(config) {
      for (const name of aliased) {
        config.logger.warn(
          pluginError(
            `resolve.alias already maps "${name}", so that import keeps your alias and is not trimmed; remove the alias to trim it.`,
          ).message,
        );
      }

      const droppable = await readDroppable();
      const outDirs = [
        config.build,
        ...Object.values(config.environments ?? {}).map((environment) => environment.build),
      ];

      root = { vite: path.resolve(config.root), real: fs.realpathSync.native(config.root) };
      isServe = config.command === "serve";
      recent.clear();
      trimmer = await Trimmer.start({
        imports,
        droppable,
        scan: new ProjectScan({
          root: root.real,
          skip: [...outDirs.map(({ outDir }) => path.resolve(config.root, outDir)), config.cacheDir, cacheDir].map(
            realPathOrSelf,
          ),
          content,
          known: droppable,
          shipped: await readShippedSizes(),
        }),
      });
    },
    configureServer(server) {
      const outside = content
        .map((entry) => path.resolve(root.real, globBase(entry)))
        .filter((base) => !isInside(root.real, base) && base !== root.real);

      if (outside.length > 0) {
        server.watcher.add(outside);
      }
      // Vite 6 and newer call `hotUpdate` for a file created or deleted too; Vite 5 has no hook for either.
      // The types are the newest Vite's, which always has environments.
      if ((server as Partial<ViteDevServer>).environments === undefined) {
        server.watcher
          .on("add", (file: string) => void reloadTrimmed(server, () => started().change(toScanPath(file), "create")))
          .on(
            "unlink",
            (file: string) => void reloadTrimmed(server, () => started().change(toScanPath(file), "delete")),
          );
      }
    },
    // Vite 6 and newer. After other plugins, which may pick the modules a change updates and would drop the stylesheets.
    hotUpdate: {
      order: "post",
      async handler({ type, file, timestamp, modules }) {
        const written = await changeOnce(`${timestamp}\0${type}\0${file}`, file, type);

        return updateTrimmed({
          graph: this.environment.moduleGraph,
          written,
          modules,
          isPageReload: modules.length === 0 && file.endsWith(".html") && this.environment.name === "client",
          timestamp,
        });
      },
    },
    // Vite 5 only: Vite 6 and newer skip it for a plugin that has `hotUpdate`.
    handleHotUpdate: {
      order: "post",
      async handler({ file, timestamp, modules, server }) {
        const written = await changeOnce(`${timestamp}\0update\0${file}`, file, "update");

        return updateTrimmed({
          graph: server.moduleGraph,
          written,
          modules,
          isPageReload: modules.length === 0 && file.endsWith(".html"),
          timestamp,
        });
      },
    },
    // A build in watch mode watches every file read, so changing one rebuilds; the dev server watches the root already.
    buildStart() {
      if (!isServe && this.meta.watchMode) {
        rewritten.forBuild = rewritten.sinceBuild;
        rewritten.sinceBuild = false;
        for (const file of started().files()) {
          this.addWatchFile(file);
        }
      }
    },
    // The dev server calls this too, before `hotUpdate`, which handles the change there.
    async watchChange(id, { event }) {
      if (!isServe) {
        const written = await started().change(toScanPath(id), event);

        rewritten.sinceBuild ||= written.length > 0;
      }
    },
    /* Rollup keeps the module it transformed before when the module's own text
       is the same, and a stylesheet that imports the package holds the trimmed
       text it inlined. Vite has its watcher ignore the cache folder, so it never
       learns the trimmed file changed. Vite 8 does not call the hook, and its
       watcher sees the change. */
    shouldTransformCachedModule({ id }) {
      return rewritten.forBuild && CSS_REQUEST.test(id) ? true : undefined;
    },
  };
}

interface UpdateTrimmed<Module> {
  graph: ModuleGraphOf<Module>;
  // The trimmed files the change rewrote.
  written: readonly string[];
  // The modules the change updates without the plugin.
  modules: readonly Module[];
  // Whether Vite reloads the page for the change: an HTML file that no module is made from.
  isPageReload: boolean;
  timestamp: number;
}

/* The modules to update: the change's own and the trimmed stylesheets'.
   Nothing when no stylesheet changed, so Vite keeps its own. For a page
   reload the stylesheets are invalidated instead, as is every module that
   imports one, since an update would stop the reload the HTML needs. */
function updateTrimmed<Module>({
  graph,
  written,
  modules,
  isPageReload,
  timestamp,
}: UpdateTrimmed<Module>): Module[] | undefined {
  const trimmed = written.flatMap((file) => [...(graph.getModulesByFile(toPosix(file)) ?? [])]);

  if (trimmed.length === 0) {
    return undefined;
  }
  if (isPageReload) {
    for (const module of trimmed) {
      graph.invalidateModule(module, new Set(), timestamp, true);
    }

    return undefined;
  }

  return [...new Set([...modules, ...trimmed])];
}

// Vite 5: a file created or deleted reaches no hook, so the trimmed stylesheets are reloaded here, and an error shown as Vite shows a hook's.
async function reloadTrimmed(server: ViteDevServer, change: () => Promise<string[]>): Promise<void> {
  try {
    const written = await change();
    const modules = written.flatMap((file) => [...(server.moduleGraph.getModulesByFile(toPosix(file)) ?? [])]);

    await Promise.all(modules.map((module) => server.reloadModule(module)));
  } catch (error) {
    const { message, stack = "" } = error instanceof Error ? error : new Error(String(error));

    server.ws.send({ type: "error", err: { message, stack } });
  }
}

/* The folder a `content` entry reads from: its path up to the first segment
   with a wildcard, as watched to see a file created there. */
function globBase(entry: string): string {
  const segments = entry.split(process.platform === "win32" ? /[\\/]/ : "/");
  const literal = segments.findIndex((segment) => GLOB_CHARACTERS.test(segment));

  return (literal === -1 ? segments : segments.slice(0, literal)).join("/") || ".";
}

function findsOf(alias: AliasOptions | undefined): (string | RegExp)[] {
  if (alias === undefined) {
    return [];
  }

  return Array.isArray(alias) ? alias.map(({ find }) => find) : Object.keys(alias);
}

/* By Vite's rule: a string maps itself and any path below it, a regular
   expression what it tests. A copy is tested, so a global one's `lastIndex`
   is left as Vite will find it. */
function isAliasedBy(find: string | RegExp, specifier: string): boolean {
  if (find instanceof RegExp) {
    return new RegExp(find).test(specifier);
  }

  return specifier === find || specifier.startsWith(`${find}/`);
}

// Vite 5 runs on Node.js 18, which the scan's `fs.globSync` predates.
function assertNodeVersion(nodeVersion: string): void {
  if (Number.parseInt(nodeVersion, 10) < MIN_NODE_MAJOR) {
    throw pluginError(`this plugin needs Node.js ${MIN_NODE_MAJOR} or newer; this is Node.js ${nodeVersion}.`);
  }
}

// A copy, so a configuration that changes its array later does not change what is read.
function readContentOption({ content }: ViteStylesOptions): readonly string[] {
  if (content === undefined) {
    return [];
  }
  if (!Array.isArray(content) || !content.every((entry) => typeof entry === "string")) {
    throw pluginError(`content must be an array of paths or globs, as in content: ["../shared/**/*.html"].`);
  }
  if (content.some((entry) => entry.trim() === "")) {
    throw pluginError("content holds an empty entry; remove it or name a path or glob.");
  }

  return [...content];
}

/* Where Vite keeps its own generated files, found as Vite 5 to 8 find it,
   since the `config` hook runs before Vite has. */
function findCacheDir(root: string, configured: string | undefined): string {
  if (configured !== undefined) {
    return path.resolve(root, configured);
  }

  for (let dir = root; ; dir = path.dirname(dir)) {
    if (fs.statSync(path.join(dir, "package.json"), { throwIfNoEntry: false })?.isFile()) {
      return path.join(dir, "node_modules", ".vite");
    }
    if (path.dirname(dir) === dir) {
      break;
    }
  }

  const nodeModules = path.join(root, "node_modules");

  return fs.existsSync(nodeModules) ? path.join(nodeModules, ".vite") : path.join(root, ".vite");
}

// Two configurations that read different files never share a trimmed file.
function keyOf(root: string, content: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([root, content]))
    .digest("hex")
    .slice(0, 16);
}

// A folder as the system resolves it, as the scan walks the root, or as given while nothing is there yet.
function realPathOrSelf(folder: string): string {
  try {
    return fs.realpathSync.native(folder);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }

    return path.resolve(folder);
  }
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`);
}

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}
