// Fast sticker-permutation model for the move decoder: a state is 54 face indices in the scan layout
// (vision/cubeNet.ts), so the 9 stickers of the face shown to the camera are slots F[0..8] in camera view.
import { Move } from "cubing/alg";
import { type Face, FACE_NORMAL, FaceletCube, transformSticker, type Vec } from "../analysis/facelets";
import { SCAN_ORDER, stickerPosition } from "../vision/cubeNet";

export const SLOT_FACES: Face[] = SCAN_ORDER.map((s) => s.face); // F R B L U D
export const FACE_INDEX: Record<Face, number> = Object.fromEntries(SLOT_FACES.map((f, i) => [f, i])) as Record<Face, number>;

const SLOTS: { pos: Vec; normal: Vec }[] = SLOT_FACES.flatMap((face) =>
  Array.from({ length: 9 }, (_, i) => ({ pos: stickerPosition(face, i), normal: FACE_NORMAL[face] })),
);
const key = (pos: Vec, normal: Vec) => `${pos.join(",")}|${normal.join(",")}`;
const SLOT_OF = new Map(SLOTS.map((s, i) => [key(s.pos, s.normal), i]));

export type StickerState = Uint8Array; // 54 face indices (colors), slot order above

const permCache = new Map<string, Int32Array>();

// dest[i] = slot where the sticker in slot i ends up.
export function movePermutation(move: string): Int32Array {
  let perm = permCache.get(move);
  if (!perm) {
    const m = Move.fromString(move);
    perm = new Int32Array(54);
    SLOTS.forEach((s, i) => {
      const t = transformSticker(m, s.pos, s.normal);
      perm![i] = SLOT_OF.get(key(t.pos, t.normal))!;
    });
    permCache.set(move, perm);
  }
  return perm;
}

export function applyMove(state: StickerState, move: string): StickerState {
  const perm = movePermutation(move);
  const out = new Uint8Array(54);
  for (let i = 0; i < 54; i++) out[perm[i]] = state[i];
  return out;
}

export function stateFromCube(cube: FaceletCube): StickerState {
  const out = new Uint8Array(54);
  SLOTS.forEach((s, i) => {
    const face = SLOT_FACES.find((f) => FACE_NORMAL[f].every((v, k) => v === s.normal[k]))!;
    out[i] = FACE_INDEX[cube.colorAt(s.pos, face)];
  });
  return out;
}

export const solvedState = (): StickerState => stateFromCube(FaceletCube.solved());

// The 9 stickers the camera sees (the face in front, F), in camera view order.
export const visibleFace = (state: StickerState): number[] => Array.from(state.subarray(0, 9));

export const stateKey = (state: StickerState) => state.join("");
