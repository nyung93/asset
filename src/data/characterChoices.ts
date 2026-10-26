import type {CharacterImageId} from '../types';
import defaultImage from '../assets/avatar/main-character.png';
import saverImage from '../assets/avatar/character-saver.png';
import cryingImage from '../assets/avatar/character-crying.png';
import duckImage from '../assets/avatar/character-duck.png';
import pinkImage from '../assets/avatar/character-pink.png';

export interface CharacterChoice {id:CharacterImageId;label:string;description:string;src:string}

export const CHARACTER_CHOICES: CharacterChoice[] = [
  {id:'default',label:'리본 할미',description:'차근차근 시작하는 기본 캐릭터',src:defaultImage},
  {id:'saver',label:'저축 지킴이',description:'돼지저금통을 꼭 안고 있어요',src:saverImage},
  {id:'crying',label:'눈물의 절약왕',description:'다시 모으면 된다고 다짐해요',src:cryingImage},
  {id:'duck',label:'오리 후드',description:'지출을 꼼꼼히 살펴봐요',src:duckImage},
  {id:'pink',label:'핑크 스마일',description:'오늘의 작은 성공을 응원해요',src:pinkImage},
];

export const characterChoice = (id:CharacterImageId) => CHARACTER_CHOICES.find(choice=>choice.id===id);
