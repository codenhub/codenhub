const documentRoot = document.documentElement;
const params = new URLSearchParams(window.location.search);
const isNative = documentRoot.dataset.entry === "native";
const environmentParam = params.get("env");
const environment = environmentParam === "build" || (environmentParam === null && isNative) ? "build" : "vanilla";
const nextEnvironment = environment === "build" ? "vanilla" : "build";
const stylesheet = isNative
  ? environment === "build"
    ? "/native/entry-tw.css"
    : "/native/entry-vanilla.css"
  : environment === "build"
    ? "/shared/entry-tw.css"
    : "/shared/entry-vanilla.css";

document.write(`<link rel="stylesheet" href="${stylesheet}" />`);
documentRoot.dataset.env = environment;

const setTheme = (isDark) => {
  documentRoot.classList.toggle("dark", isDark);
  documentRoot.classList.toggle("light", !isDark);
};

const storedTheme = localStorage.getItem("theme");
let isDarkTheme = storedTheme === "dark" || (!storedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches);

setTheme(isDarkTheme);

document.addEventListener("DOMContentLoaded", () => {
  const getRouteHref = (pathname) => (environment === "build" ? `${pathname}?env=build` : pathname);

  if (!document.querySelector(".playground-nav")) {
    document.body.insertAdjacentHTML(
      "afterbegin",
      `<nav class="playground-nav" aria-label="Playground routes">
        <div class="playground-nav-content">
          <a href="${getRouteHref("/")}">Home</a>
          <a href="${getRouteHref("/typography/")}">Typography</a>
          <a href="${getRouteHref("/layout/")}">Layout</a>
          <a href="${getRouteHref("/components/")}">Components</a>
          <a href="${getRouteHref("/native/")}">Native</a>
        </div>
      </nav>`,
    );
  }

  let environmentToggle = document.getElementById("environment-toggle");
  let themeToggle = document.getElementById("theme-toggle");

  if (!environmentToggle || !themeToggle) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="playground-controls">
        <button id="environment-toggle" class="tooltip playground-control" data-testid="environment-toggle" data-tooltip-position="left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z" />
            <path d="M10 21.9V14L2.1 9.1" />
            <path d="m10 14 11.9-6.9" />
            <path d="M14 19.8v-8.1" />
            <path d="M18 17.5V9.4" />
          </svg>
        </button>
        <button id="theme-toggle" class="tooltip playground-control" data-testid="theme-toggle" data-tooltip="Toggle theme" data-tooltip-position="left">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path fill="currentColor" d="M12 18a6 6 0 0 0 0-12v12z" />
          </svg>
        </button>
      </div>`,
    );
    environmentToggle = document.getElementById("environment-toggle");
    themeToggle = document.getElementById("theme-toggle");
  }

  const environmentLabel = `See ${nextEnvironment}`;
  environmentToggle.dataset.tooltip = environmentLabel;
  environmentToggle.setAttribute("aria-label", environmentLabel);
  environmentToggle.addEventListener("click", () => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("env", nextEnvironment);
    window.location.assign(nextUrl.toString());
  });

  themeToggle.setAttribute("aria-label", "Toggle theme");
  themeToggle.addEventListener("click", () => {
    isDarkTheme = !isDarkTheme;
    setTheme(isDarkTheme);
    localStorage.setItem("theme", isDarkTheme ? "dark" : "light");
  });
});
