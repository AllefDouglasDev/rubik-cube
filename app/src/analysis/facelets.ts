// Sticker-level 3x3 model: each sticker has a cubie position and a normal in {-1,0,1}³.
// A move rotates the stickers of its layers by 90° around the face axis, so wide moves, slices and
// whole-cube rotations (which move the centers) all work the same way. Checks compare stickers to centers.
import { Alg, type Move } from "cubing/alg";

export type Vec = [number, number, number];
export type Face = "U" | "D" | "R" | "L" | "F" | "B";

export const FACES: Face[] = ["U", "D", "R", "L", "F", "B"];
const NORMAL: Record<Face, Vec> = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
export const OPPOSITE: Record<Face, Face> = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };

interface Sticker {
  pos: Vec;
  normal: Vec;
  color: Face; // the face it started on (its color)
}

const eq = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Clockwise quarter turn looking at the face whose normal is `axis` (right-handed: -90° around the axis).
function rotateCw(v: Vec, axis: Vec): Vec {
  const [x, y, z] = v;
  if (axis[0]) return axis[0] > 0 ? [x, z, -y] : [x, -z, y];
  if (axis[1]) return axis[1] > 0 ? [-z, y, x] : [z, y, -x];
  return axis[2] > 0 ? [y, -x, z] : [-y, x, z];
}

// Move family → (face whose axis it turns around like, layers selected by the coordinate along that axis).
const FAMILIES: Record<string, { face: Face; layers: number[] }> = {
  U: { face: "U", layers: [1] },
  D: { face: "D", layers: [1] },
  R: { face: "R", layers: [1] },
  L: { face: "L", layers: [1] },
  F: { face: "F", layers: [1] },
  B: { face: "B", layers: [1] },
  u: { face: "U", layers: [1, 0] },
  d: { face: "D", layers: [1, 0] },
  r: { face: "R", layers: [1, 0] },
  l: { face: "L", layers: [1, 0] },
  f: { face: "F", layers: [1, 0] },
  b: { face: "B", layers: [1, 0] },
  Uw: { face: "U", layers: [1, 0] },
  Dw: { face: "D", layers: [1, 0] },
  Rw: { face: "R", layers: [1, 0] },
  Lw: { face: "L", layers: [1, 0] },
  Fw: { face: "F", layers: [1, 0] },
  Bw: { face: "B", layers: [1, 0] },
  M: { face: "L", layers: [0] },
  E: { face: "D", layers: [0] },
  S: { face: "F", layers: [0] },
  x: { face: "R", layers: [1, 0, -1] },
  y: { face: "U", layers: [1, 0, -1] },
  z: { face: "F", layers: [1, 0, -1] },
};

export const ROTATION_FAMILIES = new Set(["x", "y", "z"]);

// Where a sticker at (pos, normal) goes under `move` (unchanged if the move does not turn its layer).
export function transformSticker(move: Move, pos: Vec, normal: Vec): { pos: Vec; normal: Vec } {
  const family = FAMILIES[move.family];
  if (!family) throw new Error(`Movimento não suportado: ${move.toString()}`);
  const axis = NORMAL[family.face];
  if (!family.layers.includes(dot(pos, axis))) return { pos, normal };
  const turns = ((move.amount % 4) + 4) % 4;
  for (let i = 0; i < turns; i++) {
    pos = rotateCw(pos, axis);
    normal = rotateCw(normal, axis);
  }
  return { pos, normal };
}

export const FACE_NORMAL = NORMAL;

export class FaceletCube {
  private constructor(private readonly stickers: Sticker[]) {}

  static solved(): FaceletCube {
    const stickers: Sticker[] = [];
    for (const face of FACES) {
      const n = NORMAL[face];
      for (const a of [-1, 0, 1]) {
        for (const b of [-1, 0, 1]) {
          // Position = normal plus two free coordinates on the other axes.
          const free = [0, 1, 2].filter((i) => n[i] === 0);
          const pos: Vec = [...n] as Vec;
          pos[free[0]] = a;
          pos[free[1]] = b;
          stickers.push({ pos, normal: [...n] as Vec, color: face });
        }
      }
    }
    return new FaceletCube(stickers);
  }

  applyMove(move: Move): FaceletCube {
    const family = FAMILIES[move.family];
    if (!family) throw new Error(`Movimento não suportado: ${move.toString()}`);
    if (move.innerLayer != null || move.outerLayer != null) throw new Error(`Camadas numeradas não suportadas: ${move.toString()}`);
    const axis = NORMAL[family.face];
    const turns = (((move.amount % 4) + 4) % 4) as 0 | 1 | 2 | 3;
    const stickers = this.stickers.map((s) => {
      if (!family.layers.includes(dot(s.pos, axis))) return s;
      let { pos, normal } = s;
      for (let i = 0; i < turns; i++) {
        pos = rotateCw(pos, axis);
        normal = rotateCw(normal, axis);
      }
      return { pos, normal, color: s.color };
    });
    return new FaceletCube(stickers);
  }

  apply(alg: string | Alg): FaceletCube {
    let cube: FaceletCube = this;
    for (const m of (typeof alg === "string" ? new Alg(alg) : alg).experimentalLeafMoves()) cube = cube.applyMove(m);
    return cube;
  }

  // Color shown at a cubie position on the face with normal `face`.
  colorAt(pos: Vec, face: Face): Face {
    const n = NORMAL[face];
    return this.stickers.find((s) => eq(s.pos, pos) && eq(s.normal, n))!.color;
  }

  // Color of the center currently pointing to `face` (rotations and slices move centers).
  centerColor(face: Face): Face {
    return this.colorAt(NORMAL[face], face);
  }

  // Spatial face where the center of `color` currently is.
  faceOfColor(color: Face): Face {
    return FACES.find((f) => this.centerColor(f) === color)!;
  }

  // A cubie is solved when each of its stickers matches the center of the face it points to.
  private cubieSolved(pos: Vec): boolean {
    return FACES.filter((f) => dot(pos, NORMAL[f]) === 1).every((f) => this.colorAt(pos, f) === this.centerColor(f));
  }

  private cubies(predicate: (pos: Vec) => boolean): Vec[] {
    const out: Vec[] = [];
    for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (predicate([x, y, z])) out.push([x, y, z]);
    return out;
  }

  isSolved(): boolean {
    return FACES.every((f) => this.faceColors(f).every((c) => c === this.centerColor(f)));
  }

  faceColors(face: Face): Face[] {
    const n = NORMAL[face];
    return this.stickers.filter((s) => eq(s.normal, n)).map((s) => s.color);
  }

  // Cross on the face whose center has `color`: its 4 edges solved.
  crossSolved(color: Face): boolean {
    const n = NORMAL[this.faceOfColor(color)];
    return this.cubies((p) => dot(p, n) === 1 && countNonZero(p) === 2).every((p) => this.cubieSolved(p));
  }

  // Number of solved F2L pairs (corner + middle-layer edge) for the cross on `color`. Requires the cross.
  f2lPairs(color: Face): number {
    const n = NORMAL[this.faceOfColor(color)];
    const corners = this.cubies((p) => dot(p, n) === 1 && countNonZero(p) === 3);
    return corners.filter((c) => {
      const edge: Vec = [c[0] - n[0], c[1] - n[1], c[2] - n[2]]; // the middle-layer edge above the corner
      return this.cubieSolved(c) && this.cubieSolved(edge);
    }).length;
  }

  f2lSolved(color: Face): boolean {
    return this.crossSolved(color) && this.f2lPairs(color) === 4;
  }

  // Last layer oriented: the face opposite to the cross shows a single color.
  lastLayerOriented(crossColor: Face): boolean {
    const top = OPPOSITE[this.faceOfColor(crossColor)];
    const center = this.centerColor(top);
    return this.faceColors(top).every((c) => c === center);
  }
}

function countNonZero(p: Vec): number {
  return p.filter((v) => v !== 0).length;
}
