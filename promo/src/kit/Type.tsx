import type React from "react";
import { COLORS, FONT } from "../theme";

const hard = (px: number) => `${px}px ${px}px 0 ${COLORS.ink}`;

type PxProps = {
  readonly children: React.ReactNode;
  readonly size?: number;
  readonly color?: string;
  // Hard drop shadow in pixels (0 for none).
  readonly shadow?: number;
  readonly align?: "left" | "center" | "right";
  readonly style?: React.CSSProperties;
};

// Text in the game's pixel font. The font has capitals only in the game's look: write in capitals.
export const Px: React.FC<PxProps> = ({ children, size = 84, color = COLORS.white, shadow = 8, align = "center", style }) => (
  <div
    style={{
      fontFamily: FONT,
      fontSize: size,
      lineHeight: 1.35,
      color,
      textAlign: align,
      textShadow: shadow ? hard(shadow) : undefined,
      ...style,
    }}
  >
    {children}
  </div>
);

type PlateProps = {
  readonly children: React.ReactNode;
  readonly size?: number;
  readonly color?: string;
  readonly border?: string;
  readonly style?: React.CSSProperties;
};

// A dark plate with a border, like the game's word plates. For supporting text.
export const Plate: React.FC<PlateProps> = ({ children, size = 44, color = COLORS.white, border = COLORS.gold, style }) => (
  <div
    style={{
      display: "inline-block",
      boxSizing: "border-box",
      padding: `${Math.round(size * 0.6)}px ${Math.round(size * 0.8)}px`,
      backgroundColor: COLORS.ink,
      border: `8px solid ${border}`,
      fontFamily: FONT,
      fontSize: size,
      lineHeight: 1.5,
      color,
      textAlign: "center",
      ...style,
    }}
  >
    {children}
  </div>
);

type ChipProps = {
  readonly children: React.ReactNode;
  readonly size?: number;
  readonly color?: string;
  readonly background?: string;
  readonly style?: React.CSSProperties;
};

// A small label, for example "HARD. TYPED AT 60 WPM."
export const Chip: React.FC<ChipProps> = ({ children, size = 28, color = COLORS.ink, background = COLORS.gold, style }) => (
  <div
    style={{
      display: "inline-block",
      padding: `${Math.round(size * 0.45)}px ${Math.round(size * 0.6)}px ${Math.round(size * 0.35)}px`,
      backgroundColor: background,
      fontFamily: FONT,
      fontSize: size,
      lineHeight: 1.2,
      color,
      ...style,
    }}
  >
    {children}
  </div>
);
