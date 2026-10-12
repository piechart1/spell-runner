import type React from "react";
import { Audio } from "@remotion/media";
import { staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { OpeningPicture } from "../OpeningPicture";

export const HOOK_FRAMES = 36;

// 36 frames. The video opens one frame after the twelfth letter of TYRANNOSAURUS has landed: its
// tile is still settling and its key is still sounding. The five frames the game shows before
// the last letter run at half speed, then the picture holds.
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      <OpeningPicture t={frame} mode="open" />
      <Audio name="Key: the twelfth letter" src={staticFile("audio/one_key_ok.wav")} volume={0.3} premountFor={fps} />
    </>
  );
};
