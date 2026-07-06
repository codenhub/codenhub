import { parseAppPath, type ParsedPath } from "./path";
import type { Registry } from "./registry";
import type { RouterListener, RouterMatch, RouterMiss } from "./types";

const REENTRANT_NAVIGATION_ERROR = "Router navigation is already running.";

interface PendingNavigation {
  target: ParsedPath | null;
  miss?: RouterMiss;
  /**
   * Replays a browser history update that was deferred because navigation was
   * already running when the entry arrived (e.g. a queued popstate or navigate
   * call that arrived while another route handler was executing).
   */
  historyUpdate?: () => void;
}

/** @internal */
export interface Navigation {
  /**
   * Runs a navigation immediately. Must only be called when `isActive()` is false.
   *
   * @throws {Error} If `to` is invalid or contains dot segments.
   */
  run(target: ParsedPath): RouterMatch | null;

  /**
   * Adds a navigation to the pending queue so it executes after the current
   * loop iteration completes.
   */
  enqueue(target: ParsedPath | null, historyUpdate?: () => void): void;

  /**
   * Runs or queues a navigation originating from browser history.
   *
   * Accepts a pre-parsed target and optional miss so that history.ts retains
   * full ownership of `window` access. When navigation is already active the
   * call is enqueued with its `historyUpdate` so state is replayed in order.
   */
  runFromHistory(options: {
    target: ParsedPath | null;
    miss: RouterMiss | undefined;
    historyUpdate?: () => void;
  }): void;

  /**
   * Matches an app-local path without side effects.
   *
   * @throws {Error} If `to` is invalid or contains dot segments.
   */
  match(to: string): RouterMatch | null;

  /**
   * Registers a listener called after each navigation completes.
   *
   * @returns An unsubscribe function.
   */
  subscribe(listener: RouterListener): () => void;

  /** Returns true while a navigation loop is executing. */
  isActive(): boolean;

  /** Returns the most recent match, or null when the last navigation missed. */
  currentMatch(): RouterMatch | null;

  /** Clears pending navigations and resets the current match. Called by history on destroy. */
  reset(): void;
}

/** @internal */
export function createNavigation(registry: Registry): Navigation {
  const listeners = new Set<RouterListener>();
  const pendingNavigations: PendingNavigation[] = [];
  let isNavigating = false;
  let lastMatch: RouterMatch | null = null;

  function notify(match: RouterMatch | null): void {
    for (const listener of listeners) {
      listener(match);
    }
  }

  function runLoop(initialTarget: ParsedPath | null, initialMiss: RouterMiss | undefined): RouterMatch | null {
    // Invariant: callers must verify !isNavigating before calling runLoop.
    isNavigating = true;

    try {
      let currentTarget: ParsedPath | null = initialTarget;
      let currentMiss: RouterMiss | undefined = initialMiss;

      // Outer loop: continues running until all navigations are fully processed.
      // This includes any new navigations enqueued by subscribers during the `notify()` phase below.
      while (currentTarget !== null || currentMiss !== undefined) {
        let loopMatch: RouterMatch | null = null;

        // Inner loop: processes the current navigation path and any nested redirections
        // queued synchronously by route handlers.
        while (currentTarget !== null || currentMiss !== undefined) {
          if (currentTarget !== null) {
            const result = registry.findMatch(currentTarget);

            if (result !== null) {
              result.route.handler(result.match);
              loopMatch = result.match;
            } else {
              const miss: RouterMiss = {
                pathname: currentTarget.pathname,
                searchParams: currentTarget.searchParams,
                hash: currentTarget.hash,
              };

              registry.getFallback()?.(miss);
              loopMatch = null;
            }
          } else {
            // Invariant: since the loop condition is (currentTarget !== null || currentMiss !== undefined),
            // if currentTarget is null, currentMiss must be defined.
            registry.getFallback()?.(currentMiss!);
            loopMatch = null;
          }

          const next = pendingNavigations.shift();
          if (next !== undefined) {
            next.historyUpdate?.();
            currentTarget = next.target;
            currentMiss = next.miss;
          } else {
            currentTarget = null;
            currentMiss = undefined;
          }
        }

        lastMatch = loopMatch;
        notify(loopMatch);

        const nextFromListener = pendingNavigations.shift();
        if (nextFromListener !== undefined) {
          nextFromListener.historyUpdate?.();
          currentTarget = nextFromListener.target;
          currentMiss = nextFromListener.miss;
        }
      }

      return lastMatch;
    } catch (error) {
      pendingNavigations.length = 0;
      throw error;
    } finally {
      isNavigating = false;
    }
  }

  return {
    run(target) {
      return runLoop(target, undefined);
    },

    enqueue(target, historyUpdate) {
      pendingNavigations.push({ target, historyUpdate });
    },

    runFromHistory({ target, miss, historyUpdate }) {
      if (isNavigating) {
        pendingNavigations.push({ target, miss, historyUpdate });
        return;
      }

      runLoop(target, miss);
    },

    match(to) {
      return registry.findMatch(parseAppPath(to))?.match ?? null;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    isActive() {
      return isNavigating;
    },

    currentMatch() {
      return lastMatch;
    },

    reset() {
      pendingNavigations.length = 0;
      lastMatch = null;
      listeners.clear();
    },
  };
}

/** @internal */
export function assertNotNavigating(nav: Navigation): void {
  if (nav.isActive()) {
    throw new Error(REENTRANT_NAVIGATION_ERROR);
  }
}
