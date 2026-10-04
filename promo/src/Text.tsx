import type React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { COLORS, FONT } from "./theme";

const shadow = (px: number) => `${px}px ${px}px 0 ${COLORS.ink}`;

type HeadlineProps = {
  readonly lines: readonly string[];
  readonly top?: number;
  readonly size?: number;
  readonly color?: string;
  readonly delay?: number;
};

// Large text above the gameplay band. Each line drops in, one after the other.
export const Headline: React.FC<HeadlineProps> = ({
  lines,
  top = 190,
  size = 84,
  color = COLORS.white,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 80,
        width: 920,
        fontFamily: FONT,
        fontSize: size,
        lineHeight: 1.35,
        color,
        textAlign: "center",
        textShadow: shadow(8),
      }}
    >
      {lines.map((line, i) => (
        <div
          key={line}
          style={{
            opacity: interpolate(frame, [delay + i * 6, delay + i * 6 + 6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(
              frame,
              [delay + i * 6, delay + i * 6 + 12],
              ["0px -40px", "0px 0px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              },
            ),
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
};

type TypedProps = {
  readonly lines: readonly string[];
  readonly top?: number;
  readonly size?: number;
  readonly start?: number;
  readonly perChar?: number;
};

// Text that is typed in letter by letter, the way a word plate fills in the game: typed letters
// gold, the next letter underlined in aqua, the rest white.
export const Typed: React.FC<TypedProps> = ({
  lines,
  top = 190,
  size = 84,
  start = 4,
  perChar = 2,
}) => {
  const frame = useCurrentFrame();
  const typed = Math.max(0, Math.floor((frame - start) / perChar));
  let seen = 0;
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 80,
        width: 920,
        fontFamily: FONT,
        fontSize: size,
        lineHeight: 1.35,
        textAlign: "center",
        textShadow: shadow(8),
      }}
    >
      {lines.map((line) => {
        const chars = line.split("").map((ch) => {
          const index = seen;
          if (ch !== " ") seen++;
          const done = ch !== " " && index < typed;
          const next = ch !== " " && index === typed;
          return (
            <span
              key={`${line}-${index}-${ch}`}
              style={{
                color: done ? COLORS.gold : COLORS.white,
                borderBottom: next ? `10px solid ${COLORS.aqua}` : "10px solid transparent",
              }}
            >
              {ch === " " ? " " : ch}
            </span>
          );
        });
        return <div key={line}>{chars}</div>;
      })}
    </div>
  );
};

type PlateProps = {
  readonly lines: readonly string[];
  readonly top?: number;
  readonly size?: number;
  readonly color?: string;
  readonly delay?: number;
};

// Supporting text below the band, on a dark plate with a border, like the game's word plates.
export const Plate: React.FC<PlateProps> = ({
  lines,
  top = 1330,
  size = 44,
  color = COLORS.white,
  delay = 8,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: 0,
        width: 1080,
        display: "flex",
        justifyContent: "center",
        opacity: interpolate(frame, [delay, delay + 8], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        translate: interpolate(frame, [delay, delay + 14], ["0px 50px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      <div
        style={{
          maxWidth: 920,
          padding: "28px 36px",
          backgroundColor: COLORS.ink,
          border: `8px solid ${COLORS.gold}`,
          fontFamily: FONT,
          fontSize: size,
          lineHeight: 1.5,
          color,
          textAlign: "center",
        }}
      >
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </div>
  );
};
