import type { CharacterState, FiveVariant } from '../types';

export const HOUSE_STAGES = [
  {stage: 1, name: '아늑한 반지하 원룸', minXp: 0, nextXp: 500, firstLevel: 1, levelCount: 5},
  {stage: 2, name: '채광 좋은 오피스텔', minXp: 500, nextXp: 2000, firstLevel: 6, levelCount: 10},
  {stage: 3, name: '역세권 투룸 아파트', minXp: 2000, nextXp: 5000, firstLevel: 16, levelCount: 15},
  {stage: 4, name: '한강뷰 펜트하우스', minXp: 5000, nextXp: 10000, firstLevel: 31, levelCount: 19},
  {stage: 5, name: '정원이 있는 대저택', minXp: 10000, nextXp: null, firstLevel: 50, levelCount: null},
] as const;

/** Integer thresholds interpolate each requested house/level interval exactly. */
export function progression(totalXp: number) {
  if (!Number.isSafeInteger(totalXp) || totalXp < 0) throw new Error('누적 XP가 올바르지 않습니다.');
  const house = [...HOUSE_STAGES].reverse().find(stage => totalXp >= stage.minXp)!;
  const offset = house.nextXp === null ? Math.floor((totalXp - house.minXp) / 500)
    : Math.floor((totalXp - house.minXp) * house.levelCount / (house.nextXp - house.minXp));
  const levelStart = house.nextXp === null ? house.minXp + offset * 500
    : house.minXp + Math.ceil(offset * (house.nextXp - house.minXp) / house.levelCount);
  const nextLevelXp = house.nextXp === null ? levelStart + 500
    : house.minXp + Math.ceil((offset + 1) * (house.nextXp - house.minXp) / house.levelCount);
  return {
    level: house.firstLevel + offset, currentXp: totalXp - levelStart,
    houseStage: house.stage as FiveVariant, house, nextLevelXp, levelSpan: nextLevelXp - levelStart,
    houseProgress: house.nextXp === null ? 100 : (totalXp - house.minXp) / (house.nextXp - house.minXp) * 100,
    remainingHouseXp: house.nextXp === null ? 0 : house.nextXp - totalXp,
  };
}
export function characterAtXp(character: CharacterState, totalXp: number): CharacterState {
  const {level, currentXp, houseStage} = progression(totalXp);
  return {...character, totalXp, level, currentXp, houseStage};
}
