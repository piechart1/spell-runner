import type React from "react";
import { COLORS, FONT } from "../theme";

type LetterTilesProps = {
  readonly word: string;
  // Letters filled so far.
  readonly typed: number;
  // The width the row may take; the tiles are sized to fit it.
  readonly width: number;
  readonly maxTile?: number;
  // When true the next empty tile is outlined in coral (drive it from the frame to blink it).
  readonly blink?: boolean;
  // Show the letters that are not yet typed, dimmed. When false those tiles are empty.
  readonly showAll?: boolean;
  readonly style?: React.CSSProperties;
};

// A row of letter tiles that fills as a word is typed: gold tiles for typed letters, dark for the rest.
export const LetterTiles: React.FC<LetterTilesProps> = ({
  word,
  typed,
  width,
  maxTile = 110,
  blink = false,
  showAll = false,
  style,
}) => {
  const n = Math.max(1, word.length);
  const gap = Math.max(4, Math.round(width / 160));
  const tile = Math.floor(Math.min(maxTile, (width - (n - 1) * gap) / n));
  const border = Math.max(3, Math.round(tile / 14));
  return (
    <div style={{ display: "flex", gap, justifyContent: "center", width, fontFamily: FONT, ...style }}>
      {word
        .toUpperCase()
        .split("")
        .map((ch, i) => {
          const done = i < typed;
          const next = i === typed;
          return (
            <div
              key={i}
              style={{
                width: tile,
                height: Math.round(tile * 1.15),
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: Math.round(tile * 0.52),
                color: done ? COLORS.ink : COLORS.stone,
                backgroundColor: done ? COLORS.gold : COLORS.ink,
                border: `${border}px solid ${done ? COLORS.gold : next && blink ? COLORS.coral : next ? COLORS.aqua : COLORS.stone}`,
              }}
            >
              {done || showAll ? ch : ""}
            </div>
          );
        })}
    </div>
  );
};
