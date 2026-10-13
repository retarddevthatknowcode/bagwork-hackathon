"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

/**
 * useState that survives reloads.
 *
 * The Bagwork console keeps user-owned UI state (which notifications have been
 * read, which socials are linked, notification preferences, the Explore filters) in
 * the browser rather than inventing server tables for it.
 *
 * Implemented on `useSyncExternalStore` rather than a mount effect: reading
 * localStorage inside `useEffect` and calling `setState` there is a cascading render
 * (and an `react-hooks/set-state-in-effect` error). `useSyncExternalStore` is built for
 * exactly this — React hydrates with `getServerSnapshot` (no stored value, matching the
 * SSR HTML) and then re-renders with the real client snapshot, so there is no hydration
 * mismatch and no extra pass.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // `key === null` is a `localStorage.clear()`, which affects every key.
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === key) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    [key],
  );

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null; // storage unavailable (private mode, blocked cookies)
    }
  }, [key]);

  /** No stored value on the server, so the first paint matches the HTML. */
  const getServerSnapshot = useCallback(() => null, []);

  const stored = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // `storage` events do not fire in the tab that performed the write, so the most recent
  // local write is held in state and takes precedence over the store snapshot. Keyed so
  // a different `key` (or a reset) falls straight back to the stored value.
  const [localWrite, setLocalWrite] = useState<{ key: string; value: string | null } | null>(
    null,
  );

  const serialized =
    localWrite && localWrite.key === key ? localWrite.value : stored;

  const value = useMemo(() => {
    if (serialized === null) return initial;
    try {
      return JSON.parse(serialized) as T;
    } catch {
      return initial; // corrupt value — fall back rather than throw into a render
    }
  }, [serialized, initial]);

  const setValue = useCallback(
    (next: T | ((current: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (current: T) => T)(value) : next;
      const encoded = JSON.stringify(resolved);
      setLocalWrite({ key, value: encoded });
      try {
        window.localStorage.setItem(key, encoded);
      } catch {
        /* ignore quota / private-mode failures */
      }
    },
    [key, value],
  );

  const reset = useCallback(() => {
    setLocalWrite({ key, value: null });
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  return [value, setValue, { reset }] as const;
}
