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

export function getCodeBlockLabel({ language, meta }: CodeBlockOptions): string {
  const title = parseCodeTitle(meta);
  if (title !== undefined) {
    return title;
  }
  if (language === undefined || language.trim() === "") {
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
      node.properties.dataCodeLabel = getCodeBlockLabel({
        language: this.options.lang,
        meta: this.options.meta?.__raw,
      });
    },
  };
}
