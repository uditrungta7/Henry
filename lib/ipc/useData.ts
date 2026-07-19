"use client";

// Loads data from the Electron main process and re-loads it whenever a mutation
// fires the refresh bus (emitDataChanged). This is the client-side stand-in for
// the old server pages' data fetch + router.refresh() reconciliation.
//
// With a `cacheKey`, results are kept in an in-memory cache so returning to a
// page (or week) shows the last data instantly while a fresh load runs in the
// background. Any mutation clears the whole cache, so stale data never outlives
// a change.
//
// Returns { data, loading, error, reload }. `data` is null until the first load
// resolves; pages render their own lightweight loading state until then.

import { useCallback, useEffect, useState } from "react";
import { isElectron, onDataChanged } from "./client";

const cache = new Map<string, unknown>();

export function useData<T>(
  load: () => Promise<T>,
  cacheKey?: string
): {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
} {
  const cached = cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    // Outside Electron (static prerender / a plain browser) there's no data
    // service; stay in a benign loading state rather than crashing the build.
    if (!isElectron()) {
      setLoading(false);
      return;
    }
    // Clear any prior error so a retry (or a post-mutation refresh) doesn't keep
    // showing the old failure while the new load is in flight.
    setError(null);
    load()
      .then((d) => {
        if (cacheKey) cache.set(cacheKey, d);
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // load is recreated per render by callers; we intentionally re-run on the
    // dependency the caller controls via useCallback in the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, cacheKey]);

  useEffect(() => {
    // When the key changes (e.g. the board moves to another week), reset the
    // error and show that key's cached data right away, or fall back to the
    // loading state so neither the previous key's data nor its error bleeds in.
    setError(null);
    const hit = cacheKey ? (cache.get(cacheKey) as T | undefined) : undefined;
    if (hit !== undefined) {
      setData(hit);
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
    }
    run();
    // A mutation anywhere invalidates everything cached, then refreshes this page.
    return onDataChanged(() => {
      cache.clear();
      run();
    });
  }, [run, cacheKey]);

  return { data, loading, error, reload: run };
}
