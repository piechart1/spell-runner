import type React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { clipSfx } from "../../kit/clip";
import type { Crop } from "../../kit/PixelFrame";
import { RESULTS_LAST, RUNS } from "./layout";
import { RunBand } from "./RunBand";
import { SKY, Sky } from "./Sky";

type PlayStageProps = {
  // The clip frame each band shows at the first frame of the scene. Both then run at normal speed.
  readonly fastFrom: number;
  readonly slowFrom: number;
  readonly sound: boolean;
  // The still frame behind everything (see SKY).
  readonly sky: number;
  // The headline.
  readonly children: React.ReactNode;
};

// Both runs in play, one above the other, with the game's own sound effects in step: the top
// band's at full level and the bottom band's quietly under it.
export const PlayStage: React.FC<PlayStageProps> = ({ fastFrom, slowFrom, sound, sky, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sky at={sky} />
      {sound ? (
        <>
          <Audio name="Top band effects" src={clipSfx(RUNS.fast.play)} trimBefore={fastFrom} volume={0.6} premountFor={fps} />
          <Audio name="Bottom band effects" src={clipSfx(RUNS.slow.play)} trimBefore={slowFrom} volume={0.2} premountFor={fps} />
        </>
      ) : null}
      <RunBand run="fast" screen="play" at={fastFrom + frame} />
      <RunBand run="slow" screen="play" at={slowFrom + frame} />
      {children}
    </AbsoluteFill>
  );
};

type Stat = { readonly tag: string; readonly value: string } | null;

type ResultsStageProps = {
  // The frame of each results clip at the first frame of the scene.
  readonly fastFrom: number;
  readonly slowFrom: number;
  readonly crop?: Crop;
  readonly fastStat?: Stat;
  readonly slowStat?: Stat;
  readonly row?: number | null;
  readonly rowOpacity?: number;
  readonly dimLabels?: boolean;
  // The column tags say what accuracy each bot was set to.
  readonly setTags?: boolean;
  readonly children: React.ReactNode;
};

// The two results screens, one above the other. A results clip is 270 frames long and its screen
// is still at the end, so a band that runs past the end holds the last frame.
export const ResultsStage: React.FC<ResultsStageProps> = ({
  fastFrom,
  slowFrom,
  crop,
  fastStat = null,
  slowStat = null,
  row = null,
  rowOpacity = 1,
  dimLabels = false,
  setTags = false,
  children,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Sky at={SKY.dusk} opacity={0.24} />
      <RunBand
        run="fast"
        screen="results"
        at={Math.min(RESULTS_LAST, fastFrom + frame)}
        crop={crop}
        stat={fastStat}
        row={row}
        rowOpacity={rowOpacity}
        dimLabel={dimLabels}
        setTag={setTags}
      />
      <RunBand
        run="slow"
        screen="results"
        at={Math.min(RESULTS_LAST, slowFrom + frame)}
        crop={crop}
        stat={slowStat}
        row={row}
        rowOpacity={rowOpacity}
        dimLabel={dimLabels}
        setTag={setTags}
      />
      {children}
    </AbsoluteFill>
  );
};
