import type React from "react";
import { Composition, Folder } from "remotion";
import { DURATION, OneLetterLeft } from "./index";
import { DODGE_FRAMES, Duck, Jump } from "./scenes/Dodge";
import { END_FRAMES, EndCard } from "./scenes/EndCard";
import { Hook, HOOK_FRAMES } from "./scenes/Hook";
import { LAST_WORD_FRAMES, LastWord } from "./scenes/LastWord";
import { MEET_FRAMES, MeetTheBaron } from "./scenes/MeetTheBaron";
import { PHASE_FRAMES, PhaseThree, PhaseTwo } from "./scenes/Phases";
import { Rewind, REWIND_FRAMES } from "./scenes/Rewind";
import { Rocks, ROCKS_FRAMES } from "./scenes/Rocks";
import { LETTER_FRAMES, TheLetter } from "./scenes/TheLetter";
import { WEAK_POINT_FRAMES, WeakPoint } from "./scenes/WeakPoint";

// The registrations of this short: the video itself and, in a folder, each scene on its own
// timeline, in the order and with the length it has in the video.
export const OneLetterLeftCompositions: React.FC = () => (
  <>
    <Composition id="OneLetterLeft" component={OneLetterLeft} durationInFrames={DURATION} fps={30} width={1080} height={1920} />
    <Folder name="OneLetterLeft-Scenes">
      <Composition id="OneLetterLeft-Hook" component={Hook} durationInFrames={HOOK_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-Rewind" component={Rewind} durationInFrames={REWIND_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-MeetTheBaron" component={MeetTheBaron} durationInFrames={MEET_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-Rocks" component={Rocks} durationInFrames={ROCKS_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-Jump" component={Jump} durationInFrames={DODGE_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-WeakPoint" component={WeakPoint} durationInFrames={WEAK_POINT_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-PhaseTwo" component={PhaseTwo} durationInFrames={PHASE_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-Duck" component={Duck} durationInFrames={DODGE_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-PhaseThree" component={PhaseThree} durationInFrames={PHASE_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-LastWord" component={LastWord} durationInFrames={LAST_WORD_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-TheLetter" component={TheLetter} durationInFrames={LETTER_FRAMES} fps={30} width={1080} height={1920} />
      <Composition id="OneLetterLeft-EndCard" component={EndCard} durationInFrames={END_FRAMES} fps={30} width={1080} height={1920} />
    </Folder>
  </>
);
