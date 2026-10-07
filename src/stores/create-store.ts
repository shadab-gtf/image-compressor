"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * A ~60-line external store, used instead of a state library.
 *
 * Two reasons it is worth hand-rolling here:
 *
 *  - The queue can hold thousands of jobs that update many times a second during
 *    a batch. Selector-level subscriptions keep a row re-render scoped to the
 *    one row that changed, which a context-based store cannot do.
 *  - It keeps the processing core free of a runtime dependency, so the same
 *    state module can be reused outside React later.
 */
export type Store<T> = {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set: (next) => {
      const value =
        typeof next === "function" ? (next as (prev: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      // Copy before iterating: a listener may unsubscribe during notification.
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Subscribe to a slice of a store.
 *
 * `selector` must be referentially stable — define it at module scope or wrap it
 * in `useCallback`. An unstable selector re-runs on every render, which is
 * correct but wasteful.
 *
 * `isEqual` lets a selector return a fresh object (for example a derived tally)
 * without re-rendering when the contents are unchanged.
 */
export function useStore<T, S>(
  store: Store<T>,
  selector: (state: T) => S,
  isEqual?: (a: S, b: S) => boolean,
): S {
  const cache = useRef<{ state: T; selector: (state: T) => S; value: S } | null>(null);

  const getSnapshot = useCallback(() => {
    const state = store.get();
    const cached = cache.current;
    // The state object is immutable, so identity is a sound cache key. This is
    // what keeps getSnapshot stable and avoids the infinite-loop failure mode of
    // useSyncExternalStore.
    if (cached && cached.state === state && cached.selector === selector) {
      return cached.value;
    }
    const next = selector(state);
    if (cached && isEqual?.(cached.value, next)) {
      cache.current = { state, selector, value: cached.value };
      return cached.value;
    }
    cache.current = { state, selector, value: next };
    return next;
  }, [store, selector, isEqual]);

  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

/** Shallow equality for selectors that build small objects or arrays. */
export function shallowEqual<S>(a: S, b: S): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  const ka = Object.keys(a) as Array<keyof S>;
  const kb = Object.keys(b) as Array<keyof S>;
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}
