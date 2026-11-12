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
import { buildPatch, wholeFile, wholeHunk, type LineSelection } from '../shared/patch';
import { mergeConflicts, parseConflicts } from '../shared/conflicts';
import type { FileDiff } from '../shared/types/git';

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

describe('working tree', () => {
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
    await api.discardPatch({ repo, patch: buildPatch(diff, wholeFile(diff), 'reverse')! });
    assert.equal(read(repo, 'new.txt'), 'alpha\n');
  });

  test('a last line without a newline can be staged', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'one\ntwo\nend');
    const [diff] = await api.workingDiff({ repo, file: 'a.txt' });
    await api.stagePatch({ repo, patch: buildPatch(diff, wholeHunk(0), 'forward')! });
    assert.equal(await staged(repo), 'one\ntwo\nend');
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
    await api.push({ repo, remote: 'upstream' });
    await api.fetch({ repo });
    const remote = (await api.branches({ repo })).find((b) => b.isRemote);
    assert.deepEqual([remote?.name, remote?.remoteName], ['upstream/main', 'upstream']);
  });

  test('interactive rebase refuses to run over uncommitted changes', async () => {
    const repo = await newRepo();
    write(repo, 'a.txt', 'dirty\n');
    await assert.rejects(api.runRebasePlan({ repo, base: 'HEAD', plan: [] }), /Commit or stash/);
    assert.equal(read(repo, 'a.txt'), 'dirty\n');
  });
});

describe('stash', () => {
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
    await api.checkpointAgent({ repo, agentId });
    write(worktreePath, 'a.txt', 'broken\n');
    write(worktreePath, 'junk.txt', 'junk\n');
    await api.rollbackAgent({ repo, agentId });
    assert.equal(read(worktreePath, 'a.txt'), 'checkpointed\n');
    assert.ok(!fs.existsSync(path.join(worktreePath, 'junk.txt')));
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
  });

  test('refuses commands that rewrite history or run other programs', () => {
    for (const command of ['git difftool --extcmd=calc', 'git rebase --exec calc main', 'git -c core.pager=calc log', 'git push -f', 'git push origin +main', 'git branch -D x', 'git status\ncalc', 'ls']) {
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
