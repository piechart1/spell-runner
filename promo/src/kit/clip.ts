import { useEffect, useState } from "react";
import { staticFile, useDelayRender } from "remotion";

// One record per captured frame, as written by tools/capture.js. The record of frame f describes
// the picture of frame f. An event (a key, a cleared word) with frame f or f + 0.5 happens after that
// picture and is first seen in frame floor(f) + 1; on that frame a cleared creature is no longer in
// `ents` and a completed boss word is no longer in `boss.word`.
export type ClipState = {
  readonly t: number;
  readonly screen: string;
  readonly score: number;
  readonly lives: number;
  readonly shield: number;
  readonly wpm: number | null;
  readonly acc: number | null;
  readonly pip: readonly [number, number, string] | null;
  readonly lock: number | null;
  // id, kind, word, letters typed, x, y (game pixels on screen), from, type, seconds until it lands
  // (as the game counts them; typing a letter holds a creature back for a moment), seconds it was
  // given when it appeared. Both are real seconds.
  readonly ents: readonly (readonly [number, string, string, number, number, number, string, string, number | null, number | null])[];
  readonly boss: {
    readonly state: string;
    readonly phase: number;
    readonly health: number;
    readonly max: number;
    readonly x: number;
    readonly y: number;
    readonly word: string | null;
    readonly typed: number;
  } | null;
};

export type ClipData = {
  readonly name: string;
  readonly frames: number;
  // frame, letter, 1 for a correct key and 0 for a wrong one
  readonly keys: readonly (readonly [number, string, number])[];
  // frame, word, kind of creature
  readonly clears: readonly (readonly [number, string, string])[];
  readonly state: readonly ClipState[];
  readonly result: {
    readonly rank: string;
    readonly score: number;
    readonly cleared: boolean;
    readonly livesLost: number;
    readonly continues: number;
    readonly wpm: number;
    readonly accuracy: number;
  } | null;
};

export const GAME_W = 384;
export const GAME_H = 216;

// A captured frame: public/clips/<clip>/NNNN.png at 384 x 216.
export const clipFrame = (clip: string, index: number) => {
  const n = Math.max(0, Math.floor(index));
  // tools/used-frames.js sets this to list the frames a video asks for.
  if (process.env.REMOTION_LOG_FRAMES) console.log(`clipframe ${clip} ${n}`);
  return staticFile(`clips/${clip}/${String(n).padStart(4, "0")}.png`);
};

export const clipSfx = (clip: string) => staticFile(`clips/${clip}/sfx.wav`);

const cache = new Map<string, Promise<ClipData>>();
const loaded = new Map<string, ClipData>();

const load = (clip: string) => {
  let p = cache.get(clip);
  if (!p) {
    p = fetch(staticFile(`clips/${clip}/data.json`))
      .then((r) => {
        if (!r.ok) throw new Error(`no data for clip ${clip}: run tools/capture.js`);
        return r.json() as Promise<ClipData>;
      })
      .then((d) => {
        loaded.set(clip, d);
        return d;
      });
    cache.set(clip, p);
  }
  return p;
};

// The per-frame record of a clip (data.json). Null until it has loaded; rendering waits for it.
export const useClip = (clip: string): ClipData | null => {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [data, setData] = useState<ClipData | null>(() => loaded.get(clip) ?? null);
  useEffect(() => {
    const ready = loaded.get(clip);
    if (ready) {
      setData(ready);
      return;
    }
    const handle = delayRender(`data of clip ${clip}`);
    let live = true;
    load(clip)
      .then((d) => {
        if (live) setData(d);
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
    return () => {
      live = false;
    };
  }, [clip, delayRender, continueRender, cancelRender]);
  return data;
};

// The record of the frame at `at`, clamped to the clip.
export const stateAt = (data: ClipData | null, at: number): ClipState | null => {
  if (!data || data.state.length === 0) return null;
  const i = Math.max(0, Math.min(data.state.length - 1, Math.floor(at)));
  return data.state[i];
};
