import type React from "react";
import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { CLIPS, COLORS, type ClipName } from "./theme";

const GAME_W = 384;
const GAME_H = 216;
// The frames are stored at 3x (1152 x 648) and shown at the full width of the video, so the whole
// game screen is visible and every game pixel is scaled down evenly.
const BAND_W = 1080;
const BAND_H = Math.round((BAND_W * GAME_H) / GAME_W); // 608
const BAND_TOP = 600;

const frameFile = (clip: ClipName, index: number) =>
  staticFile(`frames/${clip}/f-${String(index).padStart(2, "0")}.png`);

type StageProps = {
  // Either a gameplay clip (an image sequence) or one still picture.
  readonly clip?: ClipName;
  readonly offset?: number;
  readonly still?: string;
  readonly sfx?: boolean;
  readonly children?: React.ReactNode;
};

// The gameplay band in the middle of the vertical frame, over an enlarged, dimmed copy of the
// same picture, with room above and below for text.
export const Stage: React.FC<StageProps> = ({ clip, offset = 0, still, sfx = true, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const src = clip
    ? frameFile(clip, Math.max(0, Math.min(CLIPS[clip] - 1, offset + frame)))
    : staticFile(still ?? "ui/title.png");

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Img
        src={src}
        style={{
          position: "absolute",
          width: GAME_W * 9,
          height: GAME_H * 9,
          left: (1080 - GAME_W * 9) / 2,
          top: (1920 - GAME_H * 9) / 2,
          imageRendering: "pixelated",
          opacity: 0.3,
          filter: "blur(10px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: BAND_TOP - 8,
          left: 0,
          width: 1080,
          height: BAND_H + 16,
          backgroundColor: COLORS.gold,
          scale: interpolate(frame, [0, 14], [1.08, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 0,
            width: 1080,
            height: BAND_H,
            overflow: "hidden",
            backgroundColor: COLORS.ink,
          }}
        >
          <Img
            src={src}
            style={{
              position: "absolute",
              width: BAND_W,
              height: BAND_H,
              left: 0,
              top: 0,
            }}
          />
        </div>
      </div>
      {clip && sfx ? (
        <Audio
          src={staticFile(`audio/sfx_${clip}.wav`)}
          trimBefore={offset}
          premountFor={fps}
          volume={0.62}
        />
      ) : null}
      {children}
    </AbsoluteFill>
  );
};
