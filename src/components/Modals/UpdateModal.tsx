import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, DownloadCloud, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';
import type { UpdateInfo } from '../../../shared/types/update';
import { api } from '../../api/client';
import { usePreference } from '../../preferences';
import { checkForAppUpdate, CURRENT_VERSION } from '../../services/updateService';
import { Button, Modal } from '../ui/Modal';

interface UpdateModalProps {
  onClose: () => void;
}

const openInBrowser = (url: string) => api.openUrl({ url }).catch(() => window.open(url, '_blank'));
const megabytes = (bytes: number) => (bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : '');

export const UpdateModal: React.FC<UpdateModalProps> = ({ onClose }) => {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installing, setInstalling] = useState<'idle' | 'running' | 'started'>('idle');
  const [autoCheck, setAutoCheck] = usePreference('checkForUpdates');

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    setInfo(null);
    try {
      setInfo(await checkForAppUpdate());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    // An explicit check must not reuse the possibly stale startup result.
    void check();
  }, [check]);

  const install = async () => {
    if (!info?.installer) return;
    setInstalling('running');
    setError(null);
    try {
      await api.installUpdate({ downloadUrl: info.installer.url });
      setInstalling('started');
    } catch (e: any) {
      setError(`The update could not be installed: ${e.message}`);
      setInstalling('idle');
    }
  };

  return (
    <Modal
      width="lg"
      icon={<DownloadCloud className="w-4 h-4" />}
      title="Software update"
      subtitle={`Gitter ${CURRENT_VERSION}`}
      onClose={onClose}
      footer={
        <>
          <label className="mr-auto flex items-center gap-2 text-[11px] text-slate-400">
            <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} />
            Check for updates when Gitter starts
          </label>
          <Button onClick={check} busy={checking}>
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            Check again
          </Button>
          <Button tone="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="p-5 space-y-4 text-xs text-slate-300">
        {checking && !info && <div className="py-10 text-center text-slate-400">Checking GitHub for the latest release…</div>}
        {error && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {info &&
          (info.hasUpdate ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-teal-500/10 border border-teal-500/30">
              <div>
                <div className="flex items-center gap-2 font-bold text-sm text-teal-300">
                  <Sparkles className="w-4 h-4" />
                  Gitter {info.version} is available
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">Released {new Date(info.publishedAt).toLocaleDateString()}</div>
              </div>
              {info.installer ? (
                <div className="flex items-center gap-2">
                  <Button tone="primary" onClick={install} busy={installing === 'running'} disabled={installing === 'started'}>
                    {installing === 'started' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <DownloadCloud className="w-3.5 h-3.5" />}
                    {installing === 'running' ? 'Downloading…' : installing === 'started' ? (info.installer.platform === 'macos' ? 'Disk image opened' : 'Installer started') : `${info.installer.platform === 'macos' ? 'Open disk image' : 'Install'} (${megabytes(info.installer.size)})`}
                  </Button>
                  <Button onClick={() => openInBrowser(info.installer!.url)} title="Download in your browser instead">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <Button onClick={() => openInBrowser(info.pageUrl)}>Download from GitHub</Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span className="font-semibold text-emerald-300">You have the latest version.</span>
            </div>
          ))}
        {installing === 'started' && <p className="text-slate-400">{info?.installer?.platform === 'macos' ? 'Quit Gitter, drag Gitter.app from the opened disk image to Applications, then reopen it.' : 'The installer is running. Gitter closes so it can be replaced, then starts again.'}</p>}
        {info && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">What's new in {info.title}</span>
              <button onClick={() => openInBrowser(info.pageUrl)} className="flex items-center gap-1 text-[11px] text-teal-400 hover:text-teal-300">
                Release page
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto p-3 rounded-lg bg-[#14181f] border border-[#2a3447] font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-text">
              {info.notes || 'No release notes.'}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
