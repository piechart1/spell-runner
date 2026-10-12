import type React from "react";
import { AbsoluteFill } from "remotion";
import { clipFrame, stateAt, useClip } from "../../kit/clip";
import type { Crop } from "../../kit/PixelFrame";
import { PixelFrame } from "../../kit/PixelFrame";
import { COLORS } from "../../theme";
import type { TileWord } from "./fight";
import { healthAt, tileWordAt } from "./fight";
import { AMBIENT, AMBIENT_FRAME, CLIP, LOW, STRIP, TILES, TOP_LINE, WIDE, WINDOW } from "./layout";
import { HealthStrip, WordTiles } from "./parts";

type FightFrameProps = {
  // The clip frame in the window. The health pips and the tile row are read from the same frame,
  // so they cannot fall out of step with the picture.
  readonly at: number;
  readonly crop?: Crop;
  // The headline above the window.
  readonly top?: React.ReactNode;
  // The caption under the tile row.
  readonly bottom?: React.ReactNode;
  // The tile row. Left out: the word being typed at `at`. Null: no row, and the caption moves up
  // into its place.
  readonly tiles?: TileWord | null;
  // How long a completed word stays on the tile row, in clip frames.
  readonly hold?: number;
  readonly blink?: boolean;
  readonly flash?: number;
  readonly wave?: number;
  // False while the footage runs backwards.
  readonly animateHealth?: boolean;
  // Drawn over the game picture, inside the window.
  readonly children?: React.ReactNode;
};

// The layout that every scene of the fight shares: headline, the Baron's health, the game in a
// tall window, the tile row and one caption.
export const FightFrame: React.FC<FightFrameProps> = ({
  at,
  crop = WIDE,
  top,
  bottom,
  tiles,
  hold,
  blink,
  flash,
  wave,
  animateHealth,
  children,
}) => {
  const data = useClip(CLIP);
  const src = clipFrame(CLIP, at);
  const ambient = clipFrame(CLIP, AMBIENT_FRAME[stateAt(data, at)?.boss?.phase ?? 1] ?? AMBIENT_FRAME[1]);
  const health = healthAt(data, at);
  const row = tiles === undefined ? tileWordAt(data, at, hold) : tiles;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink, overflow: "hidden" }}>
      {/* The colours of the scene behind the layout: a strip of sky, hills and ground, blurred,
          from a frame of the same phase of the fight. (The kit's Backdrop enlarges the whole frame,
          and the HUD and the game's type bar can still be read through its blur.) */}
      <PixelFrame
        src={ambient}
        crop={AMBIENT}
        width={1080}
        style={{ position: "absolute", left: 0, top: 0, filter: "blur(28px)", opacity: 0.4, scale: 1.08 }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: TOP_LINE.top,
          width: 1080,
          height: TOP_LINE.height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {top}
      </div>
      <div style={{ position: "absolute", left: 0, top: STRIP.top, width: 1080, height: STRIP.height }}>
        {health ? <HealthStrip health={health} animate={animateHealth} /> : null}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: WINDOW.top,
          width: 1080,
          height: WINDOW.height,
          overflow: "hidden",
          backgroundColor: COLORS.ink,
        }}
      >
        <PixelFrame src={src} crop={crop} width={1080} />
        {children}
      </div>
      <div style={{ position: "absolute", left: 0, top: WINDOW.top + WINDOW.height, width: 1080, height: 8, backgroundColor: COLORS.ink }} />
      <div
        style={{
          position: "absolute",
          left: LOW.left,
          top: TILES.top,
          width: LOW.width,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {tiles === null ? null : (
          <div style={{ width: LOW.width, height: TILES.height, marginBottom: 20 }}>
            {row ? <WordTiles tiles={row} width={LOW.width} blink={blink} flash={flash} wave={wave} /> : null}
          </div>
        )}
        {bottom}
      </div>
    </AbsoluteFill>
  );
};
