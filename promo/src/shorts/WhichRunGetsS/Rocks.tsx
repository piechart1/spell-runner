import type React from "react";
import { Head, Line, Pop, Question } from "./Head";
import { SKY } from "./Sky";
import { PlayStage } from "./Stage";

// The Baron's first rocks, the same moment in both runs. The 40 WPM run has a wrong key at clip
// frame 5372 (in TOPAZ), which is in the picture from frame 13 of the scene; in the 120 WPM run
// KIOSK brings up the game's 25 KEY STREAK! banner.
export const RocksScene: React.FC = () => (
  <PlayStage fastFrom={5360} slowFrom={5360} sound sky={SKY.dusk}>
    <Head>
      <Pop at={0}>
        <Line size={56}>PICK ONE:</Line>
        <Question />
      </Pop>
    </Head>
  </PlayStage>
);
