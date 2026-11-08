import React, { useState, useEffect } from 'react';
import {
  FolderOpen,
  Plus,
  Download,
  Star,
  ExternalLink,
  Terminal,
  Trash2,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  GitBranch,
  Clock,
  Sparkles,
  Layers,
  RefreshCw,
  FolderSearch,
} from 'lucide-react';
import { api } from '../../api/client';

export interface RecentRepoItem {
  path: string;
  name: string;
  currentBranch?: string;
  isClean?: boolean;
  lastOpened: number;
  favorite?: boolean;
}

interface LaunchpadModalProps {
  currentPath: string;
  onClose: () => void;
  onOpenRepo: (path: string) => void;
  onCloneRepo: () => void;
  onInitRepo: () => void;
}

export const LaunchpadModal: React.FC<LaunchpadModalProps> = ({
  currentPath,
  onClose,
  onOpenRepo,
  onCloneRepo,
  onInitRepo,
}) => {
  const [activeTab, setActiveTab] = useState<'recents' | 'scanner'>('recents');
  const [search, setSearch] = useState('');
  const [scanFolder, setScanFolder] = useState<string>(() => {
    return localStorage.getItem('gitter_scan_parent_folder') || 'C:/Users/home/repos';
  });
  const [scannedRepos, setScannedRepos] = useState<Array<{
    name: string;
    path: string;
    currentBranch: string;
    isClean: boolean;
    lastCommit?: string;
  }>>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const [repos, setRepos] = useState<RecentRepoItem[]>(() => {
    try {
      const stored = localStorage.getItem('gitter_recent_repos');
      if (stored) return JSON.parse(stored);
    } catch {}
    // Seed with current repository
    return currentPath
      ? [
          {
            path: currentPath,
            name: currentPath.split(/[\/\\]/).filter(Boolean).pop() || 'gitter',
            currentBranch: 'main',
            isClean: true,
            lastOpened: Date.now(),
            favorite: true,
          },
        ]
      : [];
  });

  const [dragOverZone, setDragOverZone] = useState(false);

  // Save to localStorage when repos list changes
  useEffect(() => {
    try {
      localStorage.setItem('gitter_recent_repos', JSON.stringify(repos));
    } catch {}
  }, [repos]);

  const toggleFavorite = (repoPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRepos((prev) =>
      prev.map((r) => (r.path === repoPath ? { ...r, favorite: !r.favorite } : r))
    );
  };

  const removeRepo = (repoPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRepos((prev) => prev.filter((r) => r.path !== repoPath));
  };

  const handleOpenInVsCode = (repoPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    api.openInVsCode(repoPath).catch((err) => alert(`VS Code error: ${err.message}`));
  };

  const handleOpenInTerminal = (repoPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    api.openInTerminal(repoPath).catch((err) => alert(`Terminal error: ${err.message}`));
  };

  const handleRevealInExplorer = (repoPath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    api.revealInExplorer(repoPath).catch((err) => alert(`Explorer error: ${err.message}`));
  };

  const filteredRepos = repos
    .filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return b.lastOpened - a.lastOpened;
    });

  const handleNativePick = async () => {
    try {
      const res = await api.pickNativeFolder();
      if (res && res.path) {
        const repoPath = res.path;
        const name = repoPath.split(/[\/\\]/).filter(Boolean).pop() || 'repo';
        setRepos((prev) => [
          {
            path: repoPath,
            name,
            currentBranch: 'main',
            isClean: true,
            lastOpened: Date.now(),
            favorite: false,
          },
          ...prev.filter((r) => r.path !== repoPath),
        ]);
        onOpenRepo(repoPath);
        onClose();
      }
    } catch (e: any) {
      alert(`Native dialog error: ${e.message}`);
    }
  };

  const handleFolderDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverZone(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const droppedFile = files[0];
      const droppedPath = (droppedFile as any).path || droppedFile.name;
      if (droppedPath) {
        onOpenRepo(droppedPath);
        onClose();
      }
    }
  };

  const handleBrowseScanFolder = async () => {
    try {
      const res = await api.pickNativeFolder();
      if (res && res.path) {
        setScanFolder(res.path);
        localStorage.setItem('gitter_scan_parent_folder', res.path);
      }
    } catch {}
  };

  const handleScanFolder = async () => {
    if (!scanFolder.trim()) return;
    setScanning(true);
    setScanError(null);
    try {
      localStorage.setItem('gitter_scan_parent_folder', scanFolder.trim());
      const results = await api.scanRepositories(scanFolder.trim());
      setScannedRepos(results);
    } catch (e: any) {
      setScanError(e.message || 'Failed to scan folder for repositories');
    } finally {
      setScanning(false);
    }
  };

  const handleOpenScannedRepo = (repoPath: string) => {
    const name = repoPath.split(/[\/\\]/).filter(Boolean).pop() || 'repo';
    setRepos((prev) => [
      {
        path: repoPath,
        name,
        currentBranch: 'main',
        isClean: true,
        lastOpened: Date.now(),
        favorite: false,
      },
      ...prev.filter((r) => r.path !== repoPath),
    ]);
    onOpenRepo(repoPath);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-[#181d26] border border-[#2a3447] rounded-xl shadow-2xl overflow-hidden flex flex-col h-[650px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-14 border-b border-[#2a3447] bg-[#14181f] flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <FolderOpen className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm text-slate-100 block">Repository Launchpad</span>
              <span className="text-[11px] text-slate-500">Tower & SmartGit repository manager</span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center space-x-2">
            <button
              onClick={handleNativePick}
              title="Select repository folder using native OS dialog"
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-xs font-semibold text-teal-300 transition"
            >
              <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
              <span>Browse Native...</span>
            </button>

            <button
              onClick={() => {
                const p = prompt('Enter or paste local repository path:');
                if (p) {
                  onOpenRepo(p.trim());
                  onClose();
                }
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-xs font-medium text-slate-200 transition"
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
              <span>Manual Path...</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onCloneRepo();
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-xs font-medium text-slate-200 transition"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Clone Repo...</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onInitRepo();
              }}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-[#202735] hover:bg-[#2d384c] border border-[#2a3447] text-xs font-medium text-slate-200 transition"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Init New...</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#202735] ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="h-10 bg-[#14181f] border-b border-[#2a3447] flex items-center px-6 space-x-4">
          <button
            onClick={() => setActiveTab('recents')}
            className={`h-full flex items-center space-x-1.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'recents'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Recent Repositories</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#202735] text-slate-400">
              {filteredRepos.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('scanner')}
            className={`h-full flex items-center space-x-1.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'scanner'
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderSearch className="w-3.5 h-3.5 text-teal-400" />
            <span>Scan Repositories Folder</span>
            {scannedRepos.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-teal-500/20 text-teal-300 font-mono">
                {scannedRepos.length} found
              </span>
            )}
          </button>
        </div>

        {/* Tab 1: Recent Repositories */}
        {activeTab === 'recents' ? (
          <>
            {/* Search Bar & Dropzone */}
            <div className="p-4 border-b border-[#2a3447] bg-[#161c26] flex items-center space-x-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search repositories by name or path..."
                  className="w-full bg-[#14181f] border border-[#2a3447] rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Drag & drop dropzone hint */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverZone(true);
                }}
                onDragLeave={() => setDragOverZone(false)}
                onDrop={handleFolderDrop}
                className={`px-4 py-2 rounded-lg border-2 border-dashed transition text-xs flex items-center space-x-2 ${
                  dragOverZone
                    ? 'border-teal-400 bg-teal-500/10 text-teal-300'
                    : 'border-[#2a3447] text-slate-400'
                }`}
              >
                <FolderOpen className="w-4 h-4 text-teal-400" />
                <span>Drop folder here to open</span>
              </div>
            </div>

            {/* Repositories Grid / List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {filteredRepos.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-xs italic">
                  No matching repositories found. Drop a folder above, click "Browse Native...", or switch to "Scan Repositories Folder".
                </div>
              ) : (
                filteredRepos.map((repo) => {
                  const isCurrent = repo.path === currentPath;

                  return (
                    <div
                      key={repo.path}
                      onClick={() => {
                        onOpenRepo(repo.path);
                        onClose();
                      }}
                      className={`group flex items-center justify-between p-3 rounded-lg border cursor-pointer transition ${
                        isCurrent
                          ? 'bg-teal-500/10 border-teal-500/40 text-white'
                          : 'bg-[#151a23] hover:bg-[#1f2735] border-[#2a3447] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-3 truncate">
                        {/* Favorite star */}
                        <button
                          onClick={(e) => toggleFavorite(repo.path, e)}
                          title={repo.favorite ? 'Unpin from favorites' : 'Pin to favorites'}
                          className={`p-1 rounded hover:bg-[#283344] transition ${
                            repo.favorite ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
                          }`}
                        >
                          <Star className={`w-4 h-4 ${repo.favorite ? 'fill-amber-400' : ''}`} />
                        </button>

                        <FolderOpen className="w-5 h-5 text-teal-400 flex-shrink-0" />

                        <div className="truncate">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-xs text-slate-200">{repo.name}</span>
                            {isCurrent && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/30">
                                Current
                              </span>
                            )}
                            {repo.currentBranch && (
                              <div className="flex items-center space-x-1 text-[11px] text-teal-400 font-mono">
                                <GitBranch className="w-3 h-3" />
                                <span>{repo.currentBranch}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate max-w-lg" title={repo.path}>
                            {repo.path}
                          </div>
                        </div>
                      </div>

                      {/* Actions on hover */}
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={(e) => handleOpenInVsCode(repo.path, e)}
                          title="Open in VS Code"
                          className="p-1.5 hover:bg-[#2a3447] text-slate-400 hover:text-blue-400 rounded transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => handleOpenInTerminal(repo.path, e)}
                          title="Open in Terminal"
                          className="p-1.5 hover:bg-[#2a3447] text-slate-400 hover:text-teal-400 rounded transition"
                        >
                          <Terminal className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => handleRevealInExplorer(repo.path, e)}
                          title="Reveal in File Explorer"
                          className="p-1.5 hover:bg-[#2a3447] text-slate-400 hover:text-slate-200 rounded transition"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => removeRepo(repo.path, e)}
                          title="Remove from recent repositories"
                          className="p-1.5 hover:bg-rose-500/20 text-slate-600 hover:text-rose-400 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          /* Tab 2: Scan Repositories Folder */
          <div className="flex-1 flex flex-col min-h-0 bg-[#161c26]">
            {/* Scan Controls Bar */}
            <div className="p-4 border-b border-[#2a3447] bg-[#14181f] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-xs text-slate-200 block">Scan Folder for All Repositories</span>
                  <span className="text-[11px] text-slate-500">
                    Recursively detects all Git repositories in any folder (e.g. your repos folder)
                  </span>
                </div>
                {scannedRepos.length > 0 && (
                  <button
                    onClick={() => {
                      const newRecents = [...repos];
                      scannedRepos.forEach((s) => {
                        if (!newRecents.some((r) => r.path === s.path)) {
                          newRecents.push({
                            path: s.path,
                            name: s.name,
                            currentBranch: s.currentBranch,
                            isClean: s.isClean,
                            lastOpened: Date.now(),
                          });
                        }
                      });
                      setRepos(newRecents);
                      alert(`Added ${scannedRepos.length} repositories to Recents!`);
                    }}
                    className="px-3 py-1 rounded bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-300 text-xs font-semibold transition"
                  >
                    Add All to Recents
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={scanFolder}
                  onChange={(e) => setScanFolder(e.target.value)}
                  placeholder="e.g. C:/Users/home/repos or /Users/username/Developer"
                  className="flex-1 bg-[#181d26] border border-[#2a3447] rounded px-3 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                />

                <button
                  onClick={handleBrowseScanFolder}
                  title="Browse folder via OS dialog"
                  className="px-3 py-1.5 rounded bg-[#202735] hover:bg-[#2c374b] border border-[#2a3447] text-slate-200 text-xs font-medium transition flex items-center space-x-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-teal-400" />
                  <span>Browse...</span>
                </button>

                <button
                  onClick={handleScanFolder}
                  disabled={scanning || !scanFolder.trim()}
                  className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition flex items-center space-x-1.5 shadow-md disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
                  <span>{scanning ? 'Scanning...' : 'Scan Now'}</span>
                </button>
              </div>

              {scanError && (
                <div className="text-red-400 text-[11px] p-2 bg-red-500/10 border border-red-500/30 rounded">
                  {scanError}
                </div>
              )}
            </div>

            {/* Scanned Results */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {scanning ? (
                <div className="py-16 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 text-teal-400 animate-spin mx-auto" />
                  <div className="text-sm font-medium text-slate-300">Scanning directory for Git repositories...</div>
                  <div className="text-xs text-slate-500 font-mono">{scanFolder}</div>
                </div>
              ) : scannedRepos.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-xs italic space-y-2">
                  <FolderSearch className="w-8 h-8 mx-auto opacity-40 text-teal-400" />
                  <div>No scanned repositories yet. Click "Scan Now" to discover all Git repos in {scanFolder}.</div>
                </div>
              ) : (
                scannedRepos.map((repo) => (
                  <div
                    key={repo.path}
                    className="flex items-center justify-between p-3 rounded-lg bg-[#1b212c] border border-[#2a3447] hover:border-teal-500/40 text-xs transition group"
                  >
                    <div className="space-y-1 truncate flex-1 pr-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-100 group-hover:text-teal-400 transition">
                          {repo.name}
                        </span>
                        <span className="flex items-center space-x-1 text-[10px] text-blue-300 font-mono bg-blue-500/10 border border-blue-500/30 px-1.5 py-0.2 rounded">
                          <GitBranch className="w-2.5 h-2.5 text-blue-400" />
                          <span>{repo.currentBranch}</span>
                        </span>
                        {repo.isClean ? (
                          <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded font-medium">
                            Clean
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded font-medium">
                            Modified
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 truncate">{repo.path}</div>
                      {repo.lastCommit && (
                        <div className="text-[11px] text-slate-400 truncate">
                          Latest: <span className="italic">{repo.lastCommit}</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleOpenScannedRepo(repo.path)}
                      className="px-3 py-1.5 rounded bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-300 font-semibold text-xs transition flex items-center space-x-1 flex-shrink-0"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Open Repo</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="h-10 bg-[#14181f] border-t border-[#2a3447] px-6 flex items-center justify-between text-[11px] text-slate-500 flex-shrink-0">
          <span>{repos.length} repositories managed in Launchpad</span>
          <span>Tip: Drag folders anywhere onto Gitter to open them</span>
        </div>
      </div>
    </div>
  );
};
