import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export default function Dialog({title, onClose, children, className = ''}: {title: string; onClose: () => void; children: ReactNode; className?: string}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => {event.preventDefault();event.stopPropagation();onClose();}} className={`modal max-h-[90dvh] overflow-y-auto ${className}`}>
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <button type="button" className="icon-button" onClick={onClose} aria-label="닫기"><X size={20}/></button>
    </div>
    {children}
  </dialog>;
}
