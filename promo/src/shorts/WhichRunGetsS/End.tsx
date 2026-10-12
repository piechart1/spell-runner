import type React from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Logo, UrlPlate } from "../../kit/Brand";
import { useClip } from "../../kit/clip";
import { Px } from "../../kit/Type";
import { COLORS, FONT } from "../../theme";
import { Line, Pop } from "./Head";
import type { RunId } from "./layout";
import { CLAMP, RANK_COLOURS, RUNS } from "./layout";
import { SKY, Sky } from "./Sky";

type RankCardProps = {
  // One of the two runs, or nothing for the viewer's own card.
  readonly run: RunId | null;
  // The frame of the scene the card arrives on.
  readonly at: number;
};

// A rank stamp with a label over it. A run's card shows the rank in the result of its results clip
// and, under it, the accuracy its bot was set to, so that the card does not pair speed with rank.
const RankCard: React.FC<RankCardProps> = ({ run, at }) => {
  const frame = useCurrentFrame();
  const data = useClip(run ? RUNS[run].results : RUNS.fast.results);
  const rank = run ? (data && data.result ? data.result.rank : "") : "?";
  const colour = run ? (RANK_COLOURS[rank] ?? COLORS.white) : COLORS.white;
  return (
    <div
      style={{
        width: 280,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        opacity: interpolate(frame, [at - 1, at + 1], [0, 1], CLAMP),
        scale: interpolate(frame, [at, at + 7], [0.7, 1], {
          ...CLAMP,
          easing: Easing.out(Easing.back(1.8)),
        }),
      }}
    >
      <Px size={40} shadow={4} color={run ? RUNS[run].colour : COLORS.white} style={{ lineHeight: 1, whiteSpace: "nowrap" }}>
        {run ? RUNS[run].label : "YOU"}
      </Px>
      <div
        style={{
          width: 220,
          height: 168,
          boxSizing: "border-box",
          border: `8px solid ${colour}`,
          backgroundColor: COLORS.ink,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 112,
            lineHeight: 1,
            paddingTop: 12,
            color: colour,
            // The viewer's question mark blinks.
            opacity: run || frame % 16 < 10 ? 1 : 0.3,
          }}
        >
          {rank}
        </div>
      </div>
      {run ? (
        <div
          style={{
            width: 280,
            boxSizing: "border-box",
            padding: "10px 0 6px",
            backgroundColor: COLORS.stone,
            fontFamily: FONT,
            lineHeight: 1.15,
            color: COLORS.white,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontSize: 26 }}>BOT SET TO</div>
          <div>
            <span style={{ fontSize: 40 }}>{RUNS[run].set}%</span>
            <span style={{ fontSize: 26 }}> ACC</span>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// The end card: the question to the viewer, the two ranks again, and where to play. The address and
// NEEDS A KEYBOARD arrive on the same frame.
export const EndScene: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sky at={SKY.sunset} />
      <Audio name="Start sound" src={staticFile("audio/one_start.wav")} volume={0.4} premountFor={fps} />
      <div style={{ position: "absolute", left: 40, top: 216, width: 1000 }}>
        <Pop at={0}>
          <Line size={68}>WHAT RANK</Line>
          <Line size={68}>WOULD YOU GET?</Line>
        </Pop>
      </div>
      <div style={{ position: "absolute", left: 80, top: 408, width: 920, display: "flex", justifyContent: "space-between" }}>
        <RankCard run="fast" at={3} />
        <RankCard run="slow" at={7} />
        <RankCard run={null} at={11} />
      </div>
      <div style={{ position: "absolute", left: 40, top: 762, width: 1000, display: "flex", justifyContent: "center" }}>
        <Pop at={12}>
          <UrlPlate size={40} />
        </Pop>
      </div>
      {/* Below the middle of the frame words stay left of x 950, so this block is 10 px left of centre. */}
      <div style={{ position: "absolute", left: 110, top: 984, width: 840 }}>
        <Pop at={12}>
          <Line size={40}>FREE IN YOUR BROWSER.</Line>
          <Line size={40} color={COLORS.gold}>
            NEEDS A KEYBOARD.
          </Line>
        </Pop>
      </div>
      <Logo width={800} style={{ position: "absolute", left: 140, top: 1128, boxShadow: `0 0 0 8px ${COLORS.ink}` }} />
    </AbsoluteFill>
  );
};
