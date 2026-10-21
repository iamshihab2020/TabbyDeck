import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** Accessible dialog: focus moves in and is trapped, Escape closes, focus returns on close. */
export function Modal({ title, onClose, children, width = 440 }: { title: string; onClose(): void; children: ComponentChildren; width?: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = box.current!;
    const focusables = () => [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(x => !x.hasAttribute('disabled'));
    (focusables()[0] ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Tab') {
        const f = focusables(); if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    el.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div class="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={box} style={{ width: `${width}px` }}>
        <h2 class="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
