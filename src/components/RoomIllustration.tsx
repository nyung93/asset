import type { AvatarConfig, CharacterExpression, CharacterImageId, FiveVariant } from '../types';
import { HOUSE_STAGES } from '../lib/progression';
import roomStage1 from '../assets/rooms/room-stage-1.png';
import roomStage2 from '../assets/rooms/room-stage-2.png';
import roomStage3 from '../assets/rooms/room-stage-3.png';
import roomStage4 from '../assets/rooms/room-stage-4.png';
import roomStage5 from '../assets/rooms/room-stage-5.png';
import CharacterAvatar from './CharacterAvatar';

const ROOMS = [
  { src: roomStage1, width: 1408, height: 768 },
  { src: roomStage2, width: 1200, height: 896 },
  { src: roomStage3, width: 1200, height: 896 },
  { src: roomStage4, width: 1200, height: 896 },
  { src: roomStage5, width: 1200, height: 896 },
] as const;

export default function RoomIllustration({ stage, avatar, expression = 'neutral', isCustomized = false, characterId }: {
  stage: FiveVariant;
  avatar: AvatarConfig;
  expression?: CharacterExpression;
  isCustomized?: boolean;
  characterId?: CharacterImageId;
}) {
  const room = ROOMS[stage - 1];

  return <div
    className="room-illustration relative w-full overflow-hidden"
    style={{ aspectRatio: `${room.width} / ${room.height}` }}
    role="img"
    aria-label={`${HOUSE_STAGES[stage - 1].name}과 나의 캐릭터`}
    data-testid="my-room"
    data-stage={stage}
  >
    <img src={room.src} alt="" className="absolute inset-0 h-full w-full object-cover" data-testid="room-background"/>
    <CharacterAvatar
      avatar={avatar}
      expression={expression}
      useDefaultArtwork={!isCustomized}
      characterId={characterId}
      className="absolute bottom-[1%] left-1/2 h-auto -translate-x-1/2 drop-shadow-[0_8px_8px_rgba(80,53,32,0.18)]"
      style={{ width: stage === 1 ? '20%' : '24%' }}
      data-testid="room-avatar"
    />
  </div>;
}
