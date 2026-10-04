import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { WorkspacePackage } from "../workspace/discover.ts";
import type { CheckRule, Finding } from "./rule.ts";

const MANIFEST_LOCATION = "package.json";
const README = "README.md";
const DOCS_DIRECTORY = "docs";
const PIN_FILE = ".nvmrc";
// Internal docs are not shipped, and a changelog page describes the floor of the
// release it belongs to, so neither has to name the current one.
const UNSTATED_DOCS = new Set(["internal", "changelog"]);
const VERSION = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;
const LOWER_BOUND = /^>=\s*(\d+(?:\.\d+){0,2})$/;
// "Node.js 24 or newer" in prose and "| Node.js | 24 or newer" in a table both
// state a floor; "every supported Node.js version" states none.
const STATED_FLOOR = /Node\.js[^\n\d]*?(\d+(?:\.\d+){0,2}) or newer/g;

type Version = readonly [number, number, number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseVersion(text: string): Version | undefined {
  const match = VERSION.exec(text.trim());
  if (match === null) {
    return undefined;
  }
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareVersions(left: Version, right: Version): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

function declaredNodeRange(workspacePackage: WorkspacePackage): unknown {
  const engines = workspacePackage.manifest.engines;
  return isRecord(engines) ? engines.node : undefined;
}

async function readText(path: string): Promise<string | undefined> {
  return readFile(path, "utf8").catch(() => undefined);
}

/**
 * Lists the package's public Markdown documents, relative to the package.
 * @param directory Absolute package directory.
 * @returns Package-relative POSIX paths.
 */
async function publicDocs(directory: string): Promise<string[]> {
  const entries = await readdir(join(directory, DOCS_DIRECTORY), { recursive: true }).catch(() => []);
  return entries
    .map((entry) => entry.split("\\").join("/"))
    .filter((entry) => entry.endsWith(".md") && !UNSTATED_DOCS.has(entry.split("/")[0] ?? ""))
    .map((entry) => `${DOCS_DIRECTORY}/${entry}`)
    .sort();
}

function statedFloors(text: string): string[] {
  return [...text.matchAll(STATED_FLOOR)].map((match) => match[1] ?? "");
}

/**
 * Checks a declared Node.js floor against the pinned toolchain and the documents that repeat it.
 * @param workspacePackage Package to inspect.
 * @param pin Contents of the root `.nvmrc`, or `undefined` when it cannot be read.
 * @returns Findings for a floor CI does not test or that the docs misstate.
 */
async function checkNodeFloor(workspacePackage: WorkspacePackage, pin: string | undefined): Promise<Finding[]> {
  const fail = (code: string, message: string, location = MANIFEST_LOCATION): Finding => ({
    code: `engines/${code}`,
    location,
    message,
    severity: "error",
  });

  const range = declaredNodeRange(workspacePackage);
  const bound = typeof range === "string" ? LOWER_BOUND.exec(range.trim()) : null;
  if (bound === null) {
    return [
      fail("node-range", `"engines.node" must be a lower bound only, such as ">=24"; got ${JSON.stringify(range)}.`),
    ];
  }
  const floorText = bound[1] ?? "";
  const floor = parseVersion(floorText);
  const pinned = pin === undefined ? undefined : parseVersion(pin);
  if (floor === undefined || pinned === undefined) {
    return [
      fail("pin", `The root ${PIN_FILE} must hold one Node.js version to compare "engines.node" against.`, PIN_FILE),
    ];
  }

  const findings: Finding[] = [];
  if (floor[0] < pinned[0]) {
    findings.push(
      fail(
        "node-below-pin",
        `"engines.node" is ${range as string}, but CI runs only Node.js ${pin?.trim()}; declare ">=${pinned[0]}", the pinned major.`,
      ),
    );
  } else if (compareVersions(floor, pinned) > 0) {
    findings.push(
      fail(
        "node-above-pin",
        `"engines.node" is ${range as string}, above the Node.js ${pin?.trim()} CI runs, so no run satisfies it.`,
      ),
    );
  }

  const readme = await readText(join(workspacePackage.directory, README));
  if (readme !== undefined) {
    const stated = statedFloors(readme);
    if (stated.length === 0) {
      findings.push(
        fail("readme", `The README must state the Node.js floor, "Node.js ${floorText} or newer".`, README),
      );
    }
  }
  const docs = await publicDocs(workspacePackage.directory);
  const texts = await Promise.all(docs.map(async (location) => readText(join(workspacePackage.directory, location))));
  const documents: [string, string | undefined][] = [
    [README, readme],
    ...docs.map((location, index): [string, string | undefined] => [location, texts[index]]),
  ];
  for (const [location, text] of documents) {
    const wrong = [...new Set(statedFloors(text ?? ""))].filter((stated) => stated !== floorText);
    if (wrong.length > 0) {
      findings.push(
        fail(
          location === README ? "readme" : "docs",
          `States Node.js ${wrong.join(", ")} or newer, but "engines.node" is ${range as string}.`,
          location,
        ),
      );
    }
  }
  return findings;
}

/**
 * Creates the rule that checks a package's Node.js floor against the lifecycle spec.
 *
 * Only a declared floor is checked. Whether a package runs on Node.js at all, and
 * so whether it should declare one, is not knowable from its files.
 * @param root Absolute repository root, where `.nvmrc` pins the Node.js version CI runs.
 * @returns Engines rules ready for registration.
 */
export function createEnginesRules(root: string): CheckRule[] {
  let pin: Promise<string | undefined> | undefined;
  return [
    {
      appliesTo: (workspacePackage) => !workspacePackage.isPrivate && declaredNodeRange(workspacePackage) !== undefined,
      name: "engines",
      run: async ({ package: workspacePackage }) => {
        pin ??= readText(join(root, PIN_FILE));
        return checkNodeFloor(workspacePackage, await pin);
      },
      summary: "A declared Node.js floor is the pinned major, and the README and public docs state it.",
    },
  ];
}
