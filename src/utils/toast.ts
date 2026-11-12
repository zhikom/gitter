export type ToastTone = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

type Listener = (items: ToastItem[]) => void;

let items: ToastItem[] = [];
let seq = 0;
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l(items));

export const subscribeToasts = (listener: Listener): (() => void) => {
  listeners.add(listener);
  listener(items);
  return () => listeners.delete(listener);
};

export const dismissToast = (id: number) => {
  items = items.filter((t) => t.id !== id);
  emit();
};

const push = (tone: ToastTone, message: string) => {
  const id = ++seq;
  items = [...items.slice(-3), { id, tone, message }];
  emit();
  // Errors stay long enough to read; the user can also dismiss them.
  setTimeout(() => dismissToast(id), tone === 'error' ? 8000 : 4000);
};

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
};
