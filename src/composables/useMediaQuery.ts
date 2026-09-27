import { onBeforeUnmount, ref, type Ref } from 'vue';

/**
 * Reactive {@link window.matchMedia} wrapper. Subscribes on mount, cleans up on
 * unmount, returns a Ref that flips whenever the media-query match state changes.
 *
 * Used as the foundation for breakpoint-aware components that need to swap DOM
 * (not just CSS) on viewport changes — sidebar drawer, dashboard agenda, etc.
 *
 * SSR-safe: returns a never-matching ref when `window` is undefined.
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return matches;
  }

  const mql = window.matchMedia(query);
  matches.value = mql.matches;
  const handler = (ev: MediaQueryListEvent) => { matches.value = ev.matches; };
  mql.addEventListener('change', handler);
  onBeforeUnmount(() => mql.removeEventListener('change', handler));

  return matches;
}
