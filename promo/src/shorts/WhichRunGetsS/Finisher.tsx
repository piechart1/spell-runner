import type React from "react";
import { Head, Line } from "./Head";
import { SKY } from "./Sky";
import { PlayStage } from "./Stage";

// The last word, EXTRAORDINARY. Each band is cut so that its last letter lands on frame 38 of the
// scene: clip frame 7422 of the 120 WPM run and 8486 of the 40 WPM run. The 120 WPM run has a wrong
// key at clip frame 7393.5, which is in the picture from frame 10 of the scene.
export const FinisherScene: React.FC = () => (
  <PlayStage fastFrom={7384} slowFrom={8448} sound sky={SKY.dusk}>
    <Head>
      <Line size={80}>SO WHAT</Line>
      <Line size={80}>DECIDES IT?</Line>
    </Head>
  </PlayStage>
);
