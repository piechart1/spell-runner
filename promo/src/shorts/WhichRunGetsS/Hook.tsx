import type React from "react";
import { useCurrentFrame } from "remotion";
import { Head, Line, Pop, Question, Versus } from "./Head";
import { SKY } from "./Sky";
import { PlayStage } from "./Stage";

type HookProps = {
  // The clip frame both bands start on. 4392 is a busy moment of SUNSET RIDGE: in the 40 WPM run a
  // boar, a crow and a mole are on screen together; in the 120 WPM run one creature at a time. The
  // game's own WPM readout in the 120 WPM picture has just changed from 107 to 115.
  readonly from: number;
  readonly sound: boolean;
};

// The opening: both runs at the same moment of the level, and the question. The 120 WPM run has a
// wrong key at clip frame 4481.5, which is in the picture from frame 90 of the scene.
// The same scene, started 12 frames earlier, is the last 12 frames of the video, so that the end
// runs into frame 0 when the video loops.
export const HookScene: React.FC<HookProps> = ({ from, sound }) => {
  const frame = useCurrentFrame();
  return (
    <PlayStage fastFrom={from} slowFrom={from} sound={sound} sky={SKY.sunset}>
      <Head>
        <Versus />
        {frame < 60 ? (
          <Question />
        ) : (
          <Pop at={60}>
            <Line size={80}>SAME LEVEL.</Line>
            <Line size={80}>HARD MODE.</Line>
          </Pop>
        )}
      </Head>
    </PlayStage>
  );
};
