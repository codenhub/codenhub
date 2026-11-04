import { defaultShellMessages, type ShellMessages } from "@codenhub/app-shell/messages";

/** Every piece of interface text the documentation site renders around a document. */
export interface Dictionary {
  shell: ShellMessages;
  /** The header's link to the main site's package list. */
  packages: string;
  /** The mobile toggle that opens the package navigation. */
  browse: string;
  /** The package navigation's landmark. `{label}` is the package label. */
  packageNavigation: string;
  /** Marks a navigation entry whose page has no translation and opens in English. */
  inEnglish: string;
  /** The page outline's toggle and landmark. */
  onThisPage: string;
  sections: { changelog: string; guides: string; reference: string };
  demo: string;
  backToTop: string;
  linkPreview: string;
  pageActions: {
    copyAsMarkdown: string;
    copyPage: string;
    copied: string;
    copyFailed: string;
    more: string;
    copyDescription: string;
    view: string;
    viewDescription: string;
    download: string;
  };
}

export const en: Dictionary = {
  shell: defaultShellMessages,
  packages: "Packages",
  browse: "Browse documentation",
  packageNavigation: "{label} documentation",
  inEnglish: "in English",
  onThisPage: "On this page",
  sections: { changelog: "Changelog", guides: "Guides", reference: "Reference" },
  demo: "Demo",
  backToTop: "Back to top",
  linkPreview: "Link preview",
  pageActions: {
    copyAsMarkdown: "Copy page as Markdown",
    copyPage: "Copy page",
    copied: "Copied",
    copyFailed: "Copy failed",
    more: "More page actions",
    copyDescription: "As Markdown, ready to paste anywhere",
    view: "View Markdown",
    viewDescription: "The source text of this page",
    download: "Download Markdown",
  },
};
