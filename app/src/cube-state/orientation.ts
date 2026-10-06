// How the solved cube is held before applying a scramble: white on the bottom, green in front (so yellow on
// top and orange on the right). This is a user preference, not the WCA default (white top, green front):
// the scramble is applied after the rotation below, so previews and the virtual cube match the real cube.
// The camera scan (SCAN_ORDER) keeps its own protocol and does not use this.
import type { Face } from "../analysis/facelets";
import type { CubeColor } from "../vision/classifier";

// Whole-cube rotation from the WCA orientation to the start position.
export const START_ROTATION = "z2";

// Color shown at each face position in the start position.
export const START_SCHEME: Record<Face, CubeColor> = { U: "Y", D: "W", F: "G", B: "B", R: "O", L: "R" };

// The scramble as applied from the start position, for cubing.js and FaceletCube. Read the resulting
// FaceletCube with STANDARD_SCHEME (the color of each sticker's original face).
export function fromStartPosition(scramble: string): string {
  return `${START_ROTATION} ${scramble}`.trim();
}

