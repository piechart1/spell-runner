import type React from "react";
import { COLORS, FONT } from "../theme";
import type { ClipData } from "./clip";

const ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
// How far each row starts to the right, in key widths, as on a real keyboard.
const INDENT = [0, 0.35, 0.95];
const GLOW = 9; // frames a key stays lit

type KeyboardProps = {
  // The keys typed in a clip: frame, letter, 1 for correct and 0 for wrong.
  readonly keys: ClipData["keys"];
  // The clip frame being shown.
  readonly at: number;
  readonly width: number;
  readonly style?: React.CSSProperties;
};

// An on-screen keyboard that lights each key as the footage types it: gold for a correct key,
// coral for a wrong one.
export const Keyboard: React.FC<KeyboardProps> = ({ keys, at, width, style }) => {
  const gap = Math.round(width / 90);
  const size = Math.floor((width - 9 * gap) / 10);
  const last = new Map<string, readonly [number, number]>();
  // A key logged at frame f is typed after the picture of frame f: it is first seen in the next one.
  for (const [f, ch, ok] of keys) {
    if (f >= at) break;
    last.set(ch.toUpperCase(), [f, ok]);
  }
  return (
    <div style={{ width, fontFamily: FONT, ...style }}>
      {ROWS.map((row, r) => (
        <div
          key={row}
          style={{ display: "flex", gap, marginTop: r === 0 ? 0 : gap, marginLeft: Math.round(INDENT[r] * (size + gap)) }}
        >
          {row.split("").map((ch) => {
            const hit = last.get(ch);
            const age = hit ? at - (Math.floor(hit[0]) + 1) : GLOW;
            const lit = Math.max(0, 1 - age / GLOW);
            const on = lit > 0;
            const colour = hit && hit[1] === 0 ? COLORS.coral : COLORS.gold;
            return (
              <div
                key={ch}
                style={{
                  width: size,
                  height: size,
                  boxSizing: "border-box",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: Math.round(size * 0.42),
                  color: on && lit > 0.45 ? COLORS.ink : COLORS.silver,
                  backgroundColor: on ? colour : COLORS.ink,
                  opacity: on ? 0.55 + 0.45 * lit : 1,
                  border: `${Math.max(3, Math.round(size / 16))}px solid ${on ? colour : COLORS.stone}`,
                  translate: `0px ${age < 3 ? Math.round(size / 12) : 0}px`,
                }}
              >
                {ch}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
