import { useLayoutEffect } from 'react';

// Each dialog owns a lock; only the last one restores the page's original style.
const locks = new Set<symbol>();
let originalOverflow = '';

export function useBodyScrollLock(active: boolean) {
  useLayoutEffect(() => {
    if (!active) return;
    const token = Symbol('dialog-scroll-lock');
    if (locks.size === 0) originalOverflow = document.body.style.overflow;
    locks.add(token);
    document.body.style.overflow = 'hidden';
    return () => {
      locks.delete(token);
      if (locks.size === 0) document.body.style.overflow = originalOverflow;
    };
  }, [active]);
}
