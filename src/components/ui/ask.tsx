// In-app replacements for window.confirm and window.prompt, which the macOS
// webview does not implement. `ask.confirm(...)` and `ask.text(...)` resolve
// when the user answers; <AskHost /> renders the open question.
import React, { useEffect, useState } from 'react';
import { Button, Field, inputClass, Modal } from './Modal';

interface ConfirmQuestion {
  kind: 'confirm';
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  resolve: (answer: boolean) => void;
}

interface TextQuestion {
  kind: 'text';
  title: string;
  label: string;
  initial?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** An error message for an unacceptable answer, or null. */
  validate?: (value: string) => string | null;
  resolve: (answer: string | null) => void;
}

type Question = ConfirmQuestion | TextQuestion;

let current: Question | null = null;
const listeners = new Set<(q: Question | null) => void>();
const show = (q: Question | null) => {
  current = q;
  listeners.forEach((l) => l(q));
};

export const ask = {
  confirm: (options: Omit<ConfirmQuestion, 'kind' | 'resolve'>) =>
    new Promise<boolean>((resolve) => show({ ...options, kind: 'confirm', resolve })),
  /** Resolves to the trimmed answer, or null when cancelled. */
  text: (options: Omit<TextQuestion, 'kind' | 'resolve'>) =>
    new Promise<string | null>((resolve) => show({ ...options, kind: 'text', resolve })),
};

export const AskHost: React.FC = () => {
  const [question, setQuestion] = useState<Question | null>(current);
  useEffect(() => {
    listeners.add(setQuestion);
    return () => void listeners.delete(setQuestion);
  }, []);
  if (!question) return null;
  return question.kind === 'confirm' ? <ConfirmDialog q={question} /> : <TextDialog q={question} />;
};

const ConfirmDialog: React.FC<{ q: ConfirmQuestion }> = ({ q }) => {
  const answer = (value: boolean) => {
    show(null);
    q.resolve(value);
  };
  return (
    <Modal
      title={q.title}
      width="sm"
      onClose={() => answer(false)}
      footer={
        <>
          {/* A dangerous confirmation starts on Cancel, so a stray Enter does not confirm it. */}
          <Button tone="quiet" autoFocus={q.danger} onClick={() => answer(false)}>
            Cancel
          </Button>
          <Button tone={q.danger ? 'danger' : 'primary'} autoFocus={!q.danger} onClick={() => answer(true)}>
            {q.confirmLabel ?? 'OK'}
          </Button>
        </>
      }
    >
      <div className="px-4 py-4 text-xs text-slate-300 leading-relaxed whitespace-pre-line">{q.message}</div>
    </Modal>
  );
};

const TextDialog: React.FC<{ q: TextQuestion }> = ({ q }) => {
  const [value, setValue] = useState(q.initial ?? '');
  const error = value.trim() ? q.validate?.(value.trim()) ?? null : null;
  const answer = (result: string | null) => {
    show(null);
    q.resolve(result);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !error) answer(value.trim());
  };
  return (
    <Modal title={q.title} width="sm" onClose={() => answer(null)}>
      <form onSubmit={submit} className="px-4 py-4 space-y-4">
        <Field label={q.label} hint={error && <span className="text-rose-300">{error}</span>}>
          <input autoFocus value={value} placeholder={q.placeholder} onChange={(e) => setValue(e.target.value)} className={`${inputClass} font-mono`} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" tone="quiet" onClick={() => answer(null)}>
            Cancel
          </Button>
          <Button type="submit" tone="primary" disabled={!value.trim() || Boolean(error)}>
            {q.confirmLabel ?? 'OK'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
