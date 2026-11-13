import React from 'react';

interface ResizerProps {
  /** The size when the drag starts. */
  size: number;
  /** +1 when dragging right grows the panel, -1 when it shrinks it. */
  direction: 1 | -1;
  min: number;
  max: number;
  onResize: (size: number) => void;
  label: string;
}

/** A draggable divider between two panels; arrow keys resize it too. */
export const Resizer: React.FC<ResizerProps> = ({ size, direction, min, max, onResize, label }) => {
  const clamp = (n: number) => Math.round(Math.max(min, Math.min(max, n)));
  const start = (e: React.MouseEvent) => {
    e.preventDefault();
    const origin = e.clientX;
    const move = (m: MouseEvent) => onResize(clamp(size + direction * (m.clientX - origin)));
    const stop = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10;
    if (e.key === 'ArrowRight') onResize(clamp(size + direction * step));
    else if (e.key === 'ArrowLeft') onResize(clamp(size - direction * step));
    else return;
    e.preventDefault();
  };
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onMouseDown={start}
      onKeyDown={onKey}
      className="w-1 cursor-col-resize flex-shrink-0 bg-[#222a3a] hover:bg-teal-500 focus-visible:bg-teal-500 transition-colors z-20 select-none"
    />
  );
};
