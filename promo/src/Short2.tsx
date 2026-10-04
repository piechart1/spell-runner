import type React from "react";
import { Audio } from "@remotion/media";
import { linearTiming, springTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { flip } from "@remotion/transitions/flip";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { AbsoluteFill, interpolate, staticFile, useVideoConfig } from "remotion";
import { Stage } from "./Stage";
import { Headline, Plate, Typed } from "./Text";
import { COLORS } from "./theme";

// 85 + 105 + 110 + 105 + 100 + 115 frames of scenes, less 5 transitions of 15 frames.
export const SHORT2_DURATION = 85 + 105 + 110 + 105 + 100 + 115 - 5 * 15;

// Short 2: "Learning to type?" Three difficulties, the world scores, and where to play.
export const Short2: React.FC = () => {
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Audio
        src={staticFile("audio/music_title.wav")}
        premountFor={fps}
        volume={(f) =>
          0.42 *
          interpolate(f, [durationInFrames - 25, durationInFrames - 1], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <TransitionSeries>
        <TransitionSeries.Sequence name="Hook" durationInFrames={85} premountFor={fps}>
          <Stage still="ui/difficulty.png">
            <Typed lines={["LEARNING", "TO TYPE?"]} top={230} />
            <Plate lines={["MAKE IT A GAME."]} delay={40} />
          </Stage>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence name="Easy" durationInFrames={105} premountFor={fps}>
          <Stage clip="easy" offset={30}>
            <Headline lines={["EASY"]} top={300} size={120} color={COLORS.aqua} />
            <Plate lines={["SHORT WORDS", "ON THE HOME ROW.", "10 TO 20 WPM."]} />
          </Stage>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence name="Medium" durationInFrames={110} premountFor={fps}>
          <Stage clip="m3" offset={70}>
            <Headline lines={["MEDIUM"]} top={300} size={120} color={COLORS.gold} />
            <Plate lines={["EVERYDAY WORDS,", "COMING FASTER.", "20 TO 40 WPM."]} />
          </Stage>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-left" })}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence name="Hard" durationInFrames={105} premountFor={fps}>
          <Stage clip="hard" offset={90}>
            <Headline lines={["HARD"]} top={300} size={120} color={COLORS.coral} />
            <Plate lines={["LONG AND", "STRANGE WORDS.", "40 WPM AND UP."]} />
          </Stage>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={flip({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence name="World scores" durationInFrames={100} premountFor={fps}>
          <Stage still="ui/world.png">
            <Headline lines={["CLIMB THE", "WORLD", "SCORES"]} />
            <Plate lines={["THREE INITIALS.", "ONE SHARED BOARD."]} />
          </Stage>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence name="Play" durationInFrames={115} premountFor={fps}>
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
