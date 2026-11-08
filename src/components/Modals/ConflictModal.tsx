import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, Sparkles, Check, ArrowRight } from 'lucide-react';
import { api } from '../../api/client';

import { toast } from '../../utils/toast';
interface ConflictModalProps {
  filePath: string;
  rawDiff: string;
  onClose: () => void;
  onApplyResolution: (resolvedContent: string) => Promise<void>;
}

export const ConflictModal: React.FC<ConflictModalProps> = ({
  filePath,
  rawDiff,
  onClose,
  onApplyResolution,
}) => {
  const [resolution, setResolution] = useState('');
  const [rationale, setRationale] = useState('');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    api.resolveConflict(rawDiff, filePath)
      .then((res) => {
        if (!isMounted) return;
        setResolution(res.suggestion);
        setRationale(res.rationale);
      })
      .catch((e) => {
        console.error('Conflict resolution error:', e);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [rawDiff, filePath]);

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApplyResolution(resolution);
      onClose();
    } catch (e: any) {
      toast(`Apply resolution error: ${e.message}`);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-4xl h-[80vh] bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 bg-[#181d26] border-b border-[#2a3447] flex items-center justify-between px-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-sm text-slate-100">AI Merge Conflict Resolver</span>
              <span className="block text-xs font-mono text-slate-400">{filePath}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-3">
          {/* AI Rationale banner */}
          <div className="bg-[#15232d] border border-teal-500/30 p-3 rounded text-xs">
            <div className="flex items-center space-x-1.5 text-teal-300 font-semibold mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Resolution Strategy</span>
            </div>
            <p className="text-slate-300 leading-relaxed">
              {loading ? 'AI is analyzing conflicting hunks and computing merge tree...' : rationale}
            </p>
          </div>

          {/* Resolution Editor */}
          <div className="flex-1 flex flex-col border border-[#2a3447] rounded overflow-hidden">
            <div className="bg-[#181e29] px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-[#2a3447] flex items-center justify-between">
              <span>Merged Output (Inspect or edit before saving)</span>
              <span className="text-emerald-400 text-[10px]">Clean conflict-free code</span>
            </div>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              disabled={loading}
              className="flex-1 bg-[#12161d] p-3 text-xs font-mono text-slate-200 resize-none focus:outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 bg-[#181d26] border-t border-[#2a3447] flex items-center justify-end space-x-3 px-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-[#202735]"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={loading || applying}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded bg-emerald-500 hover:bg-emerald-400 text-white font-semibold text-xs shadow-md transition disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
            <span>{applying ? 'Applying...' : 'Accept AI Resolution & Stage'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
