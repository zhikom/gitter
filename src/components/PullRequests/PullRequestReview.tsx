import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, MessageSquarePlus, RefreshCw, Sparkles } from 'lucide-react';
import type { DiffLine, PullRequest } from '../../../shared/types/git';
import type { ReviewAnchor, ReviewSnapshot, ReviewSuggestion } from '../../../shared/types/review';
import { api } from '../../api/client';
import { desktopApi } from '../../api/desktop';
import { useCodeTypography } from '../../useCodeTypography';
import { bitbucketReviewSnapshot, REVIEW_PAGE_ROWS, reviewAnchorPage, reviewPageDiff } from '../../utils/pullReview';
import { toast } from '../../utils/toast';
import { Button, inputClass } from '../ui/Modal';

interface Props { repo: string; pr: PullRequest }

type Tab = 'changes' | 'discussion' | 'checks';
type DiffRow = { kind: 'header'; text: string } | { kind: 'line'; line: DiffLine };

export const PullRequestReview: React.FC<Props> = ({ repo, pr }) => {
  const typography = useCodeTypography();
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('changes');
  const [filePath, setFilePath] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [page, setPage] = useState(0);
  const [anchor, setAnchor] = useState<ReviewAnchor | null>(null);
  const [body, setBody] = useState('');
  const [agent, setAgent] = useState<'codex' | 'claude'>('codex');
  const [scope, setScope] = useState<'page' | 'file' | 'all'>('page');
  const [suggestions, setSuggestions] = useState<ReviewSuggestion[]>([]);
  const [agentSummary, setAgentSummary] = useState('');
  const loadedHead = useRef('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const p = pr.provider;
      const review = p ? bitbucketReviewSnapshot(await desktopApi.getBitbucketReview(p.connectionId, p.projectKey, p.slug, pr.number)) : await api.githubReview({ repo, url: pr.url, number: pr.number });
      const revision = `${review.baseHash}:${review.headHash}`;
      if (loadedHead.current && loadedHead.current !== revision) { setSuggestions([]); setAgentSummary(''); setPage(0); }
      loadedHead.current = revision;
      setSnapshot(review);
      setFilePath((previous) => review.files.some((file) => file.path === previous) ? previous : review.files[0]?.path || '');
      setAnchor(null);
    } catch (e: any) { setSnapshot(null); setError(String(e?.message || e)); }
    finally { setLoading(false); }
  }, [repo, pr.url, pr.number, pr.provider?.connectionId, pr.provider?.projectKey, pr.provider?.slug]);
  useEffect(() => { void load(); }, [load]);

  const file = snapshot?.files.find((item) => item.path === filePath);
  const diff = useMemo(() => snapshot?.files.map((item) => item.rawDiff).join('\n') || '', [snapshot]);
  const rows = useMemo<DiffRow[]>(() => file?.hunks.flatMap((hunk): DiffRow[] => [{ kind: 'header', text: hunk.header }, ...hunk.lines.map((line): DiffRow => ({ kind: 'line', line }))]) || [], [file]);
  const pages = Math.max(1, Math.ceil(rows.length / REVIEW_PAGE_ROWS));
  const reviewInput = useMemo(() => scope === 'all' ? diff : !file ? '' : scope === 'file' ? file.rawDiff : reviewPageDiff(file, page), [scope, diff, file, page]);
  const post = async () => {
    if (!snapshot || !anchor || !body.trim()) return;
    setBusy(true);
    try {
      const p = pr.provider;
      if (p) await desktopApi.bitbucketReviewAction(p.connectionId, p.projectKey, p.slug, pr.number, snapshot.headHash, snapshot.baseHash, 'comment', body, anchor);
      else await api.githubReviewComment({ repo, url: pr.url, number: pr.number, headHash: snapshot.headHash, baseHash: snapshot.baseHash, body, anchor });
      setSuggestions((previous) => previous.filter((item) => !(item.path === anchor.path && item.line === anchor.line && item.side === anchor.side && item.body === body.trim())));
      setBody(''); setAnchor(null); toast.success('Review comment posted.'); await load();
    } catch (e: any) { toast.error(`Could not post comment: ${e.message}`); }
    finally { setBusy(false); }
  };
  const approve = async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      const p = pr.provider;
      if (p) await desktopApi.bitbucketReviewAction(p.connectionId, p.projectKey, p.slug, pr.number, snapshot.headHash, snapshot.baseHash, 'approve');
      else await api.githubApproveReview({ repo, url: pr.url, number: pr.number, headHash: snapshot.headHash, baseHash: snapshot.baseHash });
      toast.success('Review approved.'); await load();
    } catch (e: any) { toast.error(`Could not approve: ${e.message}`); }
    finally { setBusy(false); }
  };
  const runAgent = async () => {
    const revision = snapshot ? `${snapshot.baseHash}:${snapshot.headHash}` : '';
    setBusy(true); setAgentSummary(''); setSuggestions([]);
    try {
      const result = await api.localPullReview({ repo, agent, diff: reviewInput });
      if (revision !== loadedHead.current) throw new Error('The pull request changed during the review. Run the agent again.');
      setSuggestions(result.suggestions);
      setAgentSummary(`${result.summary}${result.omitted ? ` ${result.omitted} suggestion(s) omitted because their lines were not in the diff.` : ''}`);
    } catch (e: any) { toast.error(`Local review failed: ${e.message}`); }
    finally { setBusy(false); }
  };
  const selectSuggestion = (suggestion: ReviewSuggestion) => {
    const target = snapshot?.files.find((item) => item.path === suggestion.path);
    setFilePath(suggestion.path); setPage(target ? reviewAnchorPage(target, suggestion) : 0); setAnchor(suggestion); setBody(suggestion.body); setTab('changes');
  };
  const chooseLine = (line: { type: 'add' | 'delete' | 'context'; oldLineNumber?: number; newLineNumber?: number }) => {
    if (!file) return;
    const side = line.type === 'delete' ? 'LEFT' : 'RIGHT';
    const number = side === 'LEFT' ? line.oldLineNumber : line.newLineNumber;
    if (number) { setAnchor({ path: file.path, oldPath: file.oldPath, line: number, side, lineType: line.type }); setBody(''); }
  };

  return <div className="flex-1 min-h-0 flex flex-col">
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 border-b border-[#2a3447] text-xs">
      {(['changes', 'discussion', 'checks'] as const).map((name) => <button key={name} onClick={() => setTab(name)} className={`px-2 py-1 rounded capitalize ${tab === name ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-slate-100'}`}>{name}{name === 'discussion' && snapshot ? ` (${snapshot.comments.length})` : ''}{name === 'checks' && snapshot ? ` (${snapshot.checks.length})` : ''}</button>)}
      <span className="flex-1" />
      <span className="text-slate-500 font-mono">{snapshot?.headHash.slice(0, 8)}</span>
      <Button onClick={() => void load()} busy={loading} disabled={busy} title="Refresh review"><RefreshCw className="w-3.5 h-3.5" /></Button>
      <Button onClick={() => void approve()} disabled={!snapshot} busy={busy}><Check className="w-3.5 h-3.5" /> Approve</Button>
    </div>
    {loading && !snapshot && <div className="p-4 text-xs text-slate-400">Loading pull request review…</div>}
    {error && <div role="alert" className="p-4 text-xs text-rose-300">{error}</div>}
    {snapshot && <>
      {snapshot.warnings.map((warning, i) => <div key={i} className="px-4 py-1 text-xs text-amber-300">{warning}</div>)}
      {tab === 'checks' && <div className="p-4 overflow-auto space-y-3 text-xs">
        <h3 className="font-semibold text-slate-200">Builds and checks</h3>
        {!snapshot.checks.length && <p className="text-slate-500">No builds or checks reported for this commit.</p>}
        {snapshot.checks.map((check, i) => <div key={i} className="flex gap-3 text-slate-300"><span className="text-teal-300 w-28">{check.state}</span>{check.url ? <button onClick={() => check.url && void api.openUrl({ url: check.url })} className="text-left hover:underline">{check.name}</button> : check.name}</div>)}
        <h3 className="font-semibold text-slate-200 pt-3">Reviews</h3>
        {!snapshot.approvals.length && <p className="text-slate-500">No reviews reported.</p>}
        {snapshot.approvals.map((review, i) => <div key={i} className="text-slate-300">{review.author} · {review.state}</div>)}
      </div>}
      {tab === 'discussion' && <div className="p-4 overflow-auto space-y-3 text-xs">
        {!snapshot.comments.length && <p className="text-slate-500">No comments yet.</p>}
        {snapshot.comments.map((comment) => <div key={comment.id} className="rounded border border-[#2a3447] p-3"><div className="text-slate-400 mb-2">{comment.author} {comment.path && `· ${comment.path}${comment.line ? `:${comment.line}` : ''}`} {comment.outdated && '· outdated'} {comment.createdAt && `· ${new Date(comment.createdAt).toLocaleString()}`}</div><div className="text-slate-200 whitespace-pre-wrap select-text">{comment.body}</div></div>)}
      </div>}
      {tab === 'changes' && <div className="flex flex-1 min-h-0">
        <aside className="w-56 flex-shrink-0 flex flex-col overflow-hidden border-r border-[#2a3447] p-2 text-xs">
          <div className="text-slate-500 px-2 py-1">Changed files ({snapshot.files.length})</div>
          <input aria-label="Filter changed files" value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} placeholder="Filter files…" className={`${inputClass} mb-1`} />
          <div className="flex-1 min-h-[50px] overflow-auto">
            {snapshot.files.filter((item) => item.path.toLowerCase().includes(fileFilter.toLowerCase())).map((item) => <button key={item.path} onClick={() => { setFilePath(item.path); setPage(0); setAnchor(null); }} className={`w-full text-left px-2 py-1.5 rounded break-all ${item.path === filePath ? 'bg-[#283342] text-teal-300' : 'text-slate-400 hover:bg-[#202735]'}`}>{item.path}</button>)}
            {!snapshot.files.length && <div className="px-2 text-slate-500">No text diff available.</div>}
          </div>
          <div className="max-h-[55%] overflow-y-auto border-t border-[#2a3447] mt-3 pt-3 px-2 space-y-2">
            <div className="font-semibold text-slate-300">Local agent review</div>
            <p className="text-[10px] leading-relaxed text-slate-500">The selected CLI may send the diff to its AI provider. Suggestions remain drafts until you post them.</p>
            <select aria-label="Review agent" value={agent} onChange={(e) => setAgent(e.target.value as 'codex' | 'claude')} className={inputClass}><option value="codex">Codex CLI</option><option value="claude">Claude Code CLI</option></select>
            <select aria-label="Agent review scope" value={scope} onChange={(e) => setScope(e.target.value as 'page' | 'file' | 'all')} className={inputClass}><option value="page">Visible diff page</option><option value="file">Current file</option><option value="all">Entire pull request</option></select>
            <Button onClick={() => void runAgent()} busy={busy} disabled={!reviewInput || reviewInput.length > 200_000}><Sparkles className="w-3.5 h-3.5" /> Review with agent</Button>
            {reviewInput.length > 200_000 && <p className="text-amber-300">This scope exceeds 200,000 characters. Choose a smaller scope or file.</p>}
            {agentSummary && <p className="text-slate-300 whitespace-pre-wrap">{agentSummary}</p>}
            {suggestions.map((suggestion, i) => <button key={i} onClick={() => selectSuggestion(suggestion)} className="block text-left text-teal-300 hover:underline break-all">{suggestion.path}:{suggestion.line} · {suggestion.body.slice(0, 90)}</button>)}
          </div>
        </aside>
        <div style={typography} className="flex-1 min-w-0 overflow-auto font-mono text-xs">
          {file && <><div className="sticky top-0 bg-[#171c26] px-3 py-2 text-slate-300 border-b border-[#2a3447] flex gap-2 items-center"><span className="truncate">{file.path}</span><span className="ml-auto text-slate-500">Page {page + 1} of {pages}</span><Button aria-label="Previous diff page" disabled={page === 0} onClick={() => { setPage((value) => value - 1); setAnchor(null); }}>Previous</Button><Button aria-label="Next diff page" disabled={page + 1 >= pages} onClick={() => { setPage((value) => value + 1); setAnchor(null); }}>Next</Button></div>
            {file.isBinary && <p className="p-4 text-slate-500">Binary file; no line diff.</p>}
            {rows.slice(page * REVIEW_PAGE_ROWS, (page + 1) * REVIEW_PAGE_ROWS).map((row, index) => {
                if (row.kind === 'header') return <div key={index} className="px-3 py-1 bg-blue-500/10 text-blue-300">{row.text}</div>;
                const line = row.line;
                const side = line.type === 'delete' ? 'LEFT' : 'RIGHT';
                const number = side === 'LEFT' ? line.oldLineNumber : line.newLineNumber;
                const comments = snapshot.comments.filter((comment) => comment.path === file.path && comment.line === number && (!comment.side || comment.side === side) && !comment.outdated);
                return <React.Fragment key={index}><div className={`flex group ${line.type === 'add' ? 'bg-emerald-500/10' : line.type === 'delete' ? 'bg-rose-500/10' : ''}`}>
                  <button aria-label={`Comment on ${file.path} line ${number}`} onClick={() => chooseLine(line)} className="w-7 flex-shrink-0 text-slate-500 hover:text-teal-300"><MessageSquarePlus className="w-3.5 h-3.5 mx-auto" /></button>
                  <span className="w-10 text-right text-slate-600 pr-2 flex-shrink-0">{line.oldLineNumber || ''}</span><span className="w-10 text-right text-slate-600 pr-2 flex-shrink-0">{line.newLineNumber || ''}</span><pre className="text-slate-200 whitespace-pre">{line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}{line.text}</pre>
                </div>{comments.map((comment) => <div key={comment.id} className="ml-20 my-1 p-2 border border-[#2a3447] rounded text-slate-300 whitespace-pre-wrap"><span className="text-teal-300">{comment.author}: </span>{comment.body}</div>)}
                {anchor?.path === file.path && anchor.line === number && anchor.side === side && <div className="ml-20 p-2 font-sans"><div className="text-slate-400 mb-1">Comment on {file.path}:{number}</div><textarea aria-label="Review comment" value={body} onChange={(e) => setBody(e.target.value)} rows={3} className={inputClass} /><div className="flex gap-2 mt-1"><Button tone="primary" onClick={() => void post()} busy={busy} disabled={!body.trim()}>Post comment</Button><Button onClick={() => setAnchor(null)}>Cancel</Button></div></div>}</React.Fragment>;
              })}
          </>}
        </div>
      </div>}
    </>}
  </div>;
};
