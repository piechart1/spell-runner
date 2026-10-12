import type { Crop } from "../../kit/PixelFrame";

// The boss fight of one run: HARD, typed by the test bot at 60 WPM (clips.json, run boss60).
export const CLIP = "boss_fight";

// The frame from top to bottom (1080 x 1920). Everything that matters stays inside y 210 to 1540.
export const TOP_LINE = { top: 212, height: 104 };
export const STRIP = { top: 322, height: 64 };
export const WINDOW = { top: 386, height: 740 };
// The tile row, with the caption 20 pixels under it.
export const TILES = { top: 1146, height: 110 };
// Below the middle of the frame the right-hand edge is covered: words stay between x 40 and x 950.
export const LOW = { left: 40, width: 910 };

// Parts of the 384 x 216 game picture. The window is 1080 x 740.
// Pip, the word plate at the top, the game's banners and the Baron, without the HUD rows: every
// game pixel is 4 x 4.
export const WIDE: Crop = { x: 62, y: 31, w: 270, h: 185 };
// The Baron alone, 8 x 8.
export const BARON_CLOSE: Crop = { x: 228, y: 98, w: 135, h: 93 };
// The mound the Baron comes out of, 9 x 9. It starts on the first row under the game's own banners
// (CHECKPOINT, then THE BARON'S DIG: game rows 96 to 130), so that they stay out of the window. As
// he comes all the way out (clip frames 86 to 90), the top five rows of his helmet pass above the
// crop; the game's banner covers the same rows.
export const MOUND_CLOSE: Crop = { x: 235, y: 131, w: 120, h: 83 };
// Pip's half of the picture, 6 x 6: Pip and what comes at him, without the Baron. It starts under
// the rows where the score of the last rock is still rising.
export const PIP_CLOSE: Crop = { x: 62, y: 80, w: 180, h: 124 };
// The mound and the small mole, 10 x 10.
export const MOLE_CLOSE: Crop = { x: 242, y: 124, w: 108, h: 74 };
// The hole with the sky above it, 11 x 11: it fills the whole frame behind the end card.
export const FOUNTAIN: Crop = { x: 247, y: 41, w: 98, h: 175 };
// A strip of sky, hills and ground between Pip and the Baron, for the blurred colour behind the layout.
export const AMBIENT: Crop = { x: 150, y: 58, w: 74, h: 132 };
// One clip frame from each phase of the fight (the sky darkens with the phase) on which nothing
// crosses that strip. The blurred colour is taken from these and not from the frame in the window,
// because word plates and score popups that pass through the strip show through the blur.
export const AMBIENT_FRAME: Readonly<Record<number, number>> = { 1: 345, 2: 1010, 3: 1745 };

// Clip frames that the video cuts on (node tools/clip-index.js boss_fight).
// The twelfth letter of TYRANNOSAURUS is first seen on frame 2647, where the game draws the Baron
// as a white shape for one frame (the hit flash). The video opens one frame later, when he can be
// seen again; the last S lands after frame 2652.
export const TWELFTH_LETTER = 2647;
export const OPENING_FRAME = 2648;
export const LAST_FRAME_BEFORE_S = 2652;
