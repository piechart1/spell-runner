import type React from "react";
import { Audio } from "@remotion/media";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clipSfx } from "../../../kit/clip";
import { COLORS } from "../../../theme";
import { FightFrame } from "../FightFrame";
import { CLIP } from "../layout";
import { BottomLine, TopLine } from "../parts";

export const PHASE_FRAMES = 45;

type PhaseProps = {
  readonly from: number;
  readonly phase: string;
  readonly what: string;
};

// A cut of a second and a half from a later phase of the fight, at normal speed.
const Phase: React.FC<PhaseProps> = ({ from, phase, what }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      <FightFrame
        at={from + frame}
        top={
          <TopLine color={COLORS.coral} since={frame}>
            {phase}
          </TopLine>
        }
        bottom={
          // ROCKS FROM ABOVE nearly fills the line: a small pop keeps it inside.
          <BottomLine since={frame} pop={1.03}>
            {what}
          </BottomLine>
        }
      />
      <Audio name="Game sound" src={clipSfx(CLIP)} trimBefore={from} volume={0.7} premountFor={fps} />
    </>
  );
};

// 45 frames (clip frames 820 to 864): the rock QUALM is thrown high and falls from above.
export const PhaseTwo: React.FC = () => <Phase from={820} phase="PHASE 2" what="ROCKS FROM ABOVE" />;

// 45 frames (clip frames 1626 to 1670): a Digby mole comes up from below with the word SQUEEZE. It
// stays under the ground, where only its dust and its word plate show, until the word is typed.
export const PhaseThree: React.FC = () => <Phase from={1626} phase="PHASE 3" what="A MOLE DIGS IN" />;
