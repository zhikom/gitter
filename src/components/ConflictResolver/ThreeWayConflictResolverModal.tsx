// Resolves one conflicted file: pick ours, theirs or both for each conflict, or
// edit the result directly, then save it and mark the file resolved.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import hljs from 'highlight.js/lib/common';
import 'highlight.js/styles/github-dark.css';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { useCodeTypography } from '../../useCodeTypography';
import { ask } from '../ui/ask';
import { Button, Modal } from '../ui/Modal';
import { type Conflict, type ConflictedFile, hasMarkers, mergeConflicts, parseConflicts, type Resolution } from '../../../shared/conflicts';

interface ThreeWayConflictResolverModalProps {
  file: string;
  repo: string;
  /** During a rebase git's "ours" is the branch being rebased onto and "theirs" is your commit. */
  rebasing: boolean;
  onClose: () => void;
  onResolved: () => void;
}

const SIDE_STYLE = {
  ours: { dot: 'bg-blue-500', text: 'text-blue-300', chosen: 'border-blue-500/60 bg-blue-500/10', button: 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border-blue-500/40' },
  theirs: { dot: 'bg-purple-500', text: 'text-purple-300', chosen: 'border-purple-500/60 bg-purple-500/10', button: 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border-purple-500/40' },
};

/** Highlight only known languages; unknown files stay plain text. */
const CodePreview: React.FC<{ file: string; code: string }> = ({ file, code }) => {
  const typography = useCodeTypography();
  const ext = file.split('.').pop()?.toLowerCase() || '';
  const language = ({ tsx: 'typescript', jsx: 'javascript', yml: 'yaml', rs: 'rust', py: 'python', sh: 'bash', zsh: 'bash', md: 'markdown' } as Record<string, string>)[ext] || ext;
  const highlighted = hljs.getLanguage(language) ? hljs.highlight(code, { language, ignoreIllegals: true }).value : null;
  return <pre style={typography} className="hljs whitespace-pre-wrap break-words leading-relaxed p-2 rounded select-text">{highlighted === null ? code || '(no lines)' : <code dangerouslySetInnerHTML={{ __html: highlighted }} />}</pre>;
};

export const ThreeWayConflictResolverModal: React.FC<ThreeWayConflictResolverModalProps> = ({ file, repo, rebasing, onClose, onResolved }) => {
  const typography = useCodeTypography();
  const sideLabel = { ours: rebasing ? 'Rebasing onto' : 'Yours (checked out)', theirs: rebasing ? 'Your commit' : 'Incoming' };
  const [parsed, setParsed] = useState<ConflictedFile | null>(null);
  const [result, setResult] = useState('');
  const [rationale, setRationale] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState('');
  const [activeConflict, setActiveConflict] = useState(0);
  const [preview, setPreview] = useState(true);

  useEffect(() => {
    let current = true;
    api
      .workingFile({ repo, file })
      .then((content) => {
        if (!current) return;
        const next = parseConflicts(content);
        setSource(content);
        setParsed(next);
        setResult(mergeConflicts(next));
        setActiveConflict(0);
      })
      .catch((e) => toast.error(`Could not read ${file}: ${e.message}`));
    return () => {
      current = false;
    };
  }, [repo, file]);

  const conflicts = useMemo(() => (parsed?.sections.filter((s): s is Conflict => s.kind === 'conflict') ?? []), [parsed]);
  const unresolved = conflicts.filter((c) => c.resolution === 'unresolved').length;

  // Choosing a side rebuilds the result; edits typed into it before are replaced.
  const choose = async (conflict: Conflict, resolution: Resolution) => {
    if (!parsed) return;
    if (result !== mergeConflicts(parsed) && !(await ask.confirm({ title: 'Replace edited result?', message: 'Choosing a side rebuilds the preview and replaces your manual or AI edits.', confirmLabel: 'Replace edits', danger: true }))) return;
    const next = { ...parsed, sections: parsed.sections.map((s) => (s === conflict ? { ...conflict, resolution } : s)) };
    setParsed(next);
    setResult(mergeConflicts(next));
    setPreview(true);
  };

  const resolveWithAi = async () => {
    if (!parsed) return;
    setAiBusy(true);
    try {
      const answer = await api.resolveConflict({ file, content: mergeConflicts({ ...parsed, sections: parsed.sections.map((s) => (s.kind === 'conflict' ? { ...s, resolution: 'unresolved' } : s)) }) });
      setResult(answer.resolved);
      setRationale(answer.rationale);
      setPreview(true);
    } catch (e: any) {
      toast.error(`AI resolution failed: ${e.message}`);
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (
      hasMarkers(result) &&
      !(await ask.confirm({ title: 'Conflict markers remain', message: 'The result still has conflict markers. Save it and mark the file resolved anyway?', confirmLabel: 'Save anyway', danger: true }))
    ) {
      return;
    }
    setSaving(true);
    try {
      await api.saveConflictResolution({ repo, file, content: result, stage: true, expectedContent: source });
      toast.success(`${file} is resolved and staged.`);
      onResolved();
      onClose();
    } catch (e: any) {
      toast.error(`Could not save ${file}: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const side = (which: 'ours' | 'theirs') => {
    const style = SIDE_STYLE[which];
    return (
      <div className="flex flex-col min-h-0 bg-[#12161f]">
        <div className="h-9 flex-shrink-0 bg-[#171c26] border-b border-[#232c3d] px-4 flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
          <span className={`text-xs font-semibold ${style.text}`}>{sideLabel[which]}</span>
          <span className="text-[10px] text-slate-500 font-mono truncate">{conflicts[0]?.[which === 'ours' ? 'oursLabel' : 'theirsLabel']}</span>
        </div>
        <div className="flex-1 p-3 overflow-y-auto font-mono text-xs space-y-3">
          {conflicts.map((c, i) => {
            if (i !== activeConflict) return null;
            const chosen = c.resolution === which || c.resolution === (which === 'ours' ? 'ours-then-theirs' : 'theirs-then-ours');
            return (
              <div key={i} className={`border rounded-lg p-2.5 ${chosen ? style.chosen : 'border-[#263345] bg-[#161d28]'}`}>
                <div className="flex items-center justify-between mb-2 font-sans">
                  <span className={`text-[11px] font-semibold ${style.text}`}>Conflict {i + 1}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => void choose(c, which)} className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${style.button}`}>
                      Use this
                    </button>
                    <button
                      onClick={() => void choose(c, which === 'ours' ? 'ours-then-theirs' : 'theirs-then-ours')}
                      title={`Keep both, ${sideLabel[which].toLowerCase()} first`}
                      className="px-2 py-0.5 rounded text-[10px] bg-[#1d2636] hover:bg-[#253147] text-slate-300"
                    >
                      Both, this first
                    </button>
                  </div>
                </div>
                <CodePreview file={file} code={c[which].join('\n')} />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Modal
      width="full"
      tall
      icon={<AlertTriangle className="w-4 h-4 text-rose-400" />}
      title={<span className="font-mono">{file}</span>}
      subtitle={parsed ? (unresolved ? `${unresolved} of ${conflicts.length} conflicts without a side selected` : `${conflicts.length} conflicts have a side selected`) : 'Loading…'}
      onClose={onClose}
      actions={
        <>
          <Button onClick={resolveWithAi} busy={aiBusy} disabled={!parsed}>
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            {aiBusy ? 'Resolving…' : 'Resolve with AI'}
          </Button>
          <Button tone="primary" onClick={save} busy={saving} disabled={!parsed}>
            <Check className="w-3.5 h-3.5" />
            Save and mark resolved
          </Button>
        </>
      }
    >
      {rationale && (
        <div className="px-4 py-2 bg-[#102327] border-b border-teal-500/30 text-xs text-slate-300 flex items-start gap-2">
          <Sparkles className="w-3.5 h-3.5 text-teal-400 flex-shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold text-teal-300">AI: </span>
            {rationale} Check the result before saving.
          </span>
        </div>
      )}
      <div className="px-3 py-2 flex items-center gap-2 border-b border-[#2a3447] text-xs text-slate-400">
        <Button aria-label="Previous conflict" disabled={activeConflict <= 0} onClick={() => setActiveConflict((index) => index - 1)}><ChevronLeft className="w-3.5 h-3.5" /></Button>
        <span>{conflicts.length ? `Conflict ${activeConflict + 1} of ${conflicts.length}` : 'No conflict blocks found'}</span>
        <Button aria-label="Next conflict" disabled={activeConflict >= conflicts.length - 1} onClick={() => setActiveConflict((index) => index + 1)}><ChevronRight className="w-3.5 h-3.5" /></Button>
        <span className="ml-auto">Preview the complete result before saving.</span>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-3 divide-x divide-[#232c3d]">
        {side('ours')}
        <div className="flex flex-col min-h-0 bg-[#0e1218]">
          <div className="h-9 flex-shrink-0 bg-[#171c26] border-b border-[#232c3d] px-4 flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-300">Result</span>
            <span className="text-[10px] text-slate-500">this is what gets saved</span>
            <span className="ml-auto flex gap-1"><button onClick={() => setPreview(true)} className={preview ? 'text-teal-300' : 'text-slate-500'}>Preview</button><span>/</span><button onClick={() => setPreview(false)} className={!preview ? 'text-teal-300' : 'text-slate-500'}>Edit</button></span>
          </div>
          {preview ? <div className="flex-1 overflow-auto p-2"><CodePreview file={file} code={result} /></div> : <textarea
            value={result}
            onChange={(e) => setResult(e.target.value)}
            spellCheck={false}
            aria-label="Merged result"
            style={typography}
            className="flex-1 bg-transparent p-4 font-mono text-xs text-slate-200 resize-none focus:outline-none leading-relaxed"
          />}
        </div>
        {side('theirs')}
      </div>
    </Modal>
  );
};
