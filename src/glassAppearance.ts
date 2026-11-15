import { useEffect } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';

// Changes can arrive while an earlier native request is still in flight.
// Serialize them so an old theme cannot re-enable glass after a newer choice.
let nativeQueue: Promise<boolean> = Promise.resolve(false);
let nativeKey: string | undefined;
let nativeAvailable = false;

function configureNativeGlass(enabled: boolean, appearance: 'system' | 'light' | 'dark'): Promise<boolean> {
  nativeQueue = nativeQueue.catch(() => false).then(async () => {
    const key = `${enabled}:${appearance}`;
    if (nativeKey !== key) {
      nativeAvailable = await invoke<boolean>('set_glass_effect', { enabled, appearance });
      nativeKey = key;
    }
    return enabled && nativeAvailable;
  });
  return nativeQueue;
}

/** Keep glass in step with accessibility settings even when the webview does
 * not implement prefers-reduced-transparency (notably some macOS versions). */
export function useGlassAppearance(theme: string, themePack: string, packs: unknown): void {
  useEffect(() => {
    const root = document.documentElement;
    const reduced = window.matchMedia('(prefers-reduced-transparency: reduce)');
    const contrast = window.matchMedia('(prefers-contrast: more)');
    let disposed = false;
    let sequence = 0;
    const sync = async () => {
      const current = ++sequence;
      const glass = root.dataset.theme?.startsWith('glass-') === true;
      let useSolid = !glass || reduced.matches || contrast.matches;
      if (glass && isTauri()) {
        try { useSolid ||= await invoke<boolean>('reduce_glass_effects'); }
        catch { useSolid = true; }
      }
      if (disposed || current !== sequence) return;
      root.dataset.reduceTransparency = String(useSolid);
      if (useSolid) delete root.dataset.nativeGlass;
      if (!isTauri()) return;
      try {
        const appearance = glass && theme === 'glass-light' ? 'light' : glass && theme === 'glass-dark' ? 'dark' : 'system';
        const native = await configureNativeGlass(!useSolid, appearance);
        if (!disposed && current === sequence) {
          if (native) root.dataset.nativeGlass = 'true';
          else delete root.dataset.nativeGlass;
        }
      } catch {
        if (!disposed && current === sequence) delete root.dataset.nativeGlass;
      }
    };
    void sync();
    const refresh = () => void sync();
    reduced.addEventListener('change', refresh);
    contrast.addEventListener('change', refresh);
    window.addEventListener('focus', refresh);
    // AppKit's accessibility notification is not exposed by all webviews.
    // Poll only while a glass theme is selected, and avoid reapplying effects
    // when the value has not changed.
    const timer = window.setInterval(() => { if (root.dataset.theme?.startsWith('glass-')) refresh(); }, 4000);
    return () => {
      disposed = true;
      reduced.removeEventListener('change', refresh);
      contrast.removeEventListener('change', refresh);
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [theme, themePack, packs]);
}
