import type React from "react";
import { Composition, Folder } from "remotion";
import { Crowd } from "./Crowd";
import { DURATION, BeforeItLands } from "./index";
import { Round } from "./Round";
import { YourTurn } from "./YourTurn";

// The registrations of this short: the video itself and, in a folder, its scenes, so that each can
// be opened on its own in the Studio. The round is registered with the values of the first round.
export const BeforeItLandsCompositions: React.FC = () => (
  <>
    <Composition id="BeforeItLands" component={BeforeItLands} durationInFrames={DURATION} fps={30} width={1080} height={1920} />
    <Folder name="BeforeItLands-Scenes">
      <Composition
        id="BeforeItLands-Round"
        component={Round}
        durationInFrames={77}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          start: 1290,
          word: "mauve",
          big: "TYPE IT",
          small: "BEFORE IT LANDS",
          crop: null,
          pop: false,
          cue: null,
        }}
      />
      <Composition id="BeforeItLands-Crowd" component={Crowd} durationInFrames={135} fps={30} width={1080} height={1920} />
      <Composition id="BeforeItLands-YourTurn" component={YourTurn} durationInFrames={120} fps={30} width={1080} height={1920} />
    </Folder>
  </>
);
