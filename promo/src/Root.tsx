import type React from "react";
import { Composition } from "remotion";
import { Short1, SHORT1_DURATION } from "./Short1";
import { Short2, SHORT2_DURATION } from "./Short2";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="TypeFastEnough"
        component={Short1}
        durationInFrames={SHORT1_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="LearningToType"
        component={Short2}
        durationInFrames={SHORT2_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
