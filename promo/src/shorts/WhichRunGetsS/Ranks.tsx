import type React from "react";
import { Audio } from "@remotion/media";
import { useVideoConfig } from "remotion";
import { clipSfx } from "../../kit/clip";
import { Head, Line, Pop } from "./Head";
import { RUNS } from "./layout";
import { ResultsStage } from "./Stage";

// The two results screens. The game stamps the rank at frame 107 of a results clip; the clips start
// at 81 and 53, so the top stamp lands on frame 26 of the scene and the bottom one on frame 54.
// Each clip's own sound (the tally and the stamp) plays in step with it.
export const RanksScene: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <ResultsStage fastFrom={81} slowFrom={53}>
      <Audio name="Top results sound" src={clipSfx(RUNS.fast.results)} trimBefore={81} volume={0.6} premountFor={fps} />
      <Audio name="Bottom results sound" src={clipSfx(RUNS.slow.results)} trimBefore={53} volume={0.6} premountFor={fps} />
      <Head>
        <Pop at={0}>
          <Line size={48}>BOTH CLEAR STAGE 1.</Line>
          <Line size={88}>THE RANKS:</Line>
        </Pop>
      </Head>
    </ResultsStage>
  );
};
