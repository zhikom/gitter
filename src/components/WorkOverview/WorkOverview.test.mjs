import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const pause = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

test('work overview inspects locally and only sends a selected conversation on explicit request', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const keys = ['window', 'document', 'navigator', 'localStorage', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'KeyboardEvent', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  const originalFetch = globalThis.fetch;
  const calls = [];
  const id = '12345678-1234-4234-8234-123456789abc';
  const tree = { path: '/repos/app', head: 'a'.repeat(40), branch: 'feature', isBare: false, isCurrent: true, files: [{ path: 'example.txt', status: 'modified', staged: false }], rebase: false, merge: false };
  const stash = { index: 0, name: 'stash@{0}', message: 'unfinished work', hash: 'b'.repeat(40), date: '' };
  const overview = { root: '/repos/app', commonDir: '/repos/app/.git', name: 'app', checkedAt: Date.now(), origin: 'known', branches: [{ name: 'feature', head: tree.head, subject: 'Change', lastCommit: 1, upstream: { state: 'known', name: 'origin/main', ahead: 1, behind: 0 }, push: { state: 'none' }, absentFromOrigin: 1, worktrees: [tree] }], remoteBranches: [{ name: 'origin/feature', remoteName: 'origin', head: tree.head, subject: 'Change', lastCommit: 1, upstream: { state: 'none' }, push: { state: 'none' }, absentFromOrigin: 0, worktrees: [] }], detached: [], stashes: [stash], warnings: [] };
  const responses = {
    defaultRepoFolder: '/repos', scanRepositories: [{ path: '/repos/app' }], workOverview: overview,
    workSessions: { sessions: [{ id, provider: 'codex', title: 'Implement a feature', cwd: '/repos/app', branch: 'feature', updatedAt: 1, source: 'Codex' }], warnings: [] },
    stashes: [{ ...stash, index: 2, name: 'stash@{2}' }],
    branchHistory: [{ hash: tree.head, shortHash: 'aaaaaaa', summary: 'Change' }],
    workSummary: { completed: ['Started'], remaining: [], nextSteps: ['Review'], uncertainties: ['Goal unknown'], evidence: ['example.txt'], includedConversation: false, truncated: false },
  };
  globalThis.fetch = async (url, options) => {
    const operation = String(url).split('/').pop(); const body = JSON.parse(options.body);
    calls.push({ operation, body });
    if (!(operation in responses)) throw new Error(`Unexpected operation ${operation}`);
    return { ok: true, json: async () => responses[operation] };
  };
  const { createRoot } = await import('react-dom/client');
  const { Simulate } = await import('react-dom/test-utils');
  const { WorkOverviewModal } = await import('./WorkOverviewModal.tsx');
  const root = createRoot(document.getElementById('root'));
  let openedStash;
  const button = (text) => [...document.querySelectorAll('button')].find((item) => item.textContent.includes(text));
  try {
    await act(async () => { root.render(React.createElement(WorkOverviewModal, { currentRepo: '/repos/app', recent: [], openPaths: [], onClose() {}, onOpen() {}, onManage() {}, onOpenStash(_repo, value) { openedStash = value; } })); await pause(80); });
    await act(async () => { await pause(50); });
    assert.match(document.body.textContent, /1 not on fetched origin/);
    assert.match(document.body.textContent, /Possible match/);
    await act(async () => { button('unfinished work').click(); await pause(); });
    assert.equal(openedStash.index, 2, 'resolves the same stash hash after its index changes');
    assert.ok(!calls.some((call) => ['workSummary', 'pullRequests', 'resumeWorkSession'].includes(call.operation)));
    const remotes = [...document.querySelectorAll('input[type="checkbox"]')].find((item) => item.parentElement.textContent.includes('Include remote-tracking'));
    await act(async () => Simulate.change(remotes, { target: { checked: true } }));
    await act(async () => { button('origin/feature').click(); await pause(); });
    assert.match(document.body.textContent, /Remote-tracking refs have no working directory/);
    assert.ok(!calls.some((call) => call.operation === 'checkout'));
    const local = [...document.querySelectorAll('button')].find((item) => item.textContent.includes('feature') && item.textContent.includes('/repos/app'));
    await act(async () => { local.click(); await pause(); });
    await act(async () => button('Link to worktree').click());
    assert.match(document.body.textContent, /Linked by you/);
    assert.equal(JSON.parse(localStorage.getItem('gitter_work_session_links_v1'))[0].id, id);
    await act(async () => { button('Summarize work').click(); await pause(); });
    assert.equal(calls.filter((call) => call.operation === 'workSummary').length, 1);
    assert.equal(calls.find((call) => call.operation === 'workSummary').body.conversation, undefined);
    const select = [...document.querySelectorAll('select')].find((item) => item.querySelector('option')?.textContent === 'Choose a session…');
    await act(async () => Simulate.change(select, { target: { value: `codex:${id}` } }));
    const checkbox = [...document.querySelectorAll('input[type="checkbox"]')].find((item) => item.parentElement.textContent.includes('Include recent messages'));
    await act(async () => Simulate.change(checkbox, { target: { checked: true } }));
    await act(async () => { button('Summarize work').click(); await pause(); });
    const last = calls.filter((call) => call.operation === 'workSummary').at(-1);
    assert.deepEqual(last.body.conversation, { provider: 'codex', id, directory: '/repos/app' });
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch; dom.window.close();
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
});
