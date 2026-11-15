import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

let createRoot, Simulate, TooltipLayer, tooltipPosition, RepoTabBar, Sidebar, StagingPanel;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withDom(run) {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const keys = ['window', 'document', 'navigator', 'localStorage', 'Node', 'Element', 'HTMLElement', 'MutationObserver', 'KeyboardEvent', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] });
  if (!createRoot) {
    ({ createRoot } = await import('react-dom/client'));
    ({ Simulate } = await import('react-dom/test-utils'));
    ({ TooltipLayer, tooltipPosition } = await import('./TooltipLayer.tsx'));
    ({ RepoTabBar } = await import('../Navigation/RepoTabBar.tsx'));
    ({ Sidebar } = await import('../Sidebar.tsx'));
    ({ StagingPanel } = await import('../Staging/StagingPanel.tsx'));
  }
  const root = createRoot(document.getElementById('root'));
  try { await run(root, dom.window); }
  finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of previous) descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key];
  }
}

test('tooltips explain hover and keyboard focus, preserve titles, and dismiss on Escape', async () => {
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement('button', { id: 'trigger', title: 'Uncommitted changes', 'aria-describedby': 'existing' }, React.createElement('svg')),
      React.createElement(TooltipLayer))));
    const trigger = document.getElementById('trigger');
    await act(async () => { trigger.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true })); await sleep(390); });
    assert.equal(document.querySelector('[role="tooltip"]')?.textContent, 'Uncommitted changes');
    assert.equal(trigger.getAttribute('title'), '', 'the native title is suppressed while the custom tooltip is visible');
    assert.equal(trigger.getAttribute('aria-label'), 'Uncommitted changes', 'an icon-only button retains its accessible name');
    assert.equal(trigger.getAttribute('aria-describedby'), 'existing gitter-help-tooltip');
    const bubble = document.querySelector('[role="tooltip"]');
    await act(async () => { trigger.dispatchEvent(new window.MouseEvent('pointerout', { bubbles: true, relatedTarget: bubble })); bubble.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true, relatedTarget: trigger })); await sleep(210); });
    assert.ok(document.querySelector('[role="tooltip"]'), 'the tooltip remains visible while the pointer is over it');
    await act(async () => { bubble.dispatchEvent(new window.MouseEvent('pointerout', { bubbles: true, relatedTarget: trigger })); trigger.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true, relatedTarget: bubble })); });
    await act(async () => { trigger.setAttribute('title', 'Three changed files'); await sleep(10); });
    assert.equal(document.querySelector('[role="tooltip"]')?.textContent, 'Three changed files');
    assert.equal(trigger.getAttribute('aria-label'), 'Three changed files');
    await act(async () => { trigger.dispatchEvent(new window.MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body })); await sleep(210); });
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    assert.equal(trigger.getAttribute('title'), 'Three changed files', 'a changed title is restored');
    assert.equal(trigger.getAttribute('aria-describedby'), 'existing');
    assert.equal(trigger.hasAttribute('aria-label'), false);
    await act(async () => { trigger.focus(); await sleep(220); });
    assert.equal(document.querySelector('[role="tooltip"]')?.textContent, 'Three changed files');
    await act(async () => trigger.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    assert.equal(trigger.getAttribute('title'), 'Three changed files');
  });
});

test('PR diff line menu opens a comment and protects an existing draft', async () => {
  await withDom(async (root, window) => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({
      headHash: 'a'.repeat(40), baseHash: 'b'.repeat(40), comments: [], checks: [], approvals: [], warnings: [],
      files: [{ path: 'example.ts', isBinary: false, rawDiff: 'diff', hunks: [{ header: '@@ -0,0 +1,2 @@', lines: [{ type: 'add', text: 'first', newLineNumber: 1 }, { type: 'add', text: 'second', newLineNumber: 2 }] }] }],
    }) });
    try {
      const { PullRequestReview } = await import('../PullRequests/PullRequestReview.tsx');
      const pr = { number: 7, url: 'https://github.com/example/repo/pull/7' };
      await act(async () => { root.render(React.createElement(PullRequestReview, { repo: '/repos/example', pr })); await sleep(20); });
      const lines = [...document.querySelectorAll('pre')];
      assert.equal(lines.length, 2);
      await act(async () => lines[0].dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, button: 2 })));
      const items = [...document.querySelectorAll('[role="menuitem"]')];
      assert.deepEqual(items.map((item) => item.textContent), ['Comment on line', 'Copy line text', 'Copy file path and line']);
      await act(async () => items[0].click());
      const textarea = document.querySelector('[aria-label="Review comment"]');
      assert.ok(textarea);
      await act(async () => Simulate.change(textarea, { target: { value: 'My draft' } }));
      assert.equal(textarea.value, 'My draft');
      await act(async () => document.querySelector('[aria-label="Comment on example.ts line 2"]').click());
      assert.equal(document.querySelector('[aria-label="Review comment"]')?.value, 'My draft');
      assert.match(document.body.textContent, /Comment on example.ts:1/);
    } finally { globalThis.fetch = previousFetch; }
  });
});

test('tooltip placement stays within the window and flips above near the bottom', () => {
  assert.deepEqual(tooltipPosition({ left: 10, right: 30, top: 20, bottom: 40 }, { width: 100, height: 30 }, { width: 300, height: 200 }), { left: 8, top: 48, side: 'below' });
  assert.deepEqual(tooltipPosition({ left: 280, right: 300, top: 175, bottom: 195 }, { width: 100, height: 30 }, { width: 300, height: 200 }), { left: 192, top: 137, side: 'above' });
});

test('opening a modal hides a tooltip belonging to the obscured workspace', async () => {
  await withDom(async (root, window) => {
    const render = (open) => React.createElement(React.Fragment, null,
      React.createElement('button', { id: 'background', title: 'Background hint' }, 'Background'),
      open && React.createElement('div', { role: 'dialog', 'aria-modal': 'true' }, React.createElement('input', { id: 'dialog-input' })),
      React.createElement(TooltipLayer));
    await act(async () => root.render(render(false)));
    const trigger = document.getElementById('background');
    await act(async () => { trigger.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true })); await sleep(390); });
    assert.equal(document.querySelector('[role="tooltip"]')?.textContent, 'Background hint');
    await act(async () => { root.render(render(true)); });
    await act(async () => { document.getElementById('dialog-input').focus(); });
    assert.equal(document.querySelector('[role="tooltip"]'), null);
    assert.equal(trigger.getAttribute('title'), 'Background hint');
  });
});

test('a title changed immediately before dismissal is not overwritten', async () => {
  await withDom(async (root, window) => {
    await act(async () => root.render(React.createElement(React.Fragment, null, React.createElement('button', { id: 'changing', title: 'Before' }, 'Action'), React.createElement(TooltipLayer))));
    const target = document.getElementById('changing');
    await act(async () => { target.dispatchEvent(new window.MouseEvent('pointerover', { bubbles: true })); await sleep(390); });
    await act(async () => { target.setAttribute('title', 'After'); target.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true })); });
    assert.equal(target.getAttribute('title'), 'After');
    assert.equal(document.querySelector('[role="tooltip"]'), null);
  });
});

test('repository tab actions are available with a keyboard and keep the active path', async () => {
  await withDom(async (root, window) => {
    let copied = '', shown = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { copied = text; } } });
    await act(async () => root.render(React.createElement(RepoTabBar, {
      tabs: [{ name: 'project', path: '/repos/project', branch: 'feature', isClean: false }], activePath: '/repos/project',
      onSelectTab: () => {}, onCloseTab: () => {}, onNewTab: () => {}, onShowChanges: (path) => { shown = path; },
    })));
    const tab = document.querySelector('[aria-label="project, branch feature, uncommitted changes"]');
    assert.ok(tab);
    await act(async () => { tab.focus(); tab.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })); });
    let buttons = [...document.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(buttons.map((button) => button.textContent), ['Show working tree', 'Copy branch name', 'Copy Full Path']);
    assert.equal(document.activeElement, buttons[0]);
    await act(async () => buttons[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    assert.equal(document.activeElement, buttons[1]);
    await act(async () => buttons[1].click());
    assert.equal(copied, 'feature');
    await act(async () => tab.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, button: 2 })));
    buttons = [...document.querySelectorAll('[role="menuitem"]')];
    await act(async () => buttons[0].click());
    assert.equal(shown, '/repos/project');
  });
});

test('pull request context actions expose review, browser, and copy without running them on open', async () => {
  await withDom(async (root, window) => {
    let copied = '', opened = 0;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { copied = text; } } });
    const noop = () => {};
    const pr = { number: 42, title: 'Improve logging', headRefName: 'feature/logging', baseRefName: 'main', state: 'OPEN', isDraft: false, url: 'https://github.com/example/project/pull/42', author: { login: 'example' } };
    await act(async () => root.render(React.createElement(Sidebar, {
      branches: [], remotes: [], tags: [], stashes: [], pullRequests: [pr], currentBranch: 'main', selectedBranch: null,
      onSelectBranch: noop, onCheckoutBranch: noop, onDeleteBranch: noop, onPopStash: noop, onDropStash: noop,
      onDeleteTag: noop, onCreateBranch: noop, onCreateTag: noop, onViewPr: () => { opened++; }, onOpenPrInBrowser: () => { opened++; },
    })));
    const row = document.querySelector('[aria-label="Pull request 42: Improve logging"]');
    assert.ok(row);
    await act(async () => row.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, button: 2 })));
    const buttons = [...document.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(buttons.map((button) => button.textContent), ['Open review', 'Open in browser', 'Copy pull request link', 'Copy source branch']);
    assert.equal(opened, 0);
    await act(async () => buttons[2].click());
    assert.equal(copied, pr.url);
    assert.equal(opened, 0);
  });
});

test('working tree menus distinguish bulk and file actions', async () => {
  await withDom(async (root, window) => {
    let stageAll = 0, stageFile = '', discarded = 0;
    const noop = () => {};
    await act(async () => root.render(React.createElement(StagingPanel, {
      statuses: [{ path: 'src/example.ts', status: 'modified', staged: false }], selected: null,
      onSelectFile: noop, onStageFile: (path) => { stageFile = path; }, onUnstageFile: noop,
      onStageAll: () => { stageAll++; }, onUnstageAll: noop, onDiscardFile: noop, onDiscardAll: () => { discarded++; }, onStash: noop,
    })));
    const header = document.querySelector('[aria-label="Unstaged changes"]');
    await act(async () => header.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, button: 2 })));
    let items = [...document.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(items.map((item) => item.textContent), ['Stage all files', 'Stash changes…', 'Discard all changes…']);
    assert.equal(discarded, 0);
    await act(async () => items[0].click());
    assert.equal(stageAll, 1);
    const file = document.querySelector('[aria-label="src/example.ts, modified, unstaged"]');
    await act(async () => { file.focus(); file.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true })); });
    items = [...document.querySelectorAll('[role="menuitem"]')];
    const stage = items.find((item) => item.textContent.includes('Stage file'));
    assert.ok(stage);
    await act(async () => stage.click());
    assert.equal(stageFile, 'src/example.ts');
    assert.equal(discarded, 0);
  });
});
