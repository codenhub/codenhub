import { unified } from "@astrojs/markdown-remark";

interface MarkdownNode {
  type: string;
  depth?: number;
  identifier?: string;
  url?: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown> };
}

/** Where a README's package-relative URLs resolve, each ending in `/`. */
export interface ReadmeBases {
  /** Where its directory is browsable, for links. */
  baseUrl: string;
  /** Where its files are served as they are, for images, which a file viewer page cannot be. */
  imageBaseUrl: string;
}

// A URL with a scheme, a protocol-relative URL, or an in-page fragment stays as written.
const UNRESOLVED_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu;

function walk(node: MarkdownNode, visit: (node: MarkdownNode) => void): void {
  visit(node);
  node.children?.forEach((child) => walk(child, visit));
}

/**
 * Fits a README to the package page: demotes its leading title to an `<h2>`,
 * since the page has its own `<h1>`, styled to look like the page title. It
 * also resolves package-relative URLs, since they name files beside the README
 * rather than site pages: images against `imageBaseUrl`, links against `baseUrl`.
 *
 * Only Markdown links, images, and definitions are resolved. Raw HTML reaches
 * the renderer as unparsed strings, so a relative `src` or `href` written in it,
 * such as `<img src="docs/logo.svg">`, stays relative to the package page and
 * breaks. No package README uses raw HTML today; one that does should write
 * absolute URLs, or parse its HTML here first.
 */
function remarkPackageReadme({ baseUrl, imageBaseUrl }: ReadmeBases) {
  return () => (tree: MarkdownNode) => {
    const first = tree.children?.[0];
    if (first?.type === "heading" && first.depth === 1) {
      first.depth = 2;
      first.data = { ...first.data, hProperties: { ...first.data?.hProperties, className: ["package-readme-title"] } };
    }

    // A reference-style image takes its URL from a definition, which says nothing of what uses it.
    const imageDefinitions = new Set<string>();
    walk(tree, (node) => {
      if (node.type === "imageReference" && node.identifier !== undefined) {
        imageDefinitions.add(node.identifier);
      }
    });
    walk(tree, (node) => {
      if (node.url === undefined || UNRESOLVED_URL.test(node.url)) {
        return;
      }
      const isImage =
        node.type === "image" ||
        (node.type === "definition" && node.identifier !== undefined && imageDefinitions.has(node.identifier));
      node.url = new URL(node.url, isImage ? imageBaseUrl : baseUrl).href;
    });
  };
}

/**
 * Renders a package's README to HTML, highlighted like the documentation site.
 * @param source The README's Markdown.
 * @param bases Where its package-relative links and images resolve.
 * @returns The rendered HTML.
 */
export async function renderReadme(source: string, bases: ReadmeBases): Promise<string> {
  // One page renders each README once, so the renderer is not kept.
  const renderer = await unified({ remarkPlugins: [remarkPackageReadme(bases)] }).createRenderer({
    shikiConfig: { theme: "github-dark-default" },
  });
  return (await renderer.render(source)).code;
}
