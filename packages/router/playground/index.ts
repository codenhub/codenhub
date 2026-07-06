import { createRouter } from "@codenhub/router";
import type { RouterMatch, RouterMiss } from "@codenhub/router";

const router = createRouter({
  shouldInterceptLinks: true,
});

const viewTitle = document.getElementById("view-title")!;
const viewContent = document.getElementById("view-content")!;

const statePath = document.getElementById("state-path")!;
const statePathname = document.getElementById("state-pathname")!;
const stateParams = document.getElementById("state-params")!;
const stateSearch = document.getElementById("state-search")!;
const stateHash = document.getElementById("state-hash")!;
const stateMiss = document.getElementById("state-miss")!;

function updateInspector(match: RouterMatch | RouterMiss, isMiss = false) {
  if (isMiss) {
    statePath.textContent = "None";
    statePathname.textContent = match.pathname;
    stateParams.textContent = "{}";
    stateSearch.textContent = JSON.stringify(Object.fromEntries(match.searchParams.entries()), null, 2);
    stateHash.textContent = match.hash || "None";
    stateMiss.textContent = "Yes";
    return;
  }

  const m = match as RouterMatch;
  statePath.textContent = m.path;
  statePathname.textContent = m.pathname;
  stateParams.textContent = JSON.stringify(m.params, null, 2);
  stateSearch.textContent = JSON.stringify(Object.fromEntries(m.searchParams.entries()), null, 2);
  stateHash.textContent = m.hash || "None";
  stateMiss.textContent = "No";
}

router
  .on("/", (match) => {
    updateInspector(match);
    viewTitle.textContent = "Home Page";
    viewContent.innerHTML = "<p>Welcome to the router playground! This is a simple, minimalist demo.</p>";
  })
  .on("/about", (match) => {
    updateInspector(match);
    viewTitle.textContent = "About Page";
    viewContent.innerHTML = "<p>This is the about page. Testing route matching, static paths.</p>";
  })
  .on("/users/:id", (match) => {
    updateInspector(match);
    const userId = match.params.id;
    viewTitle.textContent = "User Profile";
    viewContent.innerHTML = `<p>Viewing user profile for ID: <strong id="username-display">${userId}</strong>.</p>`;
  })
  .on("/settings", (match) => {
    updateInspector(match);
    const tab = match.searchParams.get("tab") || "general";
    viewTitle.textContent = "Settings";
    viewContent.innerHTML = `<p>Active settings tab: <strong id="settings-tab-display">${tab}</strong>.</p>`;
  })
  .notFound((miss) => {
    updateInspector(miss, true);
    viewTitle.textContent = "404 - Not Found";
    viewContent.innerHTML = `<p>No route found for <code>${miss.pathname}</code>.</p>`;
  });

// Programmatic navigation buttons
document.getElementById("btn-nav-home")?.addEventListener("click", () => router.navigate("/"));
document.getElementById("btn-nav-about")?.addEventListener("click", () => router.navigate("/about"));
document.getElementById("btn-nav-user-bob")?.addEventListener("click", () => router.navigate("/users/bob"));
document
  .getElementById("btn-nav-settings-billing")
  ?.addEventListener("click", () => router.navigate("/settings?tab=billing"));
document.getElementById("btn-nav-back")?.addEventListener("click", () => history.back());
document.getElementById("btn-nav-forward")?.addEventListener("click", () => history.forward());

// Start the router
router.start();
