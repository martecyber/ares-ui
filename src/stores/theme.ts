import { defineStore } from 'pinia';
import { ref } from 'vue';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'ares-theme';

/** Reads what `index.html`'s pre-paint script already applied so the store matches reality. */
function currentFromDom(): Theme {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
}

/**
 * Theme preference store. The actual swap is done by mutating `<html data-theme>`,
 * which both our CSS (`[data-theme="light"]` overrides in main.css) and PrimeVue
 * (whose `darkModeSelector` is wired to `html[data-theme="dark"]`) listen to.
 */
export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>(currentFromDom());

  function apply(next: Theme) {
    theme.value = next;
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore quota / blocked */ }
  }

  function toggle() {
    apply(theme.value === 'dark' ? 'light' : 'dark');
  }

  return { theme, apply, toggle };
});
