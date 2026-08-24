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
  /** Opens the dialog for one icon of a family. */
  open: (entry: IconEntry, family: IconFamilyData) => void;
  /** Redraws the open dialog, after a stroke width change for instance. */
  refresh: () => void;
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
  const subtitle = element<HTMLElement>("modal-icon-subtitle");
  const tagList = element<HTMLElement>("modal-tags");
  const snippet = element<HTMLElement>("modal-code-snippet");

  let current: { entry: IconEntry; family: IconFamilyData } | undefined;

  function draw(): void {
    if (!current) {
      return;
    }
    const { entry, family } = current;

    if (preview) {
      preview.innerHTML = `<i class="${entry.className}"></i>`;
    }
    if (title) {
      title.textContent = entry.name;
    }
    if (subtitle) {
      subtitle.textContent = `${family.prefix}:${entry.name} · ${family.info.name} · ${family.info.license.spdx}`;
    }
    if (tagList) {
      tagList.innerHTML = entry.tags.map((tag) => `<span class="badge soft">${tag}</span>`).join("");
    }
    if (snippet) {
      snippet.textContent = `<i class="${entry.className}"></i>`;
    }
  }

  function close(): void {
    backdrop?.classList.remove("open");
    current = undefined;
  }

  element<HTMLButtonElement>("modal-close-btn")?.addEventListener("click", close);
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
    open: (entry, family) => {
      current = { entry, family };
      draw();
      backdrop?.classList.add("open");
    },
    refresh: draw,
  };
}
