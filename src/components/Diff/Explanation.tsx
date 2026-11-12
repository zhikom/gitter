import React from 'react';
import { Sparkles } from 'lucide-react';
import type { AIExplanation } from '../../../shared/types/git';

const RISK_STYLE: Record<AIExplanation['riskAssessment'], string> = {
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  high: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
};

/** An AI review of a set of changes: what they do, the risk, and what to check. */
export const Explanation: React.FC<{ explanation: AIExplanation }> = ({ explanation }) => (
  <div className="bg-[#15232d] border-b border-teal-500/30 p-3 text-xs select-text">
    <div className="flex items-center justify-between mb-1.5">
      <span className="flex items-center gap-2 text-teal-300 font-bold">
        <Sparkles className="w-4 h-4" />
        AI review
      </span>
      <span className="flex items-center gap-1.5 text-slate-400">
        Risk
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${RISK_STYLE[explanation.riskAssessment]}`}>
          {explanation.riskAssessment}
        </span>
      </span>
    </div>
    <p className="text-slate-300 mb-2 leading-relaxed">{explanation.summary}</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] text-slate-400">
      {explanation.keyChanges.length > 0 && (
        <div>
          <span className="font-semibold text-slate-300">Key changes</span>
          <ul className="list-disc pl-4 space-y-0.5 mt-0.5">
            {explanation.keyChanges.map((change, i) => (
              <li key={i}>{change}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-2">
        {explanation.riskReasoning && (
          <div>
            <span className="font-semibold text-slate-300">Why this risk</span>
            <p className="mt-0.5">{explanation.riskReasoning}</p>
          </div>
        )}
        {explanation.suggestedAction && (
          <div>
            <span className="font-semibold text-slate-300">What to check</span>
            <p className="mt-0.5">{explanation.suggestedAction}</p>
          </div>
        )}
      </div>
    </div>
  </div>
);
