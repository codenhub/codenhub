import { slug } from "github-slugger";

import type { ReferenceEntrypoint, ReferenceMember, ReferenceNamedDoc, ReferenceSymbol } from "./reference-model.ts";

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

/**
 * The heading-anchor slug for a symbol or member name.
 *
 * The generator uses the same function for cross-page `{@link}` targets so a
 * link and the heading it points at always agree, matching how the docs site
 * derives its own heading ids.
 * @param name Symbol or member name.
 * @returns Its GitHub-style slug.
 */
export function symbolSlug(name: string): string {
  return slug(name);
}

/** Inputs the caller supplies alongside the entrypoint to render its page. */
export interface RenderReferencePageOptions {
  /**
   * Frontmatter `title` and sidebar label: the entrypoint's import subpath, `/`
   * for the `.` entrypoint. Decoupled from the H1 so the sidebar stays terse.
   */
  title: string;
  /** Page H1: the full import specifier, such as `@codenhub/error/registries/browser`. */
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
  return /^[\w .,'()/-]+$/.test(value) && !/^\s|\s$/.test(value) ? value : JSON.stringify(value);
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
  ownNames: ReadonlySet<string>,
  resolve?: (name: string) => string | undefined,
): string {
  return markdown.replace(LINK_PATTERN, (_match, rawTarget: string, rawLabel: string | undefined) => {
    const target = rawTarget.trim();
    const label = (rawLabel ?? target).trim();
    const href = resolve?.(target) ?? (ownNames.has(target) ? `#${symbolSlug(target)}` : undefined);
    return href === undefined ? `\`${label}\`` : `[${label}](${href})`;
  });
}

function codeBlock(source: string): string {
  return ["```ts", source.trim(), "```"].join("\n");
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
  return [`**${heading}**`, documented.map((entry) => `- \`${entry.name}\` — ${link(entry.doc ?? "")}`).join("\n")];
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
  return [`**${heading}**`, items.map((item) => `- ${link(item)}`).join("\n")];
}

function memberBlocks(member: ReferenceMember, prose: boolean, link: (text: string) => string): string[] {
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
      `#### ${member.name}`,
      member.inheritedFrom === "" ? "_Inherited._" : `Inherited from ${link(`{@link ${member.inheritedFrom}}`)}.`,
    ];
  }

  const blocks = [`#### ${member.name}`];
  if (member.signature !== undefined) {
    blocks.push(codeBlock(member.signature));
  }
  if (prose && member.deprecated !== undefined) {
    blocks.push(deprecationNote(member.deprecated, link));
  }
  if (prose && member.doc !== undefined) {
    blocks.push(link(member.doc));
  }
  if (prose) {
    blocks.push(...namedDocList("Parameters", member.parameters, link));
  }
  return blocks;
}

function deprecationNote(deprecated: string | true, link: (text: string) => string): string {
  return deprecated === true ? "> **Deprecated.**" : `> **Deprecated.** ${link(deprecated)}`;
}

function symbolBlocks(symbol: ReferenceSymbol, prose: boolean, link: (text: string) => string): string[] {
  const blocks = [`### ${symbol.name}`];

  if (symbol.signature !== undefined) {
    blocks.push(codeBlock(symbol.signature));
  }

  if (prose && symbol.deprecated !== undefined) {
    blocks.push(deprecationNote(symbol.deprecated, link));
  }
  if (prose && symbol.doc !== undefined) {
    blocks.push(link(symbol.doc));
  }
  if (prose) {
    blocks.push(...namedDocList("Parameters", symbol.parameters, link));
    blocks.push(...namedDocList("Type parameters", symbol.typeParameters, link));
    if (symbol.returns !== undefined) {
      blocks.push(`**Returns** — ${link(symbol.returns)}`);
    }
    blocks.push(...notesSection("Throws", symbol.throws, link));
    if (symbol.defaultValue !== undefined) {
      blocks.push(`**Default** — ${link(symbol.defaultValue)}`);
    }
    if (symbol.since !== undefined) {
      blocks.push(`**Since** — ${link(symbol.since)}`);
    }
    for (const example of symbol.examples) {
      blocks.push("**Example**", example.trim());
    }
    blocks.push(...notesSection("See also", symbol.see, link));
  }

  for (const member of symbol.members) {
    blocks.push(...memberBlocks(member, prose, link));
  }
  return blocks;
}

/**
 * Renders one documented entrypoint to its Markdown reference page.
 *
 * The page carries the closed frontmatter schema from
 * `docs/specs/packages-documentation.md`, a generated-file notice, a single H1,
 * and one H2 section per non-empty symbol group in spec order. Signature text is
 * taken from whatever `attachSignatures` filled in; `{@link}` references resolve
 * against this page and `options.resolveLink`, falling back to inline code.
 * @param entrypoint Entrypoint from the reference model, with signatures attached.
 * @param options Frontmatter values, the source-root notice, and link resolution.
 * @returns The page's Markdown, newline-terminated.
 */
export function renderReferencePage(entrypoint: ReferenceEntrypoint, options: RenderReferencePageOptions): string {
  const ownNames = new Set(entrypoint.symbols.map((symbol) => symbol.name));
  const link = (text: string): string => resolveLinks(text, ownNames, options.resolveLink);

  const sections: string[] = [
    frontmatter(options),
    `<!-- Generated by \`pnpm generate\` from ${options.sourceRoot}. Do not edit. -->`,
    `# ${options.heading}`,
  ];

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

  return `${sections.join("\n\n")}\n`;
}
