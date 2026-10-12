import type React from "react";
import { AbsoluteFill, Img } from "remotion";
import { COLORS } from "../theme";

// The rows of the game picture between the HUD at the top and the ground and type bar at the bottom.
const FIRST_ROW = 23;
const ROWS = 145;
const SCALE = 1920 / ROWS;

// An enlarged, blurred and dimmed copy of a game frame behind everything else, so that the area
// around the game picture carries the colours of the scene. Only the scenery is used: the HUD and
// the word plates would stay readable through the blur.
export const Backdrop: React.FC<{ readonly src: string; readonly opacity?: number }> = ({ src, opacity = 0.3 }) => (
  <AbsoluteFill style={{ backgroundColor: COLORS.ink, overflow: "hidden" }}>
    <Img
      src={src}
      style={{
        position: "absolute",
        width: 384 * SCALE,
        height: 216 * SCALE,
        left: (1080 - 384 * SCALE) / 2,
        top: -FIRST_ROW * SCALE,
        imageRendering: "pixelated",
        opacity,
        filter: "blur(14px)",
      }}
    />
  </AbsoluteFill>
);
