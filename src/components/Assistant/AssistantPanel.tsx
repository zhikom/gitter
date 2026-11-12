// The AI git assistant: a chat about the open repository. A reply can suggest a
// git command, which runs through the backend's git console after confirmation.
import React, { useEffect, useRef, useState } from 'react';
import { Bot, GitBranch, Inbox, Send, Sparkles, Terminal, Trash2, User, X } from 'lucide-react';
import type { RepositoryState } from '../../../shared/types/git';
import { api } from '../../api/client';
import { toast } from '../../utils/toast';
import { ask } from '../ui/ask';

interface Message {
  id: number;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  suggestedCommand?: string;
}

interface AssistantPanelProps {
  repo: string;
  repoState: RepositoryState | null;
  /** A question to send as soon as the panel opens, e.g. from "Ask why". */
  seed: string;
  onSeedConsumed: () => void;
  agentsWaiting: number;
  onOpenInbox: () => void;
  onClose: () => void;
  /** Runs a git command in the repository and resolves to its output. */
  onRunCommand: (command: string) => Promise<string>;
}

const WELCOME: Message = {
  id: 0,
  sender: 'assistant',
  text: 'Ask me about this repository: what changed, how to undo something, or which git command does what you need.',
};

const SUGGESTIONS = ['Explain my uncommitted changes', 'How do I undo my last commit?', 'What is on this branch that main lacks?'];

const storageKey = (repo: string) => `gitter_agent_chat:${repo}`;

function loadTranscript(repo: string): Message[] {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(repo)) ?? 'null');
    if (Array.isArray(stored) && stored.length > 0) return stored;
  } catch {
    // A damaged transcript starts over.
  }
  return [WELCOME];
}

/** Mount with `key={repo}`: each repository has its own transcript. */
export const AssistantPanel: React.FC<AssistantPanelProps> = ({ repo, repoState, seed, onSeedConsumed, agentsWaiting, onOpenInbox, onClose, onRunCommand }) => {
  const [messages, setMessages] = useState<Message[]>(() => loadTranscript(repo));
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(repo), JSON.stringify(messages.slice(-100)));
    } catch {
      // Storage full: the chat still works for this session.
    }
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [repo, messages]);

  const add = (message: Omit<Message, 'id'>) => setMessages((prev) => [...prev, { ...message, id: Date.now() + Math.random() }]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || thinking) return;
    add({ sender: 'user', text: question });
    setInput('');
    setThinking(true);
    try {
      const context = {
        branch: repoState?.currentBranch || 'HEAD',
        status: `${repoState?.stagedCount ?? 0} staged, ${repoState?.unstagedCount ?? 0} unstaged, ${repoState?.untrackedCount ?? 0} untracked files`,
      };
      const { reply, suggestedCommand } = await api.chat({ message: question, context });
      if (mounted.current) add({ sender: 'assistant', text: reply, suggestedCommand });
    } catch (e: any) {
      if (mounted.current) add({ sender: 'system', text: `The assistant is unavailable: ${e.message}` });
    } finally {
      if (mounted.current) setThinking(false);
    }
  };

  useEffect(() => {
    if (seed.trim()) {
      onSeedConsumed();
      void send(seed);
    }
    // Only a new seed triggers a send.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const run = async (command: string) => {
    if (!(await ask.confirm({ title: 'Run this command?', message: command, confirmLabel: 'Run' }))) return;
    try {
      const output = await onRunCommand(command);
      add({ sender: 'system', text: output.trim() ? `$ ${command}\n${output.trim()}` : `$ ${command}` });
    } catch (e: any) {
      toast.error(`${command} failed: ${e.message}`);
    }
  };

  const clear = () => {
    setMessages([WELCOME]);
  };

  return (
    <div className="w-[22rem] max-w-full h-full bg-[#131821] border-l border-white/[0.06] flex flex-col text-slate-300 shadow-2xl">
      <div className="h-12 flex-shrink-0 border-b border-white/[0.06] flex items-center justify-between px-3 select-none">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center text-white">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-xs text-slate-200">Git assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clear} title="Clear this conversation" className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06]">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} aria-label="Close the assistant" className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06]">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-white/[0.06] flex flex-wrap items-center gap-1.5 select-none">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] text-[9px] text-slate-400 ring-1 ring-inset ring-white/10">
          <GitBranch className="w-2.5 h-2.5 text-teal-400" />
          {repoState?.currentBranch || 'no branch'}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[9px] text-emerald-300 ring-1 ring-inset ring-emerald-400/20">{repoState?.stagedCount ?? 0} staged</span>
        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[9px] text-amber-300 ring-1 ring-inset ring-amber-400/20">{repoState?.unstagedCount ?? 0} unstaged</span>
        {agentsWaiting > 0 && (
          <button onClick={onOpenInbox} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/15 text-[9px] font-semibold text-amber-200 ring-1 ring-inset ring-amber-400/30 hover:bg-amber-400/25">
            <Inbox className="w-2.5 h-2.5" />
            {agentsWaiting} agent{agentsWaiting === 1 ? '' : 's'} to review
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3" aria-live="polite">
        {messages.map((m) =>
          m.sender === 'system' ? (
            <pre key={m.id} className="px-2.5 py-1.5 rounded bg-[#202735] text-[10px] font-mono text-emerald-300 border border-[#2a3447] whitespace-pre-wrap select-text">
              {m.text}
            </pre>
          ) : (
            <div key={m.id} className={`flex items-start gap-2 ${m.sender === 'user' ? 'flex-row-reverse' : ''}`}>
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  m.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
                }`}
              >
                {m.sender === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>
              <div
                className={`max-w-[85%] rounded-lg p-2.5 text-xs leading-relaxed select-text ${
                  m.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-white/[0.04] text-slate-200 ring-1 ring-inset ring-white/[0.06]'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
                {m.suggestedCommand && (
                  <div className="mt-2.5 pt-2 border-t border-[#2a3447]/60">
                    <div className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                      <Terminal className="w-3 h-3 text-teal-400" />
                      Suggested command
                    </div>
                    <div className="bg-[#14181f] p-1.5 rounded font-mono text-[11px] text-emerald-300 border border-[#2a3447] flex items-center justify-between gap-2">
                      <span className="truncate" title={m.suggestedCommand}>
                        {m.suggestedCommand}
                      </span>
                      <button onClick={() => run(m.suggestedCommand!)} className="px-2 py-0.5 rounded bg-teal-500 hover:bg-teal-400 text-white text-[10px] font-semibold flex-shrink-0">
                        Run
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        )}
        {thinking && (
          <div className="flex items-center gap-2 text-xs text-slate-500 italic">
            <Sparkles className="w-3.5 h-3.5 animate-spin text-teal-400" />
            Thinking…
          </div>
        )}
        <div ref={end} />
      </div>

      {messages.length <= 1 && (
        <div className="px-3 py-2 border-t border-white/[0.06] flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => send(s)} className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-slate-400 hover:text-teal-300 ring-1 ring-inset ring-white/10">
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="p-3 border-t border-white/[0.06] flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about git or this repository…"
          aria-label="Message"
          className="flex-1 bg-black/30 rounded-lg px-3 py-2 text-xs text-slate-100 ring-1 ring-inset ring-white/10 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400/60"
        />
        <button type="submit" disabled={!input.trim() || thinking} aria-label="Send" className="p-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 disabled:opacity-40">
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
