// F4.2: recognises the last-layer case at the start of the OLL and the PLL.
// Cases are compared by a canonical key of the last-layer stickers (invariant to AUF and to the side
// the cube is viewed from), computed from the cross-on-D view of the cube.
import { Alg } from "cubing/alg";
import { LEVELS } from "../curriculum/curriculum";
import { type Face, FaceletCube, type Vec } from "./facelets";

// Top-row stickers of the four sides, read left → right, sides in U order (F, R, B, L).
const SIDE_TOPS: [Vec, Face][][] = [
  [[[-1, 1, 1], "F"], [[0, 1, 1], "F"], [[1, 1, 1], "F"]],
  [[[1, 1, 1], "R"], [[1, 1, 0], "R"], [[1, 1, -1], "R"]],
  [[[1, 1, -1], "B"], [[0, 1, -1], "B"], [[-1, 1, -1], "B"]],
  [[[-1, 1, -1], "L"], [[-1, 1, 0], "L"], [[-1, 1, 1], "L"]],
];
// U face stickers around the center, clockwise from the back-left corner (as seen from above).
const U_RING: Vec[] = [
  [-1, 1, -1],
  [0, 1, -1],
  [1, 1, -1],
  [1, 1, 0],
  [1, 1, 1],
  [0, 1, 1],
  [-1, 1, 1],
  [-1, 1, 0],
];

const VIEWS = ["", "y", "y2", "y'"];
const AUFS = ["", "U", "U2", "U'"];

// Turns the cube so that the cross color is on D (the last layer on U).
export function crossDown(cube: FaceletCube, crossColor: Face): FaceletCube {
  for (const r of ["", "x", "x'", "x2", "z", "z'"]) {
    const turned = r ? cube.apply(r) : cube;
    if (turned.faceOfColor(crossColor) === "D") return turned;
  }
  throw new Error(`cor da cruz não encontrada: ${crossColor}`);
}

// Orientation pattern: which of the 21 last-layer stickers show the U color (1) or not (0).
function orientationKey(cube: FaceletCube): string {
  let best: string | null = null;
  for (const a of AUFS) {
    const c = a ? cube.apply(a) : cube;
    const top = c.centerColor("U");
    const ring = U_RING.map((p) => (c.colorAt(p, "U") === top ? 1 : 0)).join("");
    const sides = SIDE_TOPS.map((side) => side.map(([p, f]) => (c.colorAt(p, f) === top ? 1 : 0)).join("")).join("");
    const key = `${ring}|${sides}`;
    if (best === null || key < best) best = key;
  }
  return best!;
}

// Permutation pattern of an oriented last layer: each side sticker as an offset (0–3) from the side whose
// center has its color, relative to the side it is on. Minimised over viewing side and AUF on both ends.
function permutationKey(cube: FaceletCube): string {
  let best: string | null = null;
  for (const v of VIEWS) {
    for (const a of AUFS) {
      const c = cube.apply(`${v} ${a}`.trim() || "U4");
      const centers = (["F", "R", "B", "L"] as Face[]).map((f) => c.centerColor(f));
      const key = SIDE_TOPS.map((side, i) => side.map(([p, f]) => (centers.indexOf(c.colorAt(p, f)) - i + 4) % 4).join("")).join("");
      if (best === null || key < best) best = key;
    }
  }
  return best!;
}

// The 21 PLLs live in the curriculum (docs/curriculum/avancado.json), the single source of truth.
export const PLL_ALGS: Record<string, string> = Object.fromEntries(
  LEVELS.flatMap((l) => l.itens)
    .find((i) => i.id === "adv-01-pll-completo")!
    .algoritmos.map((a) => [a.nome, a.alg]),
);

// The 57 OLLs, numbered, also from the curriculum.
export const OLL_ALGS: Record<string, string> = Object.fromEntries(
  LEVELS.flatMap((l) => l.itens)
    .find((i) => i.id === "adv-02-oll-completo")!
    .algoritmos.map((a) => [a.nome, a.alg]),
);

// 2-look OLL cases (validated in the curriculum tests): corner cases with edges oriented, and edge shapes.
export const OLL_CORNER_ALGS: Record<string, string> = {
  Sune: "R U R' U R U2 R'",
  Antisune: "R U2 R' U' R U' R'",
  H: "R U R' U R U' R' U R U2 R'",
  Pi: "R U2 R2 U' R2 U' R2 U2 R",
  Headlights: "R2 D' R U2 R' D R U2 R",
  T: "r U R' U' r' F R F'",
  Bowtie: "F' r U R' U' r' F R",
};

const solved = FaceletCube.solved();
const caseOf = (alg: string) => solved.apply(new Alg(alg).invert());

let pllTable: Map<string, string> | undefined;
let ollCornerTable: Map<string, string> | undefined;
let ollTable: Map<string, string> | undefined;

function tables() {
  pllTable ??= new Map(Object.entries(PLL_ALGS).map(([name, alg]) => [permutationKey(caseOf(alg)), name]));
  ollCornerTable ??= new Map(Object.entries(OLL_CORNER_ALGS).map(([name, alg]) => [orientationKey(caseOf(alg)), name]));
  ollTable ??= new Map(Object.entries(OLL_ALGS).map(([name, alg]) => [orientationKey(caseOf(alg)), name]));
  return { pllTable, ollCornerTable, ollTable };
}

export function pllKey(cube: FaceletCube): string {
  return permutationKey(cube);
}

// Name of the PLL case of a cube whose last layer (on U) is oriented; "skip" when already solved.
export function recognizePll(cube: FaceletCube): string | null {
  if (cube.isSolved() || cube.apply("U").isSolved() || cube.apply("U2").isSolved() || cube.apply("U'").isSolved()) return "skip";
  return tables().pllTable.get(permutationKey(cube)) ?? null;
}

export type EdgeShape = "cruz" | "linha" | "L" | "ponto";

// 2-look description of an OLL case: edge shape on top and, with a cross, the corner case.
export function recognizeOll(cube: FaceletCube): { edges: EdgeShape; corners: string | null; number: string | null } {
  const top = cube.centerColor("U");
  const edgeUp = [U_RING[1], U_RING[3], U_RING[5], U_RING[7]].map((p) => cube.colorAt(p, "U") === top);
  const count = edgeUp.filter(Boolean).length;
  const edges: EdgeShape =
    count === 4 ? "cruz" : count === 0 ? "ponto" : edgeUp[0] === edgeUp[2] ? "linha" : "L";
  const key = orientationKey(cube);
  const number = tables().ollTable.get(key) ?? null;
  if (edges !== "cruz") return { edges, corners: null, number };
  const allUp = U_RING.every((p) => cube.colorAt(p, "U") === top);
  return { edges, corners: allUp ? "skip" : (tables().ollCornerTable.get(key) ?? null), number };
}
