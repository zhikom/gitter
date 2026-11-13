import React, { useEffect, useMemo, useState } from 'react';
import { GitBranch } from 'lucide-react';
import type { Branch, Commit, PullRequest } from '../../../shared/types/git';
import type { AgentReviewItem } from '../../../shared/types/agentReview';
import type { ReviewSnapshot } from '../../../shared/types/review';
import { api } from '../../api/client';
import { desktopApi } from '../../api/desktop';
import { bitbucketReviewSnapshot } from '../../utils/pullReview';
import { Modal } from '../ui/Modal';

interface Props { repo: string; branch: Branch; pulls: PullRequest[]; agents: AgentReviewItem[]; onClose: () => void; onOpenCommit: (hash: string) => void; onOpenPr: (pr: PullRequest) => void; onOpenAgent: (id: string) => void }

export const BranchTimelineModal: React.FC<Props> = ({ repo, branch, pulls, agents, onClose, onOpenCommit, onOpenPr, onOpenAgent }) => {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [error, setError] = useState('');
  const [reviews, setReviews] = useState<Record<string, ReviewSnapshot | string>>({});
  const branchName = branch.isRemote && branch.remoteName && branch.name.startsWith(`${branch.remoteName}/`) ? branch.name.slice(branch.remoteName.length + 1) : branch.name;
  const related = useMemo(() => pulls.filter((pr) => pr.headRefName === branchName && (!branch.isRemote || !pr.provider || pr.provider.remoteName === branch.remoteName)), [pulls, branchName, branch.isRemote, branch.remoteName]);
  const relevantAgents = agents.filter((item) => item.branchName === branchName);
  useEffect(() => {
    let current = true;
    setError(''); setCommits([]);
    void api.branchHistory({ repo, hash: branch.targetHash }).then((items) => { if (current) setCommits(items); }).catch((e) => { if (current) setError(e.message); });
    return () => { current = false; };
  }, [repo, branch.targetHash]);
  const ids = related.map((pr) => `${pr.provider?.connectionId || 'github'}:${pr.number}:${pr.url}`).join('|');
  useEffect(() => {
    let current = true;
    setReviews({});
    for (const pr of related) {
      const key = `${pr.provider?.connectionId || 'github'}:${pr.number}:${pr.url}`;
      const p = pr.provider;
      const request = p ? desktopApi.getBitbucketReview(p.connectionId, p.projectKey, p.slug, pr.number).then(bitbucketReviewSnapshot) : api.githubReview({ repo, url: pr.url, number: pr.number });
      void request.then((result) => { if (current) setReviews((prior) => ({ ...prior, [key]: result })); }).catch((e) => { if (current) setReviews((prior) => ({ ...prior, [key]: String(e?.message || e) })); });
    }
    return () => { current = false; };
  }, [repo, ids]);
  const events = [
    ...commits.map((commit) => ({ key: `commit-${commit.hash}`, time: commit.timestamp, kind: 'commit' as const, label: commit.summary, detail: `${commit.shortHash} · ${commit.author.name}`, action: () => onOpenCommit(commit.hash) })),
    ...related.map((pr) => ({ key: `pr-${pr.provider?.connectionId || 'gh'}-${pr.number}`, time: Date.parse(pr.updatedAt || pr.createdAt) || 0, kind: 'pull request' as const, label: `#${pr.number} ${pr.title}`, detail: `${pr.state}${pr.isDraft ? ' · draft' : ''} · branch name match`, action: () => onOpenPr(pr) })),
    ...relevantAgents.map((agent) => ({ key: `agent-${agent.agentId}`, time: Math.max(agent.lastActivity || 0, agent.updatedAt || 0), kind: 'agent' as const, label: agent.agentName, detail: `${agent.status} · ${agent.taskDescription}`, action: () => onOpenAgent(agent.agentId) })),
  ].sort((a, b) => b.time - a.time);
  return <Modal width="xl" tall icon={<GitBranch className="w-4 h-4" />} title="Branch timeline" subtitle={`${branch.name} · ${branch.targetHash.slice(0, 8)} · no checkout required`} onClose={onClose}>
    <div className="flex-1 overflow-auto p-4 text-xs space-y-4">
      <section className="rounded border border-[#2a3447] p-3 space-y-2"><h3 className="font-semibold text-slate-200">Pull requests and current checks</h3>
        {!related.length && <p className="text-slate-500">No loaded pull requests match this branch name.</p>}
        {related.map((pr) => { const key = `${pr.provider?.connectionId || 'github'}:${pr.number}:${pr.url}`; const review = reviews[key]; return <div key={key} className="text-slate-300"><button className="text-teal-300 hover:underline" onClick={() => onOpenPr(pr)}>#{pr.number} {pr.title}</button><span className="text-slate-500"> · {pr.state} · matched by branch name</span>{typeof review === 'string' ? <p className="text-amber-300">Checks unavailable: {review}</p> : review ? <><p className="text-slate-500">PR head {review.headHash.slice(0, 8)}{review.headHash !== branch.targetHash ? ' differs from this local tip' : ' matches this tip'}</p><div>{review.checks.length ? review.checks.map((check, i) => <span key={i} className="inline-block mr-3 mt-1">{check.name}: {check.state}</span>) : 'No checks reported.'}</div>{review.warnings.map((warning, i) => <p key={i} className="text-amber-300">{warning}</p>)}</> : <p className="text-slate-500">Loading checks…</p>}</div>; })}
      </section>
      <section><h3 className="font-semibold text-slate-200 mb-2">Activity</h3>{error && <p role="alert" className="text-rose-300">{error}</p>}
        {!events.length && !error && <p className="text-slate-500">Loading branch history…</p>}
        <div className="border-l border-[#344153] ml-2 space-y-1">{events.map((event) => <button key={event.key} onClick={event.action} className="block w-full text-left pl-4 py-2 hover:bg-[#202735] rounded-r"><div className="flex gap-2"><span className="text-teal-400 uppercase text-[10px] w-20 flex-shrink-0">{event.kind}</span><span className="text-slate-200">{event.label}</span><span className="ml-auto text-slate-500 flex-shrink-0">{event.time ? new Date(event.time).toLocaleString() : 'date unavailable'}</span></div><div className="text-slate-500 ml-[88px] mt-1">{event.detail}</div></button>)}</div>
      </section>
    </div>
  </Modal>;
};
