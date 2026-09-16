/// <reference types="vite/client" />

/**
 * The deployable shell for the reused playground page.
 *
 * `playground/index.ts` still owns all theme CRUD and token logic. It
 * builds `.playground-header` in static markup and dispatches
 * `theme-playground:ready` once its controls are wired; this module listens
 * for that event and swaps the bare header for the branded one, reusing the
 * controls handed over in the event rather than re-querying the DOM.
 * Nothing under `playground/` is touched: the demo is the playground worn
 * as a reference.
 */

import { resolveNavLinks } from "@codenhub/app-shell/nav";
import { packageDocsUrl, packageNpmUrl } from "@codenhub/app-shell/package-links";
import { themeToggleAria } from "@codenhub/app-shell/theme";

import "virtual:icons.css";
import "./chrome.css";

const GITHUB_ICON = `<svg aria-hidden="true" viewBox="0 0 16 16">
  <path d="M8 0C3.58 0 0 3.64 0 8.13c0 3.59 2.29 6.64 5.47 7.71.4.08.55-.17.55-.39 0-.19-.01-.83-.01-1.51-2.01.38-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.53-.01-.54.63-.01 1.08.59 1.23.83.72 1.23 1.87.88 2.33.67.07-.53.28-.88.51-1.08-1.78-.21-3.64-.91-3.64-4.02 0-.89.31-1.62.82-2.19-.08-.2-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.48 7.48 0 0 1 8 3.91c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.96.08 2.16.51.57.82 1.29.82 2.19 0 3.12-1.87 3.81-3.65 4.02.29.25.54.74.54 1.51 0 1.09-.01 1.97-.01 2.24 0 .22.15.47.55.39A8.12 8.12 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z" />
</svg>`;

const NPM_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24">
  <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
</svg>`;

/** The `theme-playground:ready` `CustomEvent` detail `playground/index.ts` dispatches. */
interface ThemePlaygroundReadyDetail {
  header: HTMLElement;
  themeToggle: HTMLButtonElement;
}

/** Markup for one external header link: an icon that opens in a new tab. */
function iconLink(href: string, label: string, svg: string): string {
  return `<a class="shell-action" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${svg.replace("<svg ", '<svg class="shell-action-brand" ')}</a>`;
}

/** Restyle the playground's plain toggle button into the shell's sliding pill. */
function toPill(button: HTMLElement): void {
  button.className = "shell-theme-switch";
  button.setAttribute("role", "switch");
  button.innerHTML =
    '<span class="shell-theme-switch-track">' +
    '<span class="shell-theme-switch-knob">' +
    '<i class="ic-lucide-moon shell-theme-icon shell-theme-icon-moon" aria-hidden="true"></i>' +
    '<i class="ic-lucide-sun shell-theme-icon shell-theme-icon-sun" aria-hidden="true"></i>' +
    "</span>" +
    "</span>";
}

/**
 * Mirrors the active theme onto the pill's switch semantics. A named custom
 * theme (e.g. "sunset-glow") never makes `data-theme` literally "dark", but
 * `@codenhub/theme` also sets `documentElement.style.colorScheme` to that
 * theme's actual `colorScheme` on every activation (`src/dom.ts`) -- reading
 * that instead is what makes a dark-scheme custom theme still flip the pill
 * to its dark position rather than reading as light. `data-shell-scheme`
 * mirrors the result onto an attribute app-shell's own CSS doesn't know
 * about, for the knob/icon overrides in `chrome.css` below; `aria-checked`/
 * `aria-label` are set directly, since CSS can't touch those.
 */
function syncPill(): void {
  const button = document.getElementById("btn-toggle");
  if (!button) {
    return;
  }
  const scheme = document.documentElement.style.colorScheme === "dark" ? "dark" : "light";
  document.documentElement.dataset.shellScheme = scheme;
  const { checked, label } = themeToggleAria(scheme);
  button.setAttribute("aria-checked", String(checked));
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function buildHeader({ themeToggle }: ThemePlaygroundReadyDetail): HTMLElement {
  toPill(themeToggle);

  const navLinks = resolveNavLinks({
    docsUrl: packageDocsUrl("https://docs.codenhub.dev", "theme"),
    wwwUrl: "https://codenhub.dev",
  })
    .map(
      ({ href, label }) =>
        `<a class="shell-nav-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}<i aria-hidden="true" class="ic-lucide-arrow-up-right shell-nav-link-arrow"></i></a>`,
    )
    .join("");

  const header = document.createElement("header");
  header.className = "shell-header";
  header.innerHTML = `
    <div class="shell-header-content">
      <a class="shell-brand" href="https://demo.codenhub.dev" aria-label="@codenhub/theme home">
        <img class="shell-brand-logo shell-brand-logo-on-light" src="/assets/logo/logo-dark.svg" alt="@codenhub/theme" width="984" height="255" />
        <img class="shell-brand-logo shell-brand-logo-on-dark" src="/assets/logo/logo-light.svg" alt="@codenhub/theme" width="984" height="255" />
      </a>
      <nav class="shell-nav" aria-label="Sites">${navLinks}</nav>
      <div class="shell-actions">
        ${iconLink("https://github.com/codenhub/codenhub/tree/main/packages/theme", "@codenhub/theme on GitHub", GITHUB_ICON)}
        ${iconLink(packageNpmUrl("@codenhub/theme"), "@codenhub/theme on npm", NPM_ICON)}
      </div>
    </div>
  `;

  const actions = header.querySelector<HTMLElement>(".shell-actions");
  actions?.append(themeToggle);

  return header;
}

/** Build the site footer: copyright and the "Built by coden" credit. */
function buildFooter(): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "shell-footer";
  footer.innerHTML = `
    <div class="shell-footer-content">
      <p>&copy; <span data-footer-year></span> Coden</p>
      <p>Built by <a href="https://coden.agency/" target="_blank" rel="noopener noreferrer">coden</a>.</p>
    </div>
  `;
  const year = footer.querySelector<HTMLElement>("[data-footer-year]");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
  return footer;
}

document.addEventListener("theme-playground:ready", (event) => {
  const detail = (event as CustomEvent<ThemePlaygroundReadyDetail>).detail;

  document.title = "@codenhub/theme Demo";
  /* `.playground-header` sits nested inside `.playground-content` (its
     container div), not as a `<body>`-level sibling the way the styles
     package's `.playground-nav` does. A plain `replaceWith` would leave the
     new header at that same nested, padded position, so it's removed and the
     branded header is prepended to `<body>` instead -- a proper flex item
     alongside `.playground-content` and the footer below. */
  detail.header.remove();
  document.body.prepend(buildHeader(detail));
  document.body.append(buildFooter());

  syncPill();
  new MutationObserver(syncPill).observe(document.documentElement, {
    attributeFilter: ["data-theme", "style"],
    attributes: true,
  });
});
