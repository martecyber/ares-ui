import { reactive } from 'vue';

type Severity = 'danger' | 'warn' | 'secondary' | 'info' | 'success';

export interface ConfirmOptions {
  message: string;
  header?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  acceptSeverity?: Severity;
  acceptIcon?: string;
}

interface ConfirmState extends Required<Omit<ConfirmOptions, 'message'>> {
  visible: boolean;
  message: string;
  resolve: ((v: boolean) => void) | null;
}

export const confirmState = reactive<ConfirmState>({
  visible: false,
  header: 'Confirm',
  message: '',
  acceptLabel: 'Delete',
  rejectLabel: 'Cancel',
  acceptSeverity: 'danger',
  acceptIcon: 'pi pi-trash',
  resolve: null,
});

/** Replaces window.confirm(...) with the app's own modal — resolves true/false on accept/cancel. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState.header = options.header ?? 'Confirm';
    confirmState.message = options.message;
    confirmState.acceptLabel = options.acceptLabel ?? 'Delete';
    confirmState.rejectLabel = options.rejectLabel ?? 'Cancel';
    confirmState.acceptSeverity = options.acceptSeverity ?? 'danger';
    confirmState.acceptIcon = options.acceptIcon ?? 'pi pi-trash';
    confirmState.resolve = resolve;
    confirmState.visible = true;
  });
}

export function resolveConfirmDialog(accepted: boolean) {
  confirmState.visible = false;
  confirmState.resolve?.(accepted);
  confirmState.resolve = null;
}
