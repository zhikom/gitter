import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_ID = 'gitter-help-tooltip';
const TARGETS = '[data-tooltip], [title], button[aria-label], [role="button"][aria-label], [role="tab"][aria-label]';

/** Place help beside its trigger without clipping it at the window edge. */
export function tooltipPosition(anchor: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, size: { width: number; height: number }, viewport: { width: number; height: number }) {
  const margin = 8, gap = 8;
  const left = Math.max(margin, Math.min((anchor.left + anchor.right - size.width) / 2, viewport.width - size.width - margin));
  const below = anchor.bottom + gap;
  const side = below + size.height <= viewport.height - margin ? 'below' : 'above';
  const desiredTop = side === 'below' ? below : anchor.top - gap - size.height;
  const top = Math.max(margin, Math.min(desiredTop, viewport.height - size.height - margin));
  return { left, top, side };
}

interface Tooltip { target: Element; text: string }

/**
 * One delegated tooltip for existing title hints and explicit data-tooltip hints.
 * Native titles are suppressed only while the custom hint is visible, and are
 * restored afterwards so the original browser behavior remains a fallback.
 */
export const TooltipLayer: React.FC = () => {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const bubble = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!tooltip || !bubble.current) return;
    const element = bubble.current;
    const position = tooltipPosition(tooltip.target.getBoundingClientRect(), element.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
    element.style.left = `${position.left}px`;
    element.style.top = `${position.top}px`;
    element.style.visibility = 'visible';
    element.dataset.side = position.side;
  }, [tooltip]);

  useEffect(() => {
    let hovered: Element | null = null;
    let focused: Element | null = null;
    let overBubble = false;
    let blocked: Element | null = null;
    let pending: Element | null = null;
    let active: Element | null = null;
    let savedTitle: string | null = null;
    let temporaryLabel: string | null = null;
    let observer: MutationObserver | null = null;
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;

    const clearTimers = () => { clearTimeout(showTimer); clearTimeout(hideTimer); showTimer = undefined; hideTimer = undefined; pending = null; };
    const allowed = (target: Element): boolean => {
      if (!target.isConnected) return false;
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      const current = dialogs.length ? dialogs[dialogs.length - 1] : null;
      return !current || current.contains(target);
    };
    const textFor = (target: Element): string => {
      const explicit = target.getAttribute('data-tooltip');
      const title = target === active ? savedTitle : target.getAttribute('title');
      const fallback = target.matches('button, [role="button"], [role="tab"]') ? target.getAttribute('aria-label') : null;
      return (explicit ?? title ?? fallback ?? '').trim().slice(0, 1500);
    };
    const targetFor = (value: EventTarget | null): Element | null => {
      const node = value instanceof Element ? value : value instanceof Node ? value.parentElement : null;
      if (!node || bubble.current?.contains(node)) return null;
      const target = node.closest(TARGETS);
      return target && allowed(target) && textFor(target) && !target.matches(':disabled, [aria-hidden="true"]') ? target : null;
    };
    const restore = () => {
      // A React render can change the title in the same event that dismisses
      // the tooltip, before the observer callback has had a chance to run.
      if (active && observer?.takeRecords().some((change) => change.attributeName === 'title')) savedTitle = active.getAttribute('title');
      observer?.disconnect(); observer = null;
      if (active) {
        if (savedTitle === null) active.removeAttribute('title'); else active.setAttribute('title', savedTitle);
        if (temporaryLabel !== null && active.getAttribute('aria-label') === temporaryLabel) active.removeAttribute('aria-label');
        const descriptions = (active.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id && id !== TOOLTIP_ID);
        if (descriptions.length) active.setAttribute('aria-describedby', descriptions.join(' ')); else active.removeAttribute('aria-describedby');
      }
      active = null; savedTitle = null; temporaryLabel = null;
      setTooltip(null);
    };
    const dismiss = () => { clearTimers(); restore(); };
    const show = (target: Element) => {
      const text = textFor(target);
      if (!allowed(target) || !text) return;
      active = target;
      savedTitle = target.getAttribute('title');
      if (target.matches('button, [role="button"], [role="tab"]') && !target.getAttribute('aria-label') && !target.getAttribute('aria-labelledby') && !target.textContent?.trim()) {
        temporaryLabel = text;
        target.setAttribute('aria-label', text);
      }
      // An empty title also prevents an ancestor's native title from appearing.
      target.setAttribute('title', '');
      const descriptions = (target.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
      if (!descriptions.includes(TOOLTIP_ID)) target.setAttribute('aria-describedby', [...descriptions, TOOLTIP_ID].join(' '));
      observer = new MutationObserver((changes) => {
        if (active !== target) return;
        if (changes.some((change) => change.attributeName === 'title')) {
          savedTitle = target.getAttribute('title');
          if (savedTitle !== '') { target.setAttribute('title', ''); observer?.takeRecords(); }
        }
        const updated = textFor(target);
        if (updated) {
          if (temporaryLabel !== null && target.getAttribute('aria-label') === temporaryLabel) { target.setAttribute('aria-label', updated); temporaryLabel = updated; }
          setTooltip({ target, text: updated });
        } else dismiss();
      });
      observer.observe(target, { attributes: true, attributeFilter: ['title', 'data-tooltip'] });
      setTooltip({ target, text });
    };
    const reconcile = () => {
      clearTimeout(hideTimer); hideTimer = undefined;
      // A modal can appear under a stationary pointer; don't show help for the
      // now-obscured workspace behind it.
      if (hovered && !allowed(hovered)) hovered = null;
      if (focused && !allowed(focused)) focused = null;
      if (active && !allowed(active)) { restore(); overBubble = false; }
      if (overBubble && active) { clearTimeout(showTimer); pending = null; return; }
      const next = hovered ?? focused;
      if (!next) {
        clearTimeout(showTimer); pending = null;
        if (active) hideTimer = setTimeout(restore, 180);
        blocked = null;
        return;
      }
      if (next === blocked) return;
      blocked = null;
      if (next === active || next === pending) return;
      dismiss();
      pending = next;
      showTimer = setTimeout(() => {
        pending = null;
        if ((hovered ?? focused) === next && blocked !== next) show(next);
      }, focused === next && hovered !== next ? 180 : 350);
    };
    const isBubble = (value: EventTarget | null) => value instanceof Node && Boolean(bubble.current?.contains(value));
    const over = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.buttons) return;
      overBubble = isBubble(event.target);
      hovered = overBubble ? null : targetFor(event.target);
      reconcile();
    };
    const out = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      overBubble = isBubble(event.relatedTarget);
      hovered = overBubble ? null : targetFor(event.relatedTarget);
      reconcile();
    };
    const focusIn = (event: FocusEvent) => { focused = targetFor(event.target); reconcile(); };
    const focusOut = (event: FocusEvent) => { focused = targetFor(event.relatedTarget); reconcile(); };
    const dismissUntilMove = () => { blocked = active ?? hovered ?? focused; dismiss(); };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!active && !pending)) return;
      if (active) { event.preventDefault(); event.stopPropagation(); }
      dismissUntilMove();
    };
    const scroll = (event: Event) => { if (!isBubble(event.target)) dismissUntilMove(); };
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('pointerdown', dismissUntilMove);
    document.addEventListener('contextmenu', dismissUntilMove);
    document.addEventListener('keydown', keyDown);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('blur', dismissUntilMove);
    window.addEventListener('resize', dismissUntilMove);
    return () => {
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('pointerdown', dismissUntilMove);
      document.removeEventListener('contextmenu', dismissUntilMove);
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('blur', dismissUntilMove);
      window.removeEventListener('resize', dismissUntilMove);
      dismiss();
    };
  }, []);

  return tooltip ? createPortal(<div ref={bubble} id={TOOLTIP_ID} role="tooltip" className="gitter-tooltip" style={{ left: -9999, top: -9999, visibility: 'hidden' }}>{tooltip.text}</div>, document.body) : null;
};
