import type React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { clipFrame } from "../../kit/clip";
import { type Crop, PixelFrame } from "../../kit/PixelFrame";
import { Chip, Px } from "../../kit/Type";
import { COLORS } from "../../theme";

// Where things sit in the 1080 x 1920 frame. The platforms cover the top 210 px, everything below
// 1540 and, in the lower half, the strip right of x 950: the headline starts at 212, and what is
// under the game picture stays in a column from x 40 to 950 that ends above 1540.
export const HEAD_TOP = 212;
export const BAND_TOP = 402;
export const BAND_H = 608;
export const COL_LEFT = 40;
export const COL_W = 910;
export const WORD_TOP = 1028;
// The word plate ends at 1200 and the keyboard starts at 1284: the bar (68 px) sits 8 px from each,
// which also keeps it clear of the plate on the frames the plate jumps.
export const BAR_TOP = 1208;
export const KEYS_TOP = 1284;
export const KEYS_W = 800;

// Loudness: the music bed, the clip's own sound effects, and a single sound that marks a new beat.
// The key sounds in the clips are quiet next to the chime of a cleared word (0.17 against 0.87 of
// full scale), so the bed is kept low and the effects high; the loudest moment stays under full scale.
export const MUSIC = 0.28;
export const SFX = 0.85;
export const CUE = 0.45;

type LineProps = {
  readonly children: React.ReactNode;
  readonly size: number;
  readonly color?: string;
  // The scale the line arrives at on the first frame of the sequence it is in, before it settles
  // at 1. A line of 960 px may take 1.04 and stay 40 px inside the frame; a shorter one more.
  readonly pop?: number;
};

// One line of the headline.
export const Line: React.FC<LineProps> = ({ children, size, color = COLORS.white, pop = 1 }) => {
  const frame = useCurrentFrame();
  return (
    <Px
      size={size}
      color={color}
      shadow={Math.round(size / 11)}
      style={{
        lineHeight: 1.16,
        scale: interpolate(frame, [0, 6], [pop, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }),
      }}
    >
      {children}
    </Px>
  );
};

// The headline: lines above the game picture.
export const Headline: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: "absolute", top: HEAD_TOP, left: 0, width: 1080 }}>{children}</div>
);

type BandProps = {
  readonly clip: string;
  // The clip frame to show.
  readonly at: number;
  // The part of the game picture to show, in game pixels. It should be 16 wide to 9 high.
  readonly crop?: Crop;
  readonly children?: React.ReactNode;
};

// The game picture across the full width, with anything that is drawn over it.
export const Band: React.FC<BandProps> = ({ clip, at, crop, children }) => (
  <div
    style={{
      position: "absolute",
      top: BAND_TOP,
      left: 0,
      width: 1080,
      height: BAND_H,
      overflow: "hidden",
      backgroundColor: COLORS.ink,
      outline: `6px solid ${COLORS.ink}`,
    }}
  >
    <PixelFrame src={clipFrame(clip, at)} crop={crop} width={1080} style={{ position: "absolute", left: 0, bottom: 0 }} />
    {children}
  </div>
);

// The small label on the game picture, under the game's own score line. Short lines keep it left of
// the word of a creature that comes from above.
export const Tag: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
  <Chip size={26} style={{ position: "absolute", top: 66, left: 40, lineHeight: 1.35 }}>
    {children}
  </Chip>
);
