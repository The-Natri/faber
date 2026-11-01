import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText } from './ipc.ts';

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
}

// Loads on mount, whenever `key` changes (e.g. a filter the loader sends) and whenever reload()
// is called. Earlier responses never overwrite later ones.
export function useLoad<T>(load: () => Promise<T>, key?: unknown): Loaded<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);
  // Latest loader without re-creating reload(); updated after each render
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  const reload = useCallback(async () => {
    const ticket = ++latest.current;
    setLoading(true);
    try {
      const value = await loadRef.current();
      if (ticket === latest.current) {
        setData(value);
        setError(null);
      }
    } catch (err) {
      if (ticket === latest.current) setError(errorText(err));
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, key]);

  return { data, error, loading, reload };
}
