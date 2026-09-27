import { createApp } from 'vue';
import { createPinia } from 'pinia';
import PrimeVue from 'primevue/config';
import { definePreset } from '@primevue/themes';
import Aura from '@primevue/themes/aura';
import ToastService from 'primevue/toastservice';
import ConfirmationService from 'primevue/confirmationservice';
import Tooltip from 'primevue/tooltip';
import 'primeicons/primeicons.css';

import App from './App.vue';
import { router } from './router';
import './assets/main.css';

// Ares purple/blue preset based on the original platform palette
const AresPreset = definePreset(Aura, {
  // EXPERIMENTAL: squared-off aesthetic to match the ARES logo's angular mark — zeroes
  // PrimeVue's whole border-radius scale (buttons, inputs, dialogs, cards, etc. all pull
  // from these tokens). Revert by deleting this block (+ the --ares-radius change in
  // main.css) to go back to the original rounded look.
  primitive: {
    borderRadius: {
      none: '0px',
      xs:   '0px',
      sm:   '0px',
      md:   '0px',
      lg:   '0px',
      xl:   '0px',
    },
  },
  semantic: {
    primary: {
      50:  '#f0eef8',
      100: '#d0cce8',
      200: '#b8b3d8',
      300: '#9e98c8',
      400: '#7a75a3',
      500: '#4141a2',
      600: '#365087',
      700: '#2a3d6b',
      800: '#252542',
      900: '#1e1e2e',
      950: '#16162a',
    },
    colorScheme: {
      dark: {
        primary: {
          color:        '#b8b3d8',
          inverseColor: '#1e1e2e',
          hoverColor:   '#d0cce8',
          activeColor:  '#7a75a3',
        },
        surface: {
          0:   '#ffffff',
          50:  '#f0eef8',
          100: '#d0cce8',
          200: '#b8b3d8',
          300: '#9e98c8',
          400: '#7a75a3',
          500: '#4141a2',
          600: '#363650',
          700: '#2a2a3e',
          800: '#252542',
          900: '#1e1e2e',
          950: '#16162a',
        },
      },
    },
  },
});

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: AresPreset,
    options: {
      darkModeSelector: 'html[data-theme="dark"]',
      cssLayer: false,
    },
  },
  // ISO 8601: weeks start on Monday everywhere in the app.
  locale: {
    firstDayOfWeek: 1,
    dayNames:       ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    dayNamesShort:  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    dayNamesMin:    ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    monthNames:     ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'],
    monthNamesShort:['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    today: 'Today',
    clear: 'Clear',
  },
});
app.use(ToastService);
app.use(ConfirmationService);
app.directive('tooltip', Tooltip);

app.mount('#app');

// A successful mount means the current bundle loaded fine — clear the stale-chunk reload
// guard set by router/index.ts's onError handler so a *future* deploy can trigger its own
// one-time reload instead of being silently skipped because of a stale flag from a past one.
try { sessionStorage.removeItem('ares:chunk-reload-path'); } catch { /* private mode, etc. */ }
