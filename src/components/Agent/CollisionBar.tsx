import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import { FileCollision } from '../../types/agentFleet';

interface CollisionBarProps {
  collisions: FileCollision[];
  onOpenInbox: () => void;
}

export const CollisionBar: React.FC<CollisionBarProps> = ({ collisions, onOpenInbox }) => {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (collisions.length === 0) setDismissed(false);
  }, [collisions.length]);

  if (collisions.length === 0 || dismissed) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/[0.07] border-b border-amber-500/20 text-[11px] select-none">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
      <span className="font-semibold text-amber-200 flex-shrink-0">
        {collisions.length} collision{collisions.length === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-1 min-w-0 overflow-hidden">
        {collisions.slice(0, 3).map((collision) => (
          <span
            key={`${collision.collisionType}:${collision.filePath}`}
            title={`${collision.contendingAgents.join(' ↔ ')}\n${collision.suggestedAction}`}
            className="px-1.5 py-0.5 rounded bg-black/30 font-mono text-[10px] text-amber-100/90 truncate max-w-[180px]"
          >
            {collision.filePath}
          </span>
        ))}
        {collisions.length > 3 && (
          <span className="text-[10px] text-amber-300/70 flex-shrink-0">+{collisions.length - 3}</span>
        )}
      </div>
      <button
        onClick={onOpenInbox}
        className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400/15 hover:bg-amber-400/25 text-[10px] font-semibold text-amber-200 transition-colors flex-shrink-0"
      >
        Resolve
        <ArrowRight className="w-3 h-3" />
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss collision bar"
        className="p-0.5 rounded text-amber-400/60 hover:text-amber-200 flex-shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
};
