import { unified } from "@astrojs/markdown-remark";

interface MarkdownNode {
  type: string;
  depth?: number;
  url?: string;
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, unknown> };
}

// A URL with a scheme, a protocol-relative URL, or an in-page fragment stays as written.
const UNRESOLVED_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu;

/**
 * Fits a README to the package page: demotes its leading title to an `<h2>`,
 * since the page has its own `<h1>`, styled to look like the page title. It
 * also resolves package-relative link and image URLs against `baseUrl`, since
 * they name files beside the README rather than site pages.
 */
function remarkPackageReadme(baseUrl: string) {
  const resolve = (node: MarkdownNode): void => {
    if (node.url !== undefined && !UNRESOLVED_URL.test(node.url)) {
      node.url = new URL(node.url, baseUrl).href;
    }
    node.children?.forEach(resolve);
  };
  return () => (tree: MarkdownNode) => {
    const first = tree.children?.[0];
    if (first?.type === "heading" && first.depth === 1) {
      first.depth = 2;
      first.data = { ...first.data, hProperties: { ...first.data?.hProperties, className: ["package-readme-title"] } };
    }
    resolve(tree);
  };
}

/**
 * Renders a package's README to HTML, highlighted like the documentation site.
 * @param source The README's Markdown.
 * @param baseUrl Where the README's directory is browsable, ending in `/`; its relative links resolve against it.
 * @returns The rendered HTML.
 */
export async function renderReadme(source: string, baseUrl: string): Promise<string> {
  // One page renders each README once, so the renderer is not kept.
  const renderer = await unified({ remarkPlugins: [remarkPackageReadme(baseUrl)] }).createRenderer({
    shikiConfig: { theme: "github-dark-default" },
  });
  return (await renderer.render(source)).code;
}
