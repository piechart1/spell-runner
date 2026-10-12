import type React from "react";
import { AbsoluteFill, Img } from "remotion";
import { clipFrame } from "../../kit/clip";
import { COLORS } from "../../theme";
import { RUNS } from "./layout";

// Still frames of the 120 WPM run with nothing but scenery in the middle of the picture.
export const SKY = { sunset: 4250, day: 2270, dusk: 5500 } as const;

// The scenery of the level behind everything, blurred and dimmed: rows 16 to 196 of a game frame
// (below the HUD, above the word plate) enlarged to the height of the video, so that no game text
// shows in it.
export const Sky: React.FC<{ readonly at: number; readonly opacity?: number }> = ({ at, opacity = 0.32 }) => (
  <AbsoluteFill style={{ backgroundColor: COLORS.ink, overflow: "hidden" }}>
    <Img
      src={clipFrame(RUNS.fast.play, at)}
      style={{
        position: "absolute",
        width: 4096,
        height: 2304,
        left: -1508,
        top: -171,
        imageRendering: "pixelated",
        opacity,
        filter: "blur(14px)",
      }}
    />
  </AbsoluteFill>
);
