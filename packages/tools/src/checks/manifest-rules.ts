import type { WorkspacePackage } from "../workspace/discover.ts";
import { hasDocumentationMetadata } from "../workspace/package-policy.ts";
import type { CheckRule, Finding } from "./rule.ts";

const MANIFEST_LOCATION = "package.json";
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
const RECOMMENDED_FIELDS = ["description", "license", "repository"];
// `peerDependencies` is deliberately absent: a peer range is the consumer's
// contract, and a workspace range would publish as a pinned version.
const RESOLVED_DEPENDENCY_FIELDS = ["dependencies", "devDependencies", "optionalDependencies"];
// The negative lookahead keeps `pnpm build:styles` from reading as a chained
// `pnpm build`; only the umbrella script is the one root tooling already runs.
const BUILD_INVOCATION = /\b(?:pnpm|npm|yarn)\s+(?:run\s+)?build(?![\w:-])/;
const PACK_INVOCATION = /\bnpm\s+pack\b[^&|]*--dry-run\b/;
const PACK_IGNORES_SCRIPTS = /\bnpm\s+pack\b[^&|]*--ignore-scripts\b/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkMetadata(workspacePackage: WorkspacePackage): Finding[] {
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

function checkDependencies(workspacePackage: WorkspacePackage, workspaceNames: ReadonlySet<string>): Finding[] {
  const findings: Finding[] = [];
  for (const field of RESOLVED_DEPENDENCY_FIELDS) {
    const entries = workspacePackage.manifest[field];
    if (!isRecord(entries)) {
      continue;
    }
    for (const [name, range] of Object.entries(entries)) {
      if (workspaceNames.has(name) && !(typeof range === "string" && range.startsWith("workspace:"))) {
        findings.push({
          code: "dependencies/workspace-range",
          location: MANIFEST_LOCATION,
          message: `"${field}.${name}" should use a "workspace:" range.`,
          severity: "warning",
        });
      }
    }
  }
  return findings;
}

/**
 * Creates the rules that check package manifests against the lifecycle spec.
 * @param workspaceNames Every workspace package name, used to spot internal dependencies.
 * @returns Manifest rules ready for registration.
 */
export function createManifestRules(workspaceNames: ReadonlySet<string>): CheckRule[] {
  return [
    {
      appliesTo: (workspacePackage) => !workspacePackage.isPrivate,
      name: "metadata",
      run: ({ package: workspacePackage }) => checkMetadata(workspacePackage),
      summary: "Published packages declare the required manifest metadata.",
    },
    {
      appliesTo: () => true,
      name: "scripts",
      run: ({ package: workspacePackage }) => checkScripts(workspacePackage),
      summary: "Package scripts exist, stay unchained, and keep publishing self-contained.",
    },
    {
      appliesTo: () => true,
      name: "dependencies",
      run: ({ package: workspacePackage }) => checkDependencies(workspacePackage, workspaceNames),
      summary: "Workspace-internal dependencies use workspace ranges.",
    },
  ];
}
