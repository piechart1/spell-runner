import type React from "react";
import { Audio } from "@remotion/media";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clipSfx } from "../../../kit/clip";
import { FightFrame } from "../FightFrame";
import { CLIP, TWELFTH_LETTER } from "../layout";
import { OpeningPicture } from "../OpeningPicture";
import { BottomLine, TopLine } from "../parts";
import { HOOK_FRAMES } from "./Hook";

const FROM = 2571;
// The frame on which the twelfth letter is seen and ONE LETTER LEFT comes back.
export const LAST_WORD_BACK = TWELFTH_LETTER - FROM;
// The picture that came back is held for as long as the hook held it.
export const LAST_WORD_FRAMES = LAST_WORD_BACK + HOOK_FRAMES;

// 112 frames. The finisher TYRANNOSAURUS is typed at normal speed (clip frames 2571 to 2647), then
// the opening picture again: the same five frames at half speed and the same hold. The finisher
// has no timer and nothing attacks while it is up (docs/DESIGN.md, Finisher).
export const LastWord: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      {frame < LAST_WORD_BACK ? (
        <FightFrame
          at={FROM + frame}
          top={<TopLine since={frame}>LAST WORD.</TopLine>}
          bottom={frame >= 10 ? <BottomLine since={frame - 10}>TAKE YOUR TIME.</BottomLine> : null}
        />
      ) : (
        <OpeningPicture t={frame - LAST_WORD_BACK - 1} mode="back" />
      )}
      <Audio
        name="Game sound: the last word"
        src={clipSfx(CLIP)}
        trimBefore={FROM}
        durationInFrames={LAST_WORD_BACK + 4}
        volume={0.7}
        premountFor={fps}
      />
    </>
  );
};
