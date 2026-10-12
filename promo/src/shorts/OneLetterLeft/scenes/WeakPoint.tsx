import type React from "react";
import { Audio } from "@remotion/media";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clipSfx } from "../../../kit/clip";
import { FightFrame } from "../FightFrame";
import { BARON_CLOSE, CLIP, WIDE } from "../layout";
import { BottomLine, TopLine } from "../parts";

const FROM = 352;
// Clip frame 428: the last letter of AMBIDEXTROUS has landed and the monocle pops off.
const HIT_FRAME = 428;
const HIT = HIT_FRAME - FROM;
// The game draws the Baron as a white shape for the first six frames of the hit.
const FLASH = 6;
// The last frame of his recoil. On the next one he throws a rock.
const RECOIL_END = 446;
// How long the hit is shown.
const AFTER_HIT = 36;

export const WEAK_POINT_FRAMES = HIT + AFTER_HIT;

// 112 frames. The Baron laughs and the weak-point word AMBIDEXTROUS is typed at normal speed (clip
// frames 352 to 427). Then he loses one point of health: the picture moves in, the flash of the hit
// runs at normal speed, the rest of his recoil (clip frames 434 to 446) at half speed and its last
// frame is held, so that the health pip can be seen leaving under a caption that says so.
export const WeakPoint: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const since = frame - HIT;
  const at =
    since < 0
      ? FROM + frame
      : since < FLASH
        ? HIT_FRAME + since
        : Math.min(RECOIL_END, HIT_FRAME + FLASH + Math.floor((since - FLASH) / 2));
  return (
    <>
      <FightFrame
        at={at}
        crop={since >= 0 ? BARON_CLOSE : WIDE}
        hold={30}
        top={since >= 0 ? <TopLine since={since}>ONE DOWN.</TopLine> : <TopLine since={frame}>HE LAUGHS.</TopLine>}
        bottom={frame >= 10 && since < 0 ? <BottomLine since={frame - 10}>SPELL THE WORD.</BottomLine> : null}
      />
      {/* The clip's sound as far as clip frame 445. The hit has died away by then; on the next
          frame the sound of the next rock starts, while the slowed picture is still on the recoil. */}
      <Audio
        name="Game sound: weak point"
        src={clipSfx(CLIP)}
        trimBefore={FROM}
        durationInFrames={RECOIL_END - FROM}
        volume={0.7}
        premountFor={fps}
      />
    </>
  );
};
