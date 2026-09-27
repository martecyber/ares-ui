// PrimeVue ships no type declarations for this submodule (plain JS under primevue/toasteventbus,
// re-exported from @primeuix/utils/eventbus with no accompanying .d.ts) — this is the same event
// bus ToastService/useToast wrap, kept minimal to just the surface api/client.ts actually needs.
declare module 'primevue/toasteventbus' {
  interface ToastEventBus {
    emit(event: string, ...args: unknown[]): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
  }
  const ToastEventBus: ToastEventBus;
  export default ToastEventBus;
}
