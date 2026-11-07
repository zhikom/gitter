import React, { useState, useRef, useEffect } from 'react';
import { AIMessage, RepositoryState } from '../../types/git';
import { api } from '../../api/client';
import {
  Sparkles,
  Send,
  X,
  Terminal,
  Bot,
  User,
  Check,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';

interface AgentSidebarProps {
  repoState: RepositoryState | null;
  onClose: () => void;
  onRunGitCommand: (cmd: string) => Promise<void>;
}

export const AgentSidebar: React.FC<AgentSidebarProps> = ({
  repoState,
  onClose,
  onRunGitCommand,
}) => {
  const [messages, setMessages] = useState<AIMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Hello! I am your Git AI Agent. I can help explain changes, craft commits, resolve conflicts, and guide you through complex Git workflows safely.`,
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

      const botMsg: AIMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: res.reply,
        suggestedCommand: res.suggestedCommand,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, botMsg]);
    } catch (e: any) {
      const errorMsg: AIMessage = {
        id: String(Date.now() + 1),
        sender: 'assistant',
        text: `Error connecting to AI assistant: ${e.message}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleRunCommand = async (cmd: string) => {
    try {
      await onRunGitCommand(cmd);
      setMessages((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          sender: 'system',
          text: `Executed: ${cmd}`,
          timestamp: Date.now(),
        },
      ]);
    } catch (e: any) {
      alert(`Command failed: ${e.message}`);
    }
  };

  const promptSuggestions = [
    'Explain uncommitted changes',
    'Undo last commit safely',
    'Stash my current changes',
    'Create feature branch',
  ];

  return (
    <div className="w-88 bg-[#181d26] border-l border-[#2a3447] flex flex-col h-full select-none text-slate-300 shadow-2xl z-20">
      {/* Header */}
      <div className="h-12 bg-[#1b212c] border-b border-[#2a3447] flex items-center justify-between px-3">
        <div className="flex items-center space-x-2">
          <div className="w-6 h-6 rounded bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center text-white">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="font-bold text-xs text-slate-200">Gitter AI Agent</span>
            <span className="block text-[10px] text-teal-400">Context: {repoState?.currentBranch}</span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 hover:bg-[#283244] text-slate-400 hover:text-slate-200 rounded transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          const isSystem = m.sender === 'system';

          if (isSystem) {
            return (
              <div key={m.id} className="text-center">
                <span className="inline-block px-2.5 py-0.5 rounded bg-[#202735] text-[10px] font-mono text-emerald-400 border border-[#2a3447]">
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
                    : 'bg-[#202735] text-slate-200 border border-[#2a3447]'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.text}</p>

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
      <div className="px-3 py-1.5 bg-[#14181f] border-t border-[#222a3a] flex flex-wrap gap-1">
        {promptSuggestions.map((p) => (
          <button
            key={p}
            onClick={() => handleSend(p)}
            className="px-2 py-0.5 rounded-full bg-[#202735] hover:bg-[#2d384c] text-[10px] text-slate-400 hover:text-teal-300 border border-[#2a3447] transition"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-3 bg-[#1b212c] border-t border-[#2a3447]">
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
            className="flex-1 bg-[#14181f] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="p-1.5 rounded bg-teal-500 hover:bg-teal-400 text-white transition disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
