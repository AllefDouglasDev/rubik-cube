import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { locateFace } from "./faceLocator";

// OpenCV.js runs in Node: faces are drawn synthetically (black cube body, colored stickers) under a known
// transform, and the located centers are compared with the true ones.
type CV = any;
let cv: CV;

beforeAll(async () => {
  // In Node the package exports a promise of the module, and the module itself has a `then` method, so it
  // cannot be awaited directly (it would be unwrapped again): take it inside the callback.
  const mod = createRequire(import.meta.url)("@techstark/opencv-js") as Promise<CV>;
  await new Promise<void>((resolve) =>
    mod.then((m: CV) => {
      cv = m;
      resolve();
    }),
  );
}, 60_000);

type Pt = [number, number];
const COLORS = [
  [232, 232, 226],
  [242, 208, 42],
  [184, 32, 42],
  [240, 106, 30],
  [28, 79, 174],
  [31, 154, 85],
];

// Grid point (col,row) in [-0.5, 2.5] → image, through a homography-like projection.
function makeProjector(cx: number, cy: number, cell: number, angleDeg: number, tilt = 0): (p: Pt) => Pt {
  const a = (angleDeg * Math.PI) / 180;
  return ([gx, gy]) => {
    const x = (gx - 1) * cell;
    const y = (gy - 1) * cell;
    const w = 1 + tilt * (gx - 1); // perspective: one side farther away
    return [cx + (x * Math.cos(a) - y * Math.sin(a)) / w, cy + (x * Math.sin(a) + y * Math.cos(a)) / w];
  };
}

function render(project: (p: Pt) => Pt, occlude: number[] = []): { mat: any; centers: Pt[] } {
  const mat = new cv.Mat(480, 640, cv.CV_8UC4, new cv.Scalar(90, 85, 80, 255));
  const poly = (pts: Pt[], color: number[]) => {
    const m = cv.matFromArray(pts.length, 1, cv.CV_32SC2, pts.flatMap(([x, y]) => [Math.round(x), Math.round(y)]));
    const v = new cv.MatVector();
    v.push_back(m);
    cv.fillPoly(mat, v, new cv.Scalar(color[0], color[1], color[2], 255));
    v.delete();
    m.delete();
  };
  poly([project([-0.55, -0.55]), project([2.55, -0.55]), project([2.55, 2.55]), project([-0.55, 2.55])], [15, 15, 15]);
  const centers: Pt[] = [];
  for (let i = 0; i < 9; i++) {
    const gx = i % 3;
    const gy = Math.floor(i / 3);
    const m = 0.42;
    centers.push(project([gx, gy]));
    poly([project([gx - m, gy - m]), project([gx + m, gy - m]), project([gx + m, gy + m]), project([gx - m, gy + m])], COLORS[(i * 2) % 6]);
  }
  // A "finger": a skin-colored blob over some stickers.
  for (const i of occlude) {
    const [x, y] = centers[i];
    cv.circle(mat, new cv.Point(Math.round(x), Math.round(y)), 30, new cv.Scalar(225, 170, 140, 255), -1);
  }
  return { mat, centers };
}

function check(project: (p: Pt) => Pt, cell: number, occlude: number[] = []) {
  const { mat, centers } = render(project, occlude);
  try {
    const face = locateFace(cv, mat);
    expect(face).not.toBeNull();
    const maxError = Math.max(...face!.centers.map((c, i) => Math.hypot(c[0] - centers[i][0], c[1] - centers[i][1])));
    expect(maxError).toBeLessThan(cell * 0.2);
    return face!;
  } finally {
    mat.delete();
  }
}

describe("locateFace", () => {
  it("finds an upright face in the middle", () => {
    expect(check(makeProjector(320, 240, 60, 0), 60).stickersFound).toBe(9);
  });

  it("finds a rotated face", () => {
    check(makeProjector(300, 250, 55, 22), 55);
    check(makeProjector(340, 230, 55, -30), 55);
  });

  it("finds a small face off-center", () => {
    check(makeProjector(150, 120, 32, 8), 32);
  });

  it("handles perspective (face tilted away on one side)", () => {
    check(makeProjector(320, 240, 60, 5, 0.12), 60);
  });

  it("still locates the face with fingers over two stickers", () => {
    const face = check(makeProjector(320, 240, 60, 10), 60, [0, 5]);
    expect(face.stickersFound).toBeLessThan(9);
  });

  it("returns null when there is no cube", () => {
    const mat = new cv.Mat(480, 640, cv.CV_8UC4, new cv.Scalar(90, 85, 80, 255));
    expect(locateFace(cv, mat)).toBeNull();
    mat.delete();
  });
});

describe("locateFace on random poses", () => {
  it("locates ≥90% of faces (scale 30–80 px, ±35°, perspective, 0–2 fingers)", () => {
    let seed = 5;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let ok = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const cell = 30 + rand() * 50;
      const margin = cell * 2;
      const project = makeProjector(margin + rand() * (640 - 2 * margin), margin + rand() * (480 - 2 * margin), cell, -35 + rand() * 70, rand() * 0.15);
      const fingers = Array.from({ length: Math.floor(rand() * 3) }, () => Math.floor(rand() * 9));
      const { mat, centers } = render(project, fingers);
      const face = locateFace(cv, mat);
      mat.delete();
      if (face && Math.max(...face.centers.map((c, k) => Math.hypot(c[0] - centers[k][0], c[1] - centers[k][1]))) < cell * 0.2) ok++;
    }
    console.log(`localizador: ${ok}/${N} faces localizadas`);
    expect(ok / N).toBeGreaterThanOrEqual(0.9);
  }, 60_000);
});
