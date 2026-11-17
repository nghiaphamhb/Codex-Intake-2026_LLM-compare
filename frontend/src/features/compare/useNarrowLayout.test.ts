import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { useNarrowLayout, NARROW_MEDIA_QUERY } from './useNarrowLayout';

describe('useNarrowLayout', () => {
  let listeners: Set<() => void>;
  let matches = false;
  let addEventListenerSpy: ReturnType<typeof vi.fn>;
  let removeEventListenerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listeners = new Set();
    matches = false;
    addEventListenerSpy = vi.fn((event: string, cb: () => void) => {
      if (event === 'change') {
        listeners.add(cb);
      }
    });
    removeEventListenerSpy = vi.fn((event: string, cb: () => void) => {
      if (event === 'change') {
        listeners.delete(cb);
      }
    });

    vi.stubGlobal('matchMedia', (query: string) => {
      return {
        media: query,
        matches,
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the exact media query (max-width: 1279px)', () => {
    expect(NARROW_MEDIA_QUERY).toBe('(max-width: 1279px)');
    const matchMediaSpy = vi.fn().mockImplementation((query: string) => ({
      media: query,
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMediaSpy);

    renderHook(() => useNarrowLayout());
    expect(matchMediaSpy).toHaveBeenCalledWith('(max-width: 1279px)');
  });

  it('returns matches state initially and updates on change event', () => {
    matches = false;
    const { result } = renderHook(() => useNarrowLayout());
    expect(result.current).toBe(false);

    act(() => {
      matches = true;
      listeners.forEach((cb) => cb());
    });
    expect(result.current).toBe(true);

    act(() => {
      matches = false;
      listeners.forEach((cb) => cb());
    });
    expect(result.current).toBe(false);
  });

  it('cleans up event listener on unmount', () => {
    const { unmount } = renderHook(() => useNarrowLayout());
    expect(listeners.size).toBe(1);

    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });

  it('works correctly inside React StrictMode without leaking listeners', () => {
    const { unmount } = renderHook(() => useNarrowLayout(), {
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });
    // In StrictMode, component mounts, unmounts, remounts
    expect(listeners.size).toBe(1);

    unmount();
    expect(listeners.size).toBe(0);
  });

  it('returns false safely when matchMedia is not supported', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useNarrowLayout());
    expect(result.current).toBe(false);
  });
});
