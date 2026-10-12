import type React from "react";
import { Audio } from "@remotion/media";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clipSfx, stateAt, useClip } from "../../../kit/clip";
import { COLORS } from "../../../theme";
import { FightFrame } from "../FightFrame";
import { CLIP, PIP_CLOSE } from "../layout";
import { KeyCap, TopLine } from "../parts";

export const DODGE_FRAMES = 36;

type DodgeProps = {
  // The first clip frame of the cut.
  readonly from: number;
  readonly word: string;
  // The key that does it in the game (README, Controls).
  readonly keyLabel: string;
  // What the record calls Pip's state while he does it.
  readonly pose: string;
};

// A cut of 1.2 seconds of one of the Baron's attacks that have no word, close on Pip: what comes
// at him enters from the right. The key lights on the frame Pip leaves the ground or goes down.
const Dodge: React.FC<DodgeProps> = ({ from, word, keyLabel, pose }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const data = useClip(CLIP);
  const at = from + frame;
  // Lit for the first six frames of the move.
  const now = stateAt(data, at)?.pip?.[2] === pose;
  const before = stateAt(data, Math.max(from, at - 6))?.pip?.[2] === pose;
  return (
    <>
      <FightFrame
        at={at}
        crop={PIP_CLOSE}
        tiles={null}
        top={
          <TopLine size={88} color={COLORS.gold} since={frame}>
            {word}
          </TopLine>
        }
        bottom={<KeyCap label={keyLabel} width={420} height={120} size={56} down={now && !before} style={{ marginTop: 24 }} />}
      />
      <Audio name="Game sound" src={clipSfx(CLIP)} trimBefore={from} volume={0.7} premountFor={fps} />
    </>
  );
};

// 36 frames (clip frames 303 to 338): the Baron stamps, the shockwave runs along the ground and Pip
// jumps it. He leaves the ground on clip frame 321 and is down again on 338.
export const Jump: React.FC = () => <Dodge from={303} word="JUMP" keyLabel="SPACE" pose="jump" />;

// 36 frames (clip frames 966 to 1001): the pickaxe flies at head height and Pip ducks under it.
// He goes down on clip frame 980 and is up again on 1001.
export const Duck: React.FC = () => <Dodge from={966} word="DUCK" keyLabel="ENTER" pose="slide" />;
