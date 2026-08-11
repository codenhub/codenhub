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

/* An aesthetic is a cascading class, so the selector only has to put it on the
   preview root. It stops there rather than going on `<body>` so the playground
   chrome stays neutral: the nav is not part of what is being previewed, and a
   stepped or translucent nav makes it harder to read what changed. */
const AESTHETICS = [
  { label: "Default", value: "" },
  { label: "Neobrutalism", value: "neobrutalism" },
  { label: "Glass", value: "glass" },
  { label: "Pixel", value: "pixel" },
];

const aestheticParam = params.get("aesthetic");
const storedAesthetic = localStorage.getItem("aesthetic");
const isKnownAesthetic = (value) => AESTHETICS.some((aesthetic) => aesthetic.value === value);
let currentAesthetic = "";

if (aestheticParam !== null && isKnownAesthetic(aestheticParam)) {
  currentAesthetic = aestheticParam;
} else if (storedAesthetic !== null && isKnownAesthetic(storedAesthetic)) {
  currentAesthetic = storedAesthetic;
}

/* The native page names its root `native-root` because its tests address it by
   that id, so both names are accepted rather than renaming a fixture other specs
   depend on. */
const PREVIEW_ROOT_SELECTOR = '[data-testid="preview-root"], [data-testid="native-root"]';

const applyAesthetic = (value) => {
  const root = document.querySelector(PREVIEW_ROOT_SELECTOR);

  if (!root) {
    return;
  }

  for (const aesthetic of AESTHETICS) {
    if (aesthetic.value) {
      root.classList.toggle(aesthetic.value, aesthetic.value === value);
    }
  }

  root.dataset.aesthetic = value || "default";
};

document.addEventListener("DOMContentLoaded", () => {
  const getRouteHref = (pathname) => (environment === "build" ? `${pathname}?env=build` : pathname);

  const routes = [
    { text: "Home", path: "/" },
    { text: "Buttons", path: "/buttons/" },
    { text: "Forms", path: "/forms/" },
    { text: "Feedback", path: "/feedback/" },
    { text: "Surfaces", path: "/surfaces/" },
    { text: "Typography", path: "/typography/" },
    { text: "Layout", path: "/layout/" },
    { text: "Native", path: "/native/" },
  ];

  const currentPath = window.location.pathname;
  const isCurrent = (path) => {
    if (path === "/") {
      return currentPath === "/" || currentPath === "/index.html";
    }
    return currentPath === path || currentPath === path + "index.html" || currentPath.startsWith(path);
  };

  if (!document.querySelector(".playground-nav")) {
    const linksHtml = routes
      .map(
        (route) =>
          `<a href="${getRouteHref(route.path)}"${isCurrent(route.path) ? ' class="active"' : ""}>${route.text}</a>`,
      )
      .join("\n          ");

    document.body.insertAdjacentHTML(
      "afterbegin",
      `<nav class="playground-nav" aria-label="Playground routes">
        <div class="playground-nav-content">
          <div class="playground-nav-links">
            ${linksHtml}
          </div>
          <div class="playground-controls">
            <select id="aesthetic-select" class="select playground-aesthetic" data-testid="aesthetic-select" aria-label="Aesthetic">
              ${AESTHETICS.map(
                (aesthetic) =>
                  `<option value="${aesthetic.value}"${aesthetic.value === currentAesthetic ? " selected" : ""}>${aesthetic.label}</option>`,
              ).join("")}
            </select>
            <button id="environment-toggle" class="tooltip playground-control" data-testid="environment-toggle" data-tooltip-position="bottom">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z" />
                <path d="M10 21.9V14L2.1 9.1" />
                <path d="m10 14 11.9-6.9" />
                <path d="M14 19.8v-8.1" />
                <path d="M18 17.5V9.4" />
              </svg>
            </button>
            <button id="theme-toggle" class="tooltip playground-control" data-testid="theme-toggle" data-tooltip="Toggle theme" data-tooltip-position="bottom">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path fill="currentColor" d="M12 18a6 6 0 0 0 0-12v12z" />
              </svg>
            </button>
          </div>
        </div>
      </nav>`,
    );
  }

  const environmentToggle = document.getElementById("environment-toggle");
  const themeToggle = document.getElementById("theme-toggle");

  const environmentLabel = `See ${nextEnvironment}`;
  environmentToggle.dataset.tooltip = environmentLabel;
  environmentToggle.setAttribute("aria-label", environmentLabel);
  environmentToggle.addEventListener("click", () => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("env", nextEnvironment);
    window.location.assign(nextUrl.toString());
  });

  const aestheticSelect = document.getElementById("aesthetic-select");

  /* The class lands after the first paint, so every component would animate from
     the default material to the aesthetic's on load. Suppressing transitions for
     two frames makes the first render the settled one. Switching later still
     animates, which is the part worth seeing. */
  documentRoot.dataset.booting = "true";
  applyAesthetic(currentAesthetic);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      delete documentRoot.dataset.booting;
    });
  });

  aestheticSelect.addEventListener("change", () => {
    currentAesthetic = aestheticSelect.value;
    localStorage.setItem("aesthetic", currentAesthetic);
    applyAesthetic(currentAesthetic);
  });

  themeToggle.setAttribute("aria-label", "Toggle theme");
  themeToggle.addEventListener("click", () => {
    isDarkTheme = !isDarkTheme;
    setTheme(isDarkTheme);
    localStorage.setItem("theme", isDarkTheme ? "dark" : "light");
  });
});
