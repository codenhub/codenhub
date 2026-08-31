/// <reference types="vite/client" />

/**
 * The deployable shell for the reused playground pages.
 *
 * `packages/styles/playground/shared/playground.js` still owns the theme and
 * aesthetic state, the boot transition, and the aesthetic `<select>`. It
 * builds a `.playground-nav` on `DOMContentLoaded`; this module runs after it
 * and swaps that bare nav for the branded header and footer, keeping the
 * controls `playground.js` already wired. Nothing under `playground/` is
 * touched: the demo is the playground worn as a reference.
 */

import "./chrome.css";

/* "/" when the demo is served on its own, "/styles/" when `apps/demo` mounts
   it under a path segment. Every URL this module builds is relative to it. */
const base = import.meta.env.BASE_URL;

const GITHUB_ICON = `<svg aria-hidden="true" viewBox="0 0 16 16">
  <path d="M8 0C3.58 0 0 3.64 0 8.13c0 3.59 2.29 6.64 5.47 7.71.4.08.55-.17.55-.39 0-.19-.01-.83-.01-1.51-2.01.38-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.53-.01-.54.63-.01 1.08.59 1.23.83.72 1.23 1.87.88 2.33.67.07-.53.28-.88.51-1.08-1.78-.21-3.64-.91-3.64-4.02 0-.89.31-1.62.82-2.19-.08-.2-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.48 7.48 0 0 1 8 3.91c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.96.08 2.16.51.57.82 1.29.82 2.19 0 3.12-1.87 3.81-3.65 4.02.29.25.54.74.54 1.51 0 1.09-.01 1.97-.01 2.24 0 .22.15.47.55.39A8.12 8.12 0 0 0 16 8.13C16 3.64 12.42 0 8 0Z" />
</svg>`;

const NPM_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24">
  <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
</svg>`;

/** Resolve a root-absolute path against the mount base (`/` or `/styles/`). */
function rebase(pathname: string): string {
  return base + pathname.replace(/^\//, "");
}

/** Markup for one external header link: an icon that opens in a new tab. */
function iconLink(href: string, label: string, svg: string): string {
  return `<a class="header-icon-link" href="${href}" target="_blank" rel="noopener noreferrer" aria-label="${label}">${svg}</a>`;
}

/** Restyle `playground.js`'s theme button into the icons-demo sliding pill. */
function toPill(button: HTMLElement): void {
  button.className = "theme-toggle";
  button.setAttribute("role", "switch");
  button.innerHTML =
    '<span class="theme-toggle-knob">' +
    '<i class="ic-moon theme-icon theme-icon-moon" aria-hidden="true"></i>' +
    '<i class="ic-sun theme-icon theme-icon-sun" aria-hidden="true"></i>' +
    "</span>";
}

/** Mirror the current theme onto the pill's switch semantics. */
function syncPill(): void {
  const button = document.getElementById("theme-toggle");
  if (!button) {
    return;
  }
  const isDark = document.documentElement.classList.contains("dark");
  const label = `Switch to ${isDark ? "light" : "dark"} theme`;
  button.setAttribute("aria-checked", String(isDark));
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function buildHeader(nav: HTMLElement): HTMLElement {
  const routeLinks = [...nav.querySelectorAll<HTMLAnchorElement>(".playground-nav-links a")];
  const aestheticSelect = nav.querySelector<HTMLSelectElement>("#aesthetic-select");
  const themeToggle = nav.querySelector<HTMLButtonElement>("#theme-toggle");

  /* The vanilla/build switch is a development affordance; a deployed reference
     runs one build. `playground.js` has already read and wired it by now. */
  nav.querySelector("#environment-toggle")?.remove();

  for (const link of routeLinks) {
    link.setAttribute("href", rebase(link.getAttribute("href") ?? "/"));
  }

  if (themeToggle) {
    toPill(themeToggle);
  }
  aestheticSelect?.classList.add("demo-aesthetic");

  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="site-header-content cluster between">
      <div class="header-start cluster loose">
        <a class="brand" href="${base}" aria-label="@codenhub/styles home">
          <img class="brand-logo brand-logo-on-light" src="${rebase("/assets/logo/logo-dark.svg")}" alt="@codenhub/styles" width="984" height="255" />
          <img class="brand-logo brand-logo-on-dark" src="${rebase("/assets/logo/logo-light.svg")}" alt="@codenhub/styles" width="984" height="255" />
        </a>
        <nav class="primary-navigation" aria-label="Primary">
          <a href="https://docs.codenhub.dev/styles">Docs</a>
          <a href="https://github.com/codenhub/codenhub">CodenHub</a>
        </nav>
      </div>
      <div class="header-actions">
        ${iconLink("https://github.com/codenhub/codenhub/tree/main/packages/styles", "@codenhub/styles on GitHub", GITHUB_ICON)}
        ${iconLink("https://www.npmjs.com/package/@codenhub/styles", "@codenhub/styles on npm", NPM_ICON)}
      </div>
    </div>
    <nav class="demo-routes" aria-label="Pages"></nav>
  `;

  const actions = header.querySelector<HTMLElement>(".header-actions");
  if (actions && aestheticSelect) {
    actions.insertBefore(aestheticSelect, actions.firstChild);
  }
  if (actions && themeToggle) {
    actions.append(themeToggle);
  }
  header.querySelector<HTMLElement>(".demo-routes")?.append(...routeLinks);

  return header;
}

/** Build the site footer: copyright and the "Made with … by Coden" credit. */
function buildFooter(): HTMLElement {
  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="site-footer-content cluster between">
      <p class="footer-copyright">© <span id="footer-year"></span> Coden</p>
      <p class="footer-credit">
        Made with <i class="ic-heart" aria-hidden="true"></i> by
        <a href="https://coden.agency" target="_blank" rel="noopener noreferrer">Coden</a>
      </p>
    </div>
  `;
  const year = footer.querySelector<HTMLElement>("#footer-year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
  return footer;
}

document.addEventListener("DOMContentLoaded", () => {
  const nav = document.querySelector<HTMLElement>(".playground-nav");
  if (!nav) {
    return;
  }

  nav.replaceWith(buildHeader(nav));
  document.body.append(buildFooter());

  syncPill();
  new MutationObserver(syncPill).observe(document.documentElement, {
    attributeFilter: ["class"],
    attributes: true,
  });
});
