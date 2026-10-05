import { useCallback, useEffect, useRef, useState } from 'react';

/** Minimal data loader: { data, error, loading, refreshing, reload }. Re-runs when `deps` change. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean; refreshing: boolean }>({ data: undefined, error: null, loading: true, refreshing: false });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async (refresh = false) => {
    setState((s) => ({ ...s, loading: !refresh && s.data === undefined, refreshing: refresh, error: null }));
    try {
      const data = await fnRef.current();
      setState({ data, error: null, loading: false, refreshing: false });
    } catch (e) {
      setState((s) => ({ ...s, error: e as Error, loading: false, refreshing: false }));
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, deps);
  return { ...state, reload: () => run(true) };
}
