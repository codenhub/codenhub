import type { LinkPreviewIndex } from "./build-index";

/** A Lucide icon name; the card renders each from its own `virtual:@codenhub/icons/lucide/…` module. */
export type LinkPreviewIcon = "arrow-right" | "copy" | "external-link" | "mail" | "phone";

export type LinkPreviewAction =
  | { kind: "copy"; icon: LinkPreviewIcon; label: string; text: string }
  | { kind: "open"; href: string; icon: LinkPreviewIcon; label: string; isNewTab: boolean };

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

/** The card's text in the page's language. */
export interface LinkPreviewMessages {
  copyLink: string;
  newTab: string;
  open: string;
  externalSite: string;
  copyAddress: string;
  sendEmail: string;
  /** An email link's subject line. `{subject}` is the subject. */
  subject: string;
  email: string;
  copyNumber: string;
  call: string;
  phone: string;
}

export const ENGLISH_LINK_PREVIEW_MESSAGES: LinkPreviewMessages = {
  copyLink: "Copy link",
  newTab: "New tab",
  open: "Open",
  externalSite: "External site",
  copyAddress: "Copy address",
  sendEmail: "Send email",
  subject: "Subject: {subject}",
  email: "Email",
  copyNumber: "Copy number",
  call: "Call",
  phone: "Phone",
};

export interface DescribeLinkContext {
  /** The card's text; English when omitted. */
  messages?: LinkPreviewMessages;
  /** The page the link is on, which relative links resolve against. */
  pageUrl: string;
  previews: LinkPreviewIndex;
}

const COPY_ICON = "copy";

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function navigationActions(url: URL, messages: LinkPreviewMessages): LinkPreviewAction[] {
  return [
    { icon: COPY_ICON, kind: "copy", label: messages.copyLink, text: url.href },
    { href: url.href, icon: "external-link", isNewTab: true, kind: "open", label: messages.newTab },
    { href: url.href, icon: "arrow-right", isNewTab: false, kind: "open", label: messages.open },
  ];
}

function describeSiteLink(url: URL, previews: LinkPreviewIndex, messages: LinkPreviewMessages): LinkPreview {
  const fragment = decode(url.hash.slice(1));
  const entry = (fragment === "" ? undefined : previews[`${url.pathname}#${fragment}`]) ?? previews[url.pathname];
  const detail = decode(`${url.pathname}${url.search}${url.hash}`);
  if (entry !== undefined) {
    return {
      actions: navigationActions(url, messages),
      detail,
      summary: entry.summary,
      title: entry.title,
      trail: entry.trail,
    };
  }

  // A published file such as `LICENSE` or an image, or a page this build does not know.
  const fileName = decode(url.pathname.split("/").findLast((segment) => segment !== "") ?? url.host);
  return { actions: navigationActions(url, messages), detail, title: fileName, trail: [url.host] };
}

function describeExternalLink(url: URL, messages: LinkPreviewMessages): LinkPreview {
  return {
    actions: navigationActions(url, messages),
    detail: url.href,
    title: url.hostname.replace(/^www\./, ""),
    trail: [messages.externalSite],
  };
}

/** `mailto:` may carry several comma-separated recipients and a `?subject=` query. */
function describeEmailLink(url: URL, messages: LinkPreviewMessages): LinkPreview {
  const address = decode(url.pathname);
  const subject = url.searchParams.get("subject") ?? undefined;
  return {
    actions: [
      { icon: COPY_ICON, kind: "copy", label: messages.copyAddress, text: address },
      { href: url.href, icon: "mail", isNewTab: false, kind: "open", label: messages.sendEmail },
    ],
    summary: subject === undefined ? undefined : messages.subject.replace("{subject}", () => subject),
    title: address,
    trail: [messages.email],
  };
}

function describePhoneLink(url: URL, messages: LinkPreviewMessages): LinkPreview {
  const number = decode(url.pathname);
  return {
    actions: [
      { icon: COPY_ICON, kind: "copy", label: messages.copyNumber, text: number },
      { href: url.href, icon: "phone", isNewTab: false, kind: "open", label: messages.call },
    ],
    title: number,
    trail: [messages.phone],
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
export function describeLink(
  href: string,
  { messages = ENGLISH_LINK_PREVIEW_MESSAGES, pageUrl, previews }: DescribeLinkContext,
): LinkPreview | undefined {
  let url: URL;
  try {
    url = new URL(href, pageUrl);
  } catch {
    return undefined;
  }

  switch (url.protocol) {
    case "mailto:":
      return describeEmailLink(url, messages);
    case "tel:":
      return describePhoneLink(url, messages);
    case "http:":
    case "https:":
      return url.origin === new URL(pageUrl).origin
        ? describeSiteLink(url, previews, messages)
        : describeExternalLink(url, messages);
    default:
      return undefined;
  }
}
