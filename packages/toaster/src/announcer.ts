import { getToastLayerHost } from "./dom";
import type { ToastRole } from "./types";

/**
 * How long a newly inserted region waits before its first text. A live
 * region that arrives already holding its text, or gets it in the same
 * task, is often missed: assistive technology announces changes to a
 * region it already tracks, and it only starts tracking one after the
 * insertion reaches the accessibility tree (W3C technique ARIA22).
 */
const FIRST_ANNOUNCEMENT_DELAY_MS = 100;

/** How long an announced line stays in its region before it is removed, so stale text does not pile up in browse mode. */
const ANNOUNCEMENT_LIFETIME_MS = 7000;

type Politeness = "polite" | "assertive";

/** Regions still inside their first-announcement delay, with the text waiting for it. */
const pendingLines = new WeakMap<HTMLElement, string[]>();

/** Visually hides a region while keeping it in the accessibility tree. Set through the CSSOM, so it needs no stylesheet and passes a `style-src` CSP. */
const VISUALLY_HIDDEN: Readonly<Record<string, string>> = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: "0",
  border: "0",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  "clip-path": "inset(50%)",
  "white-space": "nowrap",
};

function findRegion(parent: HTMLElement, instanceId: string, politeness: Politeness): HTMLElement | null {
  for (const child of parent.children) {
    if (
      child.getAttribute("data-toast-announcer") === politeness &&
      child.getAttribute("data-toast-instance") === instanceId
    ) {
      return child as HTMLElement;
    }
  }
  return null;
}

function createRegion(parent: HTMLElement, instanceId: string, politeness: Politeness): HTMLElement {
  const region = parent.ownerDocument.createElement("div");
  region.setAttribute("data-toast-announcer", politeness);
  // Carries the instance attribute so `removeInstanceContainers` removes it on destroy.
  region.setAttribute("data-toast-instance", instanceId);
  region.setAttribute("aria-live", politeness);
  for (const [property, value] of Object.entries(VISUALLY_HIDDEN)) {
    region.style.setProperty(property, value);
  }
  parent.appendChild(region);
  return region;
}

function appendLine(region: HTMLElement, text: string): void {
  const line = region.ownerDocument.createElement("div");
  line.textContent = text;
  region.appendChild(line);
  setTimeout(() => line.remove(), ANNOUNCEMENT_LIFETIME_MS);
}

export interface AnnounceParams {
  parent: HTMLElement;
  instanceId: string;
  role: ToastRole;
  text: string;
}

/**
 * Speaks a toast's text through one of its instance's two hidden live
 * regions: `status` toasts through the polite one, `alert` toasts through
 * the assertive one. The toast element itself is not a live region; its
 * text is added and replaced in the same task it is built in, which
 * assistive technology does not reliably announce.
 */
export function announce(params: AnnounceParams): void {
  const { parent, instanceId, role, text } = params;
  if (text.length === 0) {
    return;
  }
  const politeness: Politeness = role === "alert" ? "assertive" : "polite";
  const host = getToastLayerHost(parent, instanceId);
  const existing = findRegion(host, instanceId, politeness);
  if (existing) {
    const pending = pendingLines.get(existing);
    if (pending) {
      pending.push(text);
    } else {
      appendLine(existing, text);
    }
    return;
  }

  const region = createRegion(host, instanceId, politeness);
  const pending = [text];
  pendingLines.set(region, pending);
  setTimeout(() => {
    pendingLines.delete(region);
    // A dialog opened since the region was added, which makes the region
    // inert. A dialog that is only closing is still modal, so its own
    // region is not.
    const isInert = getToastLayerHost(parent, instanceId) !== host && host === parent;
    if (region.isConnected && !isInert) {
      pending.forEach((line) => appendLine(region, line));
    } else if (region.isConnected || (host !== parent && host.isConnected)) {
      // Either the region is inert, or the dialog that held it closed and
      // was cleared before the region was ready. The dialog stays in the
      // document until the instance is destroyed, so the toasts are still
      // showing: announce through the current host instead.
      pending.forEach((line) => announce({ parent, instanceId, role, text: line }));
    }
  }, FIRST_ANNOUNCEMENT_DELAY_MS);
}
