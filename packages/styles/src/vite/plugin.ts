import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AliasOptions, Logger, Plugin, ViteDevServer } from "vite";

import {
  PURGE_SOURCE,
  MIN_NODE_MAJOR,
  readAestheticNames,
  readDroppable,
  readShippedSizes,
  resolveExport,
} from "../trim";
import { pluginError } from "./errors";
import { ignoreFilesAbove, isInside } from "./ignore";
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
   the first call's result is kept until every environment has had it. A call
   that never comes, as when another plugin's hook throws before this one's,
   leaves its result kept this long once it settles: a change queued behind a
   long burst is never dropped while it is still running. */
const CHANGE_KEPT_MS = 60_000;
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
  let logger: Logger | undefined;
  // `vite preview` serves a finished build, so the plugin reads and writes nothing for it.
  let isPreview = false;
  let trimmer: Trimmer | undefined;
  // Each change still in flight: its result, the environments yet to call for it, and when it settled.
  const recent = new Map<string, { pending: Promise<string[]>; left: number; settledAt: number }>();
  // How many times a change reaches `hotUpdate` or `handleHotUpdate`: once per environment, and once on Vite 5.
  let environmentCount = 1;
  /* Whether a change rewrote a trimmed file since the build before, and so
     whether this build does. A change made during a build counts for the next. */
  const rewritten = { sinceBuild: false, forBuild: false };
  // Whether a build in watch mode has run, so the next one reads the project again.
  let hasBuilt = false;

  // A path Vite names, as the scan names it.
  const toScanPath = (file: string): string => {
    const resolved = path.resolve(file);

    return isInside(root.vite, resolved) ? path.join(root.real, path.relative(root.vite, resolved)) : resolved;
  };
  const changeOnce = (key: string, file: string, event: FileEvent): Promise<string[]> => {
    const now = Date.now();

    // Changes settle out of the order they started in, so every entry is checked.
    for (const [kept, { settledAt }] of recent) {
      if (now - settledAt > CHANGE_KEPT_MS) {
        recent.delete(kept);
      }
    }

    let change = recent.get(key);

    if (change === undefined) {
      const fresh = { pending: Promise.resolve<string[]>([]), left: environmentCount, settledAt: Infinity };

      fresh.pending = (async () => {
        try {
          return await changeInServer(file, event);
        } finally {
          fresh.settledAt = Date.now();
        }
      })();
      change = fresh;
    }

    change.left -= 1;
    if (change.left > 0) {
      recent.set(key, change);
    } else {
      recent.delete(key);
    }

    return change.pending;
  };
  /* A change the dev server reports. Vite shows a hook's error only on the
     page, so with no page open it would go unseen; it is shown in the
     terminal too, once however many environments call for the change. */
  const changeInServer = async (file: string, event: FileEvent): Promise<string[]> => {
    try {
      return await started().change(toScanPath(file), event);
    } catch (error) {
      logger?.error(error instanceof Error ? error.message : String(error), {
        timestamp: true,
        error: error instanceof Error ? error : undefined,
      });
      throw error;
    }
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
      handler(config, env) {
        isPreview = env.isPreview === true;
        if (isPreview) {
          return;
        }

        const configuredRoot = path.resolve(config.root ?? process.cwd());

        // Vite 5 and 6 call this hook without a context, and keep the older rule.
        cacheDir = findCacheDir(
          configuredRoot,
          config.cacheDir,
          (this as Partial<typeof this> | undefined)?.meta?.viteVersion,
        );

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
      if (isPreview) {
        return;
      }
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
      logger = config.logger;
      isServe = config.command === "serve";
      hasBuilt = false;
      recent.clear();
      trimmer = await Trimmer.start({
        imports,
        droppable,
        scan: new ProjectScan({
          root: root.real,
          viteRoot: root.vite,
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
      // The types are the newest Vite's, which always has environments.
      environmentCount = Object.keys((server as Partial<ViteDevServer>).environments ?? {}).length || 1;

      const outside = content
        .map((entry) => path.resolve(root.vite, globBase(entry)))
        .filter((base) => !isInside(root.vite, base) && base !== root.vite);

      // Only one that exists: a `.gitignore` created above the root is read at the next start.
      outside.push(...ignoreFilesAbove(root.real).filter((file) => fs.existsSync(file)));
      if (outside.length > 0) {
        server.watcher.add(outside);
      }
      // Vite 6 and newer call `hotUpdate` for a file created or deleted too; Vite 5 has no hook for either.
      if ((server as Partial<ViteDevServer>).environments === undefined) {
        server.watcher
          .on("add", (file: string) => void reloadTrimmed(server, () => changeInServer(file, "create")))
          .on("unlink", (file: string) => void reloadTrimmed(server, () => changeInServer(file, "delete")));
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
    /* A build in watch mode watches every file read, so changing one rebuilds,
       and each rebuild reads the project again, so a file created since counts
       too. The dev server watches the root already. */
    async buildStart() {
      if (!isServe && this.meta.watchMode) {
        if (hasBuilt) {
          // Read first: `||=` would skip the read once a change has already rewritten a file.
          const written = await started().rescan();

          rewritten.sinceBuild ||= written.length > 0;
        }
        hasBuilt = true;
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
// Vite's rule for its cache folder, which changed in 8.1.0.
function findCacheDir(root: string, configured: string | undefined, viteVersion: string | undefined): string {
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

  return isAtLeast(viteVersion, 8, 1) && fs.existsSync(nodeModules)
    ? path.join(nodeModules, ".vite")
    : path.join(root, ".vite");
}

function isAtLeast(version: string | undefined, major: number, minor: number): boolean {
  const [actualMajor = 0, actualMinor = 0] = (version ?? "").split(".").map((part) => Number.parseInt(part, 10));

  return actualMajor > major || (actualMajor === major && actualMinor >= minor);
}

// Two configurations that read different files never share a trimmed file.
function keyOf(root: string, content: readonly string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([root, content]))
    .digest("hex")
    .slice(0, 16);
}

/* A folder as the system resolves it, as the scan walks the root. One not
   there yet is resolved through the nearest folder above it that is, so an
   output folder a build creates later is still left out when the root's
   spelling differs from its real path: a link, a `subst` drive, an 8.3 short
   name, or a Windows path in another case. */
function realPathOrSelf(folder: string): string {
  const missing: string[] = [];

  for (let dir = path.resolve(folder); ; dir = path.dirname(dir)) {
    try {
      return path.join(fs.realpathSync.native(dir), ...missing);
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") {
        throw error;
      }
      if (path.dirname(dir) === dir) {
        return path.resolve(folder);
      }
      missing.unshift(path.basename(dir));
    }
  }
}

function escapeRegExp(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\/]/g, String.raw`\$&`);
}

function toPosix(file: string): string {
  return file.split(path.sep).join("/");
}
