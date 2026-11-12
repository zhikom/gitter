// AI coding agents working in this repository, each on its own `agent/...`
// branch and usually in its own worktree, and the review of their work.
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  ACTIVE_WINDOW_MS,
  AGENT_BRANCH_PREFIX,
  agentBranchName,
  agentTrailers,
  detectCollisions,
  harnessFromBranch,
  REVIEW_ORDER,
} from '../shared/agents';
import type { AgentActivityEvent, AgentFileOwnership, AgentHarness, AgentInstance } from '../shared/types/agentFleet';
import type { ChangedFile } from '../shared/types/git';
import type { AgentCheckpoint, AgentDiff, AgentReviewItem, AgentReviewSnapshot, AgentReviewStatus } from '../shared/types/agentReview';
import { git, gitSucceeds } from './git';
import { changedFiles, parseDiff, parseNumstat, parseStatus, records, refFormat, STATUS_ARGS } from './gitParse';
import { inRepo, UserError } from './http';
import { readDoc, updateDoc, worktreeGitDir } from './repoStore';
import { worktrees } from './worktrees';

interface StoredAgent {
  id: string;
  name: string;
  harness: AgentHarness;
  branchName: string;
  baseRef: string;
  worktreePath?: string;
  taskDescription: string;
  claimedFiles: string[];
  createdAt: number;
  review?: { status?: AgentReviewStatus; feedback?: string; updatedAt: number; checkpoint?: AgentCheckpoint };
}

interface AgentsDoc {
  agents: StoredAgent[];
  /** Agent branches the user released; branch discovery leaves them alone. */
  dismissedBranches: string[];
}

const EMPTY: AgentsDoc = { agents: [], dismissedBranches: [] };
const DOC = 'agents';

/** The branch (or, when detached, the commit) the repository's checkout is on. */
async function checkedOutRef(repo: string): Promise<string> {
  const branch = (await git(repo, ['branch', '--show-current'])).trim();
  return branch || (await git(repo, ['rev-parse', 'HEAD'])).trim();
}

// Agent branches nobody registered (an agent started outside Gitter) still show
// up, measured against whatever the repository has checked out.
async function discover(repo: string, doc: AgentsDoc): Promise<StoredAgent[]> {
  const out = await git(repo, ['for-each-ref', refFormat('%(refname:short)', '%(creatordate:unix)'), `refs/heads/${AGENT_BRANCH_PREFIX}`]);
  const known = new Set([...doc.agents.map((a) => a.branchName), ...doc.dismissedBranches]);
  const base = await checkedOutRef(repo);
  return records(out)
    .filter(([branch]) => branch && !known.has(branch))
    .map(([branch, created]) => ({
      id: `branch:${branch}`,
      name: branch.slice(AGENT_BRANCH_PREFIX.length),
      harness: harnessFromBranch(branch),
      branchName: branch,
      baseRef: base,
      taskDescription: '',
      claimedFiles: [],
      createdAt: Number(created) * 1000,
    }));
}

interface Inspection {
  files: ChangedFile[];
  commitsAhead: number;
  lastActivity: number;
}

const NAME_STATUS_CODE: Record<string, string> = { '?': '?', A: 'A', D: 'D', R: 'R' };

async function inspect(repo: string, agent: StoredAgent, worktree?: string): Promise<Inspection> {
  const range = `${agent.baseRef}...${agent.branchName}`;
  const [committedNames, committedCounts, ahead, lastCommit] = await Promise.all([
    git(repo, ['diff', '--name-status', '-z', range]),
    git(repo, ['diff', '--numstat', '-z', range]),
    git(repo, ['rev-list', '--count', `${agent.baseRef}..${agent.branchName}`]),
    git(repo, ['log', '-1', '--format=%ct', `${agent.baseRef}..${agent.branchName}`]),
  ]);
  const files = new Map(changedFiles(committedNames, committedCounts).map((f) => [f.path, f]));
  let lastEdit = 0;
  if (worktree) {
    const [status, live] = await Promise.all([git(worktree, STATUS_ARGS), git(worktree, ['diff', '--numstat', '-z', 'HEAD'])]);
    const counts = new Map(parseNumstat(live).map((f) => [f.path, f]));
    for (const entry of parseStatus(status)) {
      const code = entry.x === '?' ? '?' : (NAME_STATUS_CODE[entry.x.trim() || entry.y.trim()] ?? 'M');
      const count = counts.get(entry.path);
      const before = files.get(entry.path);
      files.set(entry.path, {
        path: entry.path,
        status: code,
        additions: (before?.additions ?? 0) + (count?.additions ?? 0),
        deletions: (before?.deletions ?? 0) + (count?.deletions ?? 0),
      });
      const mtime = fs.statSync(path.join(worktree, entry.path), { throwIfNoEntry: false })?.mtimeMs ?? 0;
      lastEdit = Math.max(lastEdit, mtime);
    }
  }
  return {
    files: [...files.values()],
    commitsAhead: Number(ahead.trim()) || 0,
    lastActivity: Math.max(agent.createdAt, Number(lastCommit.trim()) * 1000 || 0, lastEdit),
  };
}

function reviewStatus(agent: StoredAgent, inspection: Inspection, running: boolean): AgentReviewStatus {
  const stored = agent.review?.status;
  // "Queued" (after a rollback) and "changes requested" wait for the agent; new
  // activity after the decision means it is working again.
  const superseded =
    (stored === 'queued' || stored === 'changes-requested') && inspection.lastActivity > (agent.review?.updatedAt ?? 0);
  if (stored && !superseded) return stored;
  if (inspection.files.length === 0 && inspection.commitsAhead === 0) return 'queued';
  return running ? 'running' : 'needs-review';
}

/**
 * A lock this old is most likely left over from a git process that crashed.
 * It can still be live (`git commit` holds the lock while its editor is open),
 * so it is only ever removed when the user asks, after a warning.
 */
const STALE_LOCK_MS = 30_000;

function staleIndexLock(repo: string): boolean {
  const stat = fs.statSync(path.join(worktreeGitDir(repo), 'index.lock'), { throwIfNoEntry: false });
  return Boolean(stat && Date.now() - stat.mtimeMs > STALE_LOCK_MS);
}

export async function agentSnapshot(repo: string): Promise<AgentReviewSnapshot> {
  const [doc, trees] = await Promise.all([readDoc(repo, DOC, EMPTY), worktrees(repo)]);
  const stored = [...doc.agents, ...(await discover(repo, doc))];
  const now = Date.now();

  const inspected = await Promise.all(
    stored.map(async (agent) => {
      const worktree = trees.find((t) => t.branch === agent.branchName)?.path;
      const inspection = await inspect(repo, agent, worktree).catch((e: Error) => ({ error: e.message }));
      return { agent, worktree, inspection };
    })
  );

  const agents: AgentInstance[] = [];
  const reviews: AgentReviewItem[] = [];
  for (const { agent, worktree, inspection } of inspected) {
    if ('error' in inspection) {
      // A deleted branch or base must not hide the other agents.
      agents.push({ ...toInstance(agent, worktree, 'idle', [], agent.createdAt), problem: inspection.error });
      continue;
    }
    const merged = agent.review?.status === 'merged';
    const running = !merged && now - inspection.lastActivity < ACTIVE_WINDOW_MS;
    const status = merged ? 'completed' : running ? 'running' : 'idle';
    agents.push(toInstance(agent, worktree, status, inspection.files.map((f) => f.path), inspection.lastActivity));
    reviews.push({
      agentId: agent.id,
      agentName: agent.name,
      harness: agent.harness,
      branchName: agent.branchName,
      baseRef: agent.baseRef,
      worktreePath: worktree,
      taskDescription: agent.taskDescription,
      status: reviewStatus(agent, inspection, running),
      agentStatus: status,
      files: inspection.files,
      additions: inspection.files.reduce((n, f) => n + f.additions, 0),
      deletions: inspection.files.reduce((n, f) => n + f.deletions, 0),
      commitsAhead: inspection.commitsAhead,
      collisions: [],
      checkpoint: agent.review?.checkpoint,
      feedback: agent.review?.feedback,
      updatedAt: agent.review?.updatedAt ?? agent.createdAt,
      lastActivity: inspection.lastActivity,
    });
  }

  const collisions = detectCollisions(agents);
  for (const review of reviews) {
    review.collisions = collisions.filter((c) => c.agentIds.includes(review.agentId)).map((c) => c.filePath);
  }
  reviews.sort(
    (a, b) => REVIEW_ORDER.indexOf(a.status) - REVIEW_ORDER.indexOf(b.status) || b.lastActivity - a.lastActivity
  );
  return { fleet: { agents, collisions, staleIndexLock: staleIndexLock(repo) }, reviews };
}

function toInstance(agent: StoredAgent, worktree: string | undefined, status: AgentInstance['status'], modifiedFiles: string[], lastActivity: number): AgentInstance {
  return {
    id: agent.id,
    name: agent.name,
    harness: agent.harness,
    status,
    branchName: agent.branchName,
    baseRef: agent.baseRef,
    worktreePath: worktree,
    taskDescription: agent.taskDescription,
    claimedFiles: agent.claimedFiles,
    modifiedFiles,
    lastActivity,
  };
}

/** Finds an agent, registered or discovered, and its worktree. */
async function findAgent(repo: string, agentId: string): Promise<{ agent: StoredAgent; worktree?: string }> {
  const doc = await readDoc(repo, DOC, EMPTY);
  const agent = [...doc.agents, ...(await discover(repo, doc))].find((a) => a.id === agentId);
  if (!agent) throw new UserError(`No agent "${agentId}" in this repository.`);
  const worktree = (await worktrees(repo)).find((t) => t.branch === agent.branchName)?.path;
  return { agent, worktree };
}

async function requireWorktree(repo: string, agentId: string) {
  const found = await findAgent(repo, agentId);
  if (!found.worktree) throw new UserError(`${found.agent.name} has no worktree of its own.`);
  return found as { agent: StoredAgent; worktree: string };
}

/** Saves a change to one agent; a discovered agent becomes registered by it. */
function updateAgent(repo: string, agent: StoredAgent, change: (agent: StoredAgent) => StoredAgent): Promise<AgentsDoc> {
  return updateDoc(repo, DOC, EMPTY, (doc) => {
    const current = doc.agents.find((a) => a.id === agent.id) ?? agent;
    return { ...doc, agents: [...doc.agents.filter((a) => a.id !== agent.id), change(current)] };
  });
}

/**
 * A commit of every file in the worktree, untracked ones included, or undefined
 * when nothing differs from HEAD. It is built in a temporary index, so the
 * agent's own index and files are untouched. (`git stash create` would leave
 * untracked files out, and a rollback's clean would then delete them.)
 */
async function snapshotWorktree(worktree: string, head: string): Promise<string | undefined> {
  const index = path.join(os.tmpdir(), `gitter-snapshot-${process.pid}-${Date.now()}`);
  const env = { GIT_INDEX_FILE: index };
  try {
    await git(worktree, ['read-tree', head], { env });
    await git(worktree, ['add', '-A'], { env });
    const tree = (await git(worktree, ['write-tree'], { env })).trim();
    if (tree === (await git(worktree, ['rev-parse', `${head}^{tree}`])).trim()) return undefined;
    return (await git(worktree, ['commit-tree', tree, '-p', head, '-m', 'Gitter checkpoint'])).trim();
  } finally {
    await fs.promises.rm(index, { force: true });
  }
}

function setReview(repo: string, agent: StoredAgent, review: Partial<NonNullable<StoredAgent['review']>>) {
  return updateAgent(repo, agent, (a) => ({ ...a, review: { ...a.review, ...review, updatedAt: Date.now() } }));
}

/** The agent's changes against its base, including files it created but has not added. */
async function agentDiff(repo: string, agentId: string, file?: string): Promise<AgentDiff> {
  const { agent, worktree } = await findAgent(repo, agentId);
  const paths = file ? ['--', file] : [];
  if (!worktree) {
    const range = `${agent.baseRef}...${agent.branchName}`;
    const [diff, counts] = await Promise.all([git(repo, ['diff', range, ...paths]), git(repo, ['diff', '--numstat', '-z', range, ...paths])]);
    return { agentId, baseRef: agent.baseRef, files: toChanges(counts), diffs: parseDiff(diff) }; // three dots: from the fork point
  }
  // From where the agent's branch left its base: commits the base gained since are not the agent's.
  const forkPoint = (await git(worktree, ['merge-base', '--end-of-options', agent.baseRef, 'HEAD']).catch(() => agent.baseRef)).trim();
  const [diff, counts, untrackedOut] = await Promise.all([
    git(worktree, ['diff', '--end-of-options', forkPoint, ...paths]),
    git(worktree, ['diff', '--numstat', '-z', '--end-of-options', forkPoint, ...paths]),
    git(worktree, ['ls-files', '--others', '--exclude-standard', '-z', ...paths]),
  ]);
  const untracked = untrackedOut.split('\0').filter(Boolean);
  // --no-index diffs a file against nothing; it exits 1 when they differ.
  const created = await Promise.all(
    untracked.map((f) => git(worktree, ['diff', '--no-index', '--', '/dev/null', f], { successCodes: [1] }))
  );
  const createdDiffs = parseDiff(created.join(''));
  return {
    agentId,
    baseRef: agent.baseRef,
    files: [
      ...toChanges(counts),
      ...createdDiffs.map((d) => ({
        path: d.path,
        status: '?',
        additions: d.hunks.reduce((n, h) => n + h.lines.filter((l) => l.type === 'add').length, 0),
        deletions: 0,
      })),
    ],
    diffs: [...parseDiff(diff), ...createdDiffs],
  };
}

function toChanges(numstat: string): ChangedFile[] {
  return parseNumstat(numstat).map((f) => ({ path: f.path, additions: f.additions, deletions: f.deletions, status: 'M' }));
}

async function activity(repo: string) {
  const { fleet } = await agentSnapshot(repo);
  const events: AgentActivityEvent[] = [];
  await Promise.all(
    fleet.agents.map(async (agent) => {
      if (agent.problem) return; // its branch or base is gone; the snapshot says why
      // Each chunk is one commit's header line followed by its numstat lines.
      const log = await git(repo, [
        'log', `${agent.baseRef}..${agent.branchName}`, '--no-merges', '--no-renames', '--numstat', '--format=%x1e%H%x1f%at%x1f%s',
      ]);
      for (const chunk of log.split('\x1e').filter((c) => c.trim())) {
        const [header, ...stats] = chunk.split('\n');
        const [hash, at, subject] = header.split('\x1f');
        events.push({
          id: hash,
          agentId: agent.id,
          kind: 'commit',
          hash,
          subject,
          timestamp: Number(at) * 1000,
          files: toChanges(stats.filter(Boolean).join('\0')),
        });
      }
      if (agent.worktreePath && agent.modifiedFiles.length > 0) {
        events.push({ id: `live-${agent.id}`, agentId: agent.id, kind: 'uncommitted', subject: 'Uncommitted changes', timestamp: agent.lastActivity, files: [] });
      }
    })
  );
  events.sort((a, b) => b.timestamp - a.timestamp);
  const ownership = new Map<string, AgentFileOwnership>();
  for (const event of events) {
    for (const file of event.files) {
      const entry = ownership.get(file.path) ?? { filePath: file.path, agentIds: [], additions: 0, deletions: 0 };
      if (!entry.agentIds.includes(event.agentId)) entry.agentIds.push(event.agentId);
      entry.additions += file.additions;
      entry.deletions += file.deletions;
      ownership.set(file.path, entry);
    }
  }
  return {
    events: events.slice(0, 200),
    fileOwnership: [...ownership.values()].sort((a, b) => b.agentIds.length - a.agentIds.length || a.filePath.localeCompare(b.filePath)),
  };
}

export const agentHandlers = {
  agentSnapshot: inRepo((repo) => agentSnapshot(repo)),
  agentActivity: inRepo((repo) => activity(repo)),
  agentDiff: inRepo((repo, { agentId, file }: { agentId: string; file?: string }) => agentDiff(repo, agentId, file)),

  spawnAgent: inRepo(async (repo, { harness, task, baseRef }: { harness: AgentHarness; task: string; baseRef?: string }) => {
    const base = baseRef?.trim() || (await checkedOutRef(repo));
    if (!(await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${base}^{commit}`]))) {
      throw new UserError(`"${base}" is not a branch or commit in this repository.`);
    }
    const branch = agentBranchName(harness, task);
    if (!(await gitSucceeds(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]))) {
      await git(repo, ['branch', '--end-of-options', branch, base]);
    }
    const root = (await git(repo, ['rev-parse', '--show-toplevel'])).trim();
    const folder = path.resolve(root, '..', `${path.basename(root)}-${branch.slice(AGENT_BRANCH_PREFIX.length)}`);
    await git(repo, ['worktree', 'add', '--end-of-options', folder, branch]);
    const agent: StoredAgent = {
      id: `agent-${Date.now().toString(36)}`,
      name: task.trim() || branch,
      harness,
      branchName: branch,
      baseRef: base,
      taskDescription: task.trim(),
      claimedFiles: [],
      createdAt: Date.now(),
    };
    await updateDoc(repo, DOC, EMPTY, (doc) => ({
      agents: [...doc.agents, agent],
      dismissedBranches: doc.dismissedBranches.filter((b) => b !== branch),
    }));
    return { agentId: agent.id, worktreePath: folder.replace(/\\/g, '/') };
  }),

  claimFiles: inRepo(async (repo, { agentId, files }: { agentId: string; files: string[] }) => {
    const { agent } = await findAgent(repo, agentId);
    await updateAgent(repo, agent, (a) => ({ ...a, claimedFiles: [...new Set(files)] }));
    return agentSnapshot(repo);
  }),

  /** Stops tracking an agent, optionally deleting its worktree. Its branch is kept. */
  releaseAgent: inRepo(async (repo, { agentId, removeWorktree = false }: { agentId: string; removeWorktree?: boolean }) => {
    const { agent, worktree } = await findAgent(repo, agentId);
    if (removeWorktree && worktree) await git(repo, ['worktree', 'remove', '--force', '--end-of-options', worktree]);
    await updateDoc(repo, DOC, EMPTY, (doc) => ({
      agents: doc.agents.filter((a) => a.id !== agentId),
      dismissedBranches: [...new Set([...doc.dismissedBranches, agent.branchName])],
    }));
    return agentSnapshot(repo);
  }),

  clearStaleIndexLock: inRepo(async (repo) => {
    if (!staleIndexLock(repo)) throw new UserError('The index lock is in use or already gone.');
    await fs.promises.unlink(path.join(worktreeGitDir(repo), 'index.lock'));
  }),

  /** Records the agent's branch HEAD and uncommitted files so a rollback can restore them. */
  checkpointAgent: inRepo(async (repo, { agentId, label }: { agentId: string; label?: string }) => {
    const { agent, worktree } = await requireWorktree(repo, agentId);
    const head = (await git(worktree, ['rev-parse', 'HEAD'])).trim();
    const stash = await snapshotWorktree(worktree, head);
    const checkpoint: AgentCheckpoint = { id: `cp-${Date.now().toString(36)}`, createdAt: Date.now(), head, worktreeStash: stash, label: label?.trim() || 'Checkpoint' };
    // A ref keeps the stash commit from being garbage-collected before a rollback needs it.
    if (stash) await git(repo, ['update-ref', `refs/gitter/checkpoints/${agent.id.replace(/[^\w-]/g, '-')}`, stash]);
    await setReview(repo, agent, { checkpoint });
    return agentSnapshot(repo);
  }),

  rollbackAgent: inRepo(async (repo, { agentId }: { agentId: string }) => {
    const { agent, worktree } = await requireWorktree(repo, agentId);
    const checkpoint = agent.review?.checkpoint;
    if (!checkpoint) throw new UserError(`${agent.name} has no checkpoint to roll back to.`);
    await git(worktree, ['reset', '--hard', checkpoint.head]);
    await git(worktree, ['clean', '-fd']);
    // The snapshot's files go back into the worktree as uncommitted changes; the index stays at HEAD.
    if (checkpoint.worktreeStash) await git(worktree, ['restore', `--source=${checkpoint.worktreeStash}`, '--worktree', '--', '.']);
    await setReview(repo, agent, { status: 'queued', feedback: `Rolled back to "${checkpoint.label}".` });
    return agentSnapshot(repo);
  }),

  /** Commits the agent's uncommitted files and, with `merge`, merges its branch into the checked-out branch. */
  approveAgent: inRepo(async (repo, { agentId, message, merge = false }: { agentId: string; message?: string; merge?: boolean }) => {
    const { agent, worktree } = await requireWorktree(repo, agentId);
    if ((await git(worktree, STATUS_ARGS)).length > 0) {
      await git(worktree, ['add', '-A']);
      const text = message?.trim() || `Accept ${agent.name}'s changes`;
      await git(worktree, ['commit', '-F', '-'], { input: `${text}\n\n${agentTrailers(agent)}` });
    }
    if (merge) {
      if ((await git(repo, STATUS_ARGS)).length > 0) throw new UserError('Commit or stash your own changes before merging the agent\'s branch.');
      const target = (await git(repo, ['branch', '--show-current'])).trim();
      await git(repo, ['merge', '--no-ff', '-m', `Merge ${agent.branchName} into ${target}`, '--end-of-options', agent.branchName]);
    }
    await setReview(repo, agent, { status: merge ? 'merged' : 'approved', feedback: undefined });
    return agentSnapshot(repo);
  }),

  requestAgentChanges: inRepo(async (repo, { agentId, feedback }: { agentId: string; feedback: string }) => {
    if (!feedback.trim()) throw new UserError('Describe the changes you want.');
    const { agent } = await findAgent(repo, agentId);
    await setReview(repo, agent, { status: 'changes-requested', feedback: feedback.trim() });
    return agentSnapshot(repo);
  }),

  /** Throws away the agent's work: back to its checkpoint, or to its base without one. */
  discardAgentChanges: inRepo(async (repo, { agentId }: { agentId: string }) => {
    const { agent, worktree } = await requireWorktree(repo, agentId);
    const target = agent.review?.checkpoint?.head ?? agent.baseRef;
    await git(worktree, ['reset', '--hard', '--end-of-options', target]);
    await git(worktree, ['clean', '-fd']);
    await setReview(repo, agent, { status: 'queued', feedback: 'Changes discarded.' });
    return agentSnapshot(repo);
  }),

  /** Reverses one hunk in the agent's worktree. */
  rejectAgentHunk: inRepo(async (repo, { agentId, patch }: { agentId: string; patch: string }) => {
    const { worktree } = await requireWorktree(repo, agentId);
    await git(worktree, ['apply', '-R', '--whitespace=nowarn', '-'], { input: patch });
    return agentDiff(repo, agentId);
  }),

};

