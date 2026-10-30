import GithubSlugger, { slug } from "github-slugger";
import remarkParse from "remark-parse";
import { unified } from "unified";

import {
  type ReferenceEntrypoint,
  type ReferenceMember,
  type ReferenceNamedDoc,
  type ReferenceProse,
  type ReferenceSymbol,
} from "./reference-model.ts";

// Symbol-group headings, in the render order docs/specs/packages-reference.md sets.
const GROUP_HEADINGS: readonly { kind: ReferenceSymbol["kind"]; heading: string }[] = [
  { kind: "function", heading: "Functions" },
  { kind: "class", heading: "Classes" },
  { kind: "interface", heading: "Interfaces" },
  { kind: "type-alias", heading: "Type aliases" },
  { kind: "enum", heading: "Enumerations" },
  { kind: "variable", heading: "Variables" },
  { kind: "namespace", heading: "Namespaces" },
];

const LINK_PATTERN = /\{@link\s+([^}|]+?)(?:\s*\|\s*([^}]+?))?\s*\}/g;

const markdownParser = unified().use(remarkParse);

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>#]/g, "\\$&");
}

function nestHeadings(markdown: string, level: number): string {
  const edits: { start: number; end: number; text: string }[] = [];
  const visit = (
    node: ReturnType<typeof markdownParser.parse> | ReturnType<typeof markdownParser.parse>["children"][number],
  ): void => {
    if (node.type === "heading" && node.position !== undefined) {
      const start = node.position.start.offset ?? 0;
      const end = node.position.end.offset ?? start;
      const source = markdown.slice(start, end);
      const hashes = "#".repeat(Math.min(level + node.depth, 6));
      const atx = /^#{1,6}(?=\s|$)/.exec(source);
      edits.push(
        atx === null
          ? {
              start,
              end,
              text: `${hashes} ${source.replace(/\r?\n[^\n]*$/, "").replace(/\r?\n(?:[ \t]*>[ \t]?)*[ \t]*/g, " ")}`,
            }
          : { start, end: start + atx[0].length, text: hashes },
      );
    }
    if ("children" in node) {
      for (const child of node.children) {
        visit(child);
      }
    }
  };
  visit(markdownParser.parse(markdown));
  for (const edit of edits.reverse()) {
    markdown = markdown.slice(0, edit.start) + edit.text + markdown.slice(edit.end);
  }
  return markdown;
}

/**
 * The base heading-anchor slug for a symbol or member name, before page collisions.
 * @param name Symbol or member name.
 * @returns Its GitHub-style slug.
 */
export function symbolSlug(name: string): string {
  return slug(name);
}

/** Inputs the caller supplies alongside the entrypoint to render its page. */
export interface RenderReferencePageOptions {
  /**
   * Frontmatter `title` and sidebar label: the page's label, or else the package name
   * for the `.` entrypoint and the import subpath for the rest, so the sidebar stays terse.
   */
  title: string;
  /** Page H1: the page's label, or else the full import specifier, such as `@codenhub/error/registries/browser`. */
  heading: string;
  /** Repo-relative source root for the generated-file notice, such as `packages/error/src`. */
  sourceRoot: string;
  /** Frontmatter `description`; omit when the entry module carries no summary. */
  description?: string;
  /** Frontmatter `since`; omit when the entry module carries no `@since` tag. */
  since?: string;
  /** Frontmatter `order`; omit on the reference index page. */
  order?: number;
  /** Frontmatter `group`; set only on the reference index page. */
  group?: string;
  /** When `false`, only signature blocks are rendered — no TSDoc-derived prose. */
  prose: boolean;
  /**
   * Resolves a `{@link Name}` target to an href relative to this page. Same-page
   * targets resolve on their own; return `undefined` to fall back to inline code.
   */
  resolveLink?: (name: string) => string | undefined;
}

function yamlValue(value: string): string {
  return JSON.stringify(value);
}

function frontmatter(options: RenderReferencePageOptions): string {
  const lines = ["---", `title: ${yamlValue(options.title)}`];
  if (options.description !== undefined) {
    lines.push(`description: ${yamlValue(options.description)}`);
  }
  if (options.since !== undefined) {
    lines.push(`since: ${yamlValue(options.since)}`);
  }
  if (options.order !== undefined) {
    lines.push(`order: ${options.order}`);
  }
  if (options.group !== undefined) {
    lines.push(`group: ${yamlValue(options.group)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function resolveLinks(
  markdown: string,
  ownSlugs: ReadonlyMap<string, string>,
  resolve?: (name: string) => string | undefined,
): string {
  const prose: { start: number; end: number }[] = [];
  const protectedRanges: { start: number; end: number }[] = [];
  const visit = (
    node: ReturnType<typeof markdownParser.parse> | ReturnType<typeof markdownParser.parse>["children"][number],
  ): void => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start !== undefined && end !== undefined) {
      if (["code", "inlineCode", "html", "link", "linkReference"].includes(node.type)) {
        protectedRanges.push({ start, end });
        return;
      }
      if (node.type === "paragraph" || node.type === "heading") {
        prose.push({ start, end });
      }
    }
    if ("children" in node) {
      node.children.forEach(visit);
    }
  };
  visit(markdownParser.parse(markdown));
  return markdown.replace(LINK_PATTERN, (match, rawTarget: string, rawLabel: string | undefined, offset: number) => {
    const end = offset + match.length;
    if (
      !prose.some((range) => offset >= range.start && end <= range.end) ||
      protectedRanges.some((range) => offset < range.end && end > range.start)
    ) {
      return match;
    }
    const target = rawTarget.trim();
    const label = (rawLabel ?? target).trim();
    const ownSlug = ownSlugs.get(target);
    const href = resolve?.(target) ?? (ownSlug === undefined ? undefined : `#${ownSlug}`);
    return href === undefined ? `\`${label}\`` : `[${escapeMarkdown(label)}](${href})`;
  });
}

function codeBlock(source: string): string {
  return ["```ts", source.trim(), "```"].join("\n");
}

function listItem(text: string): string {
  return `- ${text.replace(/\n(?=.)/g, "\n  ")}`;
}

function namedDocList(
  heading: string,
  entries: readonly ReferenceNamedDoc[],
  link: (text: string) => string,
): string[] {
  const documented = entries.filter((entry) => entry.doc !== undefined);
  if (documented.length === 0) {
    return [];
  }
  return [
    `**${heading}**`,
    documented.map((entry) => listItem(`\`${entry.name}\` — ${link(entry.doc ?? "")}`)).join("\n"),
  ];
}

// A repeatable free-text tag section (@throws, @see). One entry reads as a
// `**Label** — text` line, matching how the single-valued @returns renders; two
// or more become a bulleted list.
function notesSection(heading: string, items: readonly string[], link: (text: string) => string): string[] {
  if (items.length === 0) {
    return [];
  }
  if (items.length === 1) {
    return [`**${heading}** — ${link(items[0] ?? "")}`];
  }
  return [`**${heading}**`, items.map((item) => listItem(link(item))).join("\n")];
}

// Markdown stops at H6; deeper nesting keeps the last level rather than breaking the page.
function heading(level: number, text: string): string {
  return `${"#".repeat(Math.min(level, 6))} ${escapeMarkdown(text)}`;
}

function memberBlocks(
  member: ReferenceMember,
  prose: boolean,
  link: (text: string) => string,
  level: number,
): string[] {
  if (member.inheritedFrom !== undefined) {
    if (!prose) {
      // An inherited member has no signature of its own to put in a manifest-only
      // page; the declaring type's own entry, and the `extends` clause in this
      // type's signature, are how a reader finds it instead.
      return [];
    }
    // An inherited member points at the type that declares it; that type's own
    // section carries the signature and prose.
    return [
      heading(level, member.name),
      member.inheritedFrom === "" ? "_Inherited._" : `Inherited from ${link(`{@link ${member.inheritedFrom}}`)}.`,
    ];
  }

  const blocks = [heading(level, member.name)];
  if (member.signature !== undefined) {
    blocks.push(codeBlock(member.signature));
  }
  if (prose) {
    blocks.push(...proseBlocks(member, link, level, member.defaultValue));
  }
  return blocks;
}

function deprecationNote(deprecated: string | true, link: (text: string) => string): string {
  const body = deprecated === true ? "**Deprecated.**" : `**Deprecated.** ${link(deprecated)}`;
  return body
    .split("\n")
    .map((line) => (line === "" ? ">" : `> ${line}`))
    .join("\n");
}

function proseBlocks(
  prose: ReferenceProse,
  resolve: (text: string) => string,
  level: number,
  defaultValue?: string,
): string[] {
  const link = (text: string): string => nestHeadings(resolve(text), level);
  const blocks: string[] = [];
  if (prose.deprecated !== undefined) {
    blocks.push(deprecationNote(prose.deprecated, link));
  }
  if (prose.doc !== undefined) {
    blocks.push(link(prose.doc));
  }
  blocks.push(...namedDocList("Parameters", prose.parameters, link));
  blocks.push(...namedDocList("Type parameters", prose.typeParameters, link));
  if (prose.returns !== undefined) {
    blocks.push(`**Returns** — ${link(prose.returns)}`);
  }
  blocks.push(...notesSection("Throws", prose.throws, link));
  if (defaultValue !== undefined) {
    blocks.push(`**Default** — ${link(defaultValue)}`);
  }
  if (prose.since !== undefined) {
    blocks.push(`**Since** — ${link(prose.since)}`);
  }
  for (const example of prose.examples) {
    blocks.push("**Example**", nestHeadings(example.trim(), level));
  }
  blocks.push(...notesSection("See also", prose.see, link));
  return blocks;
}

type PageBlock = string | { markdown: string; target: string };

/**
 * One symbol's section. A namespace member is a section one level deeper than the
 * symbol declaring it, headed by its dot-qualified name so its anchor is unique.
 * Overloads documented apart each get their own signature block and prose.
 */
function symbolBlocks(
  symbol: ReferenceSymbol,
  prose: boolean,
  link: (text: string) => string,
  level = 3,
  qualifiedName = symbol.name,
): PageBlock[] {
  const blocks: PageBlock[] = [{ markdown: heading(level, qualifiedName), target: qualifiedName }];

  if (symbol.overloads.length > 0) {
    for (const overload of symbol.overloads) {
      if (overload.signature !== undefined) {
        blocks.push(codeBlock(overload.signature));
      }
      if (prose) {
        blocks.push(...proseBlocks(overload, link, level));
      }
    }
  } else {
    if (symbol.signature !== undefined) {
      blocks.push(codeBlock(symbol.signature));
    }
    if (prose) {
      blocks.push(...proseBlocks(symbol, link, level, symbol.defaultValue));
    }
  }

  for (const member of symbol.members) {
    blocks.push(...memberBlocks(member, prose, link, level + 1));
  }
  for (const nested of symbol.namespaceMembers) {
    blocks.push(...symbolBlocks(nested, prose, link, level + 1, `${qualifiedName}.${nested.name}`));
  }
  return blocks;
}

/**
 * Renders one documented entrypoint to its Markdown reference page.
 *
 * The page carries the closed frontmatter schema from
 * `docs/specs/packages-documentation.md`, a generated-file notice, a single H1,
 * one H2 section per non-empty symbol group in spec order, and, last, the
 * unexported types those symbols' declarations name. Signature text is
 * taken from whatever `attachSignatures` filled in; `{@link}` references resolve
 * against this page and `options.resolveLink`, falling back to inline code.
 * @param entrypoint Entrypoint from the reference model, with signatures attached.
 * @param options Frontmatter values, the source-root notice, and link resolution.
 * @returns The page's Markdown, newline-terminated.
 */
export function renderReferencePage(entrypoint: ReferenceEntrypoint, options: RenderReferencePageOptions): string {
  const ownSlugs = referencePageSlugs(entrypoint, options);
  const link = (text: string): string => resolveLinks(text, ownSlugs, options.resolveLink);
  return (
    [
      frontmatter(options),
      `<!-- Generated by \`pnpm generate\` from ${options.sourceRoot}. Do not edit. -->`,
      ...pageBlocks(entrypoint, options, link).map((block) => (typeof block === "string" ? block : block.markdown)),
    ].join("\n\n") + "\n"
  );
}

function pageBlocks(
  entrypoint: ReferenceEntrypoint,
  options: Pick<RenderReferencePageOptions, "heading" | "prose">,
  link: (text: string) => string,
): PageBlock[] {
  const sections: PageBlock[] = [heading(1, options.heading)];

  for (const { kind, heading } of GROUP_HEADINGS) {
    const group = entrypoint.symbols.filter((symbol) => symbol.kind === kind);
    if (group.length === 0) {
      continue;
    }
    sections.push(`## ${heading}`);
    for (const symbol of group) {
      sections.push(...symbolBlocks(symbol, options.prose, link));
    }
  }

  if (entrypoint.internalTypes.length > 0) {
    sections.push("## Internal types");
    for (const type of entrypoint.internalTypes) {
      sections.push(heading(3, type.name), codeBlock(type.signature));
      if (options.prose && type.doc !== undefined) {
        sections.push(nestHeadings(link(type.doc), 3));
      }
      const files = type.declaredIn.map((file) => `\`${file}\``).join(", ");
      sections.push(`Not exported; declared in ${files}.`);
    }
  }

  return sections;
}

/**
 * Allocates symbol anchors over every rendered heading, including prose and members.
 * @param entrypoint The page's symbols and internal types.
 * @param options Page heading and whether prose is rendered.
 * @returns Qualified symbol names mapped to their collision-aware page anchors.
 */
export function referencePageSlugs(
  entrypoint: ReferenceEntrypoint,
  options: Pick<RenderReferencePageOptions, "heading" | "prose">,
): ReadonlyMap<string, string> {
  const targets = new Map<number, string>();
  let offset = 0;
  const markdown = pageBlocks(entrypoint, options, (text) => resolveLinks(text, new Map()))
    .map((block) => {
      const text = typeof block === "string" ? block : block.markdown;
      if (typeof block !== "string") {
        targets.set(offset, block.target);
      }
      offset += text.length + 2;
      return text;
    })
    .join("\n\n");
  const slugger = new GithubSlugger();
  const slugs = new Map<string, string>();
  type MarkdownNode =
    | ReturnType<typeof markdownParser.parse>
    | ReturnType<typeof markdownParser.parse>["children"][number];
  const textOf = (node: MarkdownNode): string => {
    if (node.type === "html") {
      return "";
    }
    return "value" in node ? node.value : "children" in node ? node.children.map(textOf).join("") : "";
  };
  const visit = (node: MarkdownNode): void => {
    if (node.type === "heading") {
      const anchor = slugger.slug(textOf(node));
      const target = targets.get(node.position?.start.offset ?? -1);
      if (target !== undefined) {
        slugs.set(target, anchor);
      }
    }
    if ("children" in node) {
      node.children.forEach(visit);
    }
  };
  visit(markdownParser.parse(markdown));
  return slugs;
}
