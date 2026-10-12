import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Logo, UrlPlate } from "../../../kit/Brand";
import { clipFrame } from "../../../kit/clip";
import { PixelFrame } from "../../../kit/PixelFrame";
import { Chip, Px } from "../../../kit/Type";
import { COLORS } from "../../../theme";
import { CLIP, FOUNTAIN } from "../layout";
import { OpeningPicture } from "../OpeningPicture";

export const END_FRAMES = 103;
// The last frames of the video are the opening picture again, so that the loop is not felt.
const LOOP_BACK = 6;
// Clip frame 2718: the first letters leave the hole.
const FROM = 2718;
// The plate with the address and the chip that says what the game needs arrive together, so the
// address is never on screen without NEEDS A KEYBOARD.
const WORDS_AT = 6;

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// 103 frames. The fountain of letters at half speed (clip frames 2718 to 2766), filling the frame,
// with the name of the game and where to play it on plates in front. Then six frames of the
// opening picture.
export const EndCard: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame >= END_FRAMES - LOOP_BACK) return <OpeningPicture t={frame - END_FRAMES} mode="loop" />;
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <PixelFrame
        src={clipFrame(CLIP, FROM + frame / 2)}
        crop={FOUNTAIN}
        width={1078}
        style={{ position: "absolute", left: 1, top: 0 }}
      />
      <AbsoluteFill style={{ backgroundColor: COLORS.ink, opacity: 0.3 }} />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <Logo
          width={800}
          style={{
            position: "absolute",
            top: 212,
            outline: `8px solid ${COLORS.ink}`,
            scale: interpolate(frame, [0, 5], [1.12, 1], CLAMP),
          }}
        />
        {frame >= WORDS_AT ? (
          <div
            style={{
              position: "absolute",
              top: 532,
              width: 960,
              boxSizing: "border-box",
              padding: "22px 0 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              backgroundColor: COLORS.ink,
              border: `8px solid ${COLORS.gold}`,
              scale: interpolate(frame, [WORDS_AT, WORDS_AT + 4], [1.1, 1], CLAMP),
            }}
          >
            <Px size={56} shadow={0} style={{ lineHeight: 1.3 }}>
              DEFEAT THE BARON
            </Px>
            <Px size={72} shadow={0} color={COLORS.gold} style={{ lineHeight: 1.3 }}>
              YOURSELF
            </Px>
            <UrlPlate size={40} style={{ border: "none", padding: 0, marginTop: 10, lineHeight: 1.4 }} />
          </div>
        ) : null}
        {frame >= WORDS_AT ? (
          <Chip
            size={32}
            style={{
              position: "absolute",
              top: 919,
              // The chip lies across the middle of the frame, where the right-hand edge is covered:
              // a small pop keeps it left of x 950.
              scale: interpolate(frame, [WORDS_AT, WORDS_AT + 4], [1.04, 1], CLAMP),
            }}
          >
            FREE. NEEDS A KEYBOARD.
          </Chip>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
