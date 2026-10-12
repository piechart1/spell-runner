import type React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";
import { clipFrame, stateAt, useClip } from "../../kit/clip";
import type { Crop } from "../../kit/PixelFrame";
import { PixelFrame } from "../../kit/PixelFrame";
import { COLORS, FONT } from "../../theme";
import type { RunId } from "./layout";
import { BAND, CLAMP, COLUMN, RANK_COLOURS, RUN_HEIGHT, RUNS, STAMP_FRAME, STRIP, WRONG_KEY } from "./layout";

type RunBandProps = {
  readonly run: RunId;
  // "play" shows the run's gameplay clip, "results" its results screen.
  readonly screen: "play" | "results";
  // The clip frame shown.
  readonly at: number;
  // The part of the game picture shown, in game pixels. It must have the shape of the whole picture.
  readonly crop?: Crop;
  // A figure at the right of the strip (results screen only), for example ACCURACY 95%.
  readonly stat?: { readonly tag: string; readonly value: string } | null;
  // A row of the game picture to outline (the top of its text, in game pixels), and how strongly.
  readonly row?: number | null;
  readonly rowOpacity?: number;
  // Grey the speed label.
  readonly dimLabel?: boolean;
  // The tag at the foot of the column says what accuracy the bot was set to, instead of TEST BOT.
  readonly setTag?: boolean;
};

const text = (size: number, colour: string): React.CSSProperties => ({
  fontFamily: FONT,
  fontSize: size,
  lineHeight: 1,
  color: colour,
  whiteSpace: "nowrap",
});

// One run: the label strip (speed, and the word being typed), the game picture, and a column with
// the rank stamp, the accuracy and a tag (TEST BOT, or what accuracy the bot was set to). The word,
// the wrong keys, the accuracy and the rank are read from the clip's data for the frame shown, so
// the overlays are in step with the picture.
export const RunBand: React.FC<RunBandProps> = ({
  run,
  screen,
  at,
  crop,
  stat = null,
  row = null,
  rowOpacity = 1,
  dimLabel = false,
  setTag = false,
}) => {
  const frame = useCurrentFrame();
  const { label, set, colour, top } = RUNS[run];
  const clip = screen === "play" ? RUNS[run].play : RUNS[run].results;
  const data = useClip(clip);
  const s = stateAt(data, at);

  // The word being typed: the locked creature's, or the Baron's.
  const locked = s && s.lock !== null ? s.ents.find((e) => e[0] === s.lock) : undefined;
  const word = screen === "results" ? null : locked ? locked[2] : s && s.boss ? s.boss.word : null;
  const typed = locked ? locked[3] : s && s.boss ? s.boss.typed : 0;
  const wordSize = word ? Math.min(40, Math.floor(380 / word.length)) : 40;

  // Frames since the last wrong key came into the picture. A key at clip frame f or f + 0.5 is first
  // seen in frame floor(f) + 1 (see kit/clip.ts).
  let wrongAge = 99;
  if (data && screen === "play") {
    for (const [f, , ok] of data.keys) {
      const seen = Math.floor(f) + 1;
      if (seen > at) break;
      if (ok === 0) wrongAge = at - seen;
    }
  }

  // After a wrong key the strip is coral and says WRONG KEY in place of the word. The gold text on
  // it is drawn dark meanwhile.
  const flash = wrongAge < WRONG_KEY.label;

  // The rank letter, once the game has stamped it.
  const stampAge = at - STAMP_FRAME;
  const rank = screen === "results" && data && data.result && stampAge >= 0 ? data.result.rank : null;
  const rankColour = rank ? (RANK_COLOURS[rank] ?? COLORS.white) : COLORS.silver;

  const acc = s && s.acc !== null ? `${s.acc}%` : "";
  const zoom = BAND.width / (crop ? crop.w : 384);
  const cropY = crop ? crop.y : 0;

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: STRIP.left,
          top,
          width: STRIP.width,
          height: STRIP.height,
          boxSizing: "border-box",
          border: `4px solid ${colour}`,
          backgroundColor: COLORS.ink,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: COLORS.coral,
            opacity: interpolate(wrongAge, [0, WRONG_KEY.label - 4, WRONG_KEY.fade], [1, 1, 0], CLAMP),
          }}
        />
        <div style={{ position: "absolute", left: 14, top: 7, ...text(44, flash ? COLORS.ink : dimLabel ? COLORS.stone : colour) }}>{label}</div>
        {flash ? (
          <div style={{ position: "absolute", right: 14, top: 9, ...text(40, COLORS.ink) }}>WRONG KEY</div>
        ) : word ? (
          <div style={{ position: "absolute", right: 14, top: 7 + (44 - wordSize) / 2, ...text(wordSize, COLORS.white) }}>
            {word
              .toUpperCase()
              .split("")
              .map((ch, i) => (
                <span key={i} style={{ color: i >= typed ? COLORS.white : COLORS.gold }}>
                  {ch}
                </span>
              ))}
          </div>
        ) : null}
        {stat ? (
          <div style={{ position: "absolute", right: 14, top: 7, display: "flex", alignItems: "flex-end", gap: 14 }}>
            <div style={{ ...text(26, COLORS.silver), paddingBottom: 8 }}>{stat.tag}</div>
            <div style={text(44, COLORS.white)}>{stat.value}</div>
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: "absolute",
          left: BAND.left,
          top: top + STRIP.height + 4,
          width: BAND.width,
          height: BAND.height,
          boxShadow: `0 0 0 4px ${colour}`,
          backgroundColor: COLORS.ink,
          overflow: "hidden",
        }}
      >
        <PixelFrame src={clipFrame(clip, at)} crop={crop} width={BAND.width} />
        {row !== null ? (
          <>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: BAND.width,
                height: (row - 4 - cropY) * zoom,
                backgroundColor: COLORS.ink,
                opacity: 0.6 * rowOpacity,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: (row + 11 - cropY) * zoom,
                width: BAND.width,
                bottom: 0,
                backgroundColor: COLORS.ink,
                opacity: 0.6 * rowOpacity,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: (row - 4 - cropY) * zoom,
                width: BAND.width,
                height: 15 * zoom,
                boxSizing: "border-box",
                border: `6px solid ${colour}`,
                opacity: rowOpacity,
              }}
            />
          </>
        ) : null}
      </div>

      <div style={{ position: "absolute", left: COLUMN.left, top, width: COLUMN.width, height: RUN_HEIGHT }}>
        <div style={{ ...text(26, COLORS.silver), textAlign: "center", marginTop: 4 }}>RANK</div>
        <div
          style={{
            position: "relative",
            marginTop: 10,
            width: COLUMN.width,
            height: 150,
            boxSizing: "border-box",
            border: `6px solid ${rankColour}`,
            backgroundColor: COLORS.ink,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {rank ? (
            <>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: COLORS.white,
                  opacity: interpolate(stampAge, [0, 6], [0.9, 0], CLAMP),
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: 6,
                  top: 31,
                  ...text(96, rankColour),
                  opacity: interpolate(stampAge, [0, 14], [0.6, 0], CLAMP),
                  // The stamp and its echo grow from the right edge, over the picture, so that
                  // neither passes x 950.
                  transformOrigin: "100% 50%",
                  scale: interpolate(stampAge, [0, 14], [1, 3.4], {
                    ...CLAMP,
                    easing: Easing.out(Easing.quad),
                  }),
                }}
              >
                {rank}
              </div>
            </>
          ) : null}
          <div
            style={{
              ...text(rank ? 96 : 80, rankColour),
              paddingTop: 10,
              transformOrigin: rank ? "100% 50%" : "50% 50%",
              scale: rank
                ? interpolate(stampAge, [0, 4, 8], [3, 0.9, 1], {
                    ...CLAMP,
                    easing: Easing.out(Easing.quad),
                  })
                : interpolate(frame % 30, [0, 5, 12], [1, 1.15, 1], CLAMP),
            }}
          >
            {rank ?? "?"}
          </div>
        </div>
        <div style={{ ...text(26, COLORS.silver), textAlign: "center", marginTop: 34 }}>ACC</div>
        <div style={{ ...text(acc.length > 3 ? 30 : 40, wrongAge < WRONG_KEY.fade ? COLORS.coral : COLORS.white), textAlign: "center", marginTop: 10 }}>
          {acc}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: COLUMN.width,
            boxSizing: "border-box",
            padding: "12px 0 8px",
            backgroundColor: COLORS.stone,
            ...text(26, COLORS.white),
            lineHeight: 1.2,
            textAlign: "center",
            whiteSpace: "normal",
          }}
        >
          {setTag ? `BOT SET ${set}%` : "TEST BOT"}
        </div>
      </div>
    </>
  );
};
