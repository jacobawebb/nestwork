import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';

export function useApiResource<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path);
      if (currentRequest === requestId.current) setData(result);
    } catch (caught) {
      if (currentRequest === requestId.current) setError(caught instanceof Error ? caught.message : 'Could not load this view.');
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
    return () => { requestId.current += 1; };
  }, [reload]);

  return { data, setData, error, loading, reload };
}
