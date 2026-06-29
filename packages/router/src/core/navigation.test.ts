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
    it("returns null when no route matches", () => {
      const { nav } = makeNav();
      expect(nav.run(parseAppPath("/missing"))).toBeNull();
    });

    it("calls the matching route handler and returns the match", () => {
      const handler = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/users/:id", handler);

      const match = nav.run(parseAppPath("/users/alice"));
      expect(match?.path).toBe("/users/:id");
      expect(match?.params["id"]).toBe("alice");
      expect(handler).toHaveBeenCalledWith(match);
    });

    it("calls the fallback when no route matches", () => {
      const fallback = vi.fn();
      const { registry, nav } = makeNav();
      registry.setFallback(fallback);

      const match = nav.run(parseAppPath("/missing"));
      expect(match).toBeNull();
      expect(fallback).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/missing" }));
    });

    it("updates currentMatch after each run", () => {
      const { registry, nav } = makeNav();
      registry.add("/home", vi.fn());

      nav.run(parseAppPath("/home"));
      expect(nav.currentMatch()?.pathname).toBe("/home");

      nav.run(parseAppPath("/missing"));
      expect(nav.currentMatch()).toBeNull();
    });
  });

  describe("match", () => {
    it("returns the match without side effects", () => {
      const handler = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/users/:id", handler);

      const match = nav.match("/users/alice");
      expect(match?.path).toBe("/users/:id");
      // Handler must NOT have been called — match() is side-effect-free.
      expect(handler).not.toHaveBeenCalled();
    });

    it("returns null when no route matches", () => {
      const { nav } = makeNav();
      expect(nav.match("/missing")).toBeNull();
    });

    it("throws for invalid paths", () => {
      const { nav } = makeNav();
      expect(() => nav.match("settings")).toThrow(Error);
      expect(() => nav.match("/\\example.com")).toThrow(Error);
    });
  });

  // ---------------------------------------------------------------------------
  // subscribe / notify
  // ---------------------------------------------------------------------------

  describe("subscribe", () => {
    it("notifies listeners with the match after a successful navigation", () => {
      const listener = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/home", vi.fn());
      nav.subscribe(listener);

      nav.run(parseAppPath("/home"));
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0]?.[0]).toMatchObject({ pathname: "/home" });
    });

    it("notifies listeners with null after a miss", () => {
      const listener = vi.fn();
      const { nav } = makeNav();
      nav.subscribe(listener);

      nav.run(parseAppPath("/missing"));
      expect(listener).toHaveBeenCalledWith(null);
    });

    it("stops notifying after the returned unsubscribe is called", () => {
      const listener = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/home", vi.fn());
      const unsubscribe = nav.subscribe(listener);

      unsubscribe();
      nav.run(parseAppPath("/home"));
      expect(listener).not.toHaveBeenCalled();
    });

    it("supports multiple independent listeners", () => {
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
    it("executes an enqueued navigation after the current one finishes", () => {
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

    it("processes multiple enqueued navigations in FIFO order", () => {
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

    it("executes the historyUpdate callback before the queued navigation", () => {
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

    it("returns null immediately when a navigation is enqueued mid-run", () => {
      const { registry, nav } = makeNav();

      registry.add("/start", () => {
        // During navigation, isActive() should be true.
        expect(nav.isActive()).toBe(true);
      });

      nav.run(parseAppPath("/start"));
    });
  });

  // ---------------------------------------------------------------------------
  // runFromHistory
  // ---------------------------------------------------------------------------

  describe("runFromHistory", () => {
    it("runs the navigation immediately when not active", () => {
      const handler = vi.fn();
      const { registry, nav } = makeNav();
      registry.add("/home", handler);

      nav.runFromHistory(parseAppPath("/home"), undefined);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it("queues the navigation with historyUpdate when already active", () => {
      const log: string[] = [];
      const historyUpdate = vi.fn(() => log.push("history"));
      const { registry, nav } = makeNav();

      registry.add("/start", () => {
        log.push("start");
        // Simulate a popstate arriving mid-navigation.
        nav.runFromHistory(parseAppPath("/popstate-target"), undefined, historyUpdate);
      });
      registry.add("/popstate-target", () => log.push("popstate"));

      nav.run(parseAppPath("/start"));
      expect(log).toEqual(["start", "history", "popstate"]);
    });

    it("invokes the fallback when target is null (browser outside basePath)", () => {
      const fallback = vi.fn();
      const { registry, nav } = makeNav();
      registry.setFallback(fallback);

      const miss = { pathname: "/outside", searchParams: new URLSearchParams(), hash: "" };
      nav.runFromHistory(null, miss);
      expect(fallback).toHaveBeenCalledWith(miss);
    });
  });

  // ---------------------------------------------------------------------------
  // isActive
  // ---------------------------------------------------------------------------

  describe("isActive", () => {
    it("returns false before any navigation", () => {
      const { nav } = makeNav();
      expect(nav.isActive()).toBe(false);
    });

    it("returns true while a navigation is executing", () => {
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
    it("clears the current match", () => {
      const { registry, nav } = makeNav();
      registry.add("/home", vi.fn());

      nav.run(parseAppPath("/home"));
      expect(nav.currentMatch()).not.toBeNull();

      nav.reset();
      expect(nav.currentMatch()).toBeNull();
    });

    it("clears pending navigations so they do not run after reset", () => {
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

    it("clears registered listeners", () => {
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
