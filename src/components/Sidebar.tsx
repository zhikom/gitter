import React, { useState } from 'react';
import {
  GitBranch,
  Globe,
  Tag as TagIcon,
  Archive,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  RotateCcw,
  GitMerge,
  ExternalLink,
} from 'lucide-react';
import { Branch, Remote, Stash, Tag } from '../types/git';

interface SidebarProps {
  branches: Branch[];
  remotes: Remote[];
  tags: Tag[];
  stashes: Stash[];
  currentBranch: string;
  onCheckoutBranch: (name: string) => void;
  onDeleteBranch: (name: string) => void;
  onPopStash: (index: number) => void;
  onDropStash: (index: number) => void;
  onDeleteTag: (name: string) => void;
  onCreateBranch: () => void;
  onCreateTag: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  branches,
  remotes,
  tags,
  stashes,
  currentBranch,
  onCheckoutBranch,
  onDeleteBranch,
  onPopStash,
  onDropStash,
  onDeleteTag,
  onCreateBranch,
  onCreateTag,
}) => {
  const [expandLocal, setExpandLocal] = useState(true);
  const [expandRemote, setExpandRemote] = useState(true);
  const [expandTags, setExpandTags] = useState(false);
  const [expandStashes, setExpandStashes] = useState(false);
  const [expandRemotes, setExpandRemotes] = useState(false);

  const localBranches = branches.filter(b => !b.isRemote);
  const remoteBranches = branches.filter(b => b.isRemote);

  return (
    <aside className="w-64 bg-[#181d26] border-r border-[#2a3447] flex flex-col h-full text-slate-300 select-none overflow-y-auto">
      {/* LOCAL BRANCHES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandLocal(!expandLocal)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandLocal ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <GitBranch className="w-3.5 h-3.5 text-teal-400" />
            <span>Local Branches</span>
            <span className="text-[10px] text-slate-500 font-normal">({localBranches.length})</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateBranch();
            }}
            title="Create New Branch"
            className="p-0.5 hover:text-teal-300 text-slate-400 rounded"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {expandLocal && (
          <div className="pb-1">
            {localBranches.map((branch) => {
              const isCurrent = branch.name === currentBranch;
              return (
                <div
                  key={branch.name}
                  onClick={() => onCheckoutBranch(branch.name)}
                  className={`group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer transition ${
                    isCurrent
                      ? 'bg-teal-500/15 text-teal-300 font-semibold border-l-2 border-teal-400'
                      : 'hover:bg-[#202735] text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2 truncate">
                    {isCurrent ? (
                      <Check className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-teal-400" />
                      </div>
                    )}
                    <span className="truncate">{branch.name}</span>
                  </div>

                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition">
                    {(branch.ahead > 0 || branch.behind > 0) && (
                      <span className="text-[10px] text-slate-400 px-1 rounded bg-[#202735]">
                        {branch.ahead > 0 && `↑${branch.ahead}`} {branch.behind > 0 && `↓${branch.behind}`}
                      </span>
                    )}
                    {!isCurrent && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete branch '${branch.name}'?`)) {
                            onDeleteBranch(branch.name);
                          }
                        }}
                        title="Delete branch"
                        className="p-1 hover:text-red-400 text-slate-500 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* REMOTE BRANCHES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandRemote(!expandRemote)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandRemote ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>Remote Branches</span>
            <span className="text-[10px] text-slate-500 font-normal">({remoteBranches.length})</span>
          </div>
        </div>

        {expandRemote && (
          <div className="pb-1">
            {remoteBranches.map((branch) => (
              <div
                key={branch.name}
                onClick={() => onCheckoutBranch(branch.name)}
                className="group flex items-center justify-between px-3 py-1.5 text-xs cursor-pointer hover:bg-[#202735] text-slate-400 hover:text-slate-200 transition"
              >
                <div className="flex items-center space-x-2 truncate">
                  <div className="w-3.5 h-3.5 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60" />
                  </div>
                  <span className="truncate">{branch.name}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* TAGS */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandTags(!expandTags)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandTags ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <TagIcon className="w-3.5 h-3.5 text-yellow-400" />
            <span>Tags</span>
            <span className="text-[10px] text-slate-500 font-normal">({tags.length})</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCreateTag();
            }}
            title="Create Tag"
            className="p-0.5 hover:text-yellow-300 text-slate-400 rounded"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {expandTags && (
          <div className="pb-1">
            {tags.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No tags</div>
            ) : (
              tags.map((tag) => (
                <div
                  key={tag.name}
                  className="group flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[#202735] text-slate-300"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <TagIcon className="w-3 h-3 text-yellow-400/70" />
                    <span className="font-mono truncate">{tag.name}</span>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Delete tag '${tag.name}'?`)) {
                        onDeleteTag(tag.name);
                      }
                    }}
                    title="Delete Tag"
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-slate-500 rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* STASHES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandStashes(!expandStashes)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandStashes ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span>Stashes</span>
            <span className="text-[10px] text-slate-500 font-normal">({stashes.length})</span>
          </div>
        </div>

        {expandStashes && (
          <div className="pb-1">
            {stashes.length === 0 ? (
              <div className="px-5 py-1 text-xs text-slate-600 italic">No stashes</div>
            ) : (
              stashes.map((stash) => (
                <div
                  key={stash.name}
                  className="group flex items-center justify-between px-3 py-1.5 text-xs hover:bg-[#202735] text-slate-300"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <Archive className="w-3 h-3 text-amber-400/70 flex-shrink-0" />
                    <span className="truncate text-slate-300">{stash.message || stash.name}</span>
                  </div>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => onPopStash(stash.index)}
                      title="Pop stash"
                      className="p-1 hover:text-emerald-400 text-slate-500 rounded"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onDropStash(stash.index)}
                      title="Drop stash"
                      className="p-1 hover:text-red-400 text-slate-500 rounded"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* REMOTES */}
      <div className="border-b border-[#222a3a]">
        <div
          onClick={() => setExpandRemotes(!expandRemotes)}
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-[#202735] text-xs font-bold text-slate-400 uppercase tracking-wider"
        >
          <div className="flex items-center space-x-1.5">
            {expandRemotes ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>Remotes</span>
            <span className="text-[10px] text-slate-500 font-normal">({remotes.length})</span>
          </div>
        </div>

        {expandRemotes && (
          <div className="pb-1">
            {remotes.map((remote) => (
              <div
                key={remote.name}
                className="px-4 py-1 text-xs text-slate-400 flex flex-col"
              >
                <div className="font-semibold text-slate-300 flex items-center space-x-1">
                  <span>{remote.name}</span>
                </div>
                <span className="text-[10px] text-slate-500 truncate" title={remote.fetchUrl}>
                  {remote.fetchUrl}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};
