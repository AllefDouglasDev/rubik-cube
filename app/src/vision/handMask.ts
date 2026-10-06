// Marks guide cells covered by a hand as unknown. Hands come from MediaPipe as 21 landmarks each; the
// covered area is the convex hull of the landmarks, grown a little (fingers are wider than their joints).
import { guideRect, type Guide } from "./sampler";

type Pt = [number, number];

export function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Grows a polygon away from its centroid by `margin` pixels.
function grow(poly: Pt[], margin: number): Pt[] {
  const cx = poly.reduce((a, p) => a + p[0], 0) / poly.length;
  const cy = poly.reduce((a, p) => a + p[1], 0) / poly.length;
  return poly.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / d) * margin, y + ((y - cy) / d) * margin];
  });
}

// For each sticker center (pixels), whether a hand covers its sampled area (a square of side `sample`).
export function coveredAt(hands: Pt[][], centers: Pt[], cell: number, sample: number, width: number, height: number): boolean[] {
  const half = sample / 2;
  const hulls = hands.map((h) => grow(convexHull(h.map(([x, y]) => [x * width, y * height] as Pt)), cell * 0.15));
  return centers.map(([cx, cy]) => {
    const probes: Pt[] = [
      [cx, cy],
      [cx - half, cy - half],
      [cx + half, cy - half],
      [cx - half, cy + half],
      [cx + half, cy + half],
    ];
    return hulls.some((hull) => probes.some((p) => inside(p, hull)));
  });
}

// For each of the 9 guide cells (camera view), whether a hand covers its sampled center area.
export function coveredCells(hands: Pt[][], width: number, height: number, guide: Guide): boolean[] {
  const g = guideRect(width, height, guide);
  const cell = g.size / 3;
  const centers = Array.from({ length: 9 }, (_, i) => [g.x + (i % 3) * cell + cell / 2, g.y + Math.floor(i / 3) * cell + cell / 2] as Pt);
  return coveredAt(hands, centers, cell, cell * guide.sampleFrac, width, height);
}
