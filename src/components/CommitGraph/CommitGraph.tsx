import React, { useState, useMemo } from 'react';
import { Commit, GraphNode } from '../../types/git';
import { layoutCommitGraph, getLaneColor } from '../../utils/graphLayout';
import {
  GitCommit,
  GitBranch,
  Tag as TagIcon,
  Search,
  Copy,
  RotateCcw,
  GitPullRequest,
  Check,
  ChevronRight,
  Flame,
  GitMerge,
  ExternalLink,
  FileCode,
} from 'lucide-react';

interface CommitGraphProps {
  commits: Commit[];
  hasWip: boolean;
  selectedHash: string | null;
  onSelectCommit: (commit: Commit) => void;
  onCheckout: (hash: string) => void;
  onCreateBranchAt: (hash: string) => void;
  onCreateTagAt: (hash: string) => void;
  onRevertCommit: (hash: string) => void;
  onResetCommit: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void;
  onCherryPick: (hash: string) => void;
  onInteractiveRebase?: (baseHash: string) => void;
  onOpenInVsCode?: (hash: string) => void;
  onCreatePatch?: (hash: string) => void;
}

const ROW_HEIGHT = 32;
const LANE_WIDTH = 18;
const GRAPH_PADDING_X = 14;

export const CommitGraph: React.FC<CommitGraphProps> = ({
  commits,
  hasWip,
  selectedHash,
  onSelectCommit,
  onCheckout,
  onCreateBranchAt,
  onCreateTagAt,
  onRevertCommit,
  onResetCommit,
  onCherryPick,
  onInteractiveRebase,
  onOpenInVsCode,
  onCreatePatch,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    commit: Commit;
  } | null>(null);

  // Compute graph nodes with topological lane assignment
  const graphNodes = useMemo(() => {
    return layoutCommitGraph(commits, hasWip);
  }, [commits, hasWip]);

  // Filter commits based on search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return graphNodes;
    const q = searchQuery.toLowerCase();
    return graphNodes.filter((node) => {
      const c = node.commit;
      return (
        c.summary.toLowerCase().includes(q) ||
        c.shortHash.toLowerCase().includes(q) ||
        c.author.name.toLowerCase().includes(q) ||
        c.refs.some((r) => r.toLowerCase().includes(q))
      );
    });
  }, [graphNodes, searchQuery]);

  // Max lanes for graph SVG width calculation
  const maxLanes = useMemo(() => {
    let max = 1;
    for (const node of graphNodes) {
      if (node.lane >= max) max = node.lane + 1;
      for (const p of node.passingLanes) {
        if (p >= max) max = p + 1;
      }
    }
    return Math.max(max, 3);
  }, [graphNodes]);

  const graphWidth = GRAPH_PADDING_X * 2 + maxLanes * LANE_WIDTH;

  const handleContextMenu = (e: React.MouseEvent, commit: Commit) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      commit,
    });
  };

  const copySha = (hash: string) => {
    navigator.clipboard.writeText(hash);
  };

  return (
    <div
      className="flex-1 flex flex-col h-full bg-[#14181f] overflow-hidden select-none"
      onClick={() => setContextMenu(null)}
    >
      {/* Search & Filter Header */}
      <div className="h-10 bg-[#181d26] border-b border-[#2a3447] flex items-center justify-between px-3">
        <div className="flex items-center space-x-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search commits by message, author, SHA, branch..."
              className="w-full bg-[#14181f] border border-[#2a3447] rounded pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Showing <span className="font-semibold text-slate-200">{filteredNodes.length}</span> commits
        </div>
      </div>

      {/* Table Headers */}
      <div className="h-7 bg-[#1b212c] border-b border-[#2a3447] flex items-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2">
        <div style={{ width: graphWidth }} className="flex-shrink-0 px-2">
          Graph
        </div>
        <div className="flex-1 px-3">Commit Message</div>
        <div className="w-36 px-2 text-right">Author</div>
        <div className="w-28 px-2 text-right">Date</div>
        <div className="w-20 px-2 text-right font-mono">SHA</div>
      </div>

      {/* Commit Rows Virtual/Scrollable Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {filteredNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm">
            <GitCommit className="w-8 h-8 mb-2 opacity-40" />
            <span>No commits found</span>
          </div>
        ) : (
          filteredNodes.map((node, rowIndex) => {
            const commit = node.commit;
            const isSelected = selectedHash === commit.hash;
            const isWip = commit.isWip;

            const nodeX = GRAPH_PADDING_X + node.lane * LANE_WIDTH + LANE_WIDTH / 2;
            const nodeY = ROW_HEIGHT / 2;

            return (
              <div
                key={commit.hash}
                draggable={!isWip}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', commit.hash);
                  e.dataTransfer.setData('application/x-gitter-commit', commit.hash);
                }}
                onClick={() => onSelectCommit(commit)}
                onContextMenu={(e) => handleContextMenu(e, commit)}
                style={{ height: ROW_HEIGHT }}
                title={isWip ? 'Uncommitted changes' : `Commit ${commit.shortHash} by ${commit.author.name} (Drag onto a branch to cherry-pick)`}
                className={`flex items-center text-xs border-b border-[#1b212c] cursor-pointer transition select-none ${
                  isSelected
                    ? 'bg-[#263245] text-white'
                    : 'hover:bg-[#1b212c] text-slate-300'
                }`}
              >
                {/* SVG Graph Column */}
                <div
                  style={{ width: graphWidth, height: ROW_HEIGHT }}
                  className="flex-shrink-0 relative overflow-hidden"
                >
                  <svg
                    width={graphWidth}
                    height={ROW_HEIGHT}
                    className="absolute inset-0 pointer-events-none"
                  >
                    {/* Passing lanes */}
                    {node.passingLanes.map((pLane) => {
                      const px = GRAPH_PADDING_X + pLane * LANE_WIDTH + LANE_WIDTH / 2;
                      const pColor = getLaneColor(pLane);
                      return (
                        <line
                          key={pLane}
                          x1={px}
                          y1={0}
                          x2={px}
                          y2={ROW_HEIGHT}
                          stroke={pColor}
                          strokeWidth="2"
                          opacity="0.8"
                        />
                      );
                    })}

                    {/* Connecting routes to parents */}
                    {node.routes.map((route, rIdx) => {
                      const fromX = GRAPH_PADDING_X + route.fromLane * LANE_WIDTH + LANE_WIDTH / 2;
                      const toX = GRAPH_PADDING_X + route.toLane * LANE_WIDTH + LANE_WIDTH / 2;
                      const y1 = nodeY;
                      const y2 = ROW_HEIGHT; // down to next row

                      if (fromX === toX) {
                        return (
                          <line
                            key={rIdx}
                            x1={fromX}
                            y1={y1}
                            x2={toX}
                            y2={y2}
                            stroke={route.color}
                            strokeWidth="2"
                          />
                        );
                      } else {
                        // Smooth cubic bezier curve
                        const midY = (y1 + y2) / 2;
                        const d = `M ${fromX} ${y1} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${y2}`;
                        return (
                          <path
                            key={rIdx}
                            d={d}
                            fill="none"
                            stroke={route.color}
                            strokeWidth="2"
                          />
                        );
                      }
                    })}

                    {/* Commit Node Circle */}
                    {isWip ? (
                      <g>
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r="5.5"
                          fill="#14181f"
                          stroke="#18b487"
                          strokeWidth="2.5"
                          strokeDasharray="3 2"
                        />
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r="2.5"
                          fill="#18b487"
                          className="animate-pulse"
                        />
                      </g>
                    ) : (
                      <g>
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r="4.5"
                          fill={node.color}
                          stroke="#14181f"
                          strokeWidth="1.5"
                        />
                        {isSelected && (
                          <circle
                            cx={nodeX}
                            cy={nodeY}
                            r="7.5"
                            fill="none"
                            stroke={node.color}
                            strokeWidth="1.5"
                            opacity="0.7"
                          />
                        )}
                      </g>
                    )}
                  </svg>
                </div>

                {/* Commit Summary & Ref Badges */}
                <div className="flex-1 px-3 flex items-center space-x-2 truncate">
                  {/* Ref badges (branches, tags, HEAD) */}
                  {commit.refs.map((ref) => {
                    const isHead = ref.includes('HEAD');
                    const isTag = ref.startsWith('tag: ');
                    const refName = isTag ? ref.replace('tag: ', '') : ref.replace('HEAD -> ', '');

                    return (
                      <span
                        key={ref}
                        className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 border ${
                          isHead
                            ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                            : isTag
                            ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                            : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                        }`}
                      >
                        {isTag ? (
                          <TagIcon className="w-2.5 h-2.5" />
                        ) : (
                          <GitBranch className="w-2.5 h-2.5" />
                        )}
                        <span className="truncate max-w-[100px]">{refName}</span>
                      </span>
                    );
                  })}

                  {/* Summary Text */}
                  <span
                    className={`truncate ${
                      isWip ? 'text-teal-400 font-semibold' : 'text-slate-200'
                    }`}
                  >
                    {commit.summary}
                  </span>
                </div>

                {/* Author */}
                <div className="w-36 px-2 text-right truncate text-slate-400">
                  {commit.author.name}
                </div>

                {/* Date */}
                <div className="w-28 px-2 text-right truncate text-slate-500 text-[11px]">
                  {commit.date.split(' ')[0] || commit.date}
                </div>

                {/* Short SHA */}
                <div className="w-20 px-2 text-right font-mono text-[11px] text-slate-400">
                  {commit.shortHash}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Context Menu on Right Click */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed bg-[#1b212c] border border-[#2a3447] rounded-md shadow-2xl py-1 z-50 text-xs text-slate-200 min-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 font-mono text-[11px] text-teal-400 border-b border-[#2a3447]">
            {contextMenu.commit.shortHash}: {contextMenu.commit.summary.slice(0, 24)}...
          </div>

          <button
            onClick={() => {
              onCheckout(contextMenu.commit.hash);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
          >
            <GitBranch className="w-3.5 h-3.5 text-teal-400" />
            <span>Checkout this commit</span>
          </button>

          <button
            onClick={() => {
              onCreateBranchAt(contextMenu.commit.hash);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
          >
            <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
            <span>Create branch here...</span>
          </button>

          <button
            onClick={() => {
              onCreateTagAt(contextMenu.commit.hash);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
          >
            <TagIcon className="w-3.5 h-3.5 text-yellow-400" />
            <span>Create tag here...</span>
          </button>

          {onInteractiveRebase && (
            <button
              onClick={() => {
                onInteractiveRebase(contextMenu.commit.hash);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300 font-medium"
            >
              <GitMerge className="w-3.5 h-3.5 text-teal-400" />
              <span>Interactive Rebase onto this commit...</span>
            </button>
          )}

          <div className="border-t border-[#2a3447] my-1" />

          <button
            onClick={() => {
              onCherryPick(contextMenu.commit.hash);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
          >
            <GitPullRequest className="w-3.5 h-3.5 text-purple-400" />
            <span>Cherry-pick commit</span>
          </button>

          <button
            onClick={() => {
              onRevertCommit(contextMenu.commit.hash);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
            <span>Revert commit</span>
          </button>

          <div className="border-t border-[#2a3447] my-1" />

          <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500">
            Reset current branch here
          </div>
          <button
            onClick={() => {
              onResetCommit(contextMenu.commit.hash, 'soft');
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1 hover:bg-[#262f3f] text-slate-300"
          >
            Soft (Keep changes staged)
          </button>
          <button
            onClick={() => {
              onResetCommit(contextMenu.commit.hash, 'mixed');
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1 hover:bg-[#262f3f] text-slate-300"
          >
            Mixed (Keep changes unstaged)
          </button>
          <button
            onClick={() => {
              if (confirm('Are you sure? Hard reset will discard all uncommitted changes!')) {
                onResetCommit(contextMenu.commit.hash, 'hard');
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1 hover:bg-[#262f3f] text-red-400"
          >
            Hard (Discard all changes)
          </button>

          <div className="border-t border-[#2a3447] my-1" />

          {onOpenInVsCode && (
            <button
              onClick={() => {
                onOpenInVsCode(contextMenu.commit.hash);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-blue-300"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span>Open repository in VS Code</span>
            </button>
          )}

          {onCreatePatch && (
            <button
              onClick={() => {
                onCreatePatch(contextMenu.commit.hash);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300"
            >
              <FileCode className="w-3.5 h-3.5 text-teal-400" />
              <span>Create patch from this commit</span>
            </button>
          )}

          <button
            onClick={() => {
              navigator.clipboard.writeText(contextMenu.commit.summary);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-400"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy commit message</span>
          </button>

          <button
            onClick={() => {
              copySha(contextMenu.commit.hash);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-400"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy full SHA</span>
          </button>
        </div>
      )}
    </div>
  );
};
