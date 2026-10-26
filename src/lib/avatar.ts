import type {AvatarConfig, CharacterExpression, FiveVariant} from '../types';

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  hair:1, eyes:1, face:1, skin:1, top:1, bottom:1, shoes:1,
  outfit:1, accessory:3, headAccessory:3, handAccessory:0, faceExpression:'neutral',
};
export type ResolvedAvatar = AvatarConfig & Required<Pick<AvatarConfig,'outfit'|'headAccessory'|'handAccessory'|'faceExpression'>>;
const expressions: CharacterExpression[] = ['neutral','happy','crying','sad','frowning','stoic'];
function variant(value: unknown, fallback: FiveVariant): FiveVariant {
  return Number.isInteger(value) && Number(value)>=1 && Number(value)<=5 ? value as FiveVariant : fallback;
}
/** Adapt the old single accessory slot without clearing ledger data or losing its selection. */
export function resolveAvatar(avatar: AvatarConfig): ResolvedAvatar {
  const legacy = avatar.accessory ?? 0;
  const head = avatar.headAccessory ?? ([1,3].includes(legacy) ? legacy : 0);
  const hand = avatar.handAccessory ?? ([2,4,5].includes(legacy) ? legacy : 0);
  return {
    ...DEFAULT_AVATAR_CONFIG, ...avatar,
    hair:variant(avatar.hair,1), outfit:variant(avatar.outfit ?? avatar.top,1),
    headAccessory:([0,1,3].includes(head) ? head : 0) as 0|1|3,
    handAccessory:([0,2,4,5].includes(hand) ? hand : 0) as 0|2|4|5,
    faceExpression: expressions.includes(avatar.faceExpression!) ? avatar.faceExpression! : 'neutral',
  };
}

export function displayedExpression(avatar: AvatarConfig, reaction?: CharacterExpression): CharacterExpression {
  // Saved resting expression remains visible; milestones/overspending can react temporarily.
  const selected = resolveAvatar(avatar).faceExpression;
  const value = reaction && reaction !== 'neutral' && reaction !== 'stoic' ? reaction : selected;
  return value === 'stoic' ? 'neutral' : value;
}
