import React from 'react';
import { menuPosition, useDismiss } from '../ui/useDismiss';

export interface PatchMenuItem {
  label: string;
  danger?: boolean;
  run: () => void;
}

export const PatchContextMenu: React.FC<{ position: { x: number; y: number } | null; items: PatchMenuItem[]; onClose: () => void }> = ({ position, items, onClose }) => {
  useDismiss(Boolean(position), onClose);
  if (!position) return null;
  return (
    <div data-context-menu role="menu" style={menuPosition(position.x, position.y, 230, items.length * 34 + 12)} className="fixed z-50 min-w-[220px] rounded-md border border-[#344257] bg-[#1b212c] py-1 text-xs text-slate-200 shadow-2xl">
      {items.map((item) => <button key={item.label} role="menuitem" className={`block w-full px-3 py-2 text-left hover:bg-[#2a3447] ${item.danger ? 'text-rose-300' : ''}`} onClick={() => { onClose(); item.run(); }}>{item.label}</button>)}
    </div>
  );
};
