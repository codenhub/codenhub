import { defaultShellMessages, type ShellMessages } from "@codenhub/app-shell/messages";
import { REFERENCE_LABELS, type ReferenceLabel } from "@codenhub/tools/documentation";

import { ENGLISH_LINK_PREVIEW_MESSAGES, type LinkPreviewMessages } from "../../lib/link-preview/describe-link";

/** Every piece of interface text the documentation site renders around a document. */
export interface Dictionary {
  shell: ShellMessages;
  /** The header's link to the main site's package list. */
  packages: string;
  /** The header's language menu. */
  language: string;
  /** The mobile toggle that opens the package navigation. */
  browse: string;
  /** The package navigation's landmark. `{label}` is the package label. */
  packageNavigation: string;
  /** Marks a navigation entry whose page has no translation and opens in English. */
  inEnglish: string;
  /** The notice above an untranslated page shown under a locale, whose body is in English. */
  untranslated: string;
  /** The page outline's toggle and landmark. */
  onThisPage: string;
  /** The package's version selector and an archived version's notice (`docs/specs/packages-docs-versions.md`). */
  versions: {
    /** The selector's accessible name. `{version}` is the version being read. */
    label: string;
    /** The notice above an archived version's page. `{version}` is its version. */
    archived: string;
    /** The notice's link to the same page in the current version. */
    readCurrent: string;
  };
  sections: { changelog: string; guides: string; reference: string };
  demo: string;
  backToTop: string;
  linkPreview: string;
  /** What a link preview card says about a link, its trail and actions. */
  linkPreviewCard: LinkPreviewMessages;
  /** The title a folder's own page takes among its siblings in the navigation. */
  overview: string;
  /** The text a generated reference page carries around its TSDoc. */
  reference: {
    /** The deck line under the H1. `{version}` is the version the entrypoint first shipped in. */
    addedIn: string;
    /** The generator's fixed labels (`REFERENCE_LABELS`), in the page's language. */
    labels: Record<ReferenceLabel, string>;
  };
  /** Controls added to a document's rendered Markdown. */
  markdown: {
    /** A heading's anchor link. `{heading}` is the heading text. */
    headingLink: string;
    copyCode: string;
    /** A code block's copy button. `{label}` is the block's language or title. */
    copyLanguageCode: string;
    /** The label of a code block with no language or title. */
    plainText: string;
  };
  notFound: { title: string; description: string; lede: string; browse: string };
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
  language: "Language",
  browse: "Browse documentation",
  packageNavigation: "{label} documentation",
  inEnglish: "in English",
  untranslated: "This page is not translated yet, so it is shown in English.",
  onThisPage: "On this page",
  versions: {
    label: "Version {version}, choose another",
    archived: "These are the docs for version {version}, an older release.",
    readCurrent: "Read the current version",
  },
  sections: { changelog: "Changelog", guides: "Guides", reference: "Reference" },
  demo: "Demo",
  backToTop: "Back to top",
  linkPreview: "Link preview",
  linkPreviewCard: ENGLISH_LINK_PREVIEW_MESSAGES,
  overview: "Overview",
  reference: { addedIn: "Added in {version}", labels: REFERENCE_LABELS },
  markdown: {
    headingLink: "Link to {heading}",
    copyCode: "Copy code",
    copyLanguageCode: "Copy {label} code",
    plainText: "Plain text",
  },
  notFound: {
    title: "Page not found",
    description: "The requested page could not be found.",
    lede: "This page moved or never existed. Package documentation is reorganized as packages change, so a saved link can outlive the page it pointed at.",
    browse: "Browse packages",
  },
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
