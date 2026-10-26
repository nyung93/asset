import {useId, type SVGProps} from 'react';
import type {AvatarConfig, CharacterExpression} from '../types';
import {AVATAR_LAYERS} from '../data/avatarLayers';
import {displayedExpression, resolveAvatar} from '../lib/avatar';

function Sprite({id, part, variant}: {id:string;part:string;variant?:string|number}) {
  const {src,target:[x,y,width,height]} = AVATAR_LAYERS[id];
  return <image href={src} x={x} y={y} width={width} height={height} preserveAspectRatio="none"
    data-part={part} data-variant={variant} data-layer-id={id}/>;
}

/** Shared, transparent doll assembly. Every visible selection uses its own alpha sprite. */
export default function CharacterAvatar({avatar, expression, portrait = false, className, ...props}: {
  avatar:AvatarConfig; expression?:CharacterExpression; portrait?:boolean; className?:string;
} & SVGProps<SVGSVGElement>) {
  const uid=useId();
  const config=resolveAvatar(avatar);
  const mood=displayedExpression(config,expression);
  const body=AVATAR_LAYERS.body;
  return <svg viewBox={portrait ? '35 5 335 295' : '0 0 400 600'} preserveAspectRatio="xMidYMid meet"
    className={className} role="img" aria-labelledby={`${uid}-title`} data-expression={mood}
    data-avatar-config={`${config.hair}:${config.outfit}:${mood}:${config.headAccessory}:${config.handAccessory}`} {...props}>
    <title id={`${uid}-title`}>나의 커스텀 캐릭터</title>
    <defs>
      {/* Bring only the palm in front of held props, never the entire baked body. */}
      <clipPath id={`${uid}-palm`}><ellipse cx="94" cy="397" rx="17" ry="16"/></clipPath>
    </defs>
    {config.outfit===5 && <Sprite id="hood-5" part="hood" variant={5}/>}
    <Sprite id="body" part="body"/>
    <Sprite id={`outfit-${config.outfit}`} part="outfit" variant={config.outfit}/>
    <Sprite id={`shoes-${config.outfit}`} part="shoes" variant={config.outfit}/>
    <Sprite id={`expression-${mood}`} part="expression" variant={mood}/>
    <Sprite id={`hair-${config.hair}`} part="hair" variant={config.hair}/>
    {config.headAccessory>0 && <Sprite id={`accessory-${config.headAccessory}`} part="headAccessory" variant={config.headAccessory}/>}
    {config.handAccessory>0 && <>
      <Sprite id={`accessory-${config.handAccessory}`} part="handAccessory" variant={config.handAccessory}/>
      <image href={body.src} x={body.target[0]} y={body.target[1]} width={body.target[2]} height={body.target[3]} preserveAspectRatio="none" clipPath={`url(#${uid}-palm)`} aria-hidden="true"/>
    </>}
  </svg>;
}
