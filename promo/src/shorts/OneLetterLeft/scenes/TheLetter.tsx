import type React from "react";
import { Audio } from "@remotion/media";
import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS } from "../../../theme";
import { FightFrame } from "../FightFrame";
import { LAST_FRAME_BEFORE_S, MOLE_CLOSE, WIDE } from "../layout";
import { KeyCap, TopLine } from "../parts";

export const LETTER_FRAMES = 57;

// The game dims its picture and holds it for 16 frames after the last letter (clip frames 2653 to
// 2668). The video has just held the same picture, so it shows eight of them.
const HOLD_SHOWN = 8;
const AFTER_HOLD = 2669;
// Clip frame 2678: the Baron has become a small mole and his helmet is in the air.
const CLOSE_FROM = 2678;

// 57 frames. The S lands on the first frame. The game's own sequence follows: the dimmed hold
// (shortened), the helmet flying off, and a small mole that spins and goes down the hole (clip
// frames 2669 to 2717 at normal speed). When the hold ends the name of the game takes the headline,
// for viewers who leave once the letter has landed. Because frames are left out, the sound is not
// the clip's track but two of the sounds the game plays at this moment, on their own (its streak
// chime, which it also plays here, is left out).
export const TheLetter: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = frame < HOLD_SHOWN ? LAST_FRAME_BEFORE_S + 1 + frame : AFTER_HOLD + frame - HOLD_SHOWN;
  return (
    <>
      <FightFrame
        at={at}
        crop={at >= CLOSE_FROM ? MOLE_CLOSE : WIDE}
        tiles={{ word: "tyrannosaurus", typed: 13, age: frame, done: true }}
        flash={frame - 3}
        wave={frame >= 20 ? frame - 20 : undefined}
        top={
          frame >= HOLD_SHOWN ? (
            <TopLine color={COLORS.gold} since={frame - HOLD_SHOWN}>
              SPELL RUNNER
            </TopLine>
          ) : null
        }
        bottom={
          frame < 14 ? (
            <div style={{ alignSelf: "flex-end", marginTop: 20 }}>
              <KeyCap label="S" width={112} down />
            </div>
          ) : null
        }
      />
      <Audio name="Word complete" src={staticFile("audio/one_word_clear.wav")} volume={0.55} premountFor={fps} />
      <Audio name="The Baron is defeated" src={staticFile("audio/one_boss_defeat.wav")} volume={0.65} premountFor={fps} />
    </>
  );
};
