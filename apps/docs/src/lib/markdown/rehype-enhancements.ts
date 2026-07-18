import type { AstNode } from "./ast";
import { getNodeText } from "./ast";

interface MarkdownEnhancementOptions {
  siteOrigin?: string;
}

interface TransformContext extends MarkdownEnhancementOptions {
  codeBlockCount: number;
}

const SVG_PROPERTIES = {
  ariaHidden: "true",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 2,
  viewBox: "0 0 24 24",
};

function element(tagName: string, properties: Record<string, unknown>, children: AstNode[]): AstNode {
  return { type: "element", tagName, properties, children };
}

function icon(path: string, className?: string): AstNode {
  return element("svg", { ...SVG_PROPERTIES, ...(className === undefined ? {} : { className: [className] }) }, [
    element("path", { d: path }, []),
  ]);
}

function appendHeadingAnchor(node: AstNode): void {
  if ((node.tagName !== "h2" && node.tagName !== "h3") || typeof node.properties?.id !== "string") {
    return;
  }
  const headingText = getNodeText(node).trim();
  node.children ??= [];
  node.children.push(
    element(
      "a",
      {
        ariaLabel: `Link to ${headingText}`,
        className: ["heading-anchor"],
        href: `#${node.properties.id}`,
      },
      [
        icon(
          "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
          "heading-anchor-icon",
        ),
      ],
    ),
  );
}

export function isExternalLink(href: string, siteOrigin?: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  return siteOrigin === undefined || url.origin !== new URL(siteOrigin).origin;
}

function enhanceExternalLink(node: AstNode, siteOrigin?: string): void {
  const href = node.properties?.href;
  if (node.tagName !== "a" || typeof href !== "string" || !isExternalLink(href, siteOrigin)) {
    return;
  }

  const properties = (node.properties ??= {});
  const classNames = Array.isArray(properties.className) ? properties.className : [];
  const rels = Array.isArray(properties.rel) ? properties.rel : [];
  properties.className = [...classNames, "external-link"];
  properties.rel = [...rels, "external"];
  node.children ??= [];
  node.children.push(
    element("span", { ariaHidden: "true", className: ["external-link-icon"] }, [
      icon("M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"),
    ]),
  );
}

function createCopyButton(label: string, statusId: string): AstNode {
  return element(
    "button",
    {
      ariaDescribedBy: statusId,
      ariaLabel: `Copy ${label} code`,
      className: ["code-copy-button"],
      dataCodeCopy: "",
      title: "Copy code",
      type: "button",
    },
    [
      icon(
        "M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3",
        "copy-icon",
      ),
      icon("m5 12 4 4L19 6", "copied-icon"),
    ],
  );
}

function wrapCodeBlock(node: AstNode, context: TransformContext): AstNode {
  const label = node.properties?.dataCodeLabel;
  if (node.tagName !== "pre" || typeof label !== "string") {
    return node;
  }
  context.codeBlockCount += 1;
  const statusId = `code-copy-status-${context.codeBlockCount}`;
  return element("figure", { className: ["code-block"] }, [
    element("figcaption", { className: ["code-block-header"] }, [
      { type: "text", value: label, children: [] },
      createCopyButton(label, statusId),
      element("span", { ariaLive: "polite", className: ["code-copy-status", "sr-only"], id: statusId }, [
        { type: "text", value: "" },
      ]),
    ]),
    node,
  ]);
}

function transformChildren(node: AstNode, context: TransformContext): void {
  node.children = node.children?.map((child) => {
    transformChildren(child, context);
    appendHeadingAnchor(child);
    enhanceExternalLink(child, context.siteOrigin);
    return wrapCodeBlock(child, context);
  });
}

export function rehypeMarkdownEnhancements(options: MarkdownEnhancementOptions = {}): (tree: unknown) => void {
  return (tree) => transformChildren(tree as AstNode, { ...options, codeBlockCount: 0 });
}
