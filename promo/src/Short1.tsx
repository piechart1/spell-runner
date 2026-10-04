import type React from "react";
import { Audio } from "@remotion/media";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill, interpolate, staticFile, useVideoConfig } from "remotion";
import { Stage } from "./Stage";
import { Headline, Plate, Typed } from "./Text";
import { COLORS } from "./theme";

// 80 + 120 + 120 + 135 + 120 frames of scenes, less 4 transitions of 15 frames.
export const SHORT1_DURATION = 80 + 120 + 120 + 135 + 120 - 4 * 15;

// Short 1: "Can you type fast enough?" The hook, three pieces of gameplay, and where to play.
export const Short1: React.FC = () => {
  const { fps, width, height, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Audio
        src={staticFile("audio/music_level1.wav")}
        premountFor={fps}
        volume={(f) =>
          0.38 *
          interpolate(f, [durationInFrames - 25, durationInFrames - 1], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <TransitionSeries>
        <TransitionSeries.Sequence name="Hook" durationInFrames={80} premountFor={fps}>
          <Stage clip="m3" offset={20}>
            <Typed lines={["CAN YOU", "TYPE FAST", "ENOUGH?"]} />
            <Plate lines={["A RETRO", "TYPING GAME"]} delay={50} />
          </Stage>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence name="Type the word" durationInFrames={120} premountFor={fps}>
          <Stage clip="m1" offset={40}>
            <Headline lines={["TYPE", "THE WORD"]} color={COLORS.gold} />
            <Plate lines={["EVERY CREATURE", "CARRIES A WORD.", "TYPE IT. CLEAR IT."]} />
          </Stage>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence name="Faster" durationInFrames={120} premountFor={fps}>
          <Stage clip="hard" offset={0}>
            <Headline lines={["THEY COME", "FROM", "ALL SIDES"]} />
            <Plate lines={["JUMP THE GAPS.", "DUCK THE BRANCHES.", "KEEP TYPING."]} />
          </Stage>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={clockWipe({ width, height })}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence name="Boss" durationInFrames={135} premountFor={fps}>
          <Stage clip="boss" offset={70}>
            <Headline lines={["THEN MEET", "THE BARON"]} color={COLORS.coral} />
            <Plate lines={["A BOSS YOU BEAT", "WITH YOUR KEYBOARD"]} />
          </Stage>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence name="Play" durationInFrames={120} premountFor={fps}>
          <Stage still="ui/title.png">
            <Headline lines={["PLAY FREE", "IN YOUR", "BROWSER"]} color={COLORS.gold} />
            <Plate lines={["piechart1.github.io", "/spell-runner"]} size={40} color={COLORS.aqua} />
            <Plate
              lines={["NO INSTALL. NEEDS A KEYBOARD."]}
              top={1560}
              size={26}
              color={COLORS.silver}
              delay={20}
            />
          </Stage>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
