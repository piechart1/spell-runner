import type React from "react";
import { interpolate } from "remotion";
import { stateAt, useClip } from "../../kit/clip";
import { COLORS } from "../../theme";
import { FightFrame } from "./FightFrame";
import { CLIP, LAST_FRAME_BEFORE_S, OPENING_FRAME, TWELFTH_LETTER } from "./layout";
import { KeyCap, TopLine } from "./parts";

// The empty tile and the S key are lit for eight frames and unlit for eight.
const litAt = (t: number) => (((Math.floor(t / 8) % 2) + 2) % 2) === 0;

type OpeningPictureProps = {
  // Frames since the video's first frame, or since the same picture came back. In "back" it starts
  // at -1, the frame of the hit itself; in "loop" it counts up to 0, where the video starts again.
  readonly t: number;
  // "open": the first frames of the video. "back": the fight has been played up to this picture
  // and the headline lands. "loop": the held picture before the video starts again.
  readonly mode: "open" | "back" | "loop";
};

// The picture the video opens on, comes back to before the last letter, and ends on: the dizzy
// Baron, TYRANNOSAURU with one empty tile, and the S key waiting. The five frames that the game
// shows between the twelfth letter's flash and the last letter run at half speed, then the last
// of them is held.
export const OpeningPicture: React.FC<OpeningPictureProps> = ({ t, mode }) => {
  const at =
    mode === "loop"
      ? LAST_FRAME_BEFORE_S
      : t < 0
        ? TWELFTH_LETTER
        : Math.min(LAST_FRAME_BEFORE_S, OPENING_FRAME + Math.floor(t / 2));
  const data = useClip(CLIP);
  const boss = stateAt(data, at)?.boss;
  const lit = litAt(t);
  return (
    <FightFrame
      at={at}
      tiles={boss && boss.word ? { word: boss.word, typed: boss.typed, age: mode === "loop" ? 99 : (t + 3) / 2, done: false } : null}
      blink={lit}
      top={
        <TopLine since={mode === "back" ? t + 1 : 99} pop={1.06}>
          <span style={{ color: COLORS.coral }}>ONE</span> LETTER LEFT
        </TopLine>
      }
      bottom={
        <div style={{ alignSelf: "flex-end", marginTop: 20 }}>
          <KeyCap
            label="S"
            width={112}
            lit={lit}
            style={{
              // The key stands against the right-hand limit (x 950) and grows away from it.
              transformOrigin: "right center",
              scale: interpolate(((t % 16) + 16) % 16, [0, 4, 8, 16], [1.1, 1, 1, 1]),
            }}
          />
        </div>
      }
    />
  );
};
