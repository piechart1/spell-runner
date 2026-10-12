import type React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Series, staticFile, useVideoConfig } from "remotion";
import { COLORS } from "../../theme";
import { DODGE_FRAMES, Duck, Jump } from "./scenes/Dodge";
import { END_FRAMES, EndCard } from "./scenes/EndCard";
import { Hook, HOOK_FRAMES } from "./scenes/Hook";
import { LAST_WORD_BACK, LAST_WORD_FRAMES, LastWord } from "./scenes/LastWord";
import { MEET_FRAMES, MeetTheBaron } from "./scenes/MeetTheBaron";
import { PHASE_FRAMES, PhaseThree, PhaseTwo } from "./scenes/Phases";
import { Rewind, REWIND_FRAMES } from "./scenes/Rewind";
import { Rocks, ROCKS_FRAMES } from "./scenes/Rocks";
import { LETTER_FRAMES, TheLetter } from "./scenes/TheLetter";
import { WEAK_POINT_FRAMES, WeakPoint } from "./scenes/WeakPoint";

// The frames on which the music changes follow from the lengths of the scenes, so that a scene
// can change length without the music falling out of step with the picture.
// The last word starts when the nine scenes before it have run (frame 490).
const LAST_WORD_FROM =
  HOOK_FRAMES +
  REWIND_FRAMES +
  MEET_FRAMES +
  ROCKS_FRAMES +
  DODGE_FRAMES +
  WEAK_POINT_FRAMES +
  PHASE_FRAMES +
  DODGE_FRAMES +
  PHASE_FRAMES;
// The twelfth letter lands and the opening picture is back (frame 566). The music drops there,
// under the wait for the last letter.
const ONE_LEFT_AGAIN = LAST_WORD_FROM + LAST_WORD_BACK;
// The letter starts (frame 602), and the last S lands on its first frame. The music stops.
const LETTER_LANDS = LAST_WORD_FROM + LAST_WORD_FRAMES;
// The game starts its victory fanfare when the sound of the Baron's defeat ends, 1.22 seconds
// after the last letter (js/audio.js, onBossDefeat): frame 639.
const FANFARE_FROM = LETTER_LANDS + 37;

// 36 + 36 + 54 + 90 + 36 + 112 + 45 + 36 + 45 + 112 + 57 + 103 frames: 25.4 seconds.
export const DURATION = LETTER_LANDS + LETTER_FRAMES + END_FRAMES;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// "One letter left": the video opens one letter short of defeating the Baron, rewinds to the start
// of the fight, shows how the fight works, and comes back for the last letter.
// The cuts from the fight are in the order they were played, so the Baron's health only goes down
// and the sky darkens once for each phase.
// The sound of each stretch of footage is inside its scene, next to the frames it belongs to.
export const OneLetterLeft: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Series>
        <Series.Sequence name="Hook: one letter left" durationInFrames={HOOK_FRAMES} premountFor={fps}>
          <Hook />
        </Series.Sequence>
        <Series.Sequence name="Rewind" durationInFrames={REWIND_FRAMES} premountFor={fps}>
          <Rewind />
        </Series.Sequence>
        <Series.Sequence name="Meet the Baron" durationInFrames={MEET_FRAMES} premountFor={fps}>
          <MeetTheBaron />
        </Series.Sequence>
        <Series.Sequence name="Rocks" durationInFrames={ROCKS_FRAMES} premountFor={fps}>
          <Rocks />
        </Series.Sequence>
        <Series.Sequence name="Jump" durationInFrames={DODGE_FRAMES} premountFor={fps}>
          <Jump />
        </Series.Sequence>
        <Series.Sequence name="Weak point" durationInFrames={WEAK_POINT_FRAMES} premountFor={fps}>
          <WeakPoint />
        </Series.Sequence>
        <Series.Sequence name="Phase 2" durationInFrames={PHASE_FRAMES} premountFor={fps}>
          <PhaseTwo />
        </Series.Sequence>
        <Series.Sequence name="Duck" durationInFrames={DODGE_FRAMES} premountFor={fps}>
          <Duck />
        </Series.Sequence>
        <Series.Sequence name="Phase 3" durationInFrames={PHASE_FRAMES} premountFor={fps}>
          <PhaseThree />
        </Series.Sequence>
        <Series.Sequence name="The last word" durationInFrames={LAST_WORD_FRAMES} premountFor={fps}>
          <LastWord />
        </Series.Sequence>
        <Series.Sequence name="The letter" durationInFrames={LETTER_FRAMES} premountFor={fps}>
          <TheLetter />
        </Series.Sequence>
        <Series.Sequence name="End card" durationInFrames={END_FRAMES} premountFor={fps}>
          <EndCard />
        </Series.Sequence>
      </Series>
      <Audio
        name="Boss theme"
        src={staticFile("audio/music_boss1_long.wav")}
        durationInFrames={LETTER_LANDS}
        premountFor={fps}
        volume={(f) =>
          0.34 *
          interpolate(f, [ONE_LEFT_AGAIN, ONE_LEFT_AGAIN + 6, LETTER_LANDS - 3, LETTER_LANDS], [1, 0.45, 0.45, 0], CLAMP)
        }
      />
      <Audio
        name="Victory fanfare"
        src={staticFile("audio/music_victory.wav")}
        from={FANFARE_FROM}
        premountFor={fps}
        volume={(f) =>
          0.4 * interpolate(f, [DURATION - FANFARE_FROM - 15, DURATION - FANFARE_FROM - 1], [1, 0], CLAMP)
        }
      />
    </AbsoluteFill>
  );
};
