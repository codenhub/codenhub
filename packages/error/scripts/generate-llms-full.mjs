import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(PACKAGE_PATH, "llms-full.txt");
const SOURCE_PATHS = ["README.md", "docs/index.md", "docs/error-normalization.md", "docs/results.md"];
const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const MARKDOWN_LINK_PATTERN = /(!?\[[^\]]*\]\()([^\s)]+)((?:\s+"[^"]*")?\))/g;

const rebaseLinks = (markdown, sourcePath) =>
  markdown.replace(MARKDOWN_LINK_PATTERN, (link, prefix, destination, suffix) => {
    if (/^(?:[a-z]+:|#)/i.test(destination)) {
      return link;
    }

    const [targetPath, fragment] = destination.split("#", 2);
    const rebasedPath = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), targetPath));
    return `${prefix}${rebasedPath}${fragment === undefined ? "" : `#${fragment}`}${suffix}`;
  });

const sections = await Promise.all(
  SOURCE_PATHS.map(async (sourcePath) => {
    const content = await readFile(path.join(PACKAGE_PATH, sourcePath), "utf8");
    const body = sourcePath.startsWith("docs/")
      ? rebaseLinks(content.replace(FRONTMATTER_PATTERN, ""), sourcePath)
      : content;
    return `<!-- Source: ${sourcePath} -->\n\n${body.trimEnd()}`;
  }),
);
const output = `${sections.join("\n\n---\n\n")}\n`;

if (process.argv.includes("--check")) {
  const currentOutput = await readFile(OUTPUT_PATH, "utf8");
  if (currentOutput !== output) {
    throw new Error("llms-full.txt is stale. Run pnpm generate:llms.");
  }
} else {
  await writeFile(OUTPUT_PATH, output);
}
