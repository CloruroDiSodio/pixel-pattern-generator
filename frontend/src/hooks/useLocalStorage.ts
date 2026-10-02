'use client';

import { useEffect, useState } from 'react';

/**
 * `localStorage` backed state that survives reloads and hydrates safely.
 *
 * The initial render always uses `initialValue` (so server and client markup
 * match) and the stored value is applied in an effect right after mount.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        setValue({ ...initialValue, ...(JSON.parse(stored) as object) } as T);
      }
    } catch {
      // Private mode / corrupted JSON - fall back to the defaults.
    }
    // `initialValue` is a literal defined by the caller; re-running on every
    // render would loop forever, so it is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = (next: T) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Quota exceeded or storage disabled - settings simply won't persist.
    }
  };

  return [value, update];
}
