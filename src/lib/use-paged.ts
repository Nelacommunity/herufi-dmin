import { useEffect, useEffectEvent, useState } from 'react';

type State<T> = { key: string; rows: T[]; total: number; page: number; error: Error | null };

/**
 * Paged list loader: first page whenever `deps` change, `loadMore` for infinite scroll, `reload` for pull-to-refresh.
 * Results are tagged with the deps they were fetched for, so "loading" is derived rather than stored.
 */
export function usePaged<T>(fetchPage: (page: number) => Promise<{ rows: T[]; total: number }>, deps: unknown[]) {
  const key = JSON.stringify(deps);
  const [res, setRes] = useState<State<T> | null>(null);
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const fetchFirst = useEffectEvent(() => fetchPage(0));

  useEffect(() => {
    let cancelled = false;
    fetchFirst().then(
      (r) => { if (!cancelled) setRes({ key, rows: r.rows, total: r.total, page: 0, error: null }); },
      // A failed refresh keeps what's already on screen.
      (e: Error) => { if (!cancelled) setRes((prev) => (prev && prev.key === key ? { ...prev, error: e } : { key, rows: [], total: 0, page: 0, error: e })); },
    ).finally(() => { if (!cancelled) setRefreshing(false); });
    return () => { cancelled = true; };
  }, [key, nonce]);

  const loading = res?.key !== key;
  const current = loading ? null : res;

  async function loadMore() {
    if (!current || loadingMore || current.rows.length >= current.total) return;
    setLoadingMore(true);
    try {
      const r = await fetchPage(current.page + 1);
      setRes((prev) => (prev && prev.key === key ? { ...prev, rows: [...prev.rows, ...r.rows], total: r.total, page: prev.page + 1 } : prev));
    } catch {
      /* keep what we have; pull to refresh retries */
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    rows: current?.rows ?? [],
    total: current?.total ?? 0,
    error: current?.error ?? null,
    loading,
    refreshing,
    loadingMore,
    loadMore,
    reload: () => { setRefreshing(true); setNonce((n) => n + 1); },
    /** Optimistic local edits (e.g. after toggling a product's status). */
    setRows: (fn: (rows: T[]) => T[]) => setRes((prev) => (prev ? { ...prev, rows: fn(prev.rows) } : prev)),
  };
}
