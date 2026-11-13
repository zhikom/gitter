// The top bar. Every button runs a Command from App's command list, so its
// tooltip shows the same shortcut the keyboard and the palette use.
import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronDown, DownloadCloud, FolderOpen, GitBranch, Inbox, Layers, MoreHorizontal, Search } from 'lucide-react';
import type { RepositoryState } from '../../shared/types/git';
import type { UpdateInfo } from '../../shared/types/update';
import { type Command, shortcutLabel } from '../commands';
import { AttentionBell } from './Agent/AttentionBell';
import type { AttentionItem } from './Agent/agentUi';

interface HeaderToolbarProps {
  commands: Command[];
  repoState: RepositoryState | null;
  busy: boolean;
  /** Which panels are open, for the toggle buttons' pressed state. */
  open: { sidebar: boolean; staging: boolean; assistant: boolean };
  agents: { count: number; waiting: number; collisions: number };
  attention: AttentionItem[];
  acknowledged: ReadonlySet<string>;
  onAcknowledge: (id: string) => void;
  onAcknowledgeAll: () => void;
  onSelectAttention: (item: AttentionItem) => void;
  update: UpdateInfo | null;
}

const base = 'flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition disabled:opacity-40 disabled:pointer-events-none';
const plain = `${base} bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-slate-200`;
const icon = 'p-1.5 rounded transition text-slate-400 hover:text-slate-100 hover:bg-[#202735] disabled:opacity-40';

const tooltip = (c: Command) => (c.shortcut ? `${c.title} (${shortcutLabel(c.shortcut)})` : c.title);

/** A small dropdown that closes on outside click and Escape. */
const Menu: React.FC<{ button: (toggle: () => void, open: boolean) => React.ReactNode; children: React.ReactNode; align?: 'left' | 'right' }> = ({ button, children, align = 'left' }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      {button(() => setOpen(!open), open)}
      {open && (
        <div role="menu" onClick={() => setOpen(false)} className={`absolute top-full mt-1 ${align === 'right' ? 'right-0' : 'left-0'} min-w-[13rem] bg-[#1b212c] border border-[#2a3447] rounded-lg shadow-2xl py-1 z-50 text-xs`}>
          {children}
        </div>
      )}
    </div>
  );
};

const MenuItem: React.FC<{ command: Command | undefined }> = ({ command }) => {
  if (!command) return null;
  const Icon = command.icon;
  return (
    <button
      role="menuitem"
      onClick={command.run}
      disabled={command.enabled === false}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-slate-200 hover:bg-[#262f3f] disabled:opacity-40"
    >
      {Icon && <Icon className="w-3.5 h-3.5 text-slate-400" />}
      <span className="flex-1">{command.title}</span>
      {command.shortcut && <span className="text-[10px] text-slate-500 font-mono">{shortcutLabel(command.shortcut)}</span>}
    </button>
  );
};

export const HeaderToolbar: React.FC<HeaderToolbarProps> = ({ commands, repoState, busy, open, agents, attention, acknowledged, onAcknowledge, onAcknowledgeAll, onSelectAttention, update }) => {
  const byId = new Map(commands.map((c) => [c.id, c]));
  const cmd = (id: string) => byId.get(id);

  // Plain functions, not components: a component declared here would remount on
  // every App render, closing an open dropdown and dropping keyboard focus.

  /** A command as a toolbar button; `label` shows next to the icon on wide windows. */
  const action = ({ id, label, className = plain, pressed }: { id: string; label?: string; className?: string; pressed?: boolean }) => {
    const c = cmd(id);
    if (!c) return null;
    const Icon = c.icon;
    return (
      <button onClick={c.run} disabled={c.enabled === false || (busy && c.category === 'Repository')} title={tooltip(c)} aria-label={c.title} aria-pressed={pressed} className={className}>
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label && <span className="hidden lg:inline">{label}</span>}
      </button>
    );
  };

  const splitAction = ({ main, label, more }: { main: string; label: string; more: string[] }) => (
    <Menu
      button={(toggle) => (
        <div className="inline-flex">
          {action({ id: main, label, className: `${plain} rounded-r-none` })}
          <button onClick={toggle} aria-label={`More ${label.toLowerCase()} options`} className="px-1.5 bg-[#202735] hover:bg-[#2d384c] border-y border-r border-[#2a3447] rounded-r text-slate-400">
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      )}
    >
      {more.map((id) => (
        <MenuItem key={id} command={cmd(id)} />
      ))}
    </Menu>
  );

  const toggleClass = (on: boolean) => `${icon} ${on ? 'text-teal-300 bg-[#202735]' : ''}`;

  return (
    <header className="h-12 flex-shrink-0 bg-[#1b212c] border-b border-[#2a3447] flex items-center justify-between gap-2 px-3 select-none z-30">
      <div className="flex items-center gap-2 min-w-0">
        {action({ id: 'toggle-sidebar', className: toggleClass(open.sidebar), pressed: open.sidebar })}
        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 flex items-center justify-center flex-shrink-0" aria-hidden>
          <Layers className="w-4 h-4 text-white" />
        </div>
        <button onClick={cmd('repositories')?.run} title={repoState?.path ?? 'Open a repository'} className={`${plain} max-w-[200px]`}>
          <FolderOpen className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
          <span className="truncate">{repoState?.name ?? (busy ? 'Loading…' : 'Open a repository')}</span>
        </button>
        {repoState && (
          <span className="flex items-center gap-1 px-2 py-1 rounded bg-[#14181f] border border-[#2a3447] text-xs font-mono text-teal-300 min-w-0">
            <GitBranch className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate max-w-[160px]">{repoState.currentBranch}</span>
            {repoState.isRebasing && <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 rounded">REBASING</span>}
            {repoState.isMerging && <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1 rounded">MERGING</span>}
          </span>
        )}
      </div>

      {repoState && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {splitAction({ main: 'pull', label: 'Pull', more: ['pull', 'pull-rebase', 'fetch'] })}
          {splitAction({ main: 'push', label: 'Push', more: ['push', 'push-force'] })}
          {action({ id: 'new-branch', label: 'Branch' })}
          {action({ id: 'stash', label: 'Stash' })}
          {action({ id: 'pop-stash', label: 'Pop' })}
          {action({ id: 'undo', label: 'Undo' })}
          <Menu
            align="right"
            button={(toggle) => (
              <button onClick={toggle} title="More" aria-label="More actions" className={plain}>
                <MoreHorizontal className="w-4 h-4" />
              </button>
            )}
          >
            {['fetch', 'reflog', 'worktrees', 'gitflow', 'pull-request', 'lanes'].map((id) => (
              <MenuItem key={id} command={cmd(id)} />
            ))}
            <div className="border-t border-[#2a3447] my-1" />
            {['reveal', 'open-in'].map((id) => (
              <MenuItem key={id} command={cmd(id)} />
            ))}
          </Menu>
        </div>
      )}

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {repoState && (
          <>
            <button
              onClick={cmd('review-inbox')?.run}
              title={cmd('review-inbox') && tooltip(cmd('review-inbox')!)}
              className={`${base} ${agents.waiting ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40 hover:bg-amber-500/25' : 'bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-slate-300'}`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Review</span>
              {agents.waiting > 0 && <span className="min-w-[15px] h-[15px] px-1 rounded-full bg-amber-400 text-slate-950 text-[9px] font-bold flex items-center justify-center">{agents.waiting}</span>}
            </button>
            <AttentionBell attention={attention} acknowledged={acknowledged} onAcknowledge={onAcknowledge} onAcknowledgeAll={onAcknowledgeAll} onSelect={onSelectAttention} />
            {agents.collisions > 0 ? (
              <button onClick={cmd('fleet')?.run} title="Agents are changing the same files" className={`${base} rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40`}>
                <AlertTriangle className="w-3.5 h-3.5" />
                {agents.collisions}
              </button>
            ) : (
              action({ id: 'fleet', label: agents.count ? `${agents.count} agent${agents.count === 1 ? '' : 's'}` : 'Agents' })
            )}
          </>
        )}
        {action({
          id: 'toggle-assistant',
          label: 'Assistant',
          className: `${base} rounded-full ${open.assistant ? 'bg-teal-600 text-white' : 'bg-[#202735] border border-teal-500/30 text-teal-300 hover:bg-[#2d384c]'}`,
          pressed: open.assistant,
        })}
        {repoState && action({ id: 'open-in', className: icon })}
        <button onClick={cmd('palette')?.run} title={cmd('palette') && tooltip(cmd('palette')!)} aria-label="Command palette" className={plain}>
          <Search className="w-3.5 h-3.5 text-teal-400" />
        </button>
        {repoState && action({ id: 'toggle-staging', className: toggleClass(open.staging), pressed: open.staging })}
        {repoState && action({ id: 'refresh', className: `${icon} ${busy ? 'animate-spin' : ''}` })}
        {update?.hasUpdate && (
          <button onClick={cmd('check-updates')?.run} title={`Gitter ${update.version} is available`} className={`${base} rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/40`}>
            <DownloadCloud className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{update.version}</span>
          </button>
        )}
        {action({ id: 'settings', className: icon })}
      </div>
    </header>
  );
};
