import { loadFont } from "@remotion/google-fonts/PressStart2P";

const { fontFamily } = loadFont("normal", { weights: ["400"], subsets: ["latin"] });

// The game's own palette (docs/DESIGN.md, section 14.2).
export const COLORS = {
  ink: "#0F0F1B",
  stone: "#5C6078",
  silver: "#A9B0C3",
  white: "#F8F8F8",
  sky: "#5C94FC",
  gold: "#F8C020",
  aqua: "#6EF0E0",
  red: "#D82C2C",
  coral: "#F86858",
};

export const FONT = fontFamily;

export const PLAY_URL = "piechart1.github.io/spell-runner";

// Captured gameplay: frames in public/frames/<clip>/f-NN.png at 384 x 216, 30 per second.
export const CLIPS = {
  m1: 240,
  m3: 200,
  boss: 240,
  easy: 170,
  hard: 200,
} as const;

export type ClipName = keyof typeof CLIPS;
