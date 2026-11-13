import React, { useEffect, useState } from 'react';
import { FileCode, History } from 'lucide-react';
import type { BlameLine } from '../../../shared/types/git';
import { api } from '../../api/client';
import { usePreference } from '../../preferences';
import { toast } from '../../utils/toast';
import { Button, Modal } from '../ui/Modal';

interface FileBlameModalProps {
  file: string;
  repo: string;
  revision?: string;
  onClose: () => void;
  onOpenCommit: (hash: string) => void;
  onOpenHistory: (file: string) => void;
}

/** Who last changed each line, with a bar that is brighter for newer lines. */
export const FileBlameModal: React.FC<FileBlameModalProps> = ({ file, repo, revision, onClose, onOpenCommit, onOpenHistory }) => {
  const [lines, setLines] = useState<BlameLine[] | null>(null);
  const [tabSize] = usePreference('tabSize');

  useEffect(() => {
    let current = true;
    api
      .blame({ repo, file, revision })
      .then((loaded) => current && setLines(loaded))
      .catch((e) => {
        if (current) setLines([]);
        toast.error(`Could not blame ${file}: ${e.message}`);
      });
    return () => {
      current = false;
    };
  }, [repo, file, revision]);

  return (
    <Modal
      width="xl"
      tall
      icon={<FileCode className="w-4 h-4" />}
      title={<span className="font-mono">{file}</span>}
      subtitle={lines ? revision ? `${lines.length} lines at ${revision.slice(0, 7)}` : `${lines.length} lines as the file is now; lines not committed yet show 0000000` : 'Loading…'}
      onClose={onClose}
      actions={
        <Button onClick={() => onOpenHistory(file)}>
          <History className="w-3.5 h-3.5" />
          History
        </Button>
      }
    >
      <div style={{ tabSize }} className="flex-1 overflow-auto bg-[#14181f] font-mono text-xs select-text">
        {lines?.length === 0 && <div className="text-center py-16 text-slate-500">No committed lines to blame.</div>}
        {lines?.map((line) => (
          <div key={line.lineNumber} className="flex items-start hover:bg-[#1a2333]/40">
            <div style={{ opacity: Math.max(0.15, line.agePercent) }} className="w-1.5 self-stretch bg-teal-400 flex-shrink-0" />
            <div className="w-56 px-2 py-0.5 flex-shrink-0 select-none border-r border-[#222a38] text-[11px] text-slate-500 flex items-center gap-2">
              <button
                onClick={() => onOpenCommit(line.commitHash)}
                disabled={/^0+$/.test(line.commitHash)}
                title={/^0+$/.test(line.commitHash) ? 'Not committed yet' : line.summary}
                className="text-teal-400/80 hover:text-teal-300 disabled:text-slate-600 font-semibold"
              >
                {line.shortHash}
              </button>
              <span className="truncate flex-1 text-slate-400" title={line.author}>
                {line.author}
              </span>
              <span className="text-[10px] text-slate-600">{line.date}</span>
            </div>
            <div className="w-12 text-right pr-2 py-0.5 text-slate-600 select-none border-r border-[#222a38] flex-shrink-0">{line.lineNumber}</div>
            <div className="flex-1 pl-2 py-0.5 text-slate-200 whitespace-pre">{line.code}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
};
