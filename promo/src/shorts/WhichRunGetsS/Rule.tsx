import type React from "react";
import { Audio } from "@remotion/media";
import { Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { useClip } from "../../kit/clip";
import { COLORS } from "../../theme";
import { Head, Line, Pop } from "./Head";
import { CLAMP, RESULT_ROWS, ROW_Y, RUNS } from "./layout";
import { ResultsStage } from "./Stage";

// When the second and the third caption start. The scene is 214 frames long: the third caption
// gives a reason and stays three seconds.
const SPEED = 70;
const SCORE = 124;

// The game's rank rule, on the two results screens. Each band closes in on the rows of its results
// screen, and the row a caption is about is outlined: ACCURACY, then WPM, then TOTAL. The figures in
// the strips are read from the result of each clip. From here on the tag at the foot of each column
// says what accuracy the bot was set to.
// The results clips go on from where the Ranks scene (80 frames) leaves them: 81 + 80 and 53 + 80.
// The reason in the last caption is the game's multiplier rule (docs/DESIGN.md 8.2): on Hard a word
// completed with an error returns the multiplier, COMBO in the game's own display, to x1.
export const RuleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fast = useClip(RUNS.fast.results);
  const slow = useClip(RUNS.slow.results);
  const fastResult = fast ? fast.result : null;
  const slowResult = slow ? slow.result : null;
  const part = frame < SPEED ? "accuracy" : frame < SCORE ? "wpm" : "total";
  const closeIn = { ...CLAMP, easing: Easing.inOut(Easing.cubic) };

  return (
    <ResultsStage
      fastFrom={161}
      slowFrom={133}
      crop={{
        x: interpolate(frame, [0, 12], [0, RESULT_ROWS.x], closeIn),
        y: interpolate(frame, [0, 12], [0, RESULT_ROWS.y], closeIn),
        w: interpolate(frame, [0, 12], [384, RESULT_ROWS.w], closeIn),
        h: interpolate(frame, [0, 12], [216, RESULT_ROWS.h], closeIn),
      }}
      row={ROW_Y[part]}
      rowOpacity={interpolate(frame, [10, 15], [0, 1], CLAMP)}
      dimLabels={part === "wpm"}
      setTags
      fastStat={
        fastResult && part === "accuracy"
          ? { tag: "ACCURACY", value: `${fastResult.accuracy}%` }
          : fastResult && part === "total"
            ? { tag: "TOTAL", value: String(fastResult.score) }
            : null
      }
      slowStat={
        slowResult && part === "accuracy"
          ? { tag: "ACCURACY", value: `${slowResult.accuracy}%` }
          : slowResult && part === "total"
            ? { tag: "TOTAL", value: String(slowResult.score) }
            : null
      }
    >
      <Audio name="Rule" src={staticFile("audio/one_ui_select.wav")} volume={0.5} premountFor={fps} />
      <Audio name="Speed" from={SPEED} src={staticFile("audio/one_ui_move.wav")} volume={0.5} premountFor={fps} />
      <Audio name="Score" from={SCORE} src={staticFile("audio/one_streak.wav")} volume={0.45} premountFor={fps} />
      <Head>
        {part === "accuracy" ? (
          <Pop at={0}>
            <Line size={64} color={COLORS.gold}>
              RANK S:
            </Line>
            <Line size={64}>97%+ ACCURACY,</Line>
            <Line size={64}>NO LIVES LOST.</Line>
          </Pop>
        ) : part === "wpm" ? (
          <Pop at={SPEED}>
            <Line size={76}>SPEED IS NOT</Line>
            <Line size={76}>IN THE RULE.</Line>
          </Pop>
        ) : (
          <Pop at={SCORE}>
            <Line size={64}>
              THE <span style={{ color: RUNS.slow.colour }}>40 WPM</span> RUN
            </Line>
            <Line size={64}>SCORED MORE TOO</Line>
            <Line size={44}>ON HARD, A WRONG KEY</Line>
            <Line size={44}>RESETS THE COMBO.</Line>
          </Pop>
        )}
      </Head>
    </ResultsStage>
  );
};
