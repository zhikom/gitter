import React, { useState, useEffect } from 'react';
import {
  X,
  DownloadCloud,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FileBox,
  Monitor,
  Apple,
  Terminal,
} from 'lucide-react';
import { checkForAppUpdate, CURRENT_VERSION } from '../../services/updateService';
import { ReleaseAsset, UpdateInfo } from '../../types/update';

interface UpdateModalProps {
  onClose: () => void;
  updateInfo?: UpdateInfo | null;
  initialUpdateInfo?: UpdateInfo | null;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  onClose,
  updateInfo: propUpdateInfo,
  initialUpdateInfo,
}) => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(
    propUpdateInfo || initialUpdateInfo || null
  );
  const [loading, setLoading] = useState<boolean>(!initialUpdateInfo);
  const [error, setError] = useState<string | null>(null);
  const [showAllAssets, setShowAllAssets] = useState<boolean>(false);
  const [autoCheck, setAutoCheck] = useState<boolean>(() => {
    return localStorage.getItem('gitter_auto_check_updates') !== 'false';
  });

  const checkUpdates = async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await checkForAppUpdate();
      setUpdateInfo(info);
    } catch (err: any) {
      setError(err.message || 'Failed to check for updates.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialUpdateInfo) {
      checkUpdates();
    }
  }, [initialUpdateInfo]);

  const handleToggleAutoCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.checked;
    setAutoCheck(val);
    localStorage.setItem('gitter_auto_check_updates', val ? 'true' : 'false');
  };

  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '';
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const getPlatformIcon = (platform?: string) => {
    switch (platform) {
      case 'windows':
        return <Monitor className="w-3.5 h-3.5 text-blue-400" />;
      case 'macos':
        return <Apple className="w-3.5 h-3.5 text-slate-200" />;
      case 'linux':
        return <Terminal className="w-3.5 h-3.5 text-amber-400" />;
      case 'vscode':
        return <FileBox className="w-3.5 h-3.5 text-teal-400" />;
      default:
        return <DownloadCloud className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-2xl bg-[#1b212c] border border-[#2a3447] rounded-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="h-13 bg-[#151a23] border-b border-[#2a3447] flex items-center justify-between px-5 py-3">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <DownloadCloud className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>Gitter Software Update</span>
                <span className="text-[11px] font-mono font-normal text-slate-400 bg-[#222a3a] px-1.5 py-0.5 rounded border border-[#2a3447]">
                  v{CURRENT_VERSION}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">
                Official releases and changelogs from GitHub
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-[#202735] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-slate-300">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <RefreshCw className="w-8 h-8 text-teal-400 animate-spin" />
              <div className="text-sm font-medium text-slate-300">Checking for updates...</div>
              <div className="text-[11px] text-slate-500">Querying GitHub Releases API</div>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="font-semibold text-red-300 mb-1">Check Failed</div>
                <div className="text-slate-400 mb-3">{error}</div>
                <button
                  onClick={checkUpdates}
                  className="px-3 py-1 bg-[#222a3a] hover:bg-[#2b3548] border border-[#2a3447] rounded text-slate-200 text-xs font-medium transition"
                >
                  Try Again
                </button>
              </div>
            </div>
          ) : updateInfo ? (
            <>
              {/* Status Banner */}
              {updateInfo.hasUpdate ? (
                <div className="bg-gradient-to-r from-teal-500/15 via-emerald-500/10 to-transparent border border-teal-500/30 rounded-xl p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-teal-400" />
                      <span className="font-bold text-sm text-teal-300">
                        New Version Available: v{updateInfo.latestVersion}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      You are running v{updateInfo.currentVersion}. Released on{' '}
                      {new Date(updateInfo.publishedAt).toLocaleDateString()}.
                    </p>
                  </div>
                  {updateInfo.recommendedAsset && (
                    <a
                      href={updateInfo.recommendedAsset.browser_download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold text-xs shadow-lg shadow-teal-500/20 transition flex items-center space-x-1.5 flex-shrink-0"
                    >
                      <DownloadCloud className="w-4 h-4" />
                      <span>Download Update</span>
                    </a>
                  )}
                </div>
              ) : (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-center space-x-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-sm text-emerald-300">You're up to date!</div>
                    <div className="text-[11px] text-slate-400">
                      Gitter v{updateInfo.currentVersion} is currently the newest version available.
                    </div>
                  </div>
                </div>
              )}

              {/* Changelog & Release Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-slate-300 text-xs flex items-center space-x-1.5">
                    <span>What's New in {updateInfo.releaseTitle}</span>
                  </span>
                  <a
                    href={updateInfo.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal-400 hover:text-teal-300 flex items-center space-x-1 text-[11px]"
                  >
                    <span>View on GitHub</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div className="bg-[#14181f] border border-[#2a3447] rounded-lg p-3 max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed text-slate-300 whitespace-pre-wrap selection:bg-teal-500/30">
                  {updateInfo.changelog}
                </div>
              </div>

              {/* Platform Downloads Dropdown */}
              {updateInfo.assets && updateInfo.assets.length > 0 && (
                <div className="border border-[#2a3447] rounded-lg bg-[#151a23] overflow-hidden">
                  <button
                    onClick={() => setShowAllAssets(!showAllAssets)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-300 hover:bg-[#1f2635] transition"
                  >
                    <div className="flex items-center space-x-2">
                      <DownloadCloud className="w-3.5 h-3.5 text-teal-400" />
                      <span>Download Installers for Other Platforms ({updateInfo.assets.length})</span>
                    </div>
                    {showAllAssets ? (
                      <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                    )}
                  </button>

                  {showAllAssets && (
                    <div className="border-t border-[#2a3447] p-2 space-y-1 bg-[#13171f]">
                      {updateInfo.assets.map((asset) => (
                        <a
                          key={asset.name}
                          href={asset.browser_download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between px-3 py-1.5 rounded hover:bg-[#1d2432] text-xs transition group"
                        >
                          <div className="flex items-center space-x-2 truncate">
                            {getPlatformIcon(asset.platform)}
                            <span className="font-mono text-[11px] text-slate-200 group-hover:text-teal-300 truncate">
                              {asset.name}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 text-[11px] text-slate-500 flex-shrink-0">
                            {asset.size > 0 && <span>{formatSize(asset.size)}</span>}
                            <DownloadCloud className="w-3 h-3 group-hover:text-teal-400 transition" />
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="h-12 bg-[#151a23] border-t border-[#2a3447] flex items-center justify-between px-5">
          <label className="flex items-center space-x-2 text-[11px] text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={autoCheck}
              onChange={handleToggleAutoCheck}
              className="rounded bg-[#14181f] border-[#2a3447] text-teal-500 focus:ring-0"
            />
            <span>Automatically check for updates on startup</span>
          </label>

          <div className="flex items-center space-x-2">
            <button
              onClick={checkUpdates}
              disabled={loading}
              className="px-3 py-1.5 rounded bg-[#202735] hover:bg-[#2b3548] border border-[#2a3447] text-slate-300 text-xs font-medium transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Check Again</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs shadow-md transition"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
