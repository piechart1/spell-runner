import type React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { COLORS } from "../theme";
import { BigWord } from "./BigWord";
import { Logo, UrlPlate } from "./Brand";
import { clipFrame, stateAt, useClip } from "./clip";
import { Keyboard } from "./Keyboard";
import { PixelFrame } from "./PixelFrame";
import { LetterTiles } from "./Tiles";
import { TimerBar } from "./TimerBar";
import { Chip, Plate, Px } from "./Type";

// A scratch composition for checking the kit. Not one of the shorts.
export const KitTest: React.FC = () => {
  const frame = useCurrentFrame();
  const at = 2580 + frame;
  const data = useClip("boss_fight");
  const s = stateAt(data, at);
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <Logo width={540} style={{ position: "absolute", top: 20, left: 270 }} />
      <Px size={60} style={{ position: "absolute", top: 250, left: 0, width: 1080 }}>
        ONE LETTER LEFT
      </Px>
      <PixelFrame
        src={clipFrame("boss_fight", at)}
        crop={{ x: 114, y: 0, w: 270, h: 216 }}
        width={1080}
        style={{ position: "absolute", top: 340 }}
      />
      <Chip style={{ position: "absolute", top: 350, left: 10 }}>HARD. TYPED AT 60 WPM.</Chip>
      {s && s.boss && s.boss.word ? (
        <LetterTiles word={s.boss.word} typed={s.boss.typed} width={1000} blink style={{ position: "absolute", top: 1220, left: 40 }} />
      ) : null}
      <TimerBar left={1 - frame / 90} width={900} label={(3 - frame / 30).toFixed(1)} style={{ position: "absolute", top: 1330, left: 40 }} />
      <div style={{ position: "absolute", top: 1400, left: 0, width: 1080, display: "flex", justifyContent: "center" }}>
        {s && s.boss && s.boss.word ? <BigWord word={s.boss.word} typed={s.boss.typed} width={900} maxSize={50} /> : null}
      </div>
      {data ? <Keyboard keys={data.keys} at={at} width={600} style={{ position: "absolute", top: 1520, left: 40 }} /> : null}
      <UrlPlate size={28} style={{ position: "absolute", top: 1540, left: 660 }} />
      <Plate size={24} style={{ position: "absolute", top: 1760, left: 660 }}>
        A PLATE
      </Plate>
    </AbsoluteFill>
  );
};
