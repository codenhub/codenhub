// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { connectRouterLinks, definePageRoute, mountRouter } from ".";
import type { MountedRouter, MountRouterOptions, PageOptions, PageRoute } from ".";
import { createRouter } from "..";

type Equal<Actual, Expected> =
  (<Value>() => Value extends Actual ? 1 : 2) extends <Value>() => Value extends Expected ? 1 : 2 ? true : false;
type Expect<Condition extends true> = Condition;
type ReadonlyKeys<Value> = {
  [Key in keyof Value]-?: Equal<
    { [Property in Key]: Value[Key] },
    { -readonly [Property in Key]: Value[Key] }
  > extends true
    ? never
    : Key;
}[keyof Value];
type ReadonlyTypeAssertions = [
  Expect<Equal<ReadonlyKeys<PageOptions>, keyof PageOptions>>,
  Expect<Equal<ReadonlyKeys<PageRoute>, keyof PageRoute>>,
];

const readonlyTypeAssertions: ReadonlyTypeAssertions = [true, true];

describe("public route types", () => {
  it("exposes immutable page metadata types", () => {
    expect(readonlyTypeAssertions).toEqual([true, true]);
  });
});

describe("definePageRoute", () => {
  it("validates route paths and returns immutable route metadata", () => {
    const route = definePageRoute({
      path: "/users/:id",
      page: { tag: "article", className: "user-page" },
      render: vi.fn(),
    });

    expect(route.path).toBe("/users/:id");
    expect(Object.isFrozen(route)).toBe(true);
    expect(Object.isFrozen(route.page)).toBe(true);
    expect(() => definePageRoute({ path: "users/:id", render: vi.fn() })).toThrow(Error);
  });
});

describe("mountRouter", () => {
  const mountedRouters: MountedRouter[] = [];

  beforeEach(() => {
    document.body.innerHTML = '<main id="app"></main>';
    document.title = "";
    history.replaceState(null, "", "/");
  });

  afterEach(() => {
    for (const app of mountedRouters.splice(0)) {
      app.destroy();
    }
    vi.restoreAllMocks();
  });

  function mountTestRouter(options: MountRouterOptions): MountedRouter {
    const app = mountRouter(options);
    mountedRouters.push(app);

    return app;
  }

  it("renders matched page routes with params, page options, titles, and cleanup", () => {
    const homeDestroy = vi.fn();
    const homeRoute = definePageRoute({
      path: "/",
      page: { className: "home-page" },
      title: "Home",
      render({ page }) {
        page.textContent = "Home";
      },
      destroy: homeDestroy,
    });
    const userRoute = definePageRoute({
      path: "/users/:id",
      page: { tag: "article", className: "user-page" },
      title: ({ params }) => `User ${params["id"]}`,
      render({ page, params, router, searchParams }) {
        page.textContent = `${params["id"]}:${searchParams.get("tab")}:${router.href("/")}`;
      },
    });
    const app = mountTestRouter({
      routes: [homeRoute, userRoute],
      outlet: "#app",
      basePath: "/app",
      page: { tag: "section", className: "default-page" },
    });

    history.replaceState(null, "", "/app");

    const startedMatch = app.start();

    expect(startedMatch?.route).toBe(homeRoute);
    expect(document.querySelector("#app")?.innerHTML).toBe('<section class="home-page">Home</section>');
    expect(document.title).toBe("Home");

    const userMatch = app.navigate("/users/42?tab=posts#bio");

    expect(userMatch).toMatchObject({ route: userRoute, pathname: "/users/42", params: { id: "42" }, hash: "#bio" });
    expect(homeDestroy).toHaveBeenCalledWith(expect.objectContaining({ route: homeRoute }));
    expect(document.querySelector("#app")?.innerHTML).toBe('<article class="user-page">42:posts:/app/</article>');
    expect(document.title).toBe("User 42");
  });

  it("notifies subscribers, clears misses, and destroys the active page", () => {
    const routeDestroy = vi.fn();
    const route = definePageRoute({
      path: "/known",
      render({ page }) {
        page.textContent = "Known";
      },
      destroy: routeDestroy,
    });
    const app = mountTestRouter({ routes: [route], outlet: document.querySelector("#app") as Element });
    const listener = vi.fn();

    app.subscribe(listener);
    app.navigate("/known");
    const missedMatch = app.navigate("/missing");

    expect(missedMatch).toBeNull();
    expect(listener).toHaveBeenLastCalledWith(null);
    expect(document.querySelector("#app")?.innerHTML).toBe("");
    expect(routeDestroy).toHaveBeenCalledTimes(1);

    app.navigate("/known");
    app.destroy();

    expect(document.querySelector("#app")?.innerHTML).toBe("");
    expect(routeDestroy).toHaveBeenCalledTimes(2);
  });

  it("throws when a selector outlet does not match an element", () => {
    const route = definePageRoute({ path: "/", render: vi.fn() });

    expect(() => mountRouter({ routes: [route], outlet: "#missing" })).toThrow(Error);
  });

  it("rejects controller operations after destroy", () => {
    const route = definePageRoute({ path: "/", render: vi.fn() });
    const app = mountTestRouter({ routes: [route], outlet: "#app" });

    app.destroy();

    expect(() => app.start()).toThrow(Error);
    expect(() => app.navigate("/")).toThrow(Error);
    expect(() => app.match("/")).toThrow(Error);
    expect(() => app.href("/")).toThrow(Error);
    expect(() => app.subscribe(vi.fn())).toThrow(Error);
    expect(() => app.destroy()).not.toThrow();
  });

  it("rejects page navigation started during page rendering", () => {
    const redirectedRoute = definePageRoute({
      path: "/redirected",
      render({ page }) {
        page.textContent = "Redirected";
      },
    });
    const startRoute = definePageRoute({
      path: "/start",
      render({ router }) {
        router.navigate("/redirected");
      },
    });
    const app = mountTestRouter({ routes: [startRoute, redirectedRoute], outlet: "#app" });
    const listener = vi.fn();

    app.subscribe(listener);

    expect(() => app.navigate("/start")).toThrow("Router navigation is already running.");
    expect(location.pathname).toBe("/start");
    expect(document.querySelector("#app")?.innerHTML).toBe("");
    expect(listener).not.toHaveBeenCalled();
  });

  it("allows page cleanup to inspect router matches and hrefs", () => {
    const cleanupValues: string[] = [];
    const route = definePageRoute({
      path: "/known",
      render({ page }) {
        page.textContent = "Known";
      },
      destroy({ router }) {
        cleanupValues.push(router.href("/"));
        cleanupValues.push(router.match("/known")?.route.path ?? "missing");
      },
    });
    const app = mountTestRouter({ routes: [route], outlet: "#app", basePath: "/app" });

    app.navigate("/known");

    expect(() => app.destroy()).not.toThrow();
    expect(cleanupValues).toEqual(["/app/", "/known"]);
  });

  it("rejects page navigation started during page cleanup", () => {
    const redirectedRoute = definePageRoute({
      path: "/redirected",
      render({ page }) {
        page.textContent = "Redirected";
      },
    });
    const startRoute = definePageRoute({
      path: "/start",
      render({ page }) {
        page.textContent = "Start";
      },
      destroy({ router }) {
        router.navigate("/redirected");
      },
    });
    const app = mountTestRouter({ routes: [startRoute, redirectedRoute], outlet: "#app" });

    app.navigate("/start");

    expect(() => app.destroy()).toThrow("Router navigation is already running.");
    expect(document.querySelector("#app")?.innerHTML).toBe("");
  });

  it("clears the outlet when page cleanup fails during destroy", () => {
    const route = definePageRoute({
      path: "/start",
      render({ page }) {
        page.textContent = "Start";
      },
      destroy() {
        throw new Error("Cleanup failed.");
      },
    });
    const app = mountTestRouter({ routes: [route], outlet: "#app" });

    app.navigate("/start");

    expect(() => app.destroy()).toThrow("Cleanup failed.");
    expect(document.querySelector("#app")?.innerHTML).toBe("");
    expect(() => app.destroy()).not.toThrow();
  });
});

describe("connectRouterLinks", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <a id="app-link" href="/app/users/42?tab=posts#bio">User</a>
      <a id="outside-link" href="/admin/users/42">Admin</a>
      <a id="external-link" href="https://example.com/users/42">External</a>
      <a id="download-link" href="/app/report.pdf" download>Download</a>
      <a id="ignored-link" href="/app/users/42" data-router-ignore>Ignored</a>
      <a id="target-link" href="/app/users/42" target="_blank">Target</a>
    `;
    history.replaceState(null, "", "/app");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("intercepts same-origin app links and preserves native behavior for unsafe links", () => {
    const router = createRouter({ basePath: "/app" }).on("/users/:id", vi.fn());
    const navigateSpy = vi.spyOn(router, "navigate");
    const disconnect = connectRouterLinks({ router });

    const isAppLinkPrevented = clickLink("#app-link");
    const isOutsideLinkPrevented = clickLink("#outside-link");
    const isExternalLinkPrevented = clickLink("#external-link");
    const isDownloadLinkPrevented = clickLink("#download-link");

    expect(isAppLinkPrevented).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith("/users/42?tab=posts#bio");
    expect(isOutsideLinkPrevented).toBe(false);
    expect(isExternalLinkPrevented).toBe(false);
    expect(isDownloadLinkPrevented).toBe(false);

    disconnect();
  });

  it("preserves native behavior for modified clicks and opted-out anchors", () => {
    const router = createRouter({ basePath: "/app" }).on("/users/:id", vi.fn());
    const navigateSpy = vi.spyOn(router, "navigate");
    const disconnect = connectRouterLinks({ router });

    const isModifiedClickPrevented = clickLink("#app-link", { ctrlKey: true });
    const isNonPrimaryClickPrevented = clickLink("#app-link", { button: 1 });
    const isIgnoredLinkPrevented = clickLink("#ignored-link");
    const isTargetLinkPrevented = clickLink("#target-link");

    expect(isModifiedClickPrevented).toBe(false);
    expect(isNonPrimaryClickPrevented).toBe(false);
    expect(isIgnoredLinkPrevented).toBe(false);
    expect(isTargetLinkPrevented).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();

    disconnect();
  });

  it("preserves native behavior for same-document hash links", () => {
    document.body.insertAdjacentHTML("beforeend", '<a id="hash-link" href="#details">Details</a>');
    const router = createRouter({ basePath: "/app" }).on("/", vi.fn());
    const navigateSpy = vi.spyOn(router, "navigate");
    const disconnect = connectRouterLinks({ router });

    const isHashLinkPrevented = clickLink("#hash-link");

    expect(isHashLinkPrevented).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();

    disconnect();
  });

  it("intercepts base-path links when percent escapes use different casing", () => {
    document.body.innerHTML = '<a id="encoded-link" href="/caf%c3%a9/settings">Settings</a>';
    history.replaceState(null, "", "/caf%C3%A9/");

    const router = createRouter({ basePath: "/caf\u00e9" }).on("/settings", vi.fn());
    const navigateSpy = vi.spyOn(router, "navigate");
    const disconnect = connectRouterLinks({ router });

    const isEncodedLinkPrevented = clickLink("#encoded-link");

    expect(isEncodedLinkPrevented).toBe(true);
    expect(navigateSpy).toHaveBeenCalledWith("/settings");

    disconnect();
  });

  it("preserves native behavior for anchors outside the delegated root", () => {
    document.body.innerHTML = `
      <a id="outside-root-link" href="/app/users/42">
        <span id="link-root"><button id="inside-root-button" type="button">Open</button></span>
      </a>
    `;
    history.replaceState(null, "", "/app");

    const root = document.querySelector("#link-root");
    const router = createRouter({ basePath: "/app" }).on("/users/:id", vi.fn());
    const navigateSpy = vi.spyOn(router, "navigate");
    if (root === null) {
      throw new Error("Missing delegated root.");
    }
    const disconnect = connectRouterLinks({ router, root });

    const isOutsideRootLinkPrevented = clickLink("#inside-root-button");

    expect(isOutsideRootLinkPrevented).toBe(false);
    expect(navigateSpy).not.toHaveBeenCalled();

    disconnect();
  });
});

function clickLink(selector: string, options: MouseEventInit = {}): boolean {
  const link = document.querySelector(selector);
  if (!(link instanceof HTMLElement)) {
    throw new Error(`Missing test link: ${selector}`);
  }

  let wasPreventedByRouter = false;
  const preventNativeNavigation = (event: Event): void => {
    wasPreventedByRouter = event.defaultPrevented;
    event.preventDefault();
  };
  const event = new MouseEvent("click", { bubbles: true, button: 0, cancelable: true, ...options });

  document.addEventListener("click", preventNativeNavigation);
  link.dispatchEvent(event);
  document.removeEventListener("click", preventNativeNavigation);

  return wasPreventedByRouter;
}
