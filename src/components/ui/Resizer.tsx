import React from 'react';

interface ResizerProps {
  /** The size when the drag starts. */
  size: number;
  /** +1 when dragging right (or down) grows the panel, -1 when it shrinks it. */
  direction: 1 | -1;
  min: number;
  max: number;
  onResize: (size: number) => void;
  label: string;
  vertical?: boolean;
}

/** A draggable divider between two panels; arrow keys resize it too. */
export const Resizer: React.FC<ResizerProps> = ({ size, direction, min, max, onResize, label, vertical }) => {
  const clamp = (n: number) => Math.round(Math.max(min, Math.min(max, n)));
  const start = (e: React.MouseEvent) => {
    e.preventDefault();
    const origin = vertical ? e.clientY : e.clientX;
    const move = (m: MouseEvent) => onResize(clamp(size + direction * ((vertical ? m.clientY : m.clientX) - origin)));
    const stop = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = vertical ? 'row-resize' : 'col-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    const grow = vertical ? 'ArrowDown' : 'ArrowRight';
    const shrink = vertical ? 'ArrowUp' : 'ArrowLeft';
    if (e.key === grow) onResize(clamp(size + direction * step));
    else if (e.key === shrink) onResize(clamp(size - direction * step));
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onMouseDown={start}
      onKeyDown={onKey}
      className={`${vertical ? 'h-1 cursor-row-resize' : 'w-1 cursor-col-resize'} flex-shrink-0 bg-[#222a3a] hover:bg-teal-500 focus-visible:bg-teal-500 transition-colors z-20 select-none`}
    />
  );
};
