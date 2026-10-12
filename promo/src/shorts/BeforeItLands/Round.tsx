import type React from "react";
import { useMemo } from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../../kit/Backdrop";
import { clipFrame, clipSfx, useClip } from "../../kit/clip";
import { Keyboard } from "../../kit/Keyboard";
import type { Crop } from "../../kit/PixelFrame";
import { COLORS } from "../../theme";
import { lifeOf, one, secs, trackOf, TYPED } from "./data";
import { Band, COL_LEFT, COL_W, CUE, Headline, KEYS_TOP, KEYS_W, Line, SFX, Tag } from "./Frame";
import { WordPanel } from "./WordPanel";

type RoundProps = {
  // The frame of the typed clip the scene opens on.
  readonly start: number;
  // The word of the creature this round is about.
  readonly word: string;
  // The headline: a large line and a smaller one. Without a smaller one, the seconds the game
  // allows for the word are written there.
  readonly big: string;
  readonly small: string | null;
  // The part of the game picture to show. Null: all of it.
  readonly crop: Crop | null;
  // The headline arrives with a small jump. Off for the first frame of the video.
  readonly pop: boolean;
  // A single game sound on the first frame, where the clip has none of its own.
  readonly cue: string | null;
};

// One round: a creature comes with a word, the footage types it, and the seconds that were to spare
// stay on screen for a moment. Everything under the picture follows the clip's record.
export const Round: React.FC<RoundProps> = ({ start, word, big, small, crop, pop, cue }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = start + frame;
  const data = useClip(TYPED);
  const life = useMemo(() => lifeOf(data, word, start), [data, word, start]);
  const track = trackOf(data, word, life, at);
  // The keyboard goes dark once this word is done: the footage types on, but the round is over.
  const keys = useMemo(() => (data && life ? data.keys.filter((k) => k[0] <= life.last + 1) : []), [data, life]);
  // A key logged at frame f is first seen in the picture of the frame after it (see kit/clip.ts), so
  // the word jumps on the frame its letter turns gold.
  const lastKey = keys.filter((k) => k[0] >= start && k[0] < at).pop();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Backdrop src={clipFrame(TYPED, start)} />
      <Audio
        name="Game sounds"
        src={clipSfx(TYPED)}
        trimBefore={start}
        premountFor={fps}
        // Like the keyboard: after the chime of the cleared word, the next word's keys are not heard.
        volume={
          life
            ? SFX * interpolate(at, [life.last + 10, life.last + 13], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
            : SFX
        }
      />
      {cue ? <Audio name="Cue" src={one(cue)} premountFor={fps} volume={CUE} /> : null}
      <Headline>
        <Line size={88} color={COLORS.gold} pop={pop ? 1.1 : 1}>
          {big}
        </Line>
        <Line size={64} pop={pop ? 1.04 : 1}>
          {small ?? (track ? `${secs(track.allowed)} SECONDS` : "")}
        </Line>
      </Headline>
      <Band clip={TYPED} at={at} crop={crop ?? undefined}>
        <Tag>
          <div>HARD MODE.</div>
          <div>TYPED AT</div>
          <div>40 WPM.</div>
        </Tag>
      </Band>
      {track ? <WordPanel track={track} at={at} sinceKey={lastKey ? at - lastKey[0] : undefined} /> : null}
      <Keyboard
        keys={keys}
        at={at}
        width={KEYS_W}
        style={{ position: "absolute", top: KEYS_TOP, left: COL_LEFT + (COL_W - KEYS_W) / 2 }}
      />
    </AbsoluteFill>
  );
};
