import type React from "react";
import { COLORS, FONT } from "../theme";

type BigWordProps = {
  readonly word: string;
  // Letters typed so far.
  readonly typed: number;
  // The width the plate may take. The letters are sized to fit it.
  readonly width: number;
  readonly maxSize?: number;
  readonly style?: React.CSSProperties;
};

// A word plate like the game's, enlarged: typed letters gold, the next letter underlined in aqua,
// the rest white. Press Start 2P is a fixed-width font, so the size follows from the length.
export const BigWord: React.FC<BigWordProps> = ({ word, typed, width, maxSize = 120, style }) => {
  const pad = 36;
  const size = Math.floor(Math.min(maxSize, (width - 2 * pad - 16) / Math.max(1, word.length)));
  return (
    <div
      style={{
        boxSizing: "border-box",
        display: "inline-flex",
        padding: `${Math.round(size * 0.35)}px ${pad}px ${Math.round(size * 0.2)}px`,
        backgroundColor: COLORS.ink,
        border: `8px solid ${COLORS.gold}`,
        fontFamily: FONT,
        fontSize: size,
        lineHeight: 1.2,
        ...style,
      }}
    >
      {word
        .toUpperCase()
        .split("")
        .map((ch, i) => (
          <span
            key={i}
            style={{
              color: i < typed ? COLORS.gold : COLORS.white,
              borderBottom: `${Math.max(6, Math.round(size / 9))}px solid ${i === typed ? COLORS.aqua : "transparent"}`,
            }}
          >
            {ch}
          </span>
        ))}
    </div>
  );
};
