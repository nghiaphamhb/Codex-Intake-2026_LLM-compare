import { useSyncExternalStore } from 'react';

export const NARROW_MEDIA_QUERY = '(max-width: 1279px)';

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const mql = window.matchMedia(NARROW_MEDIA_QUERY);
  if ('addEventListener' in mql) {
    mql.addEventListener('change', callback);
    return () => {
      mql.removeEventListener('change', callback);
    };
  }
  // Fallback for older environments
  if ('addListener' in mql) {
    (mql as { addListener: (cb: () => void) => void }).addListener(callback);
    return () => {
      (mql as { removeListener: (cb: () => void) => void }).removeListener(callback);
    };
  }
  return () => {};
}

function getSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia(NARROW_MEDIA_QUERY).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useNarrowLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
