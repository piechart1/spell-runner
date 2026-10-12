import type React from "react";
import { COLORS, FONT } from "../theme";

type TimerBarProps = {
  // The part of the time that is left, from 1 (full) to 0 (out).
  readonly left: number;
  readonly width: number;
  readonly height?: number;
  // Text at the right-hand end, for example "2.4".
  readonly label?: string;
  readonly style?: React.CSSProperties;
};

// A countdown bar. It is aqua, and coral for the last third.
export const TimerBar: React.FC<TimerBarProps> = ({ left, width, height = 44, label, style }) => {
  const v = Math.max(0, Math.min(1, left));
  const labelW = label ? Math.round(height * 3.4) : 0;
  const barW = width - labelW;
  return (
    <div style={{ display: "flex", alignItems: "center", width, height, ...style }}>
      <div style={{ width: barW, height, boxSizing: "border-box", border: `6px solid ${COLORS.white}`, backgroundColor: COLORS.ink }}>
        <div style={{ width: `${v * 100}%`, height: "100%", backgroundColor: v < 1 / 3 ? COLORS.coral : COLORS.aqua }} />
      </div>
      {label ? (
        <div style={{ width: labelW, textAlign: "right", fontFamily: FONT, fontSize: Math.round(height * 0.8), color: v < 1 / 3 ? COLORS.coral : COLORS.white }}>
          {label}
        </div>
      ) : null}
    </div>
  );
};
