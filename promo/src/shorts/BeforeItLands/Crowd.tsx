import type React from "react";
import { useMemo } from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../../kit/Backdrop";
import { type ClipData, clipFrame, clipSfx, stateAt, useClip } from "../../kit/clip";
import { Keyboard } from "../../kit/Keyboard";
import { COLORS, FONT } from "../../theme";
import { type Life, lifeOf, one, secs, type Track, trackOf, TYPED } from "./data";
import { Band, COL_LEFT, COL_W, CUE, Headline, KEYS_TOP, KEYS_W, Line, SFX, Tag, WORD_TOP } from "./Frame";

// The scene opens on the frame the mole appears (the game sounds its own warning there). From then
// on a boar is behind Pip, a crow above and a mole below. Each row under the picture follows one
// creature and, once that one is cleared, the next that comes.
const START = 4374;
// The picture behind everything: a frame shortly before, on which the game shows no word of its own
// at the bottom.
const BACKDROP = 4332;
const ROWS: readonly (readonly string[])[] = [["toadstool", "grapevine"], ["bumblebee"], ["whirlwind"]];
// A cleared row stays for this many frames before the next creature takes it.
const LINGER = 10;
const ROW_H = 72;
const ROW_GAP = 10;

// Where a creature comes from, seen from Pip, who runs to the right.
const FROM: Record<string, string> = { right: "AHEAD", behind: "BEHIND", above: "ABOVE", below: "BELOW" };

const rowTrack = (data: ClipData | null, lives: readonly (Life | null)[], words: readonly string[], at: number): Track | null => {
  for (let i = 0; i < words.length; i++) {
    const life = lives[i];
    if (!life) continue;
    const next = i + 1 < words.length ? lives[i + 1] : null;
    if (!next || at <= life.last + LINGER || at < next.first) return trackOf(data, words[i], life, at);
  }
  return null;
};

type RowProps = {
  readonly track: Track;
  // The footage is typing this one.
  readonly locked: boolean;
  readonly top: number;
};

// One creature: where it comes from, its word as far as it is typed, and the time it has left.
const Row: React.FC<RowProps> = ({ track, locked, top }) => {
  const cleared = track.state === "cleared";
  const urgent = track.part < 1 / 3;
  return (
    <div
      style={{
        position: "absolute",
        top,
        left: COL_LEFT,
        width: COL_W,
        height: ROW_H,
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 12px",
        backgroundColor: COLORS.ink,
        border: `5px solid ${locked || cleared ? COLORS.gold : COLORS.stone}`,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          width: 168,
          padding: "10px 0 6px",
          fontSize: 26,
          lineHeight: 1.2,
          textAlign: "center",
          color: COLORS.ink,
          backgroundColor: cleared ? COLORS.gold : COLORS.aqua,
        }}
      >
        {FROM[track.from] ?? ""}
      </div>
      <div style={{ width: 364, fontSize: 40, lineHeight: 1.2, paddingTop: 6 }}>
        {track.word.split("").map((ch, i) => (
          <span key={i} style={{ color: i < track.typed ? COLORS.gold : COLORS.white }}>
            {ch}
          </span>
        ))}
      </div>
      {cleared ? (
        <div style={{ flex: 1, fontSize: 40, lineHeight: 1.2, paddingTop: 6, textAlign: "right", color: COLORS.gold }}>CLEARED</div>
      ) : (
        <>
          <div style={{ flex: 1, height: 32, boxSizing: "border-box", border: `4px solid ${COLORS.white}` }}>
            <div style={{ width: `${track.part * 100}%`, height: "100%", backgroundColor: urgent ? COLORS.coral : COLORS.aqua }} />
          </div>
          <div style={{ width: 122, fontSize: 40, lineHeight: 1.2, paddingTop: 6, textAlign: "right", color: urgent ? COLORS.coral : COLORS.white }}>
            {secs(track.left)}
          </div>
        </>
      )}
    </div>
  );
};

// Three creatures at once from three directions, typed by the same 40 WPM bot. The footage runs on
// under the second headline: more keep coming.
export const Crowd: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = START + frame;
  const data = useClip(TYPED);
  const lives = useMemo(() => ROWS.map((words) => words.map((w) => lifeOf(data, w, START))), [data]);
  const lock = stateAt(data, at)?.lock ?? null;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Backdrop src={clipFrame(TYPED, BACKDROP)} />
      <Audio name="Game sounds" src={clipSfx(TYPED)} trimBefore={START} premountFor={fps} volume={SFX} />
      <Sequence name="Now three at once" durationInFrames={60} premountFor={fps}>
        <Headline>
          <Line size={88} color={COLORS.gold} pop={1.1}>
            NOW THREE
          </Line>
          <Line size={64} pop={1.1}>
            AT ONCE
          </Line>
        </Headline>
      </Sequence>
      {/* Seven words while the rows count down: it gets 2.5 seconds, the four words before it 2. */}
      <Sequence name="About 100 words" from={60} premountFor={fps}>
        <Audio name="Cue" src={one("ui_select")} premountFor={fps} volume={CUE} />
        <Headline>
          <Line size={56} pop={1.1}>
            A HARD RUN HAS
          </Line>
          <Line size={64} color={COLORS.gold} pop={1.04}>
            ABOUT 100 WORDS
          </Line>
        </Headline>
      </Sequence>
      <Band clip={TYPED} at={at}>
        <Tag>
          <div>HARD MODE.</div>
          <div>TYPED AT</div>
          <div>40 WPM.</div>
        </Tag>
      </Band>
      {ROWS.map((words, i) => {
        const track = rowTrack(data, lives[i], words, at);
        return track ? (
          <Row key={words[0]} track={track} locked={track.state === "coming" && lock === track.id} top={WORD_TOP + i * (ROW_H + ROW_GAP)} />
        ) : null;
      })}
      {data ? (
        <Keyboard
          keys={data.keys}
          at={at}
          width={KEYS_W}
          style={{ position: "absolute", top: KEYS_TOP, left: COL_LEFT + (COL_W - KEYS_W) / 2 }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
