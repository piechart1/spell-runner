import type React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Series, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../../theme";
import { Crowd } from "./Crowd";
import { MUSIC } from "./Frame";
import { Round } from "./Round";
import { YourTurn } from "./YourTurn";

// The five scenes below, end to end: 77 + 101 + 118 + 135 + 120 frames (18.4 seconds).
export const DURATION = 551;

// "Type it before it lands": three words of growing length typed by the 40 WPM test bot on Hard,
// each with the time the game allows; then three creatures at once; then a word that nobody types.
// The video ends before that word lands and loops into the first round.
//
// Each round runs from the frame its creature appears until 36 frames (1.2 seconds) after the frame
// the word is cleared, so its length follows from the clip:
//   MAUVE      opens on frame 1290 of slow_run (the bee appeared on 1284), cleared on 1330
//   QUIBBLE    opens on 1080, cleared on 1144
//   EPHEMERAL  opens on 4938, cleared on 5019
export const BeforeItLands: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Audio
        name="Level theme"
        src={staticFile("audio/music_level1_long.wav")}
        premountFor={fps}
        volume={interpolate(frame, [durationInFrames - 15, durationInFrames - 1], [MUSIC, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
      <Series>
        <Series.Sequence name="Round 1: MAUVE" durationInFrames={77} premountFor={fps}>
          <Round start={1290} word="mauve" big="TYPE IT" small="BEFORE IT LANDS" crop={null} pop={false} cue={null} />
        </Series.Sequence>
        <Series.Sequence name="Round 2: QUIBBLE" durationInFrames={101} premountFor={fps}>
          <Round start={1080} word="quibble" big="7 LETTERS" small={null} crop={null} pop cue="ui_select" />
        </Series.Sequence>
        <Series.Sequence name="Round 3: EPHEMERAL" durationInFrames={118} premountFor={fps}>
          <Round
            start={4938}
            word="ephemeral"
            big="9 LETTERS"
            small="FROM BEHIND"
            crop={{ x: 0, y: 42, w: 270, h: 152 }}
            pop
            cue={null}
          />
        </Series.Sequence>
        <Series.Sequence name="Three at once, about 100 words" durationInFrames={135} premountFor={fps}>
          <Crowd />
        </Series.Sequence>
        <Series.Sequence name="Your turn" durationInFrames={120} premountFor={fps}>
          <YourTurn />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};
