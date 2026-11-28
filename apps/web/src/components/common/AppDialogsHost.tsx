import React, { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { Toast } from './Notice';
import { PendingConfirm, setDialogHost } from './appDialogs';

/** Shows askConfirm() questions and notify() toasts. Mounted once at the app root. */
export const AppDialogs: React.FC = () => {
  const [queue, setQueue] = useState<PendingConfirm[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const unregister = setDialogHost({
      ask: (p) => setQueue((q) => [...q, p]),
      say: (text) => {
        clearTimeout(timer.current);
        setToast(text);
        timer.current = setTimeout(() => setToast((now) => (now === text ? null : now)), Math.min(7000, Math.max(3000, text.length * 60)));
      },
    });
    return () => {
      unregister();
      clearTimeout(timer.current);
    };
  }, []);

  const current = queue[0];
  return (
    <>
      {current && (
        <ConfirmDialog
          {...current.options}
          onAnswer={(yes) => {
            current.resolve(yes);
            setQueue((q) => q.slice(1));
          }}
        />
      )}
      <Toast text={toast} />
    </>
  );
};
