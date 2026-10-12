import type React from "react";
import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, interpolate, staticFile, useVideoConfig } from "remotion";
import { COLORS } from "../../theme";
import { EndScene } from "./End";
import { FinisherScene } from "./Finisher";
import { HookScene } from "./Hook";
import { CLAMP } from "./layout";
import { RanksScene } from "./Ranks";
import { RocksScene } from "./Rocks";
import { RuleScene } from "./Rule";
import { WeakPointScene } from "./WeakPoint";

// 114 + 60 + 72 + 64 + 80 + 214 + 122 + 12 frames of scenes, less the 8 frames of the one
// transition: 24.3 seconds.
export const DURATION = 730;

// "Which run gets rank S?" Two runs of the same Hard level by the game's test bot, at 120 WPM and at
// 40 WPM, side by side. The answer is held back until the game stamps the two ranks.
//
// Where each scene starts: Hook 0, Rocks 114, Weak point 174, Finisher 246 (both last letters on
// 284), Ranks 310 (stamps on 336 and 364), Rule 390 (captions on 390, 460 and 514), End 604,
// Loop back 718.
//
// The play scenes are in the order of the level: stage 1-3, then the Baron. Three wrong keys fall
// inside them and each turns its strip coral with WRONG KEY: the 120 WPM run's on frame 90, the
// 40 WPM run's on 127 and the 120 WPM run's on 256.
//
// Sound: the level theme to frame 114, the boss theme while the Baron is on screen (114 to 310) and
// the results music from the results screens to the end, fading over the last half second.
// The game's own effects are inside the scenes, in step with the footage.
export const WhichRunGetsS: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Audio
        name="Level theme"
        src={staticFile("audio/music_level1_long.wav")}
        durationInFrames={114}
        premountFor={fps}
        volume={(f) => 0.48 * interpolate(f, [106, 114], [1, 0], CLAMP)}
      />
      <Audio
        name="Boss theme"
        src={staticFile("audio/music_boss1_long.wav")}
        from={114}
        durationInFrames={196}
        premountFor={fps}
        volume={(f) => 0.48 * interpolate(f, [186, 196], [1, 0], CLAMP)}
      />
      <Audio
        name="Results music"
        src={staticFile("audio/music_results.wav")}
        from={310}
        durationInFrames={420}
        premountFor={fps}
        volume={(f) => 0.39 * interpolate(f, [405, 420], [1, 0], CLAMP)}
      />
      <TransitionSeries>
        <TransitionSeries.Sequence name="Hook" durationInFrames={114} premountFor={fps}>
          <HookScene from={4392} sound />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="Rocks" durationInFrames={60} premountFor={fps}>
          <RocksScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="Weak point" durationInFrames={72} premountFor={fps}>
          <WeakPointScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="Finisher" durationInFrames={64} premountFor={fps}>
          <FinisherScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="Ranks" durationInFrames={80} premountFor={fps}>
          <RanksScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="Rule" durationInFrames={214} premountFor={fps}>
          <RuleScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence name="End" durationInFrames={122} premountFor={fps}>
          <EndScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: "from-bottom" })} timing={linearTiming({ durationInFrames: 8 })} />
        <TransitionSeries.Sequence name="Loop back" durationInFrames={12} premountFor={fps}>
          <HookScene from={4380} sound={false} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
