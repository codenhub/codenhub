import type { LinkPreviewIndex } from "./build-index";

export type LinkPreviewAction =
  | { kind: "copy"; icon: string; label: string; text: string }
  | { kind: "open"; href: string; icon: string; label: string; isNewTab: boolean };

/** Everything a link preview card shows for one link. */
export interface LinkPreview {
  actions: LinkPreviewAction[];
  /** The target spelled out, such as a path or a full URL; omitted when the title already is it. */
  detail?: string;
  summary?: string;
  title: string;
  /** Where the target sits, outermost first. */
  trail: string[];
}

export interface DescribeLinkContext {
  /** The page the link is on, which relative links resolve against. */
  pageUrl: string;
  previews: LinkPreviewIndex;
}

const COPY_ICON = "ic-lucide-copy";

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function navigationActions(url: URL): LinkPreviewAction[] {
  return [
    { icon: COPY_ICON, kind: "copy", label: "Copy link", text: url.href },
    { href: url.href, icon: "ic-lucide-external-link", isNewTab: true, kind: "open", label: "New tab" },
    { href: url.href, icon: "ic-lucide-arrow-right", isNewTab: false, kind: "open", label: "Open" },
  ];
}

function describeSiteLink(url: URL, previews: LinkPreviewIndex): LinkPreview {
  const fragment = decode(url.hash.slice(1));
  const entry = (fragment === "" ? undefined : previews[`${url.pathname}#${fragment}`]) ?? previews[url.pathname];
  const detail = decode(`${url.pathname}${url.search}${url.hash}`);
  if (entry !== undefined) {
    return { actions: navigationActions(url), detail, summary: entry.summary, title: entry.title, trail: entry.trail };
  }

  // A published file such as `LICENSE` or an image, or a page this build does not know.
  const fileName = decode(url.pathname.split("/").findLast((segment) => segment !== "") ?? url.host);
  return { actions: navigationActions(url), detail, title: fileName, trail: [url.host] };
}

function describeExternalLink(url: URL): LinkPreview {
  return {
    actions: navigationActions(url),
    detail: url.href,
    title: url.hostname.replace(/^www\./, ""),
    trail: ["External site"],
  };
}

/** `mailto:` may carry several comma-separated recipients and a `?subject=` query. */
function describeEmailLink(url: URL): LinkPreview {
  const address = decode(url.pathname);
  const subject = url.searchParams.get("subject") ?? undefined;
  return {
    actions: [
      { icon: COPY_ICON, kind: "copy", label: "Copy address", text: address },
      { href: url.href, icon: "ic-lucide-mail", isNewTab: false, kind: "open", label: "Send email" },
    ],
    summary: subject === undefined ? undefined : `Subject: ${subject}`,
    title: address,
    trail: ["Email"],
  };
}

function describePhoneLink(url: URL): LinkPreview {
  const number = decode(url.pathname);
  return {
    actions: [
      { icon: COPY_ICON, kind: "copy", label: "Copy number", text: number },
      { href: url.href, icon: "ic-lucide-phone", isNewTab: false, kind: "open", label: "Call" },
    ],
    title: number,
    trail: ["Phone"],
  };
}

/**
 * Says what a link leads to, for the docs site's link preview card.
 *
 * Pages and sections on this site read their title and summary from the
 * preview index. Other web links show their host and full URL, and email and
 * phone links show the address or number with a way to copy it. Any other
 * scheme returns `undefined` and gets no card.
 */
export function describeLink(href: string, { pageUrl, previews }: DescribeLinkContext): LinkPreview | undefined {
  let url: URL;
  try {
    url = new URL(href, pageUrl);
  } catch {
    return undefined;
  }

  switch (url.protocol) {
    case "mailto:":
      return describeEmailLink(url);
    case "tel:":
      return describePhoneLink(url);
    case "http:":
    case "https:":
      return url.origin === new URL(pageUrl).origin ? describeSiteLink(url, previews) : describeExternalLink(url);
    default:
      return undefined;
  }
}
