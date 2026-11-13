import React, { useState } from 'react';
import { ExternalLink, Settings } from 'lucide-react';
import { api } from '../../api/client';
import { usePreference } from '../../preferences';
import { toast } from '../../utils/toast';
import { Button, Modal } from '../ui/Modal';

export const OpenInModal: React.FC<{ repo: string; onClose: () => void; onConfigure: () => void }> = ({ repo, onClose, onConfigure }) => {
  const [apps] = usePreference('openInApps');
  const [busy, setBusy] = useState('');
  const enabled = apps.filter((app) => app.enabled);
  return <Modal title="Open in…" subtitle={repo} onClose={onClose} icon={<ExternalLink className="w-4 h-4" />}>
    <div className="p-4 space-y-2 text-xs">
      {!enabled.length && <p className="text-slate-400">No applications are enabled.</p>}
      {enabled.map((app) => <button key={app.id} disabled={Boolean(busy)} className="w-full rounded border border-[#2a3447] px-3 py-2 text-left text-slate-200 hover:bg-[#202735] disabled:opacity-40" onClick={async () => {
        setBusy(app.id);
        try { await api.openInApplication({ repo, app }); onClose(); }
        catch (error: any) { toast.error(`Could not open ${app.name}: ${error.message}`); }
        finally { setBusy(''); }
      }}>{busy === app.id ? `Opening ${app.name}…` : app.name}</button>)}
      <Button type="button" onClick={onConfigure}><Settings className="w-3.5 h-3.5" /> Configure applications…</Button>
    </div>
  </Modal>;
};
