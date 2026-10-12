import type React from "react";
import { interpolate } from "remotion";
import { Px } from "../../kit/Type";
import { COLORS, FONT } from "../../theme";
import type { Health, TileWord } from "./fight";

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

type LineProps = {
  readonly children: React.ReactNode;
  readonly size?: number;
  readonly color?: string;
  // Frames since the line appeared: it lands with a small pop.
  readonly since?: number;
  // How much larger it starts. A line that fills the width needs less.
  readonly pop?: number;
};

// The headline above the game window.
export const TopLine: React.FC<LineProps> = ({ children, size = 64, color = COLORS.white, since = 99, pop = 1.14 }) => (
  <Px
    size={size}
    color={color}
    style={{
      whiteSpace: "nowrap",
      scale: interpolate(since, [0, 4], [pop, 1], CLAMP),
    }}
  >
    {children}
  </Px>
);

// The caption line under the tile row.
export const BottomLine: React.FC<LineProps> = ({ children, size = 56, color = COLORS.white, since = 99, pop = 1.06 }) => (
  <Px
    size={size}
    color={color}
    style={{
      whiteSpace: "nowrap",
      scale: interpolate(since, [0, 4], [pop, 1], CLAMP),
    }}
  >
    {children}
  </Px>
);

type WordTilesProps = {
  readonly tiles: TileWord;
  readonly width: number;
  // The next empty tile is lit coral on this frame (drive it from the frame to blink it).
  readonly blink?: boolean;
  // Frames since the word was completed by the video's own last letter: a white flash runs
  // along the row. Leave out for no flash.
  readonly flash?: number;
  // A frame count: a small bump travels along the row every 40 frames. Leave out for a still row.
  readonly wave?: number;
};

// How far a tile is lifted `phase` frames after the bump reaches it.
const bump = (phase: number) => (phase < 8 ? Math.round(Math.sin((phase / 8) * Math.PI) * 14) : 0);

// A row of letter tiles that fills as the word is typed. Like the kit's LetterTiles, with larger
// letters, a pop on the tile that has just been filled and a blink on the next one.
export const WordTiles: React.FC<WordTilesProps> = ({ tiles, width, blink = false, flash, wave }) => {
  const { word, typed, age } = tiles;
  const n = Math.max(1, word.length);
  const gap = 6;
  const tile = Math.floor(Math.min(88, (width - (n - 1) * gap) / n));
  const height = Math.round(tile * 1.25);
  const fontSize = Math.max(32, Math.floor((tile * 0.64) / 8) * 8);
  // A row that fills the width has no room beside it for the pop of its last tile, which then
  // grows away from the right-hand edge.
  const tight = (width - (n * tile + (n - 1) * gap)) / 2 < tile * 0.15;
  return (
    <div style={{ display: "flex", gap, justifyContent: "center", alignItems: "center", width, height: "100%", fontFamily: FONT }}>
      {word
        .toUpperCase()
        .split("")
        .map((ch, i) => {
          const done = i < typed;
          const next = i === typed;
          const lit = next && blink;
          const white = flash !== undefined && flash - i >= 0 && flash - i < 3;
          const lift = wave === undefined ? 0 : bump((((wave - i * 2) % 40) + 40) % 40);
          return (
            <div
              key={i}
              style={{
                width: tile,
                height,
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize,
                lineHeight: 1,
                paddingTop: Math.round(fontSize / 8),
                color: COLORS.ink,
                backgroundColor: white ? COLORS.white : done ? COLORS.gold : lit ? COLORS.coral : COLORS.ink,
                border: `6px solid ${white ? COLORS.white : done ? COLORS.gold : lit ? COLORS.coral : next ? COLORS.white : COLORS.stone}`,
                transformOrigin: tight && i === n - 1 ? "right center" : "center",
                scale: i === typed - 1 ? interpolate(age, [0, 6], [1.3, 1], CLAMP) : 1,
                translate: `0px ${-lift}px`,
                zIndex: i === typed - 1 ? 1 : 0,
              }}
            >
              {done ? ch : ""}
            </div>
          );
        })}
    </div>
  );
};

type HealthStripProps = {
  readonly health: Health;
  // Show a lost point flashing and falling away. Off while the footage runs backwards.
  readonly animate?: boolean;
};

// The Baron's health as a row of pips, in place of the game's own bar (which the window crops).
export const HealthStrip: React.FC<HealthStripProps> = ({ health, animate = true }) => {
  const pips = [];
  for (let i = 0; i < health.max; i++) {
    const alive = i < health.health;
    const leaving = animate && i === health.health && health.lostAge < 14;
    pips.push(
      <div
        key={i}
        style={{
          position: "relative",
          width: 60,
          height: 32,
          boxSizing: "border-box",
          border: `4px solid ${alive ? COLORS.red : COLORS.stone}`,
          backgroundColor: alive ? COLORS.red : COLORS.ink,
        }}
      >
        {alive ? <div style={{ height: 8, backgroundColor: COLORS.coral }} /> : null}
        {leaving ? (
          <div
            style={{
              position: "absolute",
              left: -4,
              top: -4,
              width: 60,
              height: 32,
              backgroundColor: health.lostAge < 5 ? COLORS.white : COLORS.coral,
              opacity: interpolate(health.lostAge, [8, 14], [1, 0], CLAMP),
              translate: interpolate(health.lostAge, [4, 14], ["0px 0px", "0px 36px"], CLAMP),
              scale: interpolate(health.lostAge, [0, 4], [1.5, 1], CLAMP),
            }}
          />
        ) : null}
      </div>,
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        width: "100%",
        height: "100%",
        backgroundColor: COLORS.ink,
      }}
    >
      <Px size={32} shadow={0} style={{ lineHeight: 1, paddingTop: 4, marginRight: 14 }}>
        BARON
      </Px>
      {pips}
    </div>
  );
};

type KeyCapProps = {
  readonly label: string;
  readonly width: number;
  readonly height?: number;
  readonly size?: number;
  // The key is held down: gold, and sunk into its base.
  readonly down?: boolean;
  // Outlined in coral, to draw the eye.
  readonly lit?: boolean;
  readonly style?: React.CSSProperties;
};

// A key of a keyboard, drawn in the game's colours.
export const KeyCap: React.FC<KeyCapProps> = ({ label, width, height = 112, size = 56, down = false, lit = false, style }) => (
  <div
    style={{
      width,
      height,
      boxSizing: "border-box",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: FONT,
      fontSize: size,
      lineHeight: 1,
      paddingTop: Math.round(size / 8),
      color: down ? COLORS.ink : COLORS.white,
      backgroundColor: down ? COLORS.gold : COLORS.ink,
      border: `8px solid ${down ? COLORS.gold : lit ? COLORS.coral : COLORS.silver}`,
      boxShadow: `0 ${down ? 4 : 14}px 0 ${down ? "#9A7410" : lit ? "#8C3A30" : COLORS.stone}`,
      translate: `0px ${down ? 10 : 0}px`,
      ...style,
    }}
  >
    {label}
  </div>
);
