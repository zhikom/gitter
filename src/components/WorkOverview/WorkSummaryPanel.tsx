import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { WorkBranch, WorkSession, WorkSummary, WorktreeState } from '../../../shared/types/workOverview';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { Button, Field, inputClass } from '../ui/Modal';

interface Props {
  repo: string;
  branch?: WorkBranch;
  tree?: WorktreeState;
  sessions: WorkSession[];
}
const pathInside = (dir: string, root: string) => {
  const normalize = (value: string) => value.replace(/\\/g, '/').replace(/\/$/, '');
  return normalize(dir) === normalize(root) || normalize(dir).startsWith(`${normalize(root)}/`);
};

/** No repository or conversation data leaves the machine until the user asks. */
export const WorkSummaryPanel: React.FC<Props> = ({ repo, branch, tree, sessions }) => {
  const [agent, setAgent] = useState<'codex' | 'claude'>('codex');
  const [chosenSession, setChosenSession] = useState('');
  const [includeConversation, setIncludeConversation] = useState(false);
  const [summary, setSummary] = useState<WorkSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const selectedSession = sessions.find((session) => `${session.provider}:${session.id}` === chosenSession);
  useEffect(() => {
    if (!selectedSession) setIncludeConversation(false);
  }, [Boolean(selectedSession)]);

  const summarize = async () => {
    setBusy(true);
    setSummary(null);
    try {
      const conversation =
        includeConversation && selectedSession && tree
          ? {
              provider: selectedSession.provider,
              id: selectedSession.id,
              directory: pathInside(selectedSession.cwd, tree.path) ? selectedSession.cwd : tree.path,
            }
          : undefined;
      const result = await api.workSummary({
        repo,
        branch: branch?.name || '',
        remote: Boolean(branch?.remoteName),
        directory: tree?.path,
        agent,
        conversation,
      });
      if (active.current) setSummary(result);
    } catch (error: any) {
      if (active.current) toast.error(`Could not summarize the work: ${error.message}`);
    } finally {
      if (active.current) setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-[#2a3447] bg-[#171c26] p-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-purple-300" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">AI work summary</span>
      </div>
      <p className="text-[11px] text-slate-400 mt-2">
        On request, the selected agent receives recent commit messages, stash titles, changed file names and up to 210 KB of committed and
        working diffs. Untracked and stash contents are excluded. This may send repository data to that agent’s model provider.
      </p>
      <div className="flex flex-wrap gap-2 items-center mt-2">
        <select
          aria-label="Summary agent"
          value={agent}
          onChange={(event) => setAgent(event.target.value as 'codex' | 'claude')}
          className={`${inputClass} max-w-[150px]`}
        >
          <option value="codex">Codex</option>
          <option value="claude">Claude Code</option>
        </select>
        <Button tone="primary" busy={busy} onClick={() => void summarize()}>
          Summarize work
        </Button>
      </div>
      {tree && sessions.length > 0 && (
        <>
          <Field
            label="Optional session context"
            hint="Only include a conversation you have verified belongs to this work. Recent user and assistant messages will be sent to the chosen model provider."
          >
            <select
              value={chosenSession}
              onChange={(event) => {
                setChosenSession(event.target.value);
                setIncludeConversation(false);
              }}
              className={`${inputClass} mt-1`}
            >
              <option value="">Choose a session…</option>
              {sessions.map((session) => (
                <option key={`${session.provider}:${session.id}`} value={`${session.provider}:${session.id}`}>
                  {session.provider}: {session.title.slice(0, 80)} ({session.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </Field>
          <label className="flex gap-2 text-[11px] text-slate-400 mt-2">
            <input
              type="checkbox"
              checked={includeConversation}
              disabled={!selectedSession}
              onChange={(event) => setIncludeConversation(event.target.checked)}
            />{' '}
            Include recent messages from this session
          </label>
        </>
      )}
      {summary && (
        <div className="mt-3 space-y-2">
          {(
            [
              ['Completed or in progress', summary.completed],
              ['Remaining', summary.remaining],
              ['Suggested next steps', summary.nextSteps],
              ['Uncertainties', summary.uncertainties],
              ['Evidence', summary.evidence],
            ] as Array<[string, string[]]>
          ).map(([heading, items]) => (
            <div key={heading}>
              <div className="text-[11px] font-semibold text-slate-200">{heading}</div>
              {items.length ? (
                <ul className="list-disc pl-4 text-xs text-slate-300 mt-1 space-y-1">
                  {items.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">None identified.</p>
              )}
            </div>
          ))}
          <p className="text-[10px] text-slate-500">
            {summary.includedConversation
              ? 'Includes selected conversation excerpts.'
              : 'Git evidence only; no conversation messages included.'}
            {summary.truncated ? ' Some input was truncated.' : ''} Review the evidence before deciding to finish or drop work.
          </p>
        </div>
      )}
    </div>
  );
};
