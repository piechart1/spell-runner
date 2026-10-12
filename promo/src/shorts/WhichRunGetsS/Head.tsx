import type React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { Px } from "../../kit/Type";
import { COLORS } from "../../theme";
import { CLAMP, HEAD, RUNS } from "./layout";

// The block of headline text above the two runs. Its lines are centred in it.
export const Head: React.FC<{ readonly children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: "absolute",
      left: HEAD.left,
      top: HEAD.top,
      width: HEAD.width,
      height: HEAD.height,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    }}
  >
    {children}
  </div>
);

type LineProps = {
  readonly children: React.ReactNode;
  readonly size: number;
  readonly color?: string;
};

// One line of headline text. Press Start 2P is as wide as it is high: 1000 / size letters fit.
export const Line: React.FC<LineProps> = ({ children, size, color = COLORS.white }) => (
  <Px size={size} color={color} shadow={Math.round(size / 10)} style={{ lineHeight: 1.16, whiteSpace: "nowrap" }}>
    {children}
  </Px>
);

// Lines that arrive together with a small pop, at frame `at` of the scene.
// The padding (taken back by the margin) and the all but clear background make the browser draw the
// whole block afresh on every frame. Without them, a render with several tabs sometimes kept a
// one-pixel row and column of the caption before on screen.
export const Pop: React.FC<{ readonly at: number; readonly children: React.ReactNode }> = ({ at, children }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        padding: 8,
        margin: -8,
        backgroundColor: "rgba(15, 15, 27, 0.01)",
        opacity: interpolate(frame, [at - 1, at + 1], [0, 1], CLAMP),
        scale: interpolate(frame, [at, at + 7], [0.84, 1], {
          ...CLAMP,
          easing: Easing.out(Easing.back(1.8)),
        }),
      }}
    >
      {children}
    </div>
  );
};

// "120 WPM VS 40 WPM" in the colours of the two runs.
export const Versus: React.FC = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
    <Line size={56} color={RUNS.fast.colour}>
      {RUNS.fast.label}
    </Line>
    <Line size={40}>VS</Line>
    <Line size={56} color={RUNS.slow.colour}>
      {RUNS.slow.label}
    </Line>
  </div>
);

// The question of the video.
export const Question: React.FC = () => (
  <>
    <Line size={80}>WHICH RUN</Line>
    <Line size={80}>
      GETS RANK <span style={{ color: COLORS.gold }}>S</span>?
    </Line>
  </>
);
