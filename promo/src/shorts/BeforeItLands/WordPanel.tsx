import type React from "react";
import { Easing, interpolate } from "remotion";
import { BigWord } from "../../kit/BigWord";
import { TimerBar } from "../../kit/TimerBar";
import { Px } from "../../kit/Type";
import { COLORS } from "../../theme";
import { secs, type Track } from "./data";
import { BAR_TOP, COL_LEFT, COL_W, WORD_TOP } from "./Frame";

type WordPanelProps = {
  readonly track: Track;
  // The clip frame being shown.
  readonly at: number;
  // Hide the mark under the next letter on this frame (to blink it while nobody types).
  readonly noMark?: boolean;
  // Frames since the footage last typed a letter of this word: the word jumps a little on each key.
  readonly sinceKey?: number;
};

// How far the plate jumps when its creature appears and when its word is cleared. The plate of a
// nine-letter word is 844 px wide in a column of 910, so it jumps half as far and its border stays
// left of x 950.
const jumpOf = (word: string) => (word.length > 8 ? 1.04 : 1.08);

// Under the game picture: the word of one creature, large, filled as the footage types it, and the
// time it has left as the game counts it. Once the word is cleared the bar gives way to the seconds
// that were to spare: the game's count on the creature's last frame.
export const WordPanel: React.FC<WordPanelProps> = ({ track, at, noMark = false, sinceKey = 99 }) => (
  <>
    <div
      style={{
        position: "absolute",
        top: WORD_TOP,
        left: COL_LEFT,
        width: COL_W,
        display: "flex",
        justifyContent: "center",
        // It arrives a little too large when the creature appears, and jumps once when it is cleared.
        scale:
          interpolate(at, [track.life.first, track.life.first + 5], [jumpOf(track.word), 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }) *
          interpolate(at, [track.life.last, track.life.last + 1, track.life.last + 7], [1, jumpOf(track.word), 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) *
          interpolate(sinceKey, [0, 4], [1.035, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}
    >
      <BigWord word={track.word} typed={noMark && track.typed === 0 ? -1 : track.typed} width={COL_W} maxSize={84} />
    </div>
    {track.state === "cleared" ? (
      <Px
        size={42}
        color={COLORS.gold}
        shadow={5}
        style={{
          position: "absolute",
          top: BAR_TOP + 6,
          left: COL_LEFT,
          width: COL_W,
          scale: interpolate(at, [track.life.last + 1, track.life.last + 6], [1.08, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        {secs(track.left)} SECONDS TO SPARE
      </Px>
    ) : (
      <TimerBar
        left={track.part}
        width={COL_W}
        height={68}
        label={secs(track.left)}
        style={{ position: "absolute", top: BAR_TOP, left: COL_LEFT }}
      />
    )}
  </>
);
