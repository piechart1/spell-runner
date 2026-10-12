import type { Crop } from "../../kit/PixelFrame";
import { COLORS } from "../../theme";

// The frame is 1080 x 1920. Words and graphics stay inside y 210 to 1540, and below the middle
// they also stay left of x 950.

// The block of headline text above the two runs.
export const HEAD = { left: 40, top: 210, width: 1000, height: 296 } as const;

// One run is a label strip, the game picture under it and a narrow column on the right.
// The picture is the whole 384 x 216 game frame at twice its size, so every game pixel is square.
export const BAND = { left: 44, width: 768, height: 432 } as const;
export const STRIP = { left: 40, width: 776, height: 60 } as const;
export const COLUMN = { left: 828, width: 120 } as const;
// From the top of the strip to the bottom of the picture.
export const RUN_HEIGHT = STRIP.height + 4 + BAND.height;

export type RunId = "fast" | "slow";

// The two runs. The speeds are the WPM figures on the two results screens (data.result.wpm). `set`
// is the accuracy the test bot was set to for the run, in per cent (clips.json: 0.95 for fast120
// and 0.99 for slow40). Neither run is gold: gold is the colour of rank S.
export const RUNS = {
  fast: { label: "120 WPM", set: 95, colour: COLORS.white, top: 516, play: "fast_run", results: "fast_results" },
  slow: { label: "40 WPM", set: 99, colour: COLORS.aqua, top: 1028, play: "slow_run", results: "slow_results" },
} as const;

// How long the strip says WRONG KEY after a wrong key, and when its coral has faded, in frames.
export const WRONG_KEY = { label: 20, fade: 26 } as const;

// The colours the game draws the rank letters in (measured on the results screens).
export const RANK_COLOURS: Record<string, string> = { S: COLORS.gold, A: "#B8F050" };

// The first frame of a results clip that shows the rank letter (the game's ui:stamp event is at 106.5).
export const STAMP_FRAME = 107;
// The last frame of a results clip. The screen is still by then.
export const RESULTS_LAST = 269;

// The results screen in game pixels: the rows from SCORE to KEYS TO PRACTISE (x 64 to 320, y 44 to
// 188) with a few pixels around them, in the shape of the whole picture.
export const RESULT_ROWS: Crop = { x: 56, y: 40, w: 272, h: 153 };
// The top of the text of three rows of the results screen (each is 7 game pixels high).
export const ROW_Y = { total: 112, wpm: 128, accuracy: 144 } as const;

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
