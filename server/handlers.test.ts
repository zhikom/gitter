// Behavior tests: each runs real git in a throwaway repository through the same
// handlers the UI calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';
import { git } from './git';
import { createHandlers } from './handlers';
import { combine, UserError } from './http';
import { parseDiff } from './gitParse';
import { consoleArgs } from './gitConsole';
import { codingAppUrl } from './osIntegration';
import { buildPatch, wholeHunk, type LineSelection } from '../shared/patch';
import { mergeConflicts, parseConflicts } from '../shared/conflicts';
import type { FileDiff } from '../shared/types/git';
import { joinRepoFolder, repositoryNameFromUrl, repositoryParent } from '../src/utils/repositoryPaths';

const api = createHandlers({ onUpdateInstalling: () => {} });
const temps: string[] = [];
after(() => temps.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })));

async function newRepo(): Promise<string> {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitter-test-'));
  temps.push(repo);
  await git(repo, ['init', '-q', '-b', 'main']);
  await git(repo, ['config', 'user.name', 'Test']);
  await git(repo, ['config', 'user.email', 'test@example.com']);
  await git(repo, ['config', 'core.autocrlf', 'false']);
  write(repo, 'a.txt', 'one\ntwo\n');
  await git(repo, ['add', '-A']);
  await git(repo, ['commit', '-q', '-m', 'init']);
  return repo;
}

function write(repo: string, file: string, content: string) {
  fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  fs.writeFileSync(path.join(repo, file), content);
}

const read = (repo: string, file: string) => fs.readFileSync(path.join(repo, file), 'utf8');

test('suggests safe clone destinations for HTTPS and SSH remotes', () => {
  assert.equal(repositoryNameFromUrl('https://example.com/team/repo.git'), 'repo');
  assert.equal(repositoryNameFromUrl('ssh://git@example.com:7999/team/repo.git'), 'repo');
  assert.equal(repositoryNameFromUrl('git@example.com:team/repo.git'), 'repo');
  assert.equal(repositoryNameFromUrl('https://example.com/team/%2e%2e'), '');
  assert.equal(joinRepoFolder('/Users/example/repos/', 'repo'), '/Users/example/repos/repo');
  assert.equal(joinRepoFolder('C:\\Users\\example\\repos', 'repo'), 'C:\\Users\\example\\repos\\repo');
  assert.equal(repositoryParent('/Users/example/repos/repo'), '/Users/example/repos');
  assert.equal(repositoryParent('/repo'), '/');
  assert.equal(repositoryParent('C:\\repos\\repo'), 'C:\\repos');
  assert.equal(repositoryParent('C:\\repo'), 'C:\\');
});

test('coding app links keep special characters inside the repository path', () => {
  const folder = path.join(os.tmpdir(), 'space & # project');
  const codex = new URL(codingAppUrl('codex', folder));
  const claude = new URL(codingAppUrl('claude', folder));
  assert.equal(codex.protocol, 'codex:');
  assert.equal(codex.searchParams.get('path'), folder);
  assert.equal(claude.protocol, 'claude:');
  assert.equal(claude.searchParams.get('folder'), folder);
  assert.throws(() => codingAppUrl('codex', 'relative/path'));
  assert.throws(() => codingAppUrl('other' as 'codex', folder));
});

test('clone returns the actual destination so it can be opened', async () => {
  const repo = await newRepo();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'gitter-clone-'));
  temps.push(parent);
  const target = path.join(parent, 'checkout');
  const cloned = await api.cloneRepo({ url: repo, folder: target });
  assert.equal(cloned, target.replace(/\\/g, '/'));
  assert.equal((await api.repoState({ repo: cloned })).currentBranch, 'main');
});

describe('working tree', () => {
  test('a filename containing pathspec metacharacters does not stage matching files', async () => {
    const repo = await newRepo();
    write(repo, '[x].txt', 'literal\n');
    write(repo, 'x.txt', 'other\n');
    await api.stageFile({ repo, file: '[x].txt' });
    assert.deepEqual((await git(repo, ['diff', '--cached', '--name-only'])).trim().split('\n'), ['[x].txt']);
  });
  test('status covers staged, unstaged, untracked and odd file names', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'one\nTWO\n');
    write(repo, 'with space ü.txt', 'x\n');
    write(repo, 'staged.txt', 's\n');
    await git(repo, ['add', 'staged.txt']);
    const state = await api.repoState({ repo });
    assert.deepEqual(
      [state.stagedCount, state.unstagedCount, state.untrackedCount, state.conflictedCount, state.isClean],
      [1, 1, 1, 0, false]
    );
    const files = await api.fileStatuses({ repo });
    assert.ok(files.some((f) => f.path === 'with space ü.txt' && f.status === 'untracked'));
    assert.ok(files.some((f) => f.path === 'staged.txt' && f.staged && f.status === 'added'));
    assert.deepEqual(files.filter((f) => f.path === 'a.txt').map((f) => [f.insertions, f.deletions]), [[1, 1]]);
    assert.deepEqual(files.filter((f) => f.path === 'staged.txt').map((f) => [f.insertions, f.deletions]), [[1, 0]]);
  });

  test('an untracked file diffs as all-added lines, with no phantom trailing line', async () => {
    const repo = await newRepo();
    write(repo, 'new file.txt', 'alpha\nbeta\n');
    const [diff] = await api.workingDiff({ repo, file: 'new file.txt' });
    assert.equal(diff.path, 'new file.txt');
    assert.deepEqual(diff.hunks[0].lines.map((l) => [l.type, l.text]), [['add', 'alpha'], ['add', 'beta']]);
  });

  test('commit messages reach git literally, shell characters included', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'changed\n');
    await api.stageAll({ repo });
    const message = 'fix: "quotes" $(echo nope) `tick` & | ;';
    await api.commit({ repo, summary: message, description: 'body line' });
    assert.equal((await git(repo, ['log', '-1', '--format=%B'])).trim(), `${message}\n\nbody line`);
  });

  test('a conflict resolution cannot be written outside the repository', async () => {
    const repo = await newRepo();
    await assert.rejects(api.saveConflictResolution({ repo, file: '../escape.txt', content: 'x' }), /outside the repository/);
  });

  test('a merge conflict resolved to one side is saved and staged', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'one\r\nmine\r\n');
    await git(repo, ['commit', '-qam', 'mine']);
    await git(repo, ['checkout', '-q', '-b', 'other', 'HEAD~1']);
    write(repo, 'a.txt', 'one\r\ntheirs\r\n');
    await git(repo, ['commit', '-qam', 'theirs']);
    await git(repo, ['checkout', '-q', 'main']);
    await assert.rejects(api.merge({ repo, branch: 'other' }));

    const conflicted = parseConflicts(await api.workingFile({ repo, file: 'a.txt' }));
    const [conflict] = conflicted.sections.filter((s) => s.kind === 'conflict');
    assert.ok(conflict && conflict.kind === 'conflict');
    assert.deepEqual([conflict.ours, conflict.theirs], [['mine'], ['theirs']]);
    const resolved = mergeConflicts({ ...conflicted, sections: conflicted.sections.map((s) => (s === conflict ? { ...conflict, resolution: 'theirs' as const } : s)) });
    await api.saveConflictResolution({ repo, file: 'a.txt', content: resolved });

    assert.equal(read(repo, 'a.txt'), 'one\r\ntheirs\r\n');
    assert.equal((await api.repoState({ repo })).conflictedCount, 0);
  });

  test('a heading underline inside a conflict is text, not a marker', () => {
    const file = parseConflicts('<<<<<<< HEAD\nTitle\n==========\nours\n=======\ntheirs\n>>>>>>> other\n');
    const [conflict] = file.sections.filter((s) => s.kind === 'conflict');
    assert.ok(conflict && conflict.kind === 'conflict');
    assert.deepEqual([conflict.ours, conflict.theirs], [['Title', '==========', 'ours'], ['theirs']]);
  });

  test('undo after a commit keeps its changes staged', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'changed\n');
    await api.stageAll({ repo });
    await api.commit({ repo, summary: 'second' });
    await api.undo({ repo });
    assert.equal((await git(repo, ['log', '-1', '--format=%s'])).trim(), 'init');
    assert.equal((await api.repoState({ repo })).stagedCount, 1);
  });
});

describe('line staging', () => {
  // a.txt starts as "one\ntwo\n"; this replaces "two" and adds two lines after it.
  async function editedRepo() {
    const repo = await newRepo();
    write(repo, 'a.txt', 'one\nTWO\nthree\nfour\n');
    return repo;
  }
  const lineIndex = (diff: FileDiff, text: string, type: 'add' | 'delete') =>
    diff.hunks[0].lines.findIndex((l) => l.text === text && l.type === type);
  const pick = (...indexes: number[]): LineSelection => new Map([[0, new Set(indexes)]]);
  const staged = (repo: string) => git(repo, ['show', ':a.txt']);

  test('staging one added line leaves the others unstaged', async () => {
    const repo = await editedRepo();
    const [diff] = await api.workingDiff({ repo, file: 'a.txt' });
    await api.stagePatch({ repo, patch: buildPatch(diff, pick(lineIndex(diff, 'four', 'add')), 'forward')! });
    assert.equal(await staged(repo), 'one\ntwo\nfour\n');
    assert.equal(read(repo, 'a.txt'), 'one\nTWO\nthree\nfour\n');
  });

  test('unstaging one staged line keeps the rest staged', async () => {
    const repo = await editedRepo();
    await api.stageFile({ repo, file: 'a.txt' });
    const [diff] = await api.workingDiff({ repo, file: 'a.txt', staged: true });
    await api.unstagePatch({ repo, patch: buildPatch(diff, pick(lineIndex(diff, 'three', 'add')), 'reverse')! });
    assert.equal(await staged(repo), 'one\nTWO\nfour\n');
  });

  test('discarding a replaced line restores it and keeps the other edits', async () => {
    const repo = await editedRepo();
    const [diff] = await api.workingDiff({ repo, file: 'a.txt' });
    const selection = pick(lineIndex(diff, 'two', 'delete'), lineIndex(diff, 'TWO', 'add'));
    await api.discardPatch({ repo, patch: buildPatch(diff, selection, 'reverse')! });
    assert.equal(read(repo, 'a.txt'), 'one\ntwo\nthree\nfour\n');
  });

  test('part of a new file can be staged, and part of it discarded', async () => {
    const repo = await newRepo();
    write(repo, 'new.txt', 'alpha\nbeta\n');
    let [diff] = await api.workingDiff({ repo, file: 'new.txt' });
    await api.stagePatch({ repo, patch: buildPatch(diff, pick(0), 'forward')! });
    assert.equal(await git(repo, ['show', ':new.txt']), 'alpha\n');
    [diff] = await api.workingDiff({ repo, file: 'new.txt' });
    await api.discardPatch({ repo, patch: buildPatch(diff, wholeHunk(0), 'reverse')! });
    assert.equal(read(repo, 'new.txt'), 'alpha\n');
  });

  test('a last line without a newline can be staged', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'one\ntwo\nend');
    const [diff] = await api.workingDiff({ repo, file: 'a.txt' });
    await api.stagePatch({ repo, patch: buildPatch(diff, wholeHunk(0), 'forward')! });
    assert.equal(await staged(repo), 'one\ntwo\nend');
  });

  test('a hunk in a quoted filename stages only that literal file', async () => {
    const repo = await newRepo();
    const file = 'a "quoted" Δ\tname.txt';
    write(repo, file, 'before\n');
    await git(repo, ['add', '--', file]);
    await git(repo, ['commit', '-qm', 'add quoted file']);
    write(repo, file, 'after\n');
    const status = (await api.fileStatuses({ repo })).find((item) => item.path === file);
    assert.deepEqual([status?.insertions, status?.deletions], [1, 1]);
    const [diff] = await api.workingDiff({ repo, file });
    assert.equal(diff.path, file);
    await api.stagePatch({ repo, patch: buildPatch(diff, wholeHunk(0), 'forward')! });
    assert.equal(await git(repo, ['show', `:${file}`]), 'after\n');
  });
});

describe('commit file actions', () => {
  test('blame and file history can be limited to the selected commit', async () => {
    const repo = await newRepo();
    const original = (await git(repo, ['rev-parse', 'HEAD'])).trim();
    write(repo, 'a.txt', 'later\n');
    await git(repo, ['commit', '-qam', 'later change']);
    const lines = await api.blame({ repo, file: 'a.txt', revision: original });
    assert.deepEqual(lines.map((line) => line.code), ['one', 'two']);
    const history = await api.fileHistory({ repo, file: 'a.txt', revision: original });
    assert.deepEqual(history.map((entry) => entry.summary), ['init']);
  });
  test('applies and reverses one historical hunk without staging other work', async () => {
    const repo = await newRepo();
    const file = 'quoted "change".txt';
    const original = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    write(repo, file, `${original.join('\n')}\n`);
    await git(repo, ['add', '--', file]);
    await git(repo, ['commit', '-qm', 'base file']);
    const changed = [...original];
    changed[1] = 'first change';
    changed[18] = 'second change';
    write(repo, file, `${changed.join('\n')}\n`);
    await git(repo, ['commit', '-qam', 'two changes']);
    const hash = (await git(repo, ['rev-parse', 'HEAD'])).trim();
    const [diff] = await api.commitDiff({ repo, hash });
    assert.equal(diff.path, file);
    assert.equal(diff.hunks.length, 2);
    write(repo, 'other.txt', 'already staged\n');
    await git(repo, ['add', '--', 'other.txt']);
    await api.applyCommitPatch({ repo, patch: buildPatch(diff, wholeHunk(0), 'reverse')!, reverse: true });
    assert.equal(read(repo, file), `${[original[0], original[1], ...changed.slice(2)].join('\n')}\n`);
    assert.equal(await git(repo, ['show', ':other.txt']), 'already staged\n');
    await api.applyCommitPatch({ repo, patch: buildPatch(diff, wholeHunk(0), 'forward')! });
    assert.equal(read(repo, file), `${changed.join('\n')}\n`);
    write(repo, file, 'unrelated local content\n');
    await assert.rejects(api.applyCommitPatch({ repo, patch: buildPatch(diff, wholeHunk(0), 'reverse')!, reverse: true }));
    assert.equal(read(repo, file), 'unrelated local content\n');
  });

  test('can reverse and reapply selected lines within a historical hunk', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'ONE\ntwo\nTHREE\nfour\n');
    await git(repo, ['commit', '-qam', 'two edits']);
    const hash = (await git(repo, ['rev-parse', 'HEAD'])).trim();
    const [diff] = await api.commitDiff({ repo, hash });
    const hunk = diff.hunks[0];
    const chosen = new Map([[0, new Set(hunk.lines.flatMap((line, index) => ['one', 'ONE'].includes(line.text) ? [index] : []))]]);
    await api.applyCommitPatch({ repo, patch: buildPatch(diff, chosen, 'reverse')!, reverse: true });
    assert.equal(read(repo, 'a.txt'), 'one\ntwo\nTHREE\nfour\n');
    await api.applyCommitPatch({ repo, patch: buildPatch(diff, chosen, 'forward')! });
    assert.equal(read(repo, 'a.txt'), 'ONE\ntwo\nTHREE\nfour\n');
  });

  test('restores selected files from a commit into the worktree and index', async () => {
    const repo = await newRepo();
    const original = (await git(repo, ['rev-parse', 'HEAD'])).trim();
    write(repo, 'a.txt', 'later\n');
    write(repo, 'added.txt', 'added later\n');
    await git(repo, ['add', '-A']);
    await git(repo, ['commit', '-qm', 'later']);
    write(repo, 'a.txt', 'uncommitted\n');
    write(repo, 'other.txt', 'unrelated\n');
    await git(repo, ['add', '--', 'other.txt']);
    await api.restoreCommitFiles({ repo, hash: original, files: ['a.txt', 'added.txt'] });
    assert.equal(read(repo, 'a.txt'), 'one\ntwo\n');
    assert.equal(await git(repo, ['show', ':a.txt']), 'one\ntwo\n');
    assert.ok(!fs.existsSync(path.join(repo, 'added.txt')));
    assert.equal(await git(repo, ['show', ':other.txt']), 'unrelated\n');
    await assert.rejects(api.restoreCommitFiles({ repo, hash: original, files: ['../outside'] }), /outside/);
    await assert.rejects(api.restoreCommitFiles({ repo, hash: '--bad', files: ['a.txt'] }), /Invalid commit/);
  });
});

describe('history and branches', () => {
  test('the graph lists branch commits but not other tools\' private refs', async () => {
    const repo = await newRepo();
    const tree = (await git(repo, ['write-tree'])).trim();
    const hidden = (await git(repo, ['commit-tree', tree, '-m', 'tool checkpoint'])).trim();
    await git(repo, ['update-ref', 'refs/othertool/checkpoint', hidden]);
    const commits = await api.commits({ repo });
    assert.deepEqual(commits.map((c) => c.summary), ['init']);
  });

  test('a repository without commits has an empty history', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitter-test-'));
    temps.push(repo);
    await git(repo, ['init', '-q']);
    assert.deepEqual(await api.commits({ repo }), []);
  });

  test('branches and tags with option-like names are treated as names', async () => {
    const repo = await newRepo();
    await assert.rejects(api.createBranch({ repo, name: '--orphan' }));
    await api.createBranch({ repo, name: 'feature/x' });
    await api.createTag({ repo, name: 'v1', message: 'release "one"' });
    const branches = await api.branches({ repo });
    assert.ok(branches.some((b) => b.name === 'feature/x' && !b.isRemote));
    assert.deepEqual((await api.tags({ repo })).map((t) => [t.name, t.message]), [['v1', 'release "one"']]);
  });

  test('remote branches are recognised whatever the remote is called', async () => {
    const repo = await newRepo();
    const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'gitter-test-remote-'));
    temps.push(upstream);
    await git(upstream, ['init', '-q', '--bare']);
    await git(repo, ['remote', 'add', 'upstream', upstream]);
    await git(repo, ['push', '-q', '-u', 'upstream', 'main']);
    await api.fetch({ repo });
    const remote = (await api.branches({ repo })).find((b) => b.isRemote);
    assert.deepEqual([remote?.name, remote?.remoteName], ['upstream/main', 'upstream']);
  });

  test('a branch started from origin/main is pushed under its own name, not onto main', async () => {
    const repo = await newRepo();
    const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'gitter-test-remote-'));
    temps.push(remote);
    await git(remote, ['init', '-q', '--bare']);
    await git(repo, ['remote', 'add', 'origin', remote]);
    await git(repo, ['push', '-q', '-u', 'origin', 'main']);
    await git(repo, ['fetch', '-q', 'origin']);
    await git(repo, ['checkout', '-q', '-b', 'feature', '--track', 'origin/main']);
    write(repo, 'a.txt', 'feature\n');
    await api.stageAll({ repo });
    await api.commit({ repo, summary: 'feature work' });
    await api.push({ repo });
    assert.equal((await git(remote, ['log', '-1', '--format=%s', 'main'])).trim(), 'init');
    assert.equal((await git(remote, ['log', '-1', '--format=%s', 'feature'])).trim(), 'feature work');
  });

  test('push sends a branch to the remote it tracks, not to origin', async () => {
    const repo = await newRepo();
    const upstream = fs.mkdtempSync(path.join(os.tmpdir(), 'gitter-test-remote-'));
    temps.push(upstream);
    await git(upstream, ['init', '-q', '--bare']);
    await git(repo, ['remote', 'add', 'upstream', upstream]);
    await git(repo, ['push', '-q', '-u', 'upstream', 'main']);
    write(repo, 'a.txt', 'changed\n');
    await api.stageAll({ repo });
    await api.commit({ repo, summary: 'second' });
    await api.push({ repo });
    assert.equal((await git(upstream, ['rev-parse', 'main'])).trim(), (await git(repo, ['rev-parse', 'HEAD'])).trim());
  });

  test('interactive rebase refuses to run over uncommitted changes', async () => {
    const repo = await newRepo();
    write(repo, 'b.txt', 'b\n');
    await git(repo, ['add', '-A']);
    await git(repo, ['commit', '-qm', 'second']);
    write(repo, 'a.txt', 'dirty\n');
    const plan = await api.rebaseCommits({ repo, base: 'HEAD~1' });
    await assert.rejects(api.runRebasePlan({ repo, base: 'HEAD~1', plan }), /Commit or stash/);
    assert.equal(read(repo, 'a.txt'), 'dirty\n');
  });

  test('a conflicting interactive rebase leaves the original checkout untouched', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'first change\n');
    await git(repo, ['commit', '-qam', 'first']);
    write(repo, 'a.txt', 'second change\n');
    await git(repo, ['commit', '-qam', 'second']);
    const original = (await git(repo, ['rev-parse', 'HEAD'])).trim();
    const plan = await api.rebaseCommits({ repo, base: 'HEAD~2' });
    await assert.rejects(api.runRebasePlan({ repo, base: 'HEAD~2', plan: [...plan].reverse() }), /original worktree was preserved/);
    assert.equal((await git(repo, ['rev-parse', 'HEAD'])).trim(), original);
    assert.equal(read(repo, 'a.txt'), 'second change\n');
    assert.ok((await api.repoState({ repo })).isClean);
  });

  test('an incomplete or duplicated rebase plan is rejected before changes', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'first change\n');
    await git(repo, ['commit', '-qam', 'first']);
    const plan = await api.rebaseCommits({ repo, base: 'HEAD~1' });
    const original = (await git(repo, ['rev-parse', 'HEAD'])).trim();
    await assert.rejects(api.runRebasePlan({ repo, base: 'HEAD~1', plan: [plan[0], plan[0]] }), /each selected commit exactly once/);
    assert.equal((await git(repo, ['rev-parse', 'HEAD'])).trim(), original);
  });

  test('rewording keeps the body; squashing keeps both messages; an emptied pick is dropped', async () => {
    const repo = await newRepo();
    const commit = async (file: string, content: string, message: string) => {
      write(repo, file, content);
      await git(repo, ['add', '-A']);
      await git(repo, ['commit', '-q', '-F', '-'], { input: message });
    };
    await commit('b.txt', 'b\n', 'add b\n\nwhy b exists');
    await commit('c.txt', 'c\n', 'add c');
    await commit('d.txt', 'd\n', 'add d');
    await git(repo, ['revert', '--no-edit', 'HEAD']); // removes d again
    const [b, c, d, revert] = await api.rebaseCommits({ repo, base: 'HEAD~4' });
    await api.runRebasePlan({
      repo,
      base: 'HEAD~4',
      plan: [{ ...b, action: 'reword', newSummary: 'add b, reworded' }, { ...c, action: 'squash' }, { ...revert, action: 'pick' }, { ...d, action: 'drop' }],
    });
    const messages = (await git(repo, ['log', '--format=%B%x00', 'HEAD~1..HEAD'])).split('\0').map((m) => m.trim()).filter(Boolean);
    assert.equal(messages[0], 'add b, reworded\n\nwhy b exists\n\nadd c');
    // Reverting d without d left nothing to commit, so that pick was skipped.
    assert.equal((await git(repo, ['rev-list', '--count', 'HEAD'])).trim(), '2'); // init and the squashed commit
    assert.equal(read(repo, 'c.txt'), 'c\n');
  });

  test('file history follows a rename, and each revision diffs at its own path', async () => {
    const repo = await newRepo();
    await git(repo, ['mv', 'a.txt', 'b.txt']);
    await git(repo, ['commit', '-qm', 'rename']);
    write(repo, 'b.txt', 'one\ntwo\nthree\n');
    await git(repo, ['commit', '-qam', 'grow']);
    const history = await api.fileHistory({ repo, file: 'b.txt' });
    assert.deepEqual(
      history.map((h) => [h.summary, h.path]),
      [['grow', 'b.txt'], ['rename', 'b.txt'], ['init', 'a.txt']]
    );
    const [first] = await api.fileCommitDiff({ repo, hash: history[2].hash, file: history[2].path });
    assert.deepEqual(first.hunks[0].lines.map((l) => l.text), ['one', 'two']);
  });

  test('undo after a mixed reset moves the branch back', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'second\n');
    await api.stageAll({ repo });
    await api.commit({ repo, summary: 'second' });
    await api.reset({ repo, hash: 'HEAD~1', mode: 'mixed' });
    await api.undo({ repo });
    assert.equal((await git(repo, ['log', '-1', '--format=%s'])).trim(), 'second');
    assert.ok((await api.repoState({ repo })).isClean);
  });

  test('undo restores what a hard reset threw away', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'second\n');
    await api.stageAll({ repo });
    await api.commit({ repo, summary: 'second' });
    await api.reset({ repo, hash: 'HEAD~1', mode: 'hard' });
    await api.undo({ repo });
    assert.equal((await git(repo, ['log', '-1', '--format=%s'])).trim(), 'second');
    assert.ok((await api.repoState({ repo })).isClean);
  });

  test('undo after a soft reset moves the branch back', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'second\n');
    await api.stageAll({ repo });
    await api.commit({ repo, summary: 'second' });
    await api.reset({ repo, hash: 'HEAD~1', mode: 'soft' });
    await api.undo({ repo });
    assert.equal((await git(repo, ['log', '-1', '--format=%s'])).trim(), 'second');
    assert.ok((await api.repoState({ repo })).isClean);
  });

  test('undo of the first commit leaves its files staged on an unborn branch', async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitter-test-'));
    temps.push(repo);
    await git(repo, ['init', '-q', '-b', 'main']);
    await git(repo, ['config', 'user.name', 'Test']);
    await git(repo, ['config', 'user.email', 'test@example.com']);
    write(repo, 'a.txt', 'first\n');
    await api.stageAll({ repo });
    await api.commit({ repo, summary: 'first' });
    await api.undo({ repo });
    assert.deepEqual(await api.commits({ repo }), []);
    assert.equal((await api.repoState({ repo })).stagedCount, 1);
  });
});

describe('stash', () => {
  test('stashing with nothing to stash leaves older stashes alone', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'older\n');
    await api.saveStash({ repo, message: 'older' });
    await assert.rejects(api.saveStash({ repo, keepWorkingChanges: true }), /no changes to stash/);
    assert.equal(read(repo, 'a.txt'), 'one\ntwo\n');
    assert.equal((await api.stashes({ repo })).length, 1);
  });

  test('stashing chosen files keeps the rest, and the stash lists untracked files', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'changed\n');
    write(repo, 'b.txt', 'new\n');
    write(repo, 'c.txt', 'keep me\n');
    await api.saveStash({ repo, message: 'two files', files: ['a.txt', 'b.txt'] });
    assert.equal(read(repo, 'a.txt'), 'one\ntwo\n');
    assert.ok(fs.existsSync(path.join(repo, 'c.txt')));
    const files = await api.stashFiles({ repo, index: 0 });
    assert.deepEqual(files.map((f) => f.path).sort(), ['a.txt', 'b.txt']);
    const [untracked] = await api.stashFileDiff({ repo, index: 0, file: 'b.txt' });
    assert.equal(untracked.hunks[0].lines[0].text, 'new');
  });

  test('a snapshot stash leaves the working tree as it was', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'changed\n');
    await api.saveStash({ repo, keepWorkingChanges: true });
    assert.equal(read(repo, 'a.txt'), 'changed\n');
    assert.equal((await api.stashes({ repo })).length, 1);
  });

  test('a stash number must be a whole number', async () => {
    const repo = await newRepo();
    await assert.rejects(api.dropStash({ repo, index: '0}; echo' as unknown as number }), /No stash number/);
  });
});

describe('virtual branches', () => {
  test('committing a lane to another branch leaves the checkout and index alone', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'lane change\n');
    write(repo, 'other.txt', 'not in the lane\n');
    const { commitHash } = await api.commitVirtualBranch({ repo, branchName: 'lane-1', files: ['a.txt'], summary: 'lane work' });
    assert.equal((await git(repo, ['branch', '--show-current'])).trim(), 'main');
    assert.equal(read(repo, 'a.txt'), 'lane change\n');
    assert.equal((await git(repo, ['show', `${commitHash}:a.txt`])), 'lane change\n');
    assert.equal((await git(repo, ['diff', '--cached', '--name-only'])).trim(), '');
  });

  test('stashing and restoring a lane round-trips its files', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'lane\n');
    write(repo, 'new.txt', 'lane new\n');
    await api.stashLane({ repo, laneId: 'l1', files: ['a.txt', 'new.txt'] });
    assert.equal(read(repo, 'a.txt'), 'one\ntwo\n');
    assert.ok(!fs.existsSync(path.join(repo, 'new.txt')));
    await api.unstashLane({ repo, laneId: 'l1' });
    assert.equal(read(repo, 'new.txt'), 'lane new\n');
  });

  test('restoring a lane preserves its staged content and unrelated staged files', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'staged lane\n');
    await git(repo, ['add', '--', 'a.txt']);
    write(repo, 'a.txt', 'working lane\n');
    write(repo, 'other.txt', 'staged elsewhere\n');
    await git(repo, ['add', '--', 'other.txt']);
    await api.stashLane({ repo, laneId: 'staged-lane', files: ['a.txt'] });
    await assert.rejects(api.stashLane({ repo, laneId: 'staged-lane', files: ['other.txt'] }), /already put away/);
    await api.unstashLane({ repo, laneId: 'staged-lane' });
    assert.equal(read(repo, 'a.txt'), 'working lane\n');
    assert.equal(await git(repo, ['show', ':a.txt']), 'staged lane\n');
    assert.equal(await git(repo, ['show', ':other.txt']), 'staged elsewhere\n');
    assert.equal((await api.stashes({ repo })).length, 1, 'the recovery stash is retained');
  });
});

describe('settings', () => {
  test('identity is stored in the repository\'s git config and can be cleared', async () => {
    const repo = await newRepo();
    await api.saveRepoSettings({ repo, settings: { userName: 'Override', pullRebase: true } });
    assert.equal((await git(repo, ['config', '--local', 'user.name'])).trim(), 'Override');
    assert.equal((await api.repoSettings({ repo })).settings.pullRebase, true);
    await api.saveRepoSettings({ repo, settings: { userName: '' } });
    assert.equal((await api.repoSettings({ repo })).settings.userName, '');
  });
});

describe('agents', () => {
  test('a spawned agent\'s work is reviewed against the branch it started from', async () => {
    const repo = await newRepo();
    const { agentId, worktreePath } = await api.spawnAgent({ repo, harness: 'claude-code', task: 'Add docs' });
    temps.push(worktreePath);
    write(worktreePath, 'docs.md', '# Docs\n');
    const indexBefore = await git(worktreePath, ['diff', '--cached', '--name-only']);
    const diff = await api.agentDiff({ repo, agentId });
    assert.deepEqual(diff.files.map((f) => f.path), ['docs.md']);
    assert.equal(await git(worktreePath, ['diff', '--cached', '--name-only']), indexBefore, 'reading the diff must not touch the agent index');
    const { reviews } = await api.agentSnapshot({ repo });
    assert.equal(reviews[0].baseRef, 'main');
    assert.equal(reviews[0].files.length, 1);
  });

  test('a rollback restores the checkpoint, uncommitted files included', async () => {
    const repo = await newRepo();
    const { agentId, worktreePath } = await api.spawnAgent({ repo, harness: 'codex', task: 'refactor' });
    temps.push(worktreePath);
    write(worktreePath, 'a.txt', 'checkpointed\n');
    write(worktreePath, 'new.txt', 'not added yet\n');
    await api.checkpointAgent({ repo, agentId });
    write(worktreePath, 'a.txt', 'broken\n');
    write(worktreePath, 'new.txt', 'broken\n');
    write(worktreePath, 'junk.txt', 'junk\n');
    await api.rollbackAgent({ repo, agentId });
    assert.equal(read(worktreePath, 'a.txt'), 'checkpointed\n');
    assert.equal(read(worktreePath, 'new.txt'), 'not added yet\n');
    assert.ok(!fs.existsSync(path.join(worktreePath, 'junk.txt')));
    // The agent's index is untouched: the restored files are uncommitted changes.
    assert.equal((await git(worktreePath, ['diff', '--cached', '--name-only'])).trim(), '');
  });

  test('a released agent is not rediscovered from its branch', async () => {
    const repo = await newRepo();
    const { agentId, worktreePath } = await api.spawnAgent({ repo, harness: 'aider', task: 'temp' });
    temps.push(worktreePath);
    await api.releaseAgent({ repo, agentId, removeWorktree: true });
    assert.equal((await api.agentSnapshot({ repo })).fleet.agents.length, 0);
  });

  test('two agents editing one file collide', async () => {
    const repo = await newRepo();
    const first = await api.spawnAgent({ repo, harness: 'codex', task: 'one' });
    const second = await api.spawnAgent({ repo, harness: 'aider', task: 'two' });
    temps.push(first.worktreePath, second.worktreePath);
    write(first.worktreePath, 'a.txt', 'first\n');
    write(second.worktreePath, 'a.txt', 'second\n');
    const { fleet } = await api.agentSnapshot({ repo });
    assert.deepEqual(fleet.collisions.map((c) => [c.filePath, c.kind, c.agentIds.length]), [['a.txt', 'overlap', 2]]);
  });
});

describe('git console', () => {
  test('runs read-only and everyday commands', () => {
    assert.deepEqual(consoleArgs('git log --oneline -3'), ['log', '--oneline', '-3']);
    assert.deepEqual(consoleArgs('git commit -m "two words"'), ['commit', '-m', 'two words']);
    assert.deepEqual(consoleArgs('git checkout -b feature/x'), ['checkout', '-b', 'feature/x']);
    assert.deepEqual(consoleArgs('git log --format=%h -n 2'), ['log', '--format=%h', '-n', '2']);
    assert.deepEqual(consoleArgs('git merge -Xtheirs topic'), ['merge', '-Xtheirs', 'topic']);
  });

  test('refuses commands that rewrite history or run other programs', () => {
    for (const command of [
      'git difftool --extcmd=calc',
      'git rebase --exec calc main',
      'git rebase --exe=calc main',
      'git rebase "-xcalc" main',
      'git fetch --upload-pac="calc" origin',
      'git push --receive-pa=calc',
      'git merge -s ours x',
      'git -c core.pager=calc log',
      'git push -f',
      'git push -uf origin x',
      'git push origin +main',
      'git branch -D x',
      'git status\ncalc',
      'ls',
    ]) {
      assert.throws(() => consoleArgs(command), UserError, command);
    }
  });
});

describe('parsers and wiring', () => {
  test('diffs of renamed and binary files keep their paths', () => {
    const [renamed, binary] = parseDiff(
      'diff --git a/old name.txt b/new name.txt\nsimilarity index 90%\nrename from old name.txt\nrename to new name.txt\n' +
        'diff --git a/img.png b/img.png\nBinary files a/img.png and b/img.png differ\n'
    );
    assert.deepEqual([renamed.path, renamed.oldPath], ['new name.txt', 'old name.txt']);
    assert.deepEqual([binary.path, binary.isBinary], ['img.png', true]);
  });

  test('two handlers with one name are a startup error', () => {
    assert.throws(() => combine({ same: () => 1 }, { same: () => 2 }), /Two handlers/);
  });
});
