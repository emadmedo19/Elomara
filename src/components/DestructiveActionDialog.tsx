import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function DestructiveActionDialog({ title, busy, onClose, children }: {
  title: string; busy: boolean; onClose: () => void; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const state = useRef({ busy, onClose }); state.current = { busy, onClose };
  useEffect(() => {
    const overflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    const marker = `danger-${crypto.randomUUID()}`;
    window.history.pushState({ ...window.history.state, dangerDialog: marker }, '', window.location.href);
    const back = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      if (state.current.busy) {
        window.history.pushState({ ...window.history.state, dangerDialog: marker }, '', window.location.href);
      } else state.current.onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !state.current.busy) { event.stopImmediatePropagation(); window.history.back(); }
      if (event.key === 'Tab') {
        const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]') || []);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('popstate', back, true);
    document.addEventListener('keydown', key, true);
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      window.removeEventListener('popstate', back, true); document.removeEventListener('keydown', key, true);
      document.body.style.overflow = overflow; previousFocus?.focus();
    };
  }, []);
  return createPortal(<div dir="rtl" className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-xs">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain rounded-3xl bg-white p-5 shadow-2xl text-slate-900">
      <div className="flex items-center justify-between gap-3 mb-4"><h2 className="font-bold text-lg text-red-700">{title}</h2><button type="button" aria-label="إلغاء" disabled={busy} onClick={() => window.history.back()} className="p-2 rounded-xl bg-slate-100"><X size={20}/></button></div>
      {children}
    </div>
  </div>, document.body);
}
