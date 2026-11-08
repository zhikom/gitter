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
  setTimeout(() => dismissToast(id), tone === 'error' ? 7000 : 4000);
};

// Drop-in replacement for window.alert(): errors stay visible longer and use the error tone.
export const toast = Object.assign((message: string) => push(inferTone(message), message), {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
});

const ERROR_PATTERN = /\b(error|fail(ed|ure)?|could not|cannot|can't|invalid|not found|denied|conflict)\b/i;

function inferTone(message: string): ToastTone {
  return ERROR_PATTERN.test(message) ? 'error' : 'info';
}
