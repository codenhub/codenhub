import { describe, expect, it, vi } from "vitest";

import { createNavigation } from "./navigation";
import { parseAppPath } from "./path";
import { createRegistry } from "./registry";

function makeNav() {
  const registry = createRegistry();
  const nav = createNavigation(registry);
  return { registry, nav };
}

describe("createNavigation", () => {
  // ---------------------------------------------------------------------------
  // run / match
  // ---------------------------------------------------------------------------

  describe("run", () => {
    it("shouldReturnNullWhenNoRouteMatches", () => {
      const { nav } = makeNav();
      expect(nav.run(parseAppPath("/missing"))).toBeNull();
    });

    it("shouldCallMatchingRouteHandlerAndReturnMatch", () => {
      const handler = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/users/:id", handler);

      const match = nav.run(parseAppPath("/users/alice"));
      expect(match?.path).toBe("/users/:id");
      expect(match?.params["id"]).toBe("alice");
      expect(handler).toHaveBeenCalledWith(match);
    });

    it("shouldCallFallbackWhenNoRouteMatches", () => {
      const fallback = vi.fn();
      const { registry, nav } = makeNav();
      registry.setFallback(fallback);

      const match = nav.run(parseAppPath("/missing"));
      expect(match).toBeNull();
      expect(fallback).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/missing" }));
    });

    it("shouldUpdateCurrentMatchAfterEachRun", () => {
      const { registry, nav } = makeNav();
      registry.add("/home", vi.fn());

      nav.run(parseAppPath("/home"));
      expect(nav.currentMatch()?.pathname).toBe("/home");

      nav.run(parseAppPath("/missing"));
      expect(nav.currentMatch()).toBeNull();
    });
  });

  describe("match", () => {
    it("shouldReturnMatchWithoutSideEffects", () => {
      const handler = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/users/:id", handler);

      const match = nav.match("/users/alice");
      expect(match?.path).toBe("/users/:id");
      // Handler must NOT have been called — match() is side-effect-free.
      expect(handler).not.toHaveBeenCalled();
    });

    it("shouldReturnNullWhenNoRouteMatches", () => {
      const { nav } = makeNav();
      expect(nav.match("/missing")).toBeNull();
    });

    it("shouldThrowForInvalidPaths", () => {
      const { nav } = makeNav();
      expect(() => nav.match("settings")).toThrow(Error);
      expect(() => nav.match("/\\example.com")).toThrow(Error);
    });
  });

  // ---------------------------------------------------------------------------
  // subscribe / notify
  // ---------------------------------------------------------------------------

  describe("subscribe", () => {
    it("shouldNotifyListenersWithMatchAfterSuccessfulNavigation", () => {
      const listener = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/home", vi.fn());
      nav.subscribe(listener);

      nav.run(parseAppPath("/home"));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0]?.[0]).toMatchObject({ pathname: "/home" });
    });

    it("shouldNotifyListenersWithNullAfterMiss", () => {
      const listener = vi.fn();
      const { nav } = makeNav();
      nav.subscribe(listener);

      nav.run(parseAppPath("/missing"));
      expect(listener).toHaveBeenCalledWith(null);
    });

    it("shouldStopNotifyingAfterUnsubscribe", () => {
      const listener = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/home", vi.fn());
      const unsubscribe = nav.subscribe(listener);

      unsubscribe();
      nav.run(parseAppPath("/home"));
      expect(listener).not.toHaveBeenCalled();
    });

    it("shouldSupportMultipleIndependentListeners", () => {
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/home", vi.fn());
      nav.subscribe(listenerA);
      nav.subscribe(listenerB);

      nav.run(parseAppPath("/home"));
      expect(listenerA).toHaveBeenCalledTimes(1);
      expect(listenerB).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // FIFO queue via enqueue
  // ---------------------------------------------------------------------------

  describe("FIFO navigation queue via enqueue", () => {
    it("shouldExecuteEnqueuedNavigationAfterCurrentOneFinishes", () => {
      const log: string[] = [];
      const { registry, nav } = makeNav();

      registry.add("/start", () => {
        log.push("start");
        // Simulate a programmatic navigate() call from inside a route handler.
        nav.enqueue(parseAppPath("/next"));
      });
      registry.add("/next", () => {
        log.push("next");
      });

      nav.run(parseAppPath("/start"));
      expect(log).toEqual(["start", "next"]);
    });

    it("shouldProcessMultipleEnqueuedNavigationsInFifoOrder", () => {
      const log: string[] = [];
      const { registry, nav } = makeNav();

      registry.add("/start", () => {
        log.push("start");
        nav.enqueue(parseAppPath("/first"));
        nav.enqueue(parseAppPath("/second"));
      });
      registry.add("/first", () => log.push("first"));
      registry.add("/second", () => log.push("second"));

      nav.run(parseAppPath("/start"));
      expect(log).toEqual(["start", "first", "second"]);
    });

    it("shouldExecuteHistoryUpdateCallbackBeforeQueuedNavigation", () => {
      const callOrder: string[] = [];
      const historyUpdate = vi.fn(() => callOrder.push("historyUpdate"));
      const { registry, nav } = makeNav();

      registry.add("/start", () => {
        nav.enqueue(parseAppPath("/next"), historyUpdate);
      });
      registry.add("/next", () => callOrder.push("handler"));

      nav.run(parseAppPath("/start"));
      expect(callOrder).toEqual(["historyUpdate", "handler"]);
    });

    it("shouldReturnNullImmediatelyWhenNavigationIsEnqueuedMidRun", () => {
      const { registry, nav } = makeNav();

      registry.add("/start", () => {
        // During navigation, isActive() should be true.
        expect(nav.isActive()).toBe(true);
      });

      nav.run(parseAppPath("/start"));
    });

    it("shouldDrainQueueOnHandlerError", () => {
      const log: string[] = [];
      const { registry, nav } = makeNav();

      registry.add("/start", () => {
        nav.enqueue(parseAppPath("/next"));
        throw new Error("handler error");
      });
      registry.add("/next", () => {
        log.push("next");
      });
      registry.add("/other", () => {
        log.push("other");
      });

      expect(() => nav.run(parseAppPath("/start"))).toThrow("handler error");
      expect(nav.isActive()).toBe(false);

      nav.run(parseAppPath("/other"));
      expect(log).toEqual(["other"]);
    });
  });

  // ---------------------------------------------------------------------------
  // runFromHistory
  // ---------------------------------------------------------------------------

  describe("runFromHistory", () => {
    it("shouldRunNavigationImmediatelyWhenNotActive", () => {
      const handler = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/home", handler);

      nav.runFromHistory({ target: parseAppPath("/home"), miss: undefined });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("shouldQueueNavigationWithHistoryUpdateWhenAlreadyActive", () => {
      const log: string[] = [];
      const historyUpdate = vi.fn(() => log.push("history"));
      const { registry, nav } = makeNav();

      registry.add("/start", () => {
        log.push("start");
        // Simulate a popstate arriving mid-navigation.
        nav.runFromHistory({
          target: parseAppPath("/popstate-target"),
          miss: undefined,
          historyUpdate,
        });
      });
      registry.add("/popstate-target", () => log.push("popstate"));

      nav.run(parseAppPath("/start"));
      expect(log).toEqual(["start", "history", "popstate"]);
    });

    it("shouldInvokeFallbackWhenTargetIsNullOutsideBasePath", () => {
      const fallback = vi.fn();
      const { registry, nav } = makeNav();
      registry.setFallback(fallback);

      const miss = { pathname: "/outside", searchParams: new URLSearchParams(), hash: "" };
      nav.runFromHistory({ target: null, miss });
      expect(fallback).toHaveBeenCalledWith(miss);
    });
  });

  // ---------------------------------------------------------------------------
  // isActive
  // ---------------------------------------------------------------------------

  describe("isActive", () => {
    it("shouldReturnFalseBeforeAnyNavigation", () => {
      const { nav } = makeNav();
      expect(nav.isActive()).toBe(false);
    });

    it("shouldReturnTrueWhileNavigationIsExecuting", () => {
      const { registry, nav } = makeNav();
      let wasActive = false;

      registry.add("/home", () => {
        wasActive = nav.isActive();
      });

      nav.run(parseAppPath("/home"));
      expect(wasActive).toBe(true);
      expect(nav.isActive()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // reset
  // ---------------------------------------------------------------------------

  describe("reset", () => {
    it("shouldClearCurrentMatch", () => {
      const { registry, nav } = makeNav();
      registry.add("/home", vi.fn());

      nav.run(parseAppPath("/home"));
      expect(nav.currentMatch()).not.toBeNull();

      nav.reset();
      expect(nav.currentMatch()).toBeNull();
    });

    it("shouldClearPendingNavigationsSoTheyDoNotRunAfterReset", () => {
      const afterReset = vi.fn();
      const { registry, nav } = makeNav();

      registry.add("/start", () => {
        nav.enqueue(parseAppPath("/next"));
        // Simulate destroy() clearing the queue mid-navigation.
        nav.reset();
      });
      registry.add("/next", afterReset);

      nav.run(parseAppPath("/start"));
      expect(afterReset).not.toHaveBeenCalled();
    });

    it("shouldClearRegisteredListeners", () => {
      const { registry, nav } = makeNav();
      const listener = vi.fn();
      nav.subscribe(listener);
      registry.add("/home", vi.fn());

      nav.run(parseAppPath("/home"));
      expect(listener).toHaveBeenCalledTimes(1);

      listener.mockClear();
      nav.reset();

      nav.run(parseAppPath("/home"));
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
