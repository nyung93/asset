import { CircleSlash } from 'lucide-react';
import type { AvatarReference } from '../data/avatarReferences';

export default function AvatarReferencePreview({reference, className = '', decorative = false}: {
  reference: AvatarReference; className?: string; decorative?: boolean;
}) {
  return <div className={`flex items-center justify-center overflow-hidden rounded-xl ${className}`} data-reference-id={reference.id}>
    {reference.src
      ? <img src={reference.src} width={reference.width} height={reference.height}
          alt={decorative ? '' : reference.label} draggable={false}
          className="block h-full w-full object-contain p-2"/>
      : <span className="flex flex-col items-center gap-2 text-stone-400" aria-hidden={decorative || undefined}>
          <CircleSlash size={28}/><span className="text-xs">선택 안 함</span>
        </span>}
  </div>;
}
