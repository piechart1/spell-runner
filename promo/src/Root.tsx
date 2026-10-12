import type React from "react";
import { Composition, Folder } from "remotion";
import { KitTest } from "./kit/KitTest";
import { Short1, SHORT1_DURATION } from "./Short1";
import { Short2, SHORT2_DURATION } from "./Short2";
import { BeforeItLandsCompositions } from "./shorts/BeforeItLands/Compositions";
import { OneLetterLeftCompositions } from "./shorts/OneLetterLeft/Compositions";
import { WhichRunGetsSCompositions } from "./shorts/WhichRunGetsS/Compositions";

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
      <OneLetterLeftCompositions />
      <WhichRunGetsSCompositions />
      <BeforeItLandsCompositions />
      <Folder name="Kit">
        <Composition id="KitTest" component={KitTest} durationInFrames={120} fps={30} width={1080} height={1920} />
      </Folder>
    </>
  );
};
