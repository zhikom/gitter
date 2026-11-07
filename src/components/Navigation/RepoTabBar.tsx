import React from 'react';
import {
  FolderGit2,
  X,
  Plus,
  GitBranch,
  Circle,
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
  onNewTab: () => void;
}

export const RepoTabBar: React.FC<RepoTabBarProps> = ({
  tabs,
  activePath,
  onSelectTab,
  onCloseTab,
  onNewTab,
}) => {
  return (
    <div className="h-9 bg-[#0f131a] border-b border-[#1f2636] flex items-center px-2 select-none overflow-x-auto space-x-1 no-scrollbar">
      {tabs.map((tab, idx) => {
        const isActive = tab.path.toLowerCase() === activePath.toLowerCase();

        return (
          <div
            key={tab.path}
            onClick={() => onSelectTab(tab.path)}
            className={`group relative h-7.5 px-3 rounded-t-md flex items-center space-x-2 text-xs cursor-pointer border-t-2 transition-all ${
              isActive
                ? 'bg-[#181d26] text-slate-100 border-teal-500 font-medium shadow-sm'
                : 'bg-[#12161f] hover:bg-[#151b24] text-slate-400 border-transparent hover:text-slate-300'
            }`}
          >
            <FolderGit2 className={`w-3.5 h-3.5 ${isActive ? 'text-teal-400' : 'text-slate-500'}`} />

            <span className="truncate max-w-[130px] font-sans">{tab.name}</span>

            {/* Branch pill */}
            {tab.branch && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#202736] text-slate-400 border border-[#2c364b] flex items-center space-x-0.5">
                <GitBranch className="w-2.5 h-2.5" />
                <span className="truncate max-w-[60px]">{tab.branch}</span>
              </span>
            )}

            {/* Dirty indicator */}
            {tab.isClean === false && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
                title="Uncommitted changes"
              />
            )}

            {/* Close tab */}
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.path);
                }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#2b3548] rounded text-slate-400 hover:text-slate-200 transition-opacity ml-1"
                title="Close Tab (Ctrl+W)"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        );
      })}

      {/* New Tab Button */}
      <button
        onClick={onNewTab}
        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#1e2533] text-slate-400 hover:text-slate-200 transition-colors ml-1"
        title="Open Repository in New Tab (Ctrl+T)"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
