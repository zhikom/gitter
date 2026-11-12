import React, { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, GitBranch, GitPullRequest, Sparkles } from 'lucide-react';
import type { PullRequest } from '../../../shared/types/git';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { Button, Field, inputClass, Modal } from '../ui/Modal';

const openInBrowser = (url: string) => api.openUrl({ url }).catch(() => window.open(url, '_blank'));

interface ViewProps {
  repo: string;
  pr: PullRequest;
  onClose: () => void;
  onCheckout: (number: number) => Promise<void>;
}

export const PullRequestModal: React.FC<ViewProps> = ({ repo, pr, onClose, onCheckout }) => {
  const [details, setDetails] = useState<PullRequest>(pr);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .pullRequest({ repo, number: pr.number })
      .then(setDetails)
      .catch((e) => toast.error(`Could not load #${pr.number}: ${e.message}`));
  }, [repo, pr.number]);

  const checkout = async () => {
    setBusy(true);
    try {
      await onCheckout(details.number);
      onClose();
    } catch {
      // Reported by the action.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      width="lg"
      icon={<GitPullRequest className="w-4 h-4" />}
      title={`#${details.number} ${details.title}`}
      subtitle={`${details.author.login} · ${details.headRefName} → ${details.baseRefName}`}
      onClose={onClose}
      actions={
        <>
          <Button onClick={checkout} busy={busy}>
            Check out
          </Button>
          <Button tone="primary" onClick={() => openInBrowser(details.url)}>
            GitHub
            <ExternalLink className="w-3.5 h-3.5" />
          </Button>
        </>
      }
    >
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          <span className="px-1.5 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300">{details.isDraft ? 'DRAFT' : details.state}</span>
          {details.changedFiles !== undefined && (
            <span>
              {details.changedFiles} files · <span className="text-emerald-400">+{details.additions}</span> <span className="text-rose-400">−{details.deletions}</span>
            </span>
          )}
          {details.mergeable && <span>mergeable: {details.mergeable.toLowerCase()}</span>}
        </div>
        <div className="bg-[#14181f] p-4 rounded border border-[#2a3447] text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-text">
          {details.body || <span className="text-slate-500">No description.</span>}
        </div>
      </div>
    </Modal>
  );
};

interface CreateProps {
  repo: string;
  head: string;
  /** The branch the pull request merges into, unless the user changes it. */
  defaultBase: string;
  onClose: () => void;
  onCreated: () => void;
}

export const CreatePullRequestModal: React.FC<CreateProps> = ({ repo, head, defaultBase, onClose, onCreated }) => {
  const [base, setBase] = useState(defaultBase);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [draft, setDraft] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // The description comes from the branch's own commits and the files they change.
  const describe = async () => {
    setDrafting(true);
    try {
      const [commits, files] = await Promise.all([api.rebaseCommits({ repo, base }), api.compareCommits({ repo, base, target: 'HEAD' })]);
      if (commits.length === 0) throw new Error(`${head} has no commits that ${base} lacks.`);
      const summary = files.map((f) => `${f.status} ${f.path} (+${f.additions} −${f.deletions})`).join('\n');
      const result = await api.prDescription({ commits: commits.map((c) => c.summary), diffSummary: summary });
      setTitle(result.title);
      setBody(result.body);
    } catch (e: any) {
      toast.error(`Could not draft the description: ${e.message}`);
    } finally {
      setDrafting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await api.createPullRequest({ repo, title: title.trim(), body: body.trim(), head, base: base.trim(), draft });
      toast.success(`Opened pull request #${created.number}.`);
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(`Could not open the pull request: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal width="lg" icon={<GitPullRequest className="w-4 h-4" />} title="New pull request" subtitle="Push the branch first; GitHub needs it" onClose={onClose}>
      <form onSubmit={submit} className="p-4 space-y-3">
        <div className="flex items-center gap-3 p-3 bg-[#14181f] border border-[#2a3447] rounded text-xs font-mono">
          <span className="flex items-center gap-1.5 text-teal-300">
            <GitBranch className="w-3.5 h-3.5" />
            {head}
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
          <input value={base} onChange={(e) => setBase(e.target.value)} aria-label="Base branch" className="bg-transparent border-b border-[#2a3447] focus:outline-none focus:border-teal-500 w-40 text-slate-200" />
          <Button type="button" onClick={describe} busy={drafting} disabled={!base.trim()} className="ml-auto font-sans">
            <Sparkles className="w-3.5 h-3.5 text-teal-300" />
            {drafting ? 'Drafting…' : 'Draft with AI'}
          </Button>
        </div>
        <Field label="Title">
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Description (Markdown)">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className={`${inputClass} font-mono resize-y`} />
        </Field>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
          Open as a draft
        </label>
        <div className="flex justify-end gap-2 pt-3 border-t border-[#2a3447]">
          <Button type="button" tone="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" busy={submitting} disabled={!title.trim() || !base.trim()}>
            Open pull request
          </Button>
        </div>
      </form>
    </Modal>
  );
};
