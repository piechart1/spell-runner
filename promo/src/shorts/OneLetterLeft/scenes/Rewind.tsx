import type React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { clipFrame } from "../../../kit/clip";
import { PixelFrame } from "../../../kit/PixelFrame";
import { Px } from "../../../kit/Type";
import { COLORS } from "../../../theme";
import { FightFrame } from "../FightFrame";
import { CLIP, LAST_FRAME_BEFORE_S, MOUND_CLOSE, WIDE, WINDOW } from "../layout";

export const REWIND_FRAMES = 36;
// Where the rewind stops: the mound, just before the Baron pops out of it.
export const REWIND_TO = 40;

// The clip frame shown on each frame of the rewind. It starts slowly, so that the letters of the
// last word can be seen leaving the tiles, and ends fast.
const rewindClipFrame = (frame: number) => {
  const p = Math.min(1, Math.max(0, frame / (REWIND_FRAMES - 1)));
  return Math.round(LAST_FRAME_BEFORE_S - (LAST_FRAME_BEFORE_S - REWIND_TO) * Math.pow(p, 3));
};

// A triangle that points left, built from eight-pixel steps like the game's own art.
const Triangle: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: 32 }}>
    {[1, 2, 3, 4, 3, 2, 1].map((w, i) => (
      <div key={i} style={{ width: w * 8, height: 8, backgroundColor: COLORS.aqua }} />
    ))}
  </div>
);

// 36 frames. The whole fight runs backwards, from one letter short of the end to the mound the
// Baron came out of. The health pips refill and the tiles empty as the footage passes each hit.
export const Rewind: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = rewindClipFrame(frame);
  // The last frame is the close picture of the mound that the next scene opens on. In the wide
  // picture the game's CHECKPOINT banner would show for that one frame.
  const landed = frame >= REWIND_FRAMES - 1;
  // Three bands of the picture, pulled sideways: where they are changes on every frame.
  const bands = [0, 1, 2].map((i) => ({
    y: (frame * 197 + i * 263) % (WINDOW.height - 60),
    h: 20 + i * 16,
    dx: (i % 2 === 0 ? 1 : -1) * (24 + ((frame + i) % 3) * 16),
  }));
  return (
    <>
      <FightFrame
        at={at}
        crop={landed ? MOUND_CLOSE : WIDE}
        animateHealth={false}
        top={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Triangle />
            <Triangle />
            <Px size={64} color={COLORS.aqua} style={{ marginLeft: 24 }}>
              REWIND
            </Px>
          </div>
        }
      >
        {(landed ? [] : bands).map((b, i) => (
          <div key={i} style={{ position: "absolute", left: 0, top: b.y, width: 1080, height: b.h, overflow: "hidden" }}>
            <PixelFrame
              src={clipFrame(CLIP, at)}
              crop={WIDE}
              width={1080}
              style={{ position: "absolute", left: 0, top: -b.y, translate: `${b.dx}px 0px` }}
            />
            <AbsoluteFill style={{ backgroundColor: COLORS.white, opacity: 0.18 }} />
          </div>
        ))}
        <AbsoluteFill
          style={{
            backgroundImage: `repeating-linear-gradient(to bottom, ${COLORS.ink} 0px, ${COLORS.ink} 4px, transparent 4px, transparent 8px)`,
            opacity: 0.3,
          }}
        />
      </FightFrame>
      <Audio name="Rewind starts" src={staticFile("audio/one_slow_on.wav")} volume={0.45} premountFor={fps} />
      <Audio name="Rewind ends" from={REWIND_FRAMES - 9} src={staticFile("audio/one_slow_off.wav")} volume={0.4} premountFor={fps} />
    </>
  );
};
