'use client';

import { useEffect, useState } from 'react';

/**
 * Return `value` after it has stopped changing for `delay` milliseconds.
 *
 * Used to keep the "live" controls responsive while the (much slower) backend
 * call only fires once the user stops dragging a slider.
 */
export function useDebouncedValue<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
