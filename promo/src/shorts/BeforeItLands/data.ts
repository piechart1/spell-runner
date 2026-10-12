import { staticFile } from "remotion";
import type { ClipData, ClipState } from "../../kit/clip";

// The clips this short is cut from: a Hard run typed by the test bot at 40 WPM, and the start of
// the same level with nobody typing.
export const TYPED = "slow_run";
export const UNTYPED = "untyped";

// A single game sound: public/audio/one_<name>.wav.
export const one = (name: string) => staticFile(`audio/one_${name}.wav`);

// Seconds with one decimal, rounded down, as a countdown shows them.
export const secs = (v: number) => (Math.floor(v * 10 + 1e-6) / 10).toFixed(1);

type Ent = ClipState["ents"][number];

const entOf = (data: ClipData, at: number, word: string): Ent | undefined => {
  const s = data.state[Math.max(0, Math.min(data.state.length - 1, Math.floor(at)))];
  return s ? s.ents.find((e) => e[2] === word) : undefined;
};

// The first and the last frame of a clip on which a creature is there, and whether it left because
// its word was typed. `near` is a frame on which it is there, or up to five seconds before it comes.
export type Life = {
  readonly first: number;
  readonly last: number;
  readonly cleared: boolean;
};

export const lifeOf = (data: ClipData | null, word: string, near: number): Life | null => {
  if (!data) return null;
  const there = (f: number) => f >= 0 && f < data.state.length && entOf(data, f, word) !== undefined;
  let f = Math.max(0, Math.floor(near));
  while (!there(f)) {
    f++;
    if (f >= data.state.length || f > near + 150) return null;
  }
  let first = f;
  while (there(first - 1)) first--;
  let last = f;
  while (there(last + 1)) last++;
  return { first, last, cleared: data.clears.some((c) => c[1] === word && Math.abs(c[0] - last) <= 1) };
};

// What the overlays show for one creature on one frame of a clip.
export type Track = {
  readonly id: number;
  // The word in capitals.
  readonly word: string;
  // Where it comes from: right, behind, above or below.
  readonly from: string;
  readonly typed: number;
  // The seconds until it lands, as the game counts them. After it has gone: the count on its last frame.
  readonly left: number;
  // The part of its time that is left, from 1 to 0.
  readonly part: number;
  // The game's count on the first frame it is there.
  readonly allowed: number;
  // waiting: not there yet (the values are those of its first frame). coming: there. cleared: its
  // word was typed. landed: it reached Pip.
  readonly state: "waiting" | "coming" | "cleared" | "landed";
  readonly life: Life;
};

export const trackOf = (data: ClipData | null, word: string, life: Life | null, at: number): Track | null => {
  if (!data || !life) return null;
  const first = entOf(data, life.first, word);
  const e = entOf(data, Math.max(life.first, Math.min(life.last, at)), word);
  if (!first || !e) return null;
  const state = at < life.first ? "waiting" : at <= life.last ? "coming" : life.cleared ? "cleared" : "landed";
  const left = e[8] ?? 0;
  const given = e[9] ?? 0;
  return {
    id: e[0],
    word: word.toUpperCase(),
    from: e[6],
    typed: state === "cleared" ? word.length : e[3],
    left,
    part: given > 0 ? Math.max(0, Math.min(1, left / given)) : 0,
    allowed: first[8] ?? 0,
    state,
    life,
  };
};
