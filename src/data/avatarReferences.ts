import type {AvatarConfig} from '../types';
import {AVATAR_LAYERS} from './avatarLayers';
import {resolveAvatar} from '../lib/avatar';
export {DEFAULT_AVATAR_CONFIG} from '../lib/avatar';

export type AvatarPart = 'hair' | 'outfit' | 'faceExpression' | 'headAccessory' | 'handAccessory';
export type ReferenceValue = string | number;
export const AVATAR_PARTS: {key:AvatarPart;label:string}[] = [
  {key:'hair',label:'헤어'}, {key:'outfit',label:'의상'}, {key:'faceExpression',label:'표정'},
  {key:'headAccessory',label:'머리 장식'}, {key:'handAccessory',label:'손 소품'},
];
export interface AvatarReference {id:string;part:AvatarPart;value:ReferenceValue;label:string;src?:string;width:number;height:number}
const categories: {part:AvatarPart;prefix:string;values:ReferenceValue[];labels:string[]}[] = [
  {part:'hair',prefix:'hair',values:[1,2,3,4,5],labels:['긴 생머리','단발머리','긴 웨이브','올림머리','포니테일']},
  {part:'outfit',prefix:'outfit',values:[1,2,3,4,5],labels:['오버롤','핑크 후드','곰돌이 스웨터','세일러복','오리 우비']},
  {part:'faceExpression',prefix:'expression',values:['neutral','happy','crying','sad','frowning'],labels:['기본','활짝 웃음','엉엉 울음','슬픔','화남']},
  {part:'headAccessory',prefix:'accessory',values:[0,1,3],labels:['없음','민트 비니','리본 머리띠']},
  {part:'handAccessory',prefix:'accessory',values:[0,2,4,5],labels:['없음','돼지저금통','돈다발','포크']},
];
export const AVATAR_REFERENCES: AvatarReference[] = categories.flatMap(({part,prefix,values,labels}) => values.map((value,index) => {
  const id = value === 0 ? `${part}-none` : `${prefix}-${value}`;
  const layer = AVATAR_LAYERS[id];
  return {id,part,value,label:labels[index],src:layer?.src,width:layer?.width ?? 1,height:layer?.height ?? 1};
}));
export function referenceOptions(part: AvatarPart): AvatarReference[] {return AVATAR_REFERENCES.filter(item=>item.part===part);}
export function selectedReference(avatar: AvatarConfig, part: AvatarPart): AvatarReference {
  const value = resolveAvatar(avatar)[part];
  const options = referenceOptions(part);
  return options.find(item=>item.value===value) ?? options[0];
}
