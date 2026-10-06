// The scanned cube: 6 faces of 9 colors, read as the camera sees each face (not mirrored), held in a fixed
// order. Converts to the sticker model (FaceletCube), validates that the state can exist, and converts to
// a cubing.js KPattern (for the solver and the 3D view).
import { Alg } from "cubing/alg";
import { KPattern } from "cubing/kpuzzle";
import { type Face, FaceletCube, type Vec } from "../analysis/facelets";
import { loadKPuzzle } from "../cube-state/cubeState";
import type { CubeColor } from "./classifier";

// Scan protocol for the standard color scheme (white on top, green in front): each face is shown to the
// camera with a known color on top, so the layout of every face is known.
export const SCAN_ORDER: { face: Face; center: CubeColor; top: CubeColor }[] = [
  { face: "F", center: "G", top: "W" },
  { face: "R", center: "R", top: "W" },
  { face: "B", center: "B", top: "W" },
  { face: "L", center: "O", top: "W" },
  { face: "U", center: "W", top: "B" },
  { face: "D", center: "Y", top: "G" },
];

// Color of each face's center in the standard scheme (white on top, green in front).
export const STANDARD_SCHEME: Record<Face, CubeColor> = { U: "W", D: "Y", F: "G", B: "B", R: "R", L: "O" };

const NORMAL: Record<Face, Vec> = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
// Direction of "right" and "up" in the image for each face, viewed from outside in the scan protocol.
const AXES: Record<Face, { right: Vec; up: Vec }> = {
  F: { right: [1, 0, 0], up: [0, 1, 0] },
  R: { right: [0, 0, -1], up: [0, 1, 0] },
  B: { right: [-1, 0, 0], up: [0, 1, 0] },
  L: { right: [0, 0, 1], up: [0, 1, 0] },
  U: { right: [1, 0, 0], up: [0, 0, -1] },
  D: { right: [1, 0, 0], up: [0, 0, 1] },
};

// Cubie position of sticker (row, col) of a face in the scan protocol.
export function stickerPosition(face: Face, index: number): Vec {
  const row = Math.floor(index / 3);
  const col = index % 3;
  const n = NORMAL[face];
  const { right, up } = AXES[face];
  return [0, 1, 2].map((i) => n[i] + right[i] * (col - 1) - up[i] * (row - 1)) as Vec;
}

export type CubeNet = Record<Face, CubeColor[]>;

// Reads a FaceletCube in the scan layout (used by tests and by the scramble verification).
export function netOf(cube: FaceletCube, colorOfFace: Record<Face, CubeColor>): CubeNet {
  const net = {} as CubeNet;
  for (const { face } of SCAN_ORDER) {
    net[face] = Array.from({ length: 9 }, (_, i) => colorOfFace[cube.colorAt(stickerPosition(face, i), face)]);
  }
  return net;
}

export type NetProblem =
  | { kind: "count"; color: CubeColor; count: number }
  | { kind: "centers" }
  | { kind: "piece"; colors: CubeColor[] }
  | { kind: "twist" }
  | { kind: "flip" }
  | { kind: "parity" };

export function describeProblem(p: NetProblem): string {
  switch (p.kind) {
    case "count":
      return `A cor ${p.color} aparece ${p.count} vezes (precisam ser 9).`;
    case "centers":
      return "Os centros não formam um cubo válido (cores repetidas ou opostas lado a lado).";
    case "piece":
      return `Existe uma peça impossível com as cores ${p.colors.join("/")}: provavelmente um adesivo lido errado.`;
    case "twist":
      return "Um canto está torcido: o estado não pode ser resolvido. Algum adesivo de canto foi lido errado.";
    case "flip":
      return "Uma aresta está invertida: o estado não pode ser resolvido. Algum adesivo de aresta foi lido errado.";
    case "parity":
      return "Paridade impossível (duas peças trocadas). Confira a leitura das faces.";
  }
}

const FACES: Face[] = ["U", "D", "R", "L", "F", "B"];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// cubing.js orbit order (see curriculum/caseProfile.ts).
const EDGE_SLOTS: Face[][] = [
  ["U", "F"], ["U", "R"], ["U", "B"], ["U", "L"],
  ["D", "F"], ["D", "R"], ["D", "B"], ["D", "L"],
  ["F", "R"], ["F", "L"], ["B", "R"], ["B", "L"],
];
const CORNER_SLOTS: Face[][] = [
  ["U", "F", "R"], ["U", "R", "B"], ["U", "B", "L"], ["U", "L", "F"],
  ["D", "R", "F"], ["D", "F", "L"], ["D", "L", "B"], ["D", "B", "R"],
];

const sum = (faces: Face[]): Vec => faces.reduce<Vec>((acc, f) => [acc[0] + NORMAL[f][0], acc[1] + NORMAL[f][1], acc[2] + NORMAL[f][2]], [0, 0, 0]);

// Corner faces ordered clockwise seen from outside, starting from the U/D face.
function clockwise(faces: Face[]): Face[] {
  const [ud, a, b] = [faces.find((f) => f === "U" || f === "D")!, ...faces.filter((f) => f !== "U" && f !== "D")];
  const pos = sum(faces);
  // a follows ud clockwise when (ud × a) points into the corner… i.e. opposite to the outward diagonal.
  return dot(cross(NORMAL[ud], NORMAL[a]), pos) < 0 ? [ud, a, b] : [ud, b, a];
}

interface Analysis {
  problems: NetProblem[];
  pattern?: { edges: { pieces: number[]; orientation: number[] }; corners: { pieces: number[]; orientation: number[] } };
}

// Validates the net and computes the cubie state in cubing.js conventions.
export function analyzeNet(net: CubeNet): Analysis {
  const problems: NetProblem[] = [];
  const counts = new Map<CubeColor, number>();
  for (const f of FACES) for (const c of net[f]) counts.set(c, (counts.get(c) ?? 0) + 1);
  for (const [color, count] of counts) if (count !== 9) problems.push({ kind: "count", color, count });

  // The face each color belongs to, from the centers.
  const faceOf = new Map<CubeColor, Face>();
  for (const f of FACES) faceOf.set(net[f][4], f);
  if (faceOf.size !== 6) return { problems: [...problems, { kind: "centers" }] };

  const colorAt = (pos: Vec, face: Face): Face => {
    for (let i = 0; i < 9; i++) {
      const p = stickerPosition(face, i);
      if (p[0] === pos[0] && p[1] === pos[1] && p[2] === pos[2]) return faceOf.get(net[face][i])!;
    }
    throw new Error("posição fora da face");
  };

  const edgeKey = (faces: Face[]) => [...faces].sort().join("");
  const edges = { pieces: [] as number[], orientation: [] as number[] };
  const usedEdges = new Set<number>();
  EDGE_SLOTS.forEach((slot) => {
    const pos = sum(slot);
    const stickers = slot.map((f) => colorAt(pos, f)); // colors (as home faces) on slot[0], slot[1]
    const piece = EDGE_SLOTS.findIndex((s) => edgeKey(s) === edgeKey(stickers));
    if (piece < 0 || usedEdges.has(piece)) {
      problems.push({ kind: "piece", colors: stickers.map((f) => net[f][4]) });
      return;
    }
    usedEdges.add(piece);
    edges.pieces.push(piece);
    // The piece's primary sticker (its slot[0] color in the solved cube) sits on this slot's primary face?
    edges.orientation.push(stickers[0] === EDGE_SLOTS[piece][0] ? 0 : 1);
  });

  const cornerKey = (faces: Face[]) => [...faces].sort().join("");
  const corners = { pieces: [] as number[], orientation: [] as number[] };
  const usedCorners = new Set<number>();
  CORNER_SLOTS.forEach((slot) => {
    const pos = sum(slot);
    const order = clockwise(slot);
    const stickers = order.map((f) => colorAt(pos, f));
    const piece = CORNER_SLOTS.findIndex((s) => cornerKey(s) === cornerKey(stickers));
    if (piece < 0 || usedCorners.has(piece)) {
      problems.push({ kind: "piece", colors: stickers.map((f) => net[f][4]) });
      return;
    }
    // Chirality: the piece's own clockwise order must be a rotation of what we read.
    const home = clockwise(CORNER_SLOTS[piece]);
    const twist = stickers.indexOf(home[0]); // where the piece's U/D sticker ended up (0 = on U/D face)
    const rotated = [0, 1, 2].map((k) => stickers[(twist + k) % 3]);
    if (rotated.join() !== home.join()) {
      problems.push({ kind: "piece", colors: stickers.map((f) => net[f][4]) });
      return;
    }
    usedCorners.add(piece);
    corners.pieces.push(piece);
    corners.orientation.push(twist);
  });

  if (problems.length) return { problems };

  if (corners.orientation.reduce((a, b) => a + b, 0) % 3 !== 0) problems.push({ kind: "twist" });
  if (edges.orientation.reduce((a, b) => a + b, 0) % 2 !== 0) problems.push({ kind: "flip" });
  const parity = (perm: number[]) => {
    let swaps = 0;
    const seen = new Array(perm.length).fill(false);
    for (let i = 0; i < perm.length; i++) {
      if (seen[i]) continue;
      let len = 0;
      for (let j = i; !seen[j]; j = perm[j]) {
        seen[j] = true;
        len++;
      }
      swaps += len - 1;
    }
    return swaps % 2;
  };
  if (parity(edges.pieces) !== parity(corners.pieces)) problems.push({ kind: "parity" });
  return { problems, pattern: { edges, corners } };
}

// Requires a net without problems. Centers in the solved position (the scan protocol fixes the orientation).
export async function netToPattern(net: CubeNet): Promise<KPattern> {
  const { problems, pattern } = analyzeNet(net);
  if (problems.length || !pattern) throw new Error(problems.map(describeProblem).join(" "));
  const kpuzzle = await loadKPuzzle();
  const base = kpuzzle.defaultPattern().patternData;
  return new KPattern(kpuzzle, {
    EDGES: { pieces: pattern.edges.pieces, orientation: pattern.edges.orientation },
    CORNERS: { pieces: pattern.corners.pieces, orientation: pattern.corners.orientation },
    CENTERS: base.CENTERS,
  });
}

// A setup algorithm that reproduces the scanned state from a solved cube (for the 3D view and the timer).
export async function setupAlgFor(net: CubeNet): Promise<string> {
  const { experimentalSolve3x3x3IgnoringCenters } = await import("cubing/search");
  const solution = await experimentalSolve3x3x3IgnoringCenters(await netToPattern(net));
  return new Alg(solution).invert().toString().replace(/2'/g, "2");
}
