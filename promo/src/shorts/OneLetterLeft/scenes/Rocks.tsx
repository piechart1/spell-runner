import type React from "react";
import { Audio } from "@remotion/media";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { clipSfx } from "../../../kit/clip";
import { Chip } from "../../../kit/Type";
import { FightFrame } from "../FightFrame";
import { CLIP } from "../layout";
import { BottomLine, TopLine } from "../parts";

export const ROCKS_FRAMES = 90;
const FROM = 200;
// Clip frame 241, where the typed rock TYPHOON turns back towards the Baron.
const FLIES_BACK = 41;

// 90 frames at normal speed (clip frames 200 to 289): the rocks TYPHOON and JAWBONE are typed.
// The whole scene runs at the speed it was typed at, so the tag that says how stays for all of it.
export const Rocks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const second = frame >= FLIES_BACK;
  return (
    <>
      <FightFrame
        at={FROM + frame}
        top={second ? <TopLine since={frame - FLIES_BACK}>TYPE IT.</TopLine> : <TopLine since={frame}>EVERY ROCK</TopLine>}
        bottom={
          <>
            {second ? (
              <BottomLine since={frame - FLIES_BACK}>IT FLIES BACK.</BottomLine>
            ) : (
              <BottomLine since={frame}>IS A WORD</BottomLine>
            )}
            <Chip size={32} style={{ marginTop: 20 }}>
              HARD MODE. TYPED AT 60 WPM.
            </Chip>
          </>
        }
      />
      <Audio name="Game sound: rocks" src={clipSfx(CLIP)} trimBefore={FROM} volume={0.7} premountFor={fps} />
    </>
  );
};
