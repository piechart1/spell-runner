import type React from "react";
import { staticFile } from "remotion";
import { COLORS, FONT } from "../theme";
import { PixelFrame } from "./PixelFrame";

type LogoProps = {
  // The width it is shown at: 600, 800 and 1000 give exact pixels.
  readonly width: number;
  readonly style?: React.CSSProperties;
};

// The SPELL RUNNER title as the game draws it, cut from the title screen (public/ui/title.png,
// which is stored at three times the game's size) with its sky behind it.
export const Logo: React.FC<LogoProps> = ({ width, style }) => (
  <PixelFrame src={staticFile("ui/title.png")} crop={{ x: 276, y: 24, w: 600, h: 222 }} width={width} style={style} />
);

type UrlPlateProps = {
  readonly size?: number;
  readonly style?: React.CSSProperties;
};

// Where to play, on two lines so that it stays readable on a phone.
export const UrlPlate: React.FC<UrlPlateProps> = ({ size = 40, style }) => (
  <div
    style={{
      display: "inline-block",
      boxSizing: "border-box",
      padding: `${Math.round(size * 0.7)}px ${Math.round(size * 0.9)}px`,
      backgroundColor: COLORS.ink,
      border: `8px solid ${COLORS.gold}`,
      fontFamily: FONT,
      fontSize: size,
      lineHeight: 1.5,
      color: COLORS.aqua,
      textAlign: "center",
      ...style,
    }}
  >
    <div>piechart1.github.io</div>
    <div>/spell-runner</div>
  </div>
);
