import type React from "react";
import { Composition, Folder } from "remotion";
import { EndScene } from "./End";
import { FinisherScene } from "./Finisher";
import { HookScene } from "./Hook";
import { DURATION, WhichRunGetsS } from "./index";
import { RanksScene } from "./Ranks";
import { RocksScene } from "./Rocks";
import { RuleScene } from "./Rule";
import { WeakPointScene } from "./WeakPoint";

// The registrations of this short: the video itself and, in a folder, each scene on its own.
export const WhichRunGetsSCompositions: React.FC = () => (
  <>
    <Composition id="WhichRunGetsS" component={WhichRunGetsS} durationInFrames={DURATION} fps={30} width={1080} height={1920} />
    <Folder name="WhichRunGetsS-Scenes">
      <Composition
        id="WhichRunGetsS-Hook"
        component={HookScene}
        durationInFrames={114}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ from: 4392, sound: true }}
      />
      <Composition id="WhichRunGetsS-Rocks" component={RocksScene} durationInFrames={60} fps={30} width={1080} height={1920} />
      <Composition id="WhichRunGetsS-WeakPoint" component={WeakPointScene} durationInFrames={72} fps={30} width={1080} height={1920} />
      <Composition id="WhichRunGetsS-Finisher" component={FinisherScene} durationInFrames={64} fps={30} width={1080} height={1920} />
      <Composition id="WhichRunGetsS-Ranks" component={RanksScene} durationInFrames={80} fps={30} width={1080} height={1920} />
      <Composition id="WhichRunGetsS-Rule" component={RuleScene} durationInFrames={214} fps={30} width={1080} height={1920} />
      <Composition id="WhichRunGetsS-End" component={EndScene} durationInFrames={122} fps={30} width={1080} height={1920} />
    </Folder>
  </>
);
