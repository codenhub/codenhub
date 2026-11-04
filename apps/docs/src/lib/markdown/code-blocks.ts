import type { AstNode } from "./ast";

const LANGUAGE_LABELS: Readonly<Record<string, string>> = {
  astro: "Astro",
  bash: "Shell",
  css: "CSS",
  html: "HTML",
  js: "JavaScript",
  javascript: "JavaScript",
  json: "JSON",
  jsx: "JSX",
  markdown: "Markdown",
  md: "Markdown",
  sh: "Shell",
  shell: "Shell",
  ts: "TypeScript",
  tsx: "TSX",
  typescript: "TypeScript",
  yaml: "YAML",
  yml: "YAML",
};

interface CodeBlockOptions {
  language?: string;
  meta?: string;
}

interface ShikiTransformerContext {
  options: {
    lang?: string;
    meta?: { __raw?: string };
  };
}

interface CodeBlockTransformer {
  name: string;
  pre: (this: ShikiTransformerContext, node: AstNode) => void;
}

export function parseCodeTitle(meta: string | undefined): string | undefined {
  const title = meta?.match(/(?:^|\s)title=(['"])([^'"\r\n]+)\1(?:\s|$)/)?.[2]?.trim();
  return title === "" ? undefined : title;
}

// Astro hands Shiki `plaintext` for a fence written with no language.
function isUnlabelledLanguage(language: string | undefined): boolean {
  return language === undefined || language.trim() === "" || language === "plaintext";
}

function isPlainTextBlock({ language, meta }: CodeBlockOptions): boolean {
  return parseCodeTitle(meta) === undefined && isUnlabelledLanguage(language);
}

export function getCodeBlockLabel({ language, meta }: CodeBlockOptions): string {
  const title = parseCodeTitle(meta);
  if (title !== undefined) {
    return title;
  }
  if (language === undefined || isUnlabelledLanguage(language)) {
    return "Plain text";
  }

  const normalizedLanguage = language.toLowerCase();
  return (
    LANGUAGE_LABELS[normalizedLanguage] ??
    normalizedLanguage.replaceAll(/[-_]+/g, " ").replace(/^./, (character) => character.toUpperCase())
  );
}

export function createCodeBlockTransformer(): CodeBlockTransformer {
  return {
    name: "codenhub-code-block-label",
    pre(node) {
      node.properties ??= {};
      const options = { language: this.options.lang, meta: this.options.meta?.__raw };
      node.properties.dataCodeLabel = getCodeBlockLabel(options);
      // The transformer does not know the document's language, so the
      // Markdown enhancements relabel this block in it.
      if (isPlainTextBlock(options)) {
        node.properties.dataCodePlain = "";
      }
    },
  };
}
