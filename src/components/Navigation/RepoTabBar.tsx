import React, { useState, useRef } from 'react';
import {
  FolderGit2,
  X,
  Plus,
  GitBranch,
  ExternalLink,
  Copy,
  FolderOpen,
} from 'lucide-react';

export interface RepoTab {
  path: string;
  name: string;
  branch?: string;
  isClean?: boolean;
}

interface RepoTabBarProps {
  tabs: RepoTab[];
  activePath: string;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseOtherTabs?: (path: string) => void;
  onRevealInExplorer?: (path: string) => void;
  onNewTab: () => void;
}

interface TabContextMenu {
  x: number;
  y: number;
  tab: RepoTab;
}

export const RepoTabBar: React.FC<RepoTabBarProps> = ({
  tabs,
  activePath,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onRevealInExplorer,
  onNewTab,
}) => {
  const [contextMenu, setContextMenu] = useState<TabContextMenu | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollRef.current && e.deltaY !== 0) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, tab: RepoTab) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tab,
    });
  };

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path);
  };

  return (
    <div
      className="h-9 bg-[#0e1218] border-b border-[#1f2636] flex items-center px-2 select-none flex-shrink-0 w-full overflow-hidden"
      onClick={() => setContextMenu(null)}
    >
      {/* Scrollable Tabs Container with Mouse-Wheel Horizontal Translation */}
      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex-1 flex items-center space-x-1 overflow-x-auto no-scrollbar scroll-smooth min-w-0 h-full py-0.5"
      >
        {tabs.map((tab) => {
          const isActive = tab.path.toLowerCase() === activePath.toLowerCase();

          return (
            <div
              key={tab.path}
              onClick={() => onSelectTab(tab.path)}
              onAuxClick={(e) => {
                // Middle-click to close
                if (e.button === 1 && tabs.length > 1) {
                  e.preventDefault();
                  onCloseTab(tab.path);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, tab)}
              title={`${tab.name}\n${tab.path}\n(Middle click or click X to close)`}
              className={`group relative h-8 px-3 rounded-t-md flex items-center space-x-2 text-xs cursor-pointer border-t-2 transition-all flex-shrink-0 ${
                isActive
                  ? 'bg-[#181d26] text-slate-100 border-teal-500 font-semibold shadow-sm'
                  : 'bg-[#12161f] hover:bg-[#151b24] text-slate-400 border-transparent hover:text-slate-300'
              }`}
            >
              <FolderGit2 className={`w-3.5 h-3.5 ${isActive ? 'text-teal-400' : 'text-slate-500'}`} />

              <span className="truncate max-w-[140px] font-sans">{tab.name}</span>

              {/* Branch pill */}
              {tab.branch && (
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#202736] text-slate-400 border border-[#2c364b] flex items-center space-x-0.5">
                  <GitBranch className="w-2.5 h-2.5 text-teal-400" />
                  <span className="truncate max-w-[65px]">{tab.branch}</span>
                </span>
              )}

              {/* Dirty indicator */}
              {tab.isClean === false && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 animate-pulse"
                  title="Uncommitted changes in repository"
                />
              )}

              {/* Close tab */}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.path);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#2b3548] rounded text-slate-400 hover:text-red-400 transition ml-1"
                  title="Close Tab (Ctrl+W)"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Pinned New Tab Button - Always visible & reachable regardless of tab count */}
      <div className="flex items-center pl-1 border-l border-[#1f2636]/60 flex-shrink-0 bg-[#0e1218]">
        <button
          onClick={onNewTab}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#1e2533] text-slate-400 hover:text-teal-300 transition-colors"
          title="Open Repository in New Tab (Ctrl+T)"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tab Context Menu */}
      {contextMenu && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed bg-[#1b212c] border border-[#2a3447] rounded-md shadow-2xl py-1 z-50 text-xs text-slate-200 min-w-[180px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[11px] font-mono text-teal-400 border-b border-[#2a3447] truncate">
            {contextMenu.tab.name}
          </div>

          <button
            onClick={() => {
              copyPath(contextMenu.tab.path);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            <span>Copy Full Path</span>
          </button>

          {onRevealInExplorer && (
            <button
              onClick={() => {
                onRevealInExplorer(contextMenu.tab.path);
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2"
            >
              <FolderOpen className="w-3.5 h-3.5 text-blue-400" />
              <span>Reveal in File Explorer</span>
            </button>
          )}

          {tabs.length > 1 && (
            <>
              <div className="border-t border-[#2a3447] my-1" />

              <button
                onClick={() => {
                  onCloseTab(contextMenu.tab.path);
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-red-300"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close Tab</span>
              </button>

              {onCloseOtherTabs && (
                <button
                  onClick={() => {
                    onCloseOtherTabs(contextMenu.tab.path);
                    setContextMenu(null);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-[#262f3f] flex items-center space-x-2 text-slate-300"
                >
                  <X className="w-3.5 h-3.5 text-slate-500" />
                  <span>Close Other Tabs</span>
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
