import type { IconFamilyData } from "@codenhub/icons";

import type { IconEntry } from "./types.ts";

/** Actions the icon modal hands back to the demo. */
export interface ModalHandlers {
  /** Copy the markup that renders the icon. */
  onCopyHtml: (entry: IconEntry) => void;
  /** Copy the icon's SVG source. */
  onCopySvg: (entry: IconEntry) => void;
  /** Save the icon's SVG source to a file. */
  onDownload: (entry: IconEntry) => void;
}

/** The demo's icon detail dialog. */
export interface IconModal {
  /** Opens the dialog for one icon of a family, focusing it and remembering the triggering element. */
  open: (entry: IconEntry, family: IconFamilyData, trigger?: HTMLElement) => void;
  /** Redraws the open dialog, after a stroke width change for instance. */
  refresh: () => void;
  /**
   * Closes the dialog, such as when the icon it shows no longer belongs to the
   * selected family.
   *
   * @param options - Set `restoreFocus: false` when the triggering element is
   * about to be removed, such as during a family switch.
   * @returns Whether the dialog was open.
   */
  close: (options?: { restoreFocus?: boolean }) => boolean;
}

function element<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/**
 * Wires the icon detail dialog to the elements already in the page.
 *
 * @param handlers - Callbacks for the dialog's copy and download actions.
 * @returns Controls for opening and refreshing the dialog.
 */
export function createModal(handlers: ModalHandlers): IconModal {
  const backdrop = element<HTMLElement>("icon-modal-backdrop");
  const preview = element<HTMLElement>("modal-icon-upscaled");
  const title = element<HTMLElement>("modal-icon-title");
  const familyBadge = element<HTMLAnchorElement>("modal-family-badge");
  const licenseBadge = element<HTMLAnchorElement>("modal-license-badge");
  const tagList = element<HTMLElement>("modal-tags");
  const snippet = element<HTMLElement>("modal-code-snippet");
  const closeButton = element<HTMLButtonElement>("modal-close-btn");

  let current: { entry: IconEntry; family: IconFamilyData } | undefined;
  let triggerElement: HTMLElement | undefined;

  function draw(): void {
    if (!current) {
      return;
    }
    const { entry, family } = current;

    if (preview) {
      const icon = document.createElement("i");
      icon.className = entry.className;
      preview.replaceChildren(icon);
    }
    if (title) {
      title.textContent = entry.name;
    }
    if (familyBadge) {
      familyBadge.href = family.info.author.url;
      const label = familyBadge.querySelector<HTMLSpanElement>("span");
      if (label) {
        label.textContent = family.info.name;
      }
    }
    if (licenseBadge) {
      licenseBadge.href = family.info.license.url;
      const label = licenseBadge.querySelector<HTMLSpanElement>("span");
      if (label) {
        label.textContent = family.info.license.spdx;
      }
    }
    if (tagList) {
      tagList.textContent = entry.tags.join(", ");
    }
    if (snippet) {
      snippet.textContent = `<i class="${entry.className}"></i>`;
    }
  }

  function close(options?: { restoreFocus?: boolean }): boolean {
    const wasOpen = current !== undefined;
    backdrop?.classList.remove("open");
    current = undefined;
    if (wasOpen && options?.restoreFocus !== false) {
      triggerElement?.focus();
    }
    triggerElement = undefined;
    return wasOpen;
  }

  closeButton?.addEventListener("click", close);
  backdrop?.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });

  element<HTMLButtonElement>("copy-html-btn")?.addEventListener("click", () => {
    if (current) {
      handlers.onCopyHtml(current.entry);
    }
  });
  element<HTMLButtonElement>("copy-svg-btn")?.addEventListener("click", () => {
    if (current) {
      handlers.onCopySvg(current.entry);
    }
  });
  element<HTMLButtonElement>("download-svg-btn")?.addEventListener("click", () => {
    if (current) {
      handlers.onDownload(current.entry);
    }
  });

  return {
    open: (entry, family, trigger) => {
      current = { entry, family };
      triggerElement = trigger;
      draw();
      backdrop?.classList.add("open");
      closeButton?.focus();
    },
    refresh: draw,
    close,
  };
}
