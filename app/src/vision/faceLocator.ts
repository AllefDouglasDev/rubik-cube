// F3.1: finds a cube face anywhere in the image (classic pipeline, OpenCV.js):
// edges → sticker-like quads → keep a cluster of similar size and angle → undo the rotation and snap to a
// 3×3 lattice → homography from lattice to image (handles tilt and perspective) → the 9 sticker centers.
// Works with 5+ visible stickers, so fingers over a few stickers do not lose the face.

// OpenCV.js has no usable typings for this API surface.
type CV = any;
type Pt = [number, number];

export interface LocatedFace {
  centers: Pt[]; // 9 sticker centers, row by row as the camera sees the face
  corners: Pt[]; // outer corners of the face: top-left, top-right, bottom-right, bottom-left
  cellSize: number; // pixels, approximate
  stickersFound: number;
}

interface Candidate {
  center: Pt;
  size: number;
  angle: number; // degrees in [-45, 45)
}

function normAngle(deg: number): number {
  let a = ((deg % 90) + 90) % 90;
  if (a >= 45) a -= 90;
  return a;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function findCandidates(cv: CV, rgba: any): Candidate[] {
  const gray = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  const out: Candidate[] = [];
  try {
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    cv.Canny(gray, edges, 20, 60);
    cv.dilate(edges, edges, kernel);
    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const frameArea = rgba.rows * rgba.cols;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const area = cv.contourArea(c);
      if (area > frameArea / 2500 && area < frameArea / 12) {
        const approx = new cv.Mat();
        cv.approxPolyDP(c, approx, 0.1 * cv.arcLength(c, true), true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          const p = Array.from({ length: 4 }, (_, k) => [approx.data32S[k * 2], approx.data32S[k * 2 + 1]] as Pt);
          const sides = p.map((a, k) => Math.hypot(p[(k + 1) % 4][0] - a[0], p[(k + 1) % 4][1] - a[1]));
          const ratio = Math.min(...sides) / Math.max(...sides);
          const fill = area / ((sides[0] + sides[2]) / 2 * ((sides[1] + sides[3]) / 2));
          if (ratio > 0.6 && fill > 0.8) {
            out.push({
              center: [(p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4, (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4],
              size: Math.sqrt(area),
              angle: normAngle((Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]) * 180) / Math.PI),
            });
          }
        }
        approx.delete();
      }
      c.delete();
    }
  } finally {
    [gray, edges, contours, hierarchy, kernel].forEach((m) => m.delete());
  }
  // Inner and outer contours of the same sticker: keep one.
  const unique: Candidate[] = [];
  for (const c of out.sort((a, b) => b.size - a.size)) {
    const duplicate = unique.some(
      (u) => u.size < c.size * 1.6 && Math.hypot(u.center[0] - c.center[0], u.center[1] - c.center[1]) < u.size * 0.4,
    );
    if (!duplicate) unique.push(c);
  }
  return unique;
}

export function locateFace(cv: CV, rgba: any): LocatedFace | null {
  const found = locateAtScale(cv, rgba);
  if (found) return found;
  // A small face (far from the camera): the edges of neighbouring stickers merge; retry at 2× size.
  const up = new cv.Mat();
  try {
    cv.pyrUp(rgba, up);
    const big = locateAtScale(cv, up);
    if (!big) return null;
    const half = (pts: Pt[]) => pts.map(([x, y]) => [x / 2, y / 2] as Pt);
    return { ...big, centers: half(big.centers), corners: half(big.corners), cellSize: big.cellSize / 2 };
  } finally {
    up.delete();
  }
}

function locateAtScale(cv: CV, rgba: any): LocatedFace | null {
  const candidates = findCandidates(cv, rgba);
  if (candidates.length < 5) return null;

  let best: { points: { grid: Pt; image: Pt }[]; spacing: number } | null = null;
  // Try each candidate's size as the reference; keep the lattice that explains the most stickers.
  for (const ref of candidates) {
    const group = candidates.filter((c) => c.size > ref.size * 0.7 && c.size < ref.size * 1.4 && Math.abs(normAngle(c.angle - ref.angle)) < 15);
    if (group.length < 5) continue;
    const theta = (median(group.map((c) => normAngle(c.angle - ref.angle))) + ref.angle) * (Math.PI / 180);
    const cos = Math.cos(-theta);
    const sin = Math.sin(-theta);
    const rotated = group.map((c) => [c.center[0] * cos - c.center[1] * sin, c.center[0] * sin + c.center[1] * cos] as Pt);
    // Lattice spacing: median distance to the nearest other sticker.
    const spacing = median(rotated.map((p, i) => Math.min(...rotated.filter((_, j) => j !== i).map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
    const origin = rotated[0];
    const cells = rotated.map((p) => [Math.round((p[0] - origin[0]) / spacing), Math.round((p[1] - origin[1]) / spacing)] as Pt);
    // The 3×3 window containing the most stickers (well snapped to the lattice).
    for (let ox = -2; ox <= 0; ox++) {
      for (let oy = -2; oy <= 0; oy++) {
        const points: { grid: Pt; image: Pt }[] = [];
        const used = new Set<string>();
        cells.forEach(([cx, cy], i) => {
          const gx = cx - ox;
          const gy = cy - oy;
          const snap = Math.hypot((rotated[i][0] - origin[0]) / spacing - cx, (rotated[i][1] - origin[1]) / spacing - cy);
          const key = `${gx},${gy}`;
          if (gx >= 0 && gx <= 2 && gy >= 0 && gy <= 2 && snap < 0.3 && !used.has(key)) {
            used.add(key);
            points.push({ grid: [gx, gy], image: group[i].center });
          }
        });
        if (points.length >= 5 && (!best || points.length > best.points.length)) best = { points, spacing };
      }
    }
  }
  if (!best) return null;

  const src = cv.matFromArray(best.points.length, 1, cv.CV_32FC2, best.points.flatMap((p) => p.grid));
  const dst = cv.matFromArray(best.points.length, 1, cv.CV_32FC2, best.points.flatMap((p) => p.image));
  const H = cv.findHomography(src, dst, 0);
  const project = (pts: Pt[]): Pt[] => {
    const inMat = cv.matFromArray(pts.length, 1, cv.CV_32FC2, pts.flat());
    const outMat = new cv.Mat();
    cv.perspectiveTransform(inMat, outMat, H);
    const res = pts.map((_, i) => [outMat.data32F[i * 2], outMat.data32F[i * 2 + 1]] as Pt);
    inMat.delete();
    outMat.delete();
    return res;
  };
  try {
    if (H.empty()) return null;
    const grid: Pt[] = Array.from({ length: 9 }, (_, i) => [i % 3, Math.floor(i / 3)]);
    return {
      centers: project(grid),
      corners: project([
        [-0.5, -0.5],
        [2.5, -0.5],
        [2.5, 2.5],
        [-0.5, 2.5],
      ]),
      cellSize: best.spacing,
      stickersFound: best.points.length,
    };
  } finally {
    [src, dst, H].forEach((m) => m.delete());
  }
}
