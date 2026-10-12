import type React from "react";
import { useCurrentFrame } from "remotion";
import { Head, Line, Pop } from "./Head";
import { SKY } from "./Sky";
import { PlayStage } from "./Stage";

// The Baron's first weak-point word, RESILIENT, in each run. After the Baron arrives the two fights
// go at different speeds, so each band is cut on its own events: the 120 WPM run's word opens at
// clip frame 5523 and lands at 5552 (frame 36 here); the 40 WPM run's lands at 5641 (frame 55).
export const WeakPointScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <PlayStage fastFrom={5516} slowFrom={5586} sound sky={SKY.dusk}>
      <Head>
        {frame < 48 ? (
          <Pop at={0}>
            <Line size={72}>NEITHER RUN</Line>
            <Line size={72}>LOSES A LIFE.</Line>
          </Pop>
        ) : (
          <Pop at={48}>
            <Line size={80}>SO WHAT</Line>
            <Line size={80}>DECIDES IT?</Line>
          </Pop>
        )}
      </Head>
    </PlayStage>
  );
};
