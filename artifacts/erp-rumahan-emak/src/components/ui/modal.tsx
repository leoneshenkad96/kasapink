import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, dirty, busy = false, size = 'default' }: {
  title: string; onClose: () => void; children: ReactNode; dirty?: boolean; busy?: boolean; size?: 'default' | 'wide';
}) {
  const [changed, setChanged] = useState(false);
  const titleId = useId();
  const opener = useRef<HTMLElement | null>(document.activeElement as HTMLElement);
  const changedRef = useRef(false);
  changedRef.current = dirty ?? changed;
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (changedRef.current || busy) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [busy]);
  const allowClose = () => !busy && (dirty !== undefined || !changed || window.confirm('Perubahan belum disimpan. Tetap keluar?'));
  const close = () => { if (allowClose()) onClose(); };
  return <Dialog.Root open onOpenChange={(open) => { if (!open) close(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="modal-backdrop">
        <Dialog.Content className={`modal ${size === 'wide' ? 'modal-wide' : ''}`} aria-labelledby={titleId} aria-describedby={undefined}
          onCloseAutoFocus={(event) => { event.preventDefault(); if (opener.current?.isConnected) opener.current.focus(); }}
          onChangeCapture={() => setChanged(true)}
          onClickCapture={(event) => {
            const button = (event.target as HTMLElement).closest('button');
            if (dirty === undefined && button?.type === 'button' && /^(Batal|Tutup)$/.test(button.textContent?.trim() ?? '') && !allowClose()) {
              event.preventDefault(); event.stopPropagation();
            }
          }}>
          <div className="modal-head">
            <div><span className="eyebrow">FORM DATA</span><Dialog.Title id={titleId}>{title}</Dialog.Title></div>
            <button type="button" className="icon-button" disabled={busy} onClick={close} aria-label="Tutup"><X size={19} /></button>
          </div>
          <div className="modal-body">{children}</div>
        </Dialog.Content>
      </Dialog.Overlay>
    </Dialog.Portal>
  </Dialog.Root>;
}
