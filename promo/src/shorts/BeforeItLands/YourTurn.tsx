import type React from "react";
import { useMemo } from "react";
import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Backdrop } from "../../kit/Backdrop";
import { UrlPlate } from "../../kit/Brand";
import { clipFrame, useClip } from "../../kit/clip";
import { Keyboard } from "../../kit/Keyboard";
import { Px } from "../../kit/Type";
import { COLORS } from "../../theme";
import { lifeOf, one, trackOf, UNTYPED } from "./data";
import { Band, COL_LEFT, COL_W, CUE, Headline, KEYS_TOP, KEYS_W, Line, Tag } from "./Frame";
import { WordPanel } from "./WordPanel";

// The scene opens 17 frames before the boulder with ABYSS appears (frame 37 of the clip) and ends
// on frame 139, three frames before the boulder reaches Pip. The clip's sound track is not played
// here: in this stretch it holds one ink pickup (frames 23 to 27) and nothing else, because the
// capture leaves out the ticks the game plays while a creature is about to land. Only the start
// sound and the ticks below are heard, and both are placed by hand.
const START = 20;

// Where to play, in the place of the keyboard.
const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        top: KEYS_TOP,
        left: COL_LEFT,
        width: COL_W,
        // It is already faintly there on its first frame, the frame after the keyboard's last.
        opacity: interpolate(frame, [-1, 3], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        scale: interpolate(frame, [0, 7], [0.88, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }),
      }}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <UrlPlate size={40} />
      </div>
      <Px size={40} color={COLORS.gold} shadow={4} style={{ marginTop: 6 }}>
        NEEDS A KEYBOARD
      </Px>
    </div>
  );
};

// The last beat: the same level with nobody typing. A boulder comes with ABYSS, the word waits, the
// keyboard stays dark and the bar runs down. The video ends before the boulder lands.
export const YourTurn: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = START + frame;
  const data = useClip(UNTYPED);
  const life = useMemo(() => lifeOf(data, "abyss", START), [data]);
  const track = trackOf(data, "abyss", life, at);
  // The picture closes in on Pip as the boulder nears. Whole game pixels, 16 wide to 9 high.
  const cropW = Math.round(
    interpolate(frame, [80, 119], [384, 270], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.quad),
    }),
  );
  const cropH = Math.round((cropW * 9) / 16);
  // In the last second the picture's edge flashes on each quarter second of the game's count; the
  // ticks below are on the same frames.
  const sinceMark = track ? Math.ceil(track.left / 0.25) * 0.25 - track.left : 1;
  const flash = track && track.state === "coming" && track.left <= 1 ? Math.max(0, 1 - sinceMark / 0.1) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Backdrop src={clipFrame(UNTYPED, START)} />
      <Audio name="Start" src={one("start")} premountFor={fps} volume={CUE} />
      {/* Quiet ticks on the frames the game's count first reads 1.00, 0.75, 0.50 and 0.25 seconds or
          less: frames 112, 120, 127 and 135 of the clip. They stand in for the game's own ticks,
          which come every quarter second once the count is under 0.9 seconds (from frame 115 of the
          clip): a tenth of a second later, where the last one would fall on the video's last frames. */}
      <Audio name="Tick at 1.00 s" src={one("urgent_tick")} from={92} premountFor={fps} volume={0.4} />
      <Audio name="Tick at 0.75 s" src={one("urgent_tick")} from={100} premountFor={fps} volume={0.4} />
      <Audio name="Tick at 0.50 s" src={one("urgent_tick")} from={107} premountFor={fps} volume={0.4} />
      <Audio name="Tick at 0.25 s" src={one("urgent_tick")} from={115} premountFor={fps} volume={0.4} />
      <Sequence name="Nobody types this one" durationInFrames={54} premountFor={fps}>
        <Headline>
          <Line size={96} color={COLORS.gold} pop={1.1}>
            YOUR TURN
          </Line>
          <Line size={44} pop={1.08}>
            NOBODY TYPES THIS ONE
          </Line>
        </Headline>
      </Sequence>
      {/* The game's name: the address under the picture is the only other place it appears. Twelve
          letters at 80 px are 960 px wide. */}
      <Sequence name="Spell Runner, free in your browser" from={54} premountFor={fps}>
        <Headline>
          <Line size={80} color={COLORS.gold} pop={1.04}>
            SPELL RUNNER
          </Line>
          <Line size={46} pop={1.08}>
            FREE IN YOUR BROWSER
          </Line>
        </Headline>
      </Sequence>
      <Band clip={UNTYPED} at={at} crop={{ x: 0, y: 216 - cropH, w: cropW, h: cropH }}>
        {frame < 54 ? <Tag>HARD MODE.</Tag> : null}
        <div style={{ position: "absolute", inset: 0, boxSizing: "border-box", border: `12px solid ${COLORS.coral}`, opacity: flash }} />
      </Band>
      {track && track.state !== "waiting" ? <WordPanel track={track} at={at} noMark={Math.floor(frame / 8) % 2 === 1} /> : null}
      {/* The address takes the place of the keyboard on frame 36 of the scene, 19 frames after ABYSS
          appears, and stays for 84 frames (2.8 seconds). The headline changes 18 frames later, so
          that the two do not arrive together. */}
      <Sequence name="Keyboard, dark" durationInFrames={36} premountFor={fps}>
        <Keyboard
          keys={data ? data.keys : []}
          at={at}
          width={KEYS_W}
          style={{ position: "absolute", top: KEYS_TOP, left: COL_LEFT + (COL_W - KEYS_W) / 2 }}
        />
      </Sequence>
      <Sequence name="Where to play" from={36} premountFor={fps}>
        <EndCard />
      </Sequence>
    </AbsoluteFill>
  );
};
