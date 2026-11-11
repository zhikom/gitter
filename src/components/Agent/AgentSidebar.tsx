import React, { useState, useRef, useEffect } from 'react';
import { AIMessage, RepositoryState } from '../../types/git';
import { AgentReviewState } from '../../types/agentReview';
import { api } from '../../api/client';
import {
  Sparkles,
  Send,
  X,
  Terminal,
  Bot,
  User,
  ChevronRight,
  HelpCircle,
  Trash2,
  GitBranch,
  Inbox,
} from 'lucide-react';

import { toast } from '../../utils/toast';

interface AgentSidebarProps {
  repoState: RepositoryState | null;
  repoPath?: string;
  promptSeed?: string;
  onPromptSeedConsumed?: () => void;
  review?: AgentReviewState | null;
  onOpenReview?: (agentId: string) => void;
  onClose: () => void;
  onRunGitCommand: (cmd: string) => Promise<string | void>;
}

const welcomeMessage = (): AIMessage => ({
  id: 'welcome',
  sender: 'assistant',
  text: `Hello! I am your Git AI Agent. I can help explain changes, craft commits, resolve conflicts, and guide you through complex Git workflows safely.`,
  timestamp: Date.now(),
});

export const AgentSidebar: React.FC<AgentSidebarProps> = ({
  repoState,
  repoPath,
  promptSeed,
  onPromptSeedConsumed,
  review,
  onOpenReview,
  onClose,
  onRunGitCommand,
}) => {
  const storageKey = `gitter_agent_chat:${repoPath || 'default'}`;
  const [messages, setMessages] = useState<AIMessage[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as AIMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fall through to the welcome message.
    }
    return [welcomeMessage()];
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(true);
  const handledSeedRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reload the transcript when the repository changes.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as AIMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          setHydratedKey(storageKey);
          return;
        }
      }
    } catch {
      // Ignore malformed storage.
    }
    setMessages([welcomeMessage()]);
    setHydratedKey(storageKey);
  }, [storageKey]);

  // Persist the transcript per repository.
  useEffect(() => {
    if (hydratedKey !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      // Storage may be full; the chat still works for this session.
    }
  }, [messages, storageKey, hydratedKey]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const streamAssistantReply = async (text: string, suggestedCommand?: string) => {
    const id = String(Date.now() + 1);
    setStreamingId(id);
    setMessages((prev) => [
      ...prev,
      { id, sender: 'assistant', text: '', timestamp: Date.now() },
    ]);

    const chunks = text.match(/.{1,3}/gs) ?? [text];
    let acc = '';
    for (const chunk of chunks) {
      if (!mountedRef.current) return;
      acc += chunk;
      setMessages((prev) =>
        prev.map((message) => (message.id === id ? { ...message, text: acc } : message))
      );
      // Yield so the UI can paint between chunks.
      await new Promise((resolve) => setTimeout(resolve, 12));
    }

    setMessages((prev) =>
      prev.map((message) =>
        message.id === id
          ? { ...message, text, suggestedCommand, timestamp: Date.now() }
          : message
      )
    );
    setStreamingId(null);
  };

  const handleSend = async (textToSend?: string) => {
    const query = textToSend || input;
    if (!query.trim() || loading) return;

    const userMsg: AIMessage = {
      id: String(Date.now()),
      sender: 'user',
      text: query.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const repoContext = {
        branch: repoState?.currentBranch || 'main',
        status: `Staged: ${repoState?.stagedCount || 0}, Unstaged: ${repoState?.unstagedCount || 0}`,
        recentCommits: '',
      };

      const res = await api.chatWithAgent(query, repoContext);
      if (mountedRef.current) {
        await streamAssistantReply(res.reply, res.suggestedCommand);
      }
    } catch (e: any) {
      if (mountedRef.current) {
        setMessages((prev) => [
          ...prev,
          {
            id: String(Date.now() + 1),
            sender: 'assistant',
            text: `Error connecting to AI assistant: ${e.message}`,
            timestamp: Date.now(),
          },
        ]);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  // Seed the dock from review provenance ("Ask why").
  useEffect(() => {
    if (!promptSeed || !promptSeed.trim()) return;
    if (handledSeedRef.current === promptSeed) return;
    handledSeedRef.current = promptSeed;
    onPromptSeedConsumed?.();
    void handleSend(promptSeed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promptSeed]);

  const handleRunCommand = async (cmd: string) => {
    const confirmed = window.confirm(
      `Run this git command in the repository?\n\n${cmd}\n\nOnly git commands are allowed.`
    );
    if (!confirmed) return;
    try {
      const output = await onRunGitCommand(cmd);
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          sender: 'system',
          text: output ? `Executed: ${cmd}\n${output}` : `Executed: ${cmd}`,
          timestamp: Date.now(),
        },
      ]);
      toast.success('Command completed.');
    } catch (e: any) {
      toast.error(`Command failed: ${e.message}`);
    }
  };

  const clearChat = () => {
    setMessages([welcomeMessage()]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore storage errors.
    }
  };

  const promptSuggestions = [
    'Explain uncommitted changes',
    'Undo last commit safely',
    'Stash my current changes',
    'Create feature branch',
  ];

  const needsReview = review?.items.filter((item) => item.status === 'needs-review') ?? [];
  const firstNeedsReview = needsReview[0];

  return (
    <div className="w-[22rem] bg-[#131821] border-l border-white/[0.06] flex flex-col h-full select-none text-slate-300 shadow-2xl z-20">
      {/* Header */}
      <div className="h-12 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between px-3">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center text-white">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-bold text-xs text-slate-200">Gitter AI Agent</span>
            <span className="block text-[10px] text-teal-400">Context: {repoState?.currentBranch}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={clearChat}
            title="Clear this chat"
            aria-label="Clear chat"
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/[0.06] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close agent sidebar"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors focus-visible:ring-2 focus-visible:ring-teal-400/60 outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context chips */}
      <div className="px-3 py-2 border-b border-white/[0.06] flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.04] text-[9px] text-slate-400 ring-1 ring-inset ring-white/10">
          <GitBranch className="w-2.5 h-2.5 text-teal-400" />
          {repoState?.currentBranch || 'main'}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-[9px] text-emerald-300 ring-1 ring-inset ring-emerald-400/20">
          {repoState?.stagedCount || 0} staged
        </span>
        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-[9px] text-amber-300 ring-1 ring-inset ring-amber-400/20">
          {repoState?.unstagedCount || 0} unstaged
        </span>
        {firstNeedsReview && onOpenReview && (
          <button
            onClick={() => onOpenReview(firstNeedsReview.agentId)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/15 text-[9px] font-semibold text-amber-200 ring-1 ring-inset ring-amber-400/30 hover:bg-amber-400/25 transition-colors"
          >
            <Inbox className="w-2.5 h-2.5" />
            {needsReview.length} need review
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          const isSystem = m.sender === 'system';

          if (isSystem) {
            return (
              <div key={m.id} className="text-center">
                <span className="inline-block px-2.5 py-0.5 rounded bg-[#202735] text-[10px] font-mono text-emerald-400 border border-[#2a3447] whitespace-pre-wrap text-left">
                  {m.text}
                </span>
              </div>
            );
          }

          return (
            <div
              key={m.id}
              className={`flex items-start space-x-2 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  isUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
                }`}
              >
                {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
              </div>

              <div
                className={`max-w-[85%] rounded-lg p-2.5 text-xs select-text leading-relaxed ${
                  isUser
                    ? 'bg-blue-600 text-white'
                    : 'bg-white/[0.04] text-slate-200 ring-1 ring-inset ring-white/[0.06]'
                }`}
              >
                <p className="whitespace-pre-wrap">
                  {m.text}
                  {streamingId === m.id && (
                    <span className="inline-block w-1.5 h-3 bg-teal-400/70 ml-0.5 align-middle animate-pulse" />
                  )}
                </p>

                {/* Suggested Git Command Button */}
                {m.suggestedCommand && (
                  <div className="mt-2.5 pt-2 border-t border-[#2a3447]/60">
                    <div className="text-[10px] text-slate-400 mb-1 flex items-center space-x-1">
                      <Terminal className="w-3 h-3 text-teal-400" />
                      <span>Suggested Command:</span>
                    </div>
                    <div className="bg-[#14181f] p-1.5 rounded font-mono text-[11px] text-emerald-300 border border-[#2a3447] flex items-center justify-between">
                      <span className="truncate">{m.suggestedCommand}</span>
                      <button
                        onClick={() => handleRunCommand(m.suggestedCommand!)}
                        title="Review and run this command"
                        className="ml-2 px-2 py-0.5 rounded bg-teal-500 hover:bg-teal-400 text-white text-[10px] font-semibold flex-shrink-0 transition"
                      >
                        Run
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex items-center space-x-2 text-xs text-slate-500 italic">
            <Sparkles className="w-3.5 h-3.5 animate-spin text-teal-400" />
            <span>Agent is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompts */}
      <div className="px-3 py-2 border-t border-white/[0.06] flex flex-wrap gap-1.5">
        {promptSuggestions.map((p) => (
          <button
            key={p}
            onClick={() => handleSend(p)}
            className="px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[10px] text-slate-400 hover:text-teal-300 ring-1 ring-inset ring-white/10 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-3 bg-white/[0.02] border-t border-white/[0.06]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask agent about Git, undo, diffs..."
            className="flex-1 bg-black/30 rounded-lg px-3 py-2 text-xs text-slate-100 ring-1 ring-inset ring-white/10 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-400/60 transition-shadow"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            aria-label="Send"
            className="p-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-950 transition-colors disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
