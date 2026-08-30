import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

import { parseAssetEntries } from "../assets/manifest.ts";
import type { WorkspacePackage } from "../workspace/discover.ts";
import { hasDocumentationMetadata } from "../workspace/package-policy.ts";
import type { CheckRule, Finding } from "./rule.ts";

const MANIFEST_LOCATION = "package.json";
const LICENSE_LOCATION = "LICENSE";
const ASSETS_DIRECTORY = "assets";
const REQUIRED_STRING_FIELDS = ["name", "version", "main", "module", "types"];
const REQUIRED_SCRIPTS = [
  "build",
  "typecheck",
  "test",
  "test:coverage",
  "test:watch",
  "prepublishOnly",
  "status:npm",
  "status:pack",
];
const UNCHAINED_SCRIPTS = ["test", "test:coverage", "test:watch", "typecheck", "status:pack"];
const UNIT_TEST_SCRIPTS = ["test", "test:coverage", "test:watch"];
const BROWSER_TEST_SCRIPTS = ["test:browser", "test:browser:watch"];
const PLAYWRIGHT_CONFIGS = [
  "playwright.config.ts",
  "playwright.config.mts",
  "playwright.config.js",
  "playwright.config.mjs",
];
const RECOMMENDED_FIELDS = ["description", "license", "repository"];
// A browser suite reached from a unit script is what makes `pnpm test` slow, so
// both ways of reaching it are read: the runner directly and the script that owns it.
const PLAYWRIGHT_INVOCATION = /\bplaywright\b/;
const BROWSER_SCRIPT_INVOCATION = /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?test:browser(?![\w:-])/;
// The negative lookahead keeps `pnpm build:styles` from reading as a chained
// `pnpm build`; only the umbrella script is the one root tooling already runs.
const BUILD_INVOCATION = /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?build(?![\w:-])/;
const PACK_INVOCATION = /\bnpm\s+pack\b[^&|]*--dry-run\b/;
const PACK_IGNORES_SCRIPTS = /\bnpm\s+pack\b[^&|]*--ignore-scripts\b/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isFileWithin(root: string, path: string): Promise<boolean> {
  if (!(await isFile(path))) {
    return false;
  }
  try {
    const relativePath = relative(await realpath(root), await realpath(path));
    return (
      relativePath === "" ||
      (!isAbsolute(relativePath) && relativePath !== ".." && !relativePath.startsWith(`..${sep}`))
    );
  } catch {
    return false;
  }
}

async function hasFile(workspacePackage: WorkspacePackage, name: string): Promise<boolean> {
  return isFile(join(workspacePackage.directory, name));
}

async function checkMetadata(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  const manifest = workspacePackage.manifest;
  const findings: Finding[] = [];
  const fail = (code: string, message: string): void => {
    findings.push({ code: `metadata/${code}`, location: MANIFEST_LOCATION, message, severity: "error" });
  };

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof manifest[field] !== "string" || (manifest[field] as string).trim() === "") {
      fail(field, `Missing "${field}".`);
    }
  }
  // A missing `private` publishes just as readily as `private: false`, so the
  // spec asks for the declaration rather than merely the absence of `true`.
  if (manifest.private !== false) {
    fail("private", `"private" must be declared as false.`);
  }
  if (manifest.type !== "module") {
    fail("type", `"type" must be "module".`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail("files", `"files" must list the publishable output.`);
  }
  if (!isRecord(manifest.exports)) {
    fail("exports", `"exports" must declare the public entrypoints.`);
  }
  const publishConfig = manifest.publishConfig;
  if (!isRecord(publishConfig) || publishConfig.access !== "public") {
    fail("publish-config", `"publishConfig.access" must be "public".`);
  }
  if (!hasDocumentationMetadata(workspacePackage)) {
    fail("docs", `"codenhub.docs" must declare public documentation metadata.`);
  }
  for (const field of RECOMMENDED_FIELDS) {
    if (manifest[field] === undefined) {
      findings.push({
        code: `metadata/${field}`,
        location: MANIFEST_LOCATION,
        message: `Should declare "${field}".`,
        severity: "warning",
      });
    }
  }
  // A `license` field names the terms; the file is what a consumer receives, and
  // npm packs it whether or not `files` lists it.
  if (!(await hasFile(workspacePackage, LICENSE_LOCATION))) {
    findings.push({
      code: "metadata/license-file",
      location: LICENSE_LOCATION,
      message: `Should ship a LICENSE file alongside the "license" field.`,
      severity: "warning",
    });
  }
  return findings;
}

function checkScripts(workspacePackage: WorkspacePackage): Finding[] {
  const scripts = workspacePackage.scripts;
  const findings: Finding[] = [];
  const fail = (code: string, message: string): void => {
    findings.push({ code: `scripts/${code}`, location: MANIFEST_LOCATION, message, severity: "error" });
  };

  if (!workspacePackage.isPrivate) {
    for (const name of REQUIRED_SCRIPTS) {
      if (scripts[name] === undefined) {
        fail(name, `Missing "${name}" script.`);
      }
    }
    const prepublish = scripts.prepublishOnly;
    if (prepublish !== undefined && !(BUILD_INVOCATION.test(prepublish) && /\btypecheck\b/.test(prepublish))) {
      fail(
        "prepublish-only",
        `"prepublishOnly" must run at least a build and a typecheck; npm runs it outside \`hub\`.`,
      );
    }
    const pack = scripts["status:pack"];
    if (pack !== undefined && !PACK_INVOCATION.test(pack)) {
      fail("status-pack", `"status:pack" must run \`npm pack --dry-run\`.`);
    } else if (pack !== undefined && !PACK_IGNORES_SCRIPTS.test(pack)) {
      fail(
        "status-pack-ignore-scripts",
        `"status:pack" must pass \`--ignore-scripts\`; without it the dry run triggers packaging scripts and builds twice.`,
      );
    }
  }

  for (const name of UNCHAINED_SCRIPTS) {
    const script = scripts[name];
    if (script !== undefined && BUILD_INVOCATION.test(script)) {
      fail("build-chain", `"${name}" must not chain a build; \`hub\` builds first and chaining it again builds twice.`);
    }
  }
  return findings;
}

async function hasPlaywrightConfig(workspacePackage: WorkspacePackage): Promise<boolean> {
  const found = await Promise.all(PLAYWRIGHT_CONFIGS.map(async (config) => hasFile(workspacePackage, config)));
  return found.includes(true);
}

/**
 * Checks that a browser suite is reachable on its own and only on its own.
 *
 * The split exists so `pnpm test` stays a fast unit loop that needs no browser,
 * which only holds while the browser suite has its own script and no unit script
 * reaches it.
 * @param workspacePackage Package to inspect.
 * @returns Findings for a missing or wrongly reached browser suite.
 */
async function checkBrowserScripts(workspacePackage: WorkspacePackage): Promise<Finding[]> {
  const scripts = workspacePackage.scripts;
  const findings: Finding[] = [];

  for (const name of UNIT_TEST_SCRIPTS) {
    const script = scripts[name];
    if (script !== undefined && (PLAYWRIGHT_INVOCATION.test(script) || BROWSER_SCRIPT_INVOCATION.test(script))) {
      findings.push({
        code: "scripts/browser-chain",
        location: MANIFEST_LOCATION,
        message: `"${name}" must not run browser tests; they belong in "test:browser" so a unit run needs no browser.`,
        severity: "error",
      });
    }
  }

  if (!(await hasPlaywrightConfig(workspacePackage))) {
    return findings;
  }
  for (const name of BROWSER_TEST_SCRIPTS) {
    if (scripts[name] === undefined) {
      findings.push({
        code: name === "test:browser" ? "scripts/test-browser" : "scripts/test-browser-watch",
        location: MANIFEST_LOCATION,
        message: `Declares a Playwright config, so it ${name === "test:browser" ? "must" : "should"} define "${name}".`,
        severity: name === "test:browser" ? "error" : "warning",
      });
    }
  }
  return findings;
}

function declaresAssetsField(workspacePackage: WorkspacePackage): boolean {
  const codenhub = workspacePackage.manifest.codenhub;
  return isRecord(codenhub) && codenhub.assets !== undefined;
}

/**
 * Checks that a package's `codenhub.assets` entries resolve to real files.
 *
 * A `from` that does not exist would otherwise fail silently at build time, deep
 * inside `hub assets`, on whichever machine happens to run it next.
 * @param workspacePackage Package to inspect.
 * @param root Absolute repository root.
 * @returns Findings for malformed entries or a missing source file.
 */
async function checkAssets(workspacePackage: WorkspacePackage, root: string): Promise<Finding[]> {
  const manifestPath = join(workspacePackage.directory, MANIFEST_LOCATION);
  let entries: ReturnType<typeof parseAssetEntries>;
  try {
    entries = parseAssetEntries(workspacePackage.manifest, manifestPath);
  } catch (cause) {
    return [
      { code: "assets/invalid", location: MANIFEST_LOCATION, message: (cause as Error).message, severity: "error" },
    ];
  }

  const missing = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      exists: await isFileWithin(join(root, ASSETS_DIRECTORY), join(root, ASSETS_DIRECTORY, entry.from)),
    })),
  );
  return missing
    .filter(({ exists }) => !exists)
    .map(({ entry }) => ({
      code: "assets/missing-source",
      location: MANIFEST_LOCATION,
      message: `codenhub.assets references "${entry.from}", which does not exist under ${ASSETS_DIRECTORY}/.`,
      severity: "error" as const,
    }));
}

/**
 * Creates the rules that check package manifests against the lifecycle spec.
 * @param root Absolute repository root, used to resolve `codenhub.assets` sources.
 * @returns Manifest rules ready for registration.
 */
export function createManifestRules(root: string): CheckRule[] {
  return [
    {
      appliesTo: (workspacePackage) => !workspacePackage.isPrivate,
      name: "metadata",
      run: async ({ package: workspacePackage }) => checkMetadata(workspacePackage),
      summary: "Published packages declare the required manifest metadata.",
    },
    {
      appliesTo: () => true,
      name: "scripts",
      run: async ({ package: workspacePackage }) => [
        ...checkScripts(workspacePackage),
        ...(await checkBrowserScripts(workspacePackage)),
      ],
      summary: "Package scripts exist, stay unchained, and keep browser tests out of the unit loop.",
    },
    {
      appliesTo: declaresAssetsField,
      name: "assets",
      run: async ({ package: workspacePackage }) => checkAssets(workspacePackage, root),
      summary: "codenhub.assets entries resolve to real files under root assets/.",
    },
  ];
}
