import type { ClipData, ClipState } from "../../kit/clip";

// What the row of letter tiles shows at one clip frame.
export type TileWord = {
  readonly word: string;
  readonly typed: number;
  // Clip frames since the row last changed (capped), for the pop of the newest tile.
  readonly age: number;
  // The whole word has been typed.
  readonly done: boolean;
};

type Raw = { readonly word: string; readonly typed: number; readonly done: boolean };

const stateOf = (data: ClipData, f: number): ClipState =>
  data.state[Math.max(0, Math.min(data.state.length - 1, f))];

// An event logged at frame f (whole or f + 0.5) is first seen in the picture of frame floor(f) + 1.
const seenAt = (eventFrame: number) => Math.floor(eventFrame) + 1;

const rawWord = (data: ClipData, f: number, hold: number): Raw | null => {
  const s = stateOf(data, f);
  // The Baron's own word: a weak-point word or the finisher.
  if (s.boss && s.boss.word) return { word: s.boss.word, typed: s.boss.typed, done: false };
  // The same, completed a moment ago. The record drops the word on the frame of its last letter,
  // so a completed word is one that stood one letter short and was followed by a hit.
  for (let k = 1; k <= hold && f - k >= 0; k++) {
    const b = stateOf(data, f - k).boss;
    if (b && b.word) {
      const after = stateOf(data, f - k + 1).boss;
      const hit = after !== null && (after.health < b.health || after.state === "defeated");
      if (hit && b.typed === b.word.length - 1) return { word: b.word, typed: b.word.length, done: true };
      break;
    }
  }
  const locked = s.lock === null ? undefined : s.ents.find((e) => e[0] === s.lock);
  if (locked && locked[3] > 0) return { word: locked[2], typed: locked[3], done: false };
  // A rock or creature cleared a moment ago.
  for (const [cf, word] of data.clears) {
    const seen = seenAt(cf);
    if (seen > f) break;
    if (f - seen < Math.min(hold, 10)) return { word, typed: word.length, done: true };
  }
  const next = locked ?? s.ents[0];
  if (next) return { word: next[2], typed: next[3], done: false };
  return null;
};

// The word being typed at clip frame `at`, with its letters so far. A completed word stays for
// `hold` frames.
export const tileWordAt = (data: ClipData | null, at: number, hold = 10): TileWord | null => {
  if (!data || data.state.length === 0) return null;
  const f = Math.floor(at);
  const now = rawWord(data, f, hold);
  if (!now) return null;
  let age = 0;
  while (age < 12) {
    const before = rawWord(data, f - age - 1, hold);
    if (!before || before.word !== now.word || before.typed !== now.typed) break;
    age++;
  }
  return { ...now, age };
};

export type Health = {
  readonly health: number;
  readonly max: number;
  // Clip frames since the Baron last lost a point (30 or more: not lately).
  readonly lostAge: number;
};

export const healthAt = (data: ClipData | null, at: number): Health | null => {
  if (!data || data.state.length === 0) return null;
  const f = Math.floor(at);
  const boss = stateOf(data, f).boss;
  if (!boss) return null;
  let lostAge = 0;
  while (lostAge < 30) {
    const before = stateOf(data, f - lostAge - 1).boss;
    if (before && before.health > boss.health) break;
    lostAge++;
  }
  return { health: boss.health, max: boss.max, lostAge };
};
