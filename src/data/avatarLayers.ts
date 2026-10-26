import manifest from './avatar-layers.json';
const urls = import.meta.glob<string>('../assets/avatar/layers/sprites/*.png', {eager:true, query:'?url', import:'default'});
export interface AvatarLayer {id:string; src:string; width:number; height:number; target:number[]}
export const AVATAR_LAYERS: Record<string, AvatarLayer> = Object.fromEntries(manifest.map(item => {
  const src = urls[`../assets/avatar/layers/sprites/${item.id}.png`];
  if (!src) throw new Error(`Missing avatar layer ${item.id}`);
  return [item.id, {id:item.id,src,width:item.rect[2],height:item.rect[3],target:item.target}];
}));
