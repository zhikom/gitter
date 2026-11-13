// Type to run any command, check out a branch or tag, open a commit, or review an agent.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, GitBranch, GitCommit, Search, Tag as TagIcon, Terminal } from 'lucide-react';
import type { AgentReviewItem } from '../../../shared/types/agentReview';
import type { Branch, Commit, Tag } from '../../../shared/types/git';
import { type Command, shortcutLabel } from '../../commands';
import { useEscape } from '../ui/useEscape';

interface CommandPaletteProps {
  commands: Command[];
  branches: Branch[];
  tags: Tag[];
  commits: Commit[];
  agents: AgentReviewItem[];
  onClose: () => void;
  onCheckout: (target: string) => void;
  onOpenCommit: (commit: Commit) => void;
  onOpenAgent: (agentId: string) => void;
}

interface Item {
  id: string;
  group: string;
  title: string;
  detail?: string;
  icon: React.ReactNode;
  shortcut?: string;
  run: () => void;
}

const MAX_RESULTS = 60;

export const CommandPalette: React.FC<CommandPaletteProps> = ({ commands, branches, tags, commits, agents, onClose, onCheckout, onOpenCommit, onOpenAgent }) => {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [checkoutMode, setCheckoutMode] = useState(false);
  const back = () => { setCheckoutMode(false); setQuery(''); setIndex(0); };
  useEscape(checkoutMode ? back : onClose);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, [checkoutMode]);

  const items = useMemo<Item[]>(
    () => [
      ...commands
        .filter((c) => c.enabled !== false)
        .map((c) => ({ id: `cmd:${c.id}`, group: c.category, title: c.title, icon: c.icon ? <c.icon className="w-4 h-4" /> : <Terminal className="w-4 h-4" />, shortcut: c.shortcut, run: c.run })),
      ...agents.map((a) => ({
        id: `agent:${a.agentId}`,
        group: 'Agents',
        title: `Review ${a.agentName}`,
        detail: `${a.status.replace('-', ' ')} · ${a.branchName}`,
        icon: <Bot className="w-4 h-4" />,
        run: () => onOpenAgent(a.agentId),
      })),
      ...((branches.length || tags.length) ? [{ id: 'choose-checkout', group: 'Branches', title: 'Check out branch or tag…', icon: <GitBranch className="w-4 h-4" />, run: () => { setCheckoutMode(true); setQuery(''); setIndex(0); } }] : []),
      ...commits.map((c) => ({
        id: `commit:${c.hash}`,
        group: 'Commits',
        title: c.summary,
        detail: `${c.shortHash} · ${c.author.name}`,
        icon: <GitCommit className="w-4 h-4" />,
        run: () => onOpenCommit(c),
      })),
    ],
    [commands, agents, branches, tags, commits, onOpenCommit, onOpenAgent]
  );
  const checkoutItems = useMemo<Item[]>(() => [
      ...branches
        .filter((b) => !b.current)
        .map((b) => ({
          id: `branch:${b.name}`,
          group: 'Check out',
          title: b.name,
          detail: b.isRemote ? 'remote branch' : b.ahead || b.behind ? `${b.ahead} ahead, ${b.behind} behind` : 'branch',
          icon: <GitBranch className="w-4 h-4" />,
          run: () => onCheckout(b.name),
        })),
      ...tags.map((t) => ({ id: `tag:${t.name}`, group: 'Check out', title: t.name, detail: 'tag', icon: <TagIcon className="w-4 h-4" />, run: () => onCheckout(t.name) })),
    ], [branches, tags, onCheckout]
  );

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const source = checkoutMode ? checkoutItems : items;
    const hits = words.length ? source.filter((item) => words.every((w) => `${item.group} ${item.title} ${item.detail ?? ''} ${item.id}`.toLowerCase().includes(w))) : source.filter((i) => !i.id.startsWith('commit:'));
    return hits.slice(0, MAX_RESULTS);
  }, [items, checkoutItems, checkoutMode, query]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    (list.current?.children[index] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const run = (item: Item | undefined) => {
    if (!item) return;
    if (item.id !== 'choose-checkout') onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setIndex((i) => (i + 1) % Math.max(shown.length, 1));
    else if (e.key === 'ArrowUp') setIndex((i) => (i - 1 + shown.length) % Math.max(shown.length, 1));
    else if (e.key === 'Enter') run(shown[index]);
    else if (e.key === 'Backspace' && checkoutMode && !query) back();
    else return;
    e.preventDefault();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/60 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-2xl max-h-[560px] flex flex-col bg-[#1b212c] border border-[#2a3447] rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 p-3 border-b border-[#2a3447] bg-[#151a23]">
          {checkoutMode ? <button type="button" aria-label="Back to commands" onClick={back}><ArrowLeft className="w-5 h-5 text-teal-400" /></button> : <Search className="w-5 h-5 text-teal-400 flex-shrink-0" />}
          <input
            ref={input}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={checkoutMode ? 'Choose a branch or tag to check out…' : 'Run a command or find a commit…'}
            aria-label="Search commands"
            aria-controls="palette-results"
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
        </div>
        <div id="palette-results" ref={list} role="listbox" className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {shown.length === 0 && <div className="p-8 text-center text-slate-500 text-xs">Nothing matches.</div>}
          {shown.map((item, i) => (
            <div
              key={item.id}
              role="option"
              aria-selected={i === index}
              onClick={() => run(item)}
              onMouseMove={() => setIndex(i)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${i === index ? 'bg-teal-500/15 text-white ring-1 ring-inset ring-teal-500/40' : 'text-slate-300'}`}
            >
              <span className={i === index ? 'text-teal-300' : 'text-slate-500'}>{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold truncate">{item.title}</span>
                {item.detail && <span className="block text-[10px] text-slate-500 truncate">{item.detail}</span>}
              </span>
              {item.shortcut && <kbd className="text-[10px] text-slate-400 font-mono px-1.5 py-0.5 rounded bg-[#202735] border border-[#2a3447]">{shortcutLabel(item.shortcut)}</kbd>}
              <span className="text-[9px] uppercase font-bold text-slate-500 w-20 text-right">{item.group}</span>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-[#2a3447] bg-[#151a23] text-[11px] text-slate-500">↑ ↓ to move · Enter to run · Esc to {checkoutMode ? 'go back' : 'close'}</div>
      </div>
    </div>
  );
};
