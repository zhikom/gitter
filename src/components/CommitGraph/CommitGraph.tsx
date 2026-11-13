import { menuPosition, useDismiss } from '../ui/useDismiss';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Commit } from '../../../shared/types/git';
import { layoutCommitGraph, getLaneColor } from '../../utils/graphLayout';
import { usePreference } from '../../preferences';
import { aiAuthorOf, HARNESS_META } from '../Agent/agentUi';
import {
  GitCommit,
  GitBranch,
  Tag as TagIcon,
  Search,
  Copy,
  RotateCcw,
  GitPullRequest,
  GitMerge,
  ExternalLink,
  FileCode,
  Bot,
  AlertTriangle,
} from 'lucide-react';

interface CommitGraphProps {
  commits: Commit[];
  hasWip: boolean;
  selectedHash: string | null;
  reveal: { hash: string; sequence: number } | null;
  onSelectCommit: (commit: Commit) => void;
  onCheckout: (hash: string) => void;
  onCreateBranchAt: (hash: string) => void;
  onCreateTagAt: (hash: string) => void;
  onRevertCommit: (hash: string) => void;
  onResetCommit: (hash: string, mode: 'soft' | 'mixed' | 'hard') => void;
  onCherryPick: (hash: string) => void;
  onInteractiveRebase?: (baseHash: string) => void;
  onOpenInEditor?: () => void;
  onCopyPatch?: (hash: string) => void;
  onCompareCommits?: (commitA: Commit, commitB: Commit) => void;
  agentBranchNames?: string[];
  hasAgentCollisions?: boolean;
}

export type GraphDensity = 'compact' | 'normal' | 'comfortable';

const DENSITY_SETTINGS: Record<GraphDensity, { rowHeight: number; laneWidth: number; nodeRadius: number }> = {
  compact: { rowHeight: 24, laneWidth: 14, nodeRadius: 3.5 },
  normal: { rowHeight: 32, laneWidth: 18, nodeRadius: 4.5 },
  comfortable: { rowHeight: 40, laneWidth: 22, nodeRadius: 5.5 },
};

const GRAPH_PADDING_X = 14;

export const CommitGraph: React.FC<CommitGraphProps> = ({
  commits,
  hasWip,
  selectedHash,
  reveal,
  onSelectCommit,
  onCheckout,
  onCreateBranchAt,
  onCreateTagAt,
  onRevertCommit,
  onResetCommit,
  onCherryPick,
  onInteractiveRebase,
  onOpenInEditor,
  onCopyPatch,
  onCompareCommits,
  agentBranchNames = [],
  hasAgentCollisions = false,
}) => {
  const agentBranchSet = new Set(agentBranchNames);
  const [searchQuery, setSearchQuery] = useState('');
  const revealedRow = useRef<HTMLDivElement>(null);
  const lastRevealedSequence = useRef<number | null>(null);
  const [density, setDensity] = usePreference('graphDensity');
  // The checked-out commit; the list is newest first across all branches, so it need not be first.
  const headCommit = commits.find((c) => c.refs.some((r) => r === 'HEAD' || r.startsWith('HEAD ->')));
  const closeMenu = () => setContextMenu(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    commit: Commit;
  } | null>(null);
  useDismiss(Boolean(contextMenu), closeMenu);

  // Compute graph nodes with topological lane assignment
  const graphNodes = useMemo(() => layoutCommitGraph(commits, hasWip ? headCommit?.hash ?? '' : undefined), [commits, hasWip, headCommit?.hash]);

  // Search: plain text, or author:, hash: (sha:) and message: (msg:) prefixes.
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return graphNodes;
    const q = searchQuery.toLowerCase().trim();

    if (q.startsWith('author:')) {
      const term = q.replace(/^author:\s*/, '');
      return graphNodes.filter((n) =>
        n.commit.author.name.toLowerCase().includes(term) ||
        n.commit.author.email.toLowerCase().includes(term)
      );
    }
    if (q.startsWith('hash:') || q.startsWith('sha:')) {
      const term = q.replace(/^(hash|sha):\s*/, '');
      return graphNodes.filter((n) =>
        n.commit.hash.toLowerCase().includes(term) ||
        n.commit.shortHash.toLowerCase().includes(term)
      );
    }
    if (q.startsWith('message:') || q.startsWith('msg:')) {
      const term = q.replace(/^(message|msg):\s*/, '');
      return graphNodes.filter((n) =>
        n.commit.summary.toLowerCase().includes(term) ||
        n.commit.body?.toLowerCase().includes(term)
      );
    }

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

  const searching = searchQuery.trim() !== '';
  useEffect(() => {
    if (reveal) setSearchQuery('');
  }, [reveal]);
  useEffect(() => {
    if (reveal && !searchQuery && lastRevealedSequence.current !== reveal.sequence && revealedRow.current) {
      revealedRow.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
      lastRevealedSequence.current = reveal.sequence;
    }
  }, [reveal, searchQuery, filteredNodes]);

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

  const { rowHeight, laneWidth, nodeRadius } = DENSITY_SETTINGS[density];
  const graphWidth = GRAPH_PADDING_X * 2 + maxLanes * laneWidth;

  // Columns follow the pane's own width, which side panels change without the window resizing.
  const root = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(1000);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setPaneWidth(entry.contentRect.width));
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  // Many lanes are clipped rather than pushing the messages out of view.
  const graphColumn = Math.min(graphWidth, Math.max(80, Math.floor(paneWidth * 0.3)));
  const showAuthor = paneWidth >= 520;
  const showDate = paneWidth >= 660;
  const showSha = paneWidth >= 780;

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
      ref={root}
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

        <div className="flex items-center space-x-3">
          {/* Density Switcher */}
          <div className="flex items-center bg-[#14181f] border border-[#2a3447] rounded p-0.5 text-[10px]">
            {(['compact', 'normal', 'comfortable'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={`px-2 py-0.5 rounded transition capitalize font-medium ${
                  density === d
                    ? 'bg-teal-500/20 text-teal-300 shadow-sm border border-teal-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Graph density: ${d}`}
              >
                {d}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-400">
            Showing <span className="font-semibold text-slate-200">{filteredNodes.length}</span> commits
          </div>
          {hasAgentCollisions && (
            <span
              title="Agents are changing the same files. Open the agent fleet to see which."
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Collisions</span>
            </span>
          )}
        </div>
      </div>

      {/* Table Headers */}
      <div className="h-7 bg-[#1b212c] border-b border-[#2a3447] flex items-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2">
        <div style={{ width: graphColumn }} className="flex-shrink-0 px-2">
          Graph
        </div>
        <div className="min-w-0 flex-1 px-3 truncate">Message</div>
        {showAuthor && <div className="w-32 flex-shrink-0 px-2 text-right">Author</div>}
        {showDate && <div className="w-24 flex-shrink-0 px-2 text-right">Date</div>}
        {showSha && <div className="w-20 flex-shrink-0 px-2 text-right font-mono">SHA</div>}
      </div>

      {/* Commit Rows Virtual/Scrollable Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {filteredNodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-sm">
            <GitCommit className="w-8 h-8 mb-2 opacity-40" />
            <span>No commits found</span>
          </div>
        ) : (
          filteredNodes.map((node) => {
            const commit = node.commit;
            const isSelected = selectedHash === commit.hash;
            const isWip = commit.isWip;
            const isAgentCommit = commit.refs.some((ref) => {
              const name = ref.replace('HEAD -> ', '').replace('tag: ', '');
              return agentBranchSet.has(name);
            });

            const nodeX = GRAPH_PADDING_X + node.lane * laneWidth + laneWidth / 2;
            const nodeY = rowHeight / 2;

            return (
              <div
                key={commit.hash}
                ref={reveal?.hash === commit.hash ? revealedRow : undefined}
                data-commit-hash={commit.hash}
                draggable={!isWip}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', commit.hash);
                  e.dataTransfer.setData('application/x-gitter-commit', commit.hash);
                }}
                onClick={(e) => {
                  if (
                    (e.ctrlKey || e.metaKey || e.shiftKey) &&
                    selectedHash &&
                    selectedHash !== commit.hash &&
                    onCompareCommits &&
                    !isWip
                  ) {
                    const prev = commits.find(
                      (c) => c.hash === selectedHash || c.shortHash === selectedHash
                    );
                    if (prev && !prev.isWip) {
                      onCompareCommits(prev, commit);
                      return;
                    }
                  }
                  onSelectCommit(commit);
                }}
                onContextMenu={(e) => (isWip ? e.preventDefault() : handleContextMenu(e, commit))}
                style={{ height: rowHeight }}
                title={isWip ? 'Uncommitted changes' : `Commit ${commit.shortHash} by ${commit.author.name} (Drag onto a branch to cherry-pick)`}
                className={`flex items-center text-xs border-b border-[#1b212c] cursor-pointer transition select-none ${
                  isSelected
                    ? 'bg-[#263245] text-white'
                    : 'hover:bg-[#1b212c] text-slate-300'
                }`}
              >
                {/* SVG Graph Column */}
                <div
                  style={{ width: graphColumn, height: rowHeight }}
                  className="flex-shrink-0 relative overflow-hidden"
                >
                  <svg
                    width={graphWidth}
                    height={rowHeight}
                    className="absolute inset-0 pointer-events-none"
                  >
                    {/* While searching, rows are not adjacent, so only the nodes are drawn. */}
                    {!searching && node.incoming && (
                      <line x1={nodeX} y1={0} x2={nodeX} y2={nodeY} stroke={node.color} strokeWidth="2" />
                    )}
                    {/* Passing lanes */}
                    {!searching && node.passingLanes.map((pLane) => {
                      const px = GRAPH_PADDING_X + pLane * laneWidth + laneWidth / 2;
                      const pColor = getLaneColor(pLane);
                      return (
                        <line
                          key={pLane}
                          x1={px}
                          y1={0}
                          x2={px}
                          y2={rowHeight}
                          stroke={pColor}
                          strokeWidth="2"
                          opacity="0.8"
                        />
                      );
                    })}

                    {/* Connecting routes to parents */}
                    {!searching && node.routes.map((route, rIdx) => {
                      const fromX = GRAPH_PADDING_X + route.fromLane * laneWidth + laneWidth / 2;
                      const toX = GRAPH_PADDING_X + route.toLane * laneWidth + laneWidth / 2;
                      const y1 = nodeY;
                      const y2 = rowHeight; // down to next row

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
                          r={nodeRadius + 1}
                          fill="#14181f"
                          stroke="#18b487"
                          strokeWidth="2.5"
                          strokeDasharray="3 2"
                        />
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r={nodeRadius - 2}
                          fill="#18b487"
                          className="animate-pulse"
                        />
                      </g>
                    ) : (
                      <g>
                        <circle
                          cx={nodeX}
                          cy={nodeY}
                          r={nodeRadius}
                          fill={node.color}
                          stroke="#14181f"
                          strokeWidth="1.5"
                        />
                        {isSelected && (
                          <circle
                            cx={nodeX}
                            cy={nodeY}
                            r={nodeRadius + 3}
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
                <div className="min-w-0 flex-1 px-3 flex items-center space-x-2 truncate">
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
                        <span className="truncate max-w-[80px] sm:max-w-[120px]">{refName}</span>
                      </span>
                    );
                  })}

                  {isAgentCommit && (
                    <span
                      title="Commit produced by an agent branch"
                      className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 border bg-purple-500/20 text-purple-300 border-purple-500/40"
                    >
                      <Bot className="w-2.5 h-2.5" />
                      <span>Agent</span>
                    </span>
                  )}

                  {/* Summary Text */}
                  <span
                    className={`truncate ${
                      isWip ? 'text-teal-400 font-semibold' : 'text-slate-200'
                    }`}
                  >
                    {commit.summary}
                  </span>
                </div>

                {showAuthor && (
                  <div className="w-32 flex-shrink-0 px-2 text-right truncate text-slate-400 flex items-center justify-end gap-1.5">
                    {(() => {
                      const harness = commit.body ? aiAuthorOf(commit.body) : null;
                      if (!harness) return null;
                      const meta = HARNESS_META[harness];
                      return (
                        <span title={`Written with ${meta.label}`} className="px-1 rounded text-[9px] font-semibold border border-white/10" style={{ color: meta.color, backgroundColor: `${meta.color}22` }}>
                          {meta.label.split(' ')[0]}
                        </span>
                      );
                    })()}
                    <span className="truncate">{commit.author.name}</span>
                  </div>
                )}
                {showDate && <div className="w-24 flex-shrink-0 px-2 text-right truncate text-slate-500 text-[11px]">{commit.date.split(' ')[0] || commit.date}</div>}
                {showSha && <div className="w-20 flex-shrink-0 px-2 text-right font-mono text-[11px] text-slate-400">{commit.shortHash}</div>}
              </div>
            );
          })
        )}
      </div>

      {/* Context Menu on Right Click */}
      {contextMenu && (
        <div
          data-context-menu
          style={menuPosition(contextMenu.x, contextMenu.y, 220, 460)}
          className="fixed bg-[#1b212c] border border-[#2a3447] rounded-md shadow-2xl py-1 z-50 text-xs text-slate-200 min-w-[200px] max-h-[90vh] overflow-y-auto"
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
              onResetCommit(contextMenu.commit.hash, 'hard');
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1 hover:bg-[#262f3f] text-red-400"
          >
            Hard (Discard all changes)
          </button>

          <div className="border-t border-[#2a3447] my-1" />

          {onCompareCommits && headCommit && headCommit.hash !== contextMenu.commit.hash && (
            <>
              <button
                onClick={() => {
                  onCompareCommits(contextMenu.commit, headCommit);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300"
              >
                <GitCommit className="w-3.5 h-3.5 text-teal-400" />
                <span>Compare with HEAD</span>
              </button>
              {selectedHash && selectedHash !== contextMenu.commit.hash && (
                <button
                  onClick={() => {
                    const sel = commits.find((c) => c.hash === selectedHash || c.shortHash === selectedHash);
                    if (sel) {
                      onCompareCommits(sel, contextMenu.commit);
                    }
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300"
                >
                  <GitCommit className="w-3.5 h-3.5 text-teal-400" />
                  <span>Compare with selected commit</span>
                </button>
              )}
            </>
          )}

          {onOpenInEditor && (
            <button
              onClick={() => {
                onOpenInEditor();
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-blue-300"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span>Open repository in editor</span>
            </button>
          )}

          {onCopyPatch && (
            <button
              onClick={() => {
                onCopyPatch(contextMenu.commit.hash);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-teal-300"
            >
              <FileCode className="w-3.5 h-3.5 text-teal-400" />
              <span>Copy as patch</span>
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
