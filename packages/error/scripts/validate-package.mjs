import { execFileSync, execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path, { posix } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PACKAGE_PATH = path.resolve(path.dirname(SCRIPT_PATH), "..");
const REQUIRED_PATHS = ["README.md", "LICENSE", "docs/index.md", "llms.txt", "llms-full.txt"];
const FORBIDDEN_PREFIXES = ["coverage/", "docs/internal/", "node_modules/", "scripts/", "src/"];
const MARKDOWN_LINK_PATTERN = /!?\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g;
const EXTERNAL_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const getHeadingFragments = (markdown) =>
  new Set(
    [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map(([, heading]) =>
      heading
        .trim()
        .toLowerCase()
        .replace(/[`*_~]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-"),
    ),
  );

const getPublicDocumentationPaths = (directoryPath, relativePath = "docs") =>
  readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const entryRelativePath = posix.join(relativePath, entry.name);
    if (entryRelativePath.startsWith("docs/internal/")) {
      return [];
    }
    if (entry.isDirectory()) {
      return getPublicDocumentationPaths(path.join(directoryPath, entry.name), entryRelativePath);
    }
    return entryRelativePath.endsWith(".md") ? [entryRelativePath] : [];
  });

export const validateMarkdownLinks = ({ markdownPath, markdown, packedPaths, readMarkdown }) => {
  for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
    const destination = match[1];
    if (EXTERNAL_SCHEME_PATTERN.test(destination)) {
      let url;
      try {
        url = new URL(destination);
      } catch {
        throw new Error(`${markdownPath} contains invalid external URL ${destination}.`);
      }
      if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) {
        throw new Error(`${markdownPath} uses unsupported URL protocol ${url.protocol}.`);
      }
      continue;
    }

    const hashIndex = destination.indexOf("#");
    const targetPath = hashIndex === -1 ? destination : destination.slice(0, hashIndex);
    const fragment = hashIndex === -1 ? "" : destination.slice(hashIndex + 1);
    const resolvedPath =
      targetPath.length === 0 ? markdownPath : posix.normalize(posix.join(posix.dirname(markdownPath), targetPath));

    const isOutsidePackage = resolvedPath.startsWith("../");
    const isInternalDocumentation = resolvedPath.startsWith("docs/internal/");
    const isInvalidPublicDocumentTarget =
      markdownPath.startsWith("docs/") &&
      !resolvedPath.startsWith("docs/") &&
      resolvedPath !== "LICENSE" &&
      resolvedPath !== "NOTICE";
    if (isOutsidePackage || isInternalDocumentation || isInvalidPublicDocumentTarget) {
      throw new Error(`${markdownPath} links outside public package content: ${destination}.`);
    }
    if (!packedPaths.has(resolvedPath)) {
      throw new Error(`${markdownPath} links to unpacked path ${resolvedPath}.`);
    }
    if (fragment.length > 0 && !getHeadingFragments(readMarkdown(resolvedPath)).has(fragment)) {
      throw new Error(`${markdownPath} links to missing fragment ${destination}.`);
    }
  }
};

const validatePackage = () => {
  execFileSync(process.execPath, [path.join(PACKAGE_PATH, "scripts/generate-llms-full.mjs"), "--check"], {
    cwd: PACKAGE_PATH,
    stdio: "inherit",
  });

  const packOutput = execSync("npm pack --dry-run --json --ignore-scripts", {
    cwd: PACKAGE_PATH,
    encoding: "utf8",
  });
  const [packResult] = JSON.parse(packOutput);
  const packedPaths = new Set(packResult.files.map(({ path: packedPath }) => packedPath.replaceAll("\\", "/")));
  const packageJson = JSON.parse(readFileSync(path.join(PACKAGE_PATH, "package.json"), "utf8"));
  const publicDocumentationPaths = getPublicDocumentationPaths(path.join(PACKAGE_PATH, "docs"));

  for (const requiredPath of [...REQUIRED_PATHS, ...publicDocumentationPaths]) {
    if (!packedPaths.has(requiredPath)) {
      throw new Error(`Packed package is missing ${requiredPath}.`);
    }
  }
  for (const packedPath of packedPaths) {
    if (FORBIDDEN_PREFIXES.some((prefix) => packedPath.startsWith(prefix))) {
      throw new Error(`Packed package contains forbidden path ${packedPath}.`);
    }
  }
  for (const exportConditions of Object.values(packageJson.exports)) {
    for (const exportPath of Object.values(exportConditions)) {
      const packedPath = exportPath.replace(/^\.\//, "");
      if (!packedPaths.has(packedPath)) {
        throw new Error(`Packed package is missing exported file ${packedPath}.`);
      }
    }
  }

  const markdownPaths = ["README.md", "llms.txt", "llms-full.txt", ...publicDocumentationPaths];
  const readMarkdown = (markdownPath) => readFileSync(path.join(PACKAGE_PATH, markdownPath), "utf8");
  for (const markdownPath of markdownPaths) {
    validateMarkdownLinks({ markdownPath, markdown: readMarkdown(markdownPath), packedPaths, readMarkdown });
  }

  console.log(`Validated ${packedPaths.size} packed files and ${markdownPaths.length} Markdown surfaces.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  validatePackage();
}
