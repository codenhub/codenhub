// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createErrorRegistry, getErrorRegistry, isAppError, type AppError } from "./index";
import { AppErrorBoundary } from "./react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  // React logs every error a boundary catches; the tests assert on what the boundary does.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  getErrorRegistry().clear();
});

const render = (node: ReactNode): void => {
  act(() => root.render(node));
};

const Thrower = ({ value }: { value: unknown }): ReactNode => {
  throw value;
};

const showMessage = ({ error }: { error: AppError }): ReactNode => createElement("p", null, error.message);

describe("AppErrorBoundary", () => {
  it("should render its children when nothing throws", () => {
    render(createElement(AppErrorBoundary, { fallback: showMessage }, createElement("span", null, "fine")));

    expect(container.textContent).toBe("fine");
  });

  it("should render the fallback with the normalized AppError", () => {
    getErrorRegistry().codes.add("project.not_found", { message: "We couldn't find that project." });

    render(
      createElement(
        AppErrorBoundary,
        { fallback: showMessage },
        createElement(Thrower, { value: { code: "project.not_found" } }),
      ),
    );

    expect(container.textContent).toBe("We couldn't find that project.");
  });

  it("should never show the raw message of an unmatched error", () => {
    render(
      createElement(AppErrorBoundary, { fallback: showMessage }, createElement(Thrower, { value: new Error("SQL") })),
    );

    expect(container.textContent).toBe("An unexpected error occurred.");
  });

  it("should normalize with the supplied options", () => {
    const registry = createErrorRegistry();
    registry.names.add("ChunkLoadError", { message: "Reload the page." });
    const chunkError = Object.assign(new Error("chunk"), { name: "ChunkLoadError" });

    render(
      createElement(
        AppErrorBoundary,
        { fallback: showMessage, options: { registry } },
        createElement(Thrower, { value: chunkError }),
      ),
    );
    expect(container.textContent).toBe("Reload the page.");

    render(
      createElement(
        AppErrorBoundary,
        { key: "second", fallback: showMessage, options: { fallbackMessage: "This page failed to load." } },
        createElement(Thrower, { value: new Error("x") }),
      ),
    );
    expect(container.textContent).toBe("This page failed to load.");
  });

  it("should pass onError the same AppError the fallback shows, with the component stack", () => {
    const shown: AppError[] = [];
    const onError = vi.fn();

    render(
      createElement(
        AppErrorBoundary,
        {
          fallback: ({ error }) => {
            shown.push(error);
            return null;
          },
          onError,
        },
        createElement(Thrower, { value: new Error("boom") }),
      ),
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const [reported, info] = onError.mock.calls[0] as [AppError, { componentStack?: string }];
    expect(isAppError(reported)).toBe(true);
    // React can render a fallback it then discards, on a boundary instance it never commits; the
    // committed fallback, the last one rendered, shows the error onError receives.
    expect(shown.at(-1)).toBe(reported);
    expect(typeof info.componentStack).toBe("string");
  });

  it("should catch a thrown value that is not an Error", () => {
    render(createElement(AppErrorBoundary, { fallback: showMessage }, createElement(Thrower, { value: "text" })));

    expect(container.textContent).toBe("An unexpected error occurred.");
  });

  it("should render its children again after reset", () => {
    let shouldThrow = true;
    const Flaky = (): ReactNode => {
      if (shouldThrow) {
        throw new Error("flaky");
      }
      return "recovered";
    };
    let reset: () => void = () => {};

    render(
      createElement(
        AppErrorBoundary,
        {
          fallback: (props) => {
            reset = props.reset;
            return "failed";
          },
        },
        createElement(Flaky),
      ),
    );
    expect(container.textContent).toBe("failed");

    shouldThrow = false;
    act(() => reset());

    expect(container.textContent).toBe("recovered");
  });

  it("should reset when a reset key changes", () => {
    let shouldThrow = true;
    const Flaky = (): ReactNode => {
      if (shouldThrow) {
        throw new Error("flaky");
      }
      return "recovered";
    };
    let setRoute: (route: string) => void = () => {};
    const App = (): ReactNode => {
      const [route, setRouteState] = useState("/a");
      setRoute = setRouteState;
      return createElement(AppErrorBoundary, { fallback: () => "failed", resetKeys: [route] }, createElement(Flaky));
    };

    render(createElement(App));
    expect(container.textContent).toBe("failed");

    shouldThrow = false;
    act(() => setRoute("/a"));
    expect(container.textContent).toBe("failed");

    act(() => setRoute("/b"));
    expect(container.textContent).toBe("recovered");
  });

  it("should not reset when the reset key change is what made a child throw", () => {
    const onError = vi.fn();
    const onReset = vi.fn();
    const Page = ({ route }: { route: string }): ReactNode => {
      if (route === "/broken") {
        throw new Error("broken page");
      }
      return route;
    };
    let setRoute: (route: string) => void = () => {};
    const App = (): ReactNode => {
      const [route, setRouteState] = useState("/");
      setRoute = setRouteState;
      return createElement(
        AppErrorBoundary,
        { fallback: () => "failed", onError, onReset, resetKeys: [route] },
        createElement(Page, { route }),
      );
    };

    render(createElement(App));
    act(() => setRoute("/broken"));

    expect(container.textContent).toBe("failed");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onReset).not.toHaveBeenCalled();
  });

  it("should call onReset when it resets", () => {
    const onReset = vi.fn();
    let reset: () => void = () => {};

    render(
      createElement(
        AppErrorBoundary,
        {
          fallback: (props) => {
            reset = props.reset;
            return null;
          },
          onReset,
        },
        createElement(Thrower, { value: new Error("x") }),
      ),
    );
    act(() => reset());

    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
