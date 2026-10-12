import type React from "react";
import { Audio } from "@remotion/media";
import { interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Px } from "../../../kit/Type";
import { COLORS } from "../../../theme";
import { FightFrame } from "../FightFrame";
import { MOUND_CLOSE } from "../layout";
import { TopLine } from "../parts";
import { REWIND_TO } from "./Rewind";

export const MEET_FRAMES = 54;
// The frame on which SPELLING lands: the Baron's face is just above his mound.
const SPELLING_AT = 18;

// 54 frames. The start of the fight at normal speed (clip frames 40 to 93): the Baron comes out of
// his mound. The window is close on the mound, under the rows where the game shows its own
// CHECKPOINT banner, so the only words in the picture are the video's two.
export const MeetTheBaron: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      <FightFrame
        at={REWIND_TO + frame}
        crop={MOUND_CLOSE}
        tiles={null}
        top={<TopLine since={frame}>ONE WEAKNESS</TopLine>}
        bottom={
          frame >= SPELLING_AT ? (
            <Px
              size={112}
              color={COLORS.gold}
              shadow={12}
              style={{
                marginTop: 16,
                whiteSpace: "nowrap",
                // The word is nearly as wide as the line allows, so it lands with a small pop.
                scale: interpolate(frame, [SPELLING_AT, SPELLING_AT + 4], [1.03, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              SPELLING
            </Px>
          ) : null
        }
      />
      <Audio name="The Baron laughs" from={6} src={staticFile("audio/one_boss_laugh.wav")} volume={0.7} premountFor={fps} />
      <Audio name="Stamp: SPELLING" from={SPELLING_AT} src={staticFile("audio/one_stamp.wav")} volume={0.7} premountFor={fps} />
    </>
  );
};
