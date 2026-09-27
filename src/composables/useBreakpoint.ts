import { computed, type ComputedRef } from 'vue';
import { useMediaQuery } from './useMediaQuery';

/**
 * Named breakpoints used across the app. Aligned with the CSS @media queries
 * declared in main.css so that DOM-swap decisions (sidebar drawer, agenda view)
 * stay in lockstep with style-only changes.
 *
 *   mobile  : ≤ 767 px  → phones
 *   tablet  : 768–1023  → small laptops / iPad portrait
 *   desktop : ≥ 1024 px → default platform target
 */
export function useBreakpoint(): {
  isMobile: ComputedRef<boolean>;
  isTablet: ComputedRef<boolean>;
  isDesktop: ComputedRef<boolean>;
} {
  const mobile  = useMediaQuery('(max-width: 767px)');
  const tablet  = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const desktop = useMediaQuery('(min-width: 1024px)');
  return {
    isMobile: computed(() => mobile.value),
    isTablet: computed(() => tablet.value),
    isDesktop: computed(() => desktop.value),
  };
}
