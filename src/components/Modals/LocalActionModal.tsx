import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import type { LocalAction } from '../../../shared/types/localAction';
import { api } from '../../api/client';
import { Button, Modal } from '../ui/Modal';

type Preview = Awaited<ReturnType<typeof api.previewLocalAction>>;
type Result = Awaited<ReturnType<typeof api.localActionStatus>>;

export const LocalActionModal: React.FC<{ repo: string; action: LocalAction; branch: string; file?: string; onClose: () => void }> = ({ repo, action, branch, file, onClose }) => {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [id, setId] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    api.previewLocalAction({ repo, action, branch, file }).then((value) => { if (active) setPreview(value); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [repo, action, branch, file]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const value = await api.localActionStatus({ id });
        if (!active) return;
        setResult(value);
        if (value.state === 'running') timer = setTimeout(poll, 500);
      } catch (e: any) { if (active) setError(e.message); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [id]);
  const running = Boolean(id && (!result || result.state === 'running'));
  const run = async () => {
    setBusy(true); setError(''); setResult(null); setId('');
    try { const started = await api.startLocalAction({ repo, action, branch, file }); if (active.current) setId(started.id); else void api.cancelLocalAction({ id: started.id }).catch(() => undefined); }
    catch (e: any) { if (active.current) setError(e.message); }
    finally { if (active.current) setBusy(false); }
  };
  const cancel = async () => { try { if (id) await api.cancelLocalAction({ id }); } catch (e: any) { setError(e.message); } };
  const close = () => { if (running) void cancel(); onClose(); };
  return <Modal width="lg" tall icon={<Terminal className="w-4 h-4" />} title={action.name} subtitle="Local action" onClose={close}>
    <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3 text-xs text-slate-300">
      <p>Review the executable, arguments, and working directory before running. Closing this window requests cancellation of a running action.</p>
      {preview && <div className="space-y-2 rounded border border-[#2a3447] p-3"><div><span className="text-slate-500">Executable: </span><code className="break-all">{preview.executable}</code></div><div><span className="text-slate-500">Working directory: </span><code className="break-all">{preview.cwd}</code></div><div><span className="text-slate-500">Arguments:</span>{preview.args.length ? <ol className="list-decimal ml-5">{preview.args.map((arg, index) => <li key={index}><code className="break-all">{JSON.stringify(arg)}</code></li>)}</ol> : ' none'}</div></div>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      <div className="flex gap-2"><Button type="button" tone="primary" disabled={!preview || running} busy={busy} onClick={() => void run()}>Run action</Button>{running && <Button type="button" onClick={() => void cancel()}>Cancel action</Button>}</div>
      {result && <div className="space-y-2"><p aria-live="polite" className="font-semibold">{result.state.replace('_', ' ')}{result.exitCode !== null ? ` · exit ${result.exitCode}` : ''}{result.truncated ? ' · output truncated' : ''}</p><p className="text-slate-500">Cancellation targets the launched process; any child processes may continue.</p>{(['stdout', 'stderr'] as const).map((field) => result[field] && <div key={field}><div className="text-slate-500 uppercase text-[10px]">{field}</div><pre className="mt-1 p-2 rounded bg-[#14181f] whitespace-pre-wrap break-words select-text">{result[field]}</pre></div>)}</div>}
    </div>
  </Modal>;
};
