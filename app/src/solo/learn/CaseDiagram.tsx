// Case pictures in SVG. OLL/PLL: top view of the last layer with the side stickers (OLL shows only where the
// yellow is). F2L: isometric view of the U, F and R faces from the front-right corner, with only the pair and
// the centers in color.
import { COLOR_INFO, type CubeColor } from "../../vision/classifier";
import type { CubeNet } from "../../vision/cubeNet";
import { type StudyCase, f2lHighlight, lastLayerView } from "./cases";

const GRAY = "var(--case-gray)";
const fill = (c: CubeColor) => COLOR_INFO[c].swatch;

interface Props {
  c: StudyCase;
  net: CubeNet;
  size?: number;
}

export function CaseDiagram({ c, net, size = 96 }: Props) {
  if (c.set === "f2l") return <F2lDiagram net={net} highlight={f2lHighlight(c)} size={size} />;
  return <LastLayerDiagram net={net} size={size} orientationOnly={c.set === "oll"} />;
}

function LastLayerDiagram({ net, size, orientationOnly }: { net: CubeNet; size: number; orientationOnly: boolean }) {
  const view = lastLayerView(net);
  const color = (c: CubeColor) => (orientationOnly ? (c === "Y" ? fill("Y") : GRAY) : fill(c));
  // 3x3 cells of 10 units, side strips 4 units thick, 1 unit gaps.
  const cell = 10;
  const strip = 4;
  const gap = 1;
  const origin = strip + gap;
  const rects: { x: number; y: number; w: number; h: number; c: CubeColor }[] = [];
  view.u.forEach((c, i) => rects.push({ x: origin + (i % 3) * cell, y: origin + Math.floor(i / 3) * cell, w: cell, h: cell, c }));
  for (let i = 0; i < 3; i++) {
    rects.push({ x: origin + i * cell, y: 0, w: cell, h: strip, c: view.back[i] });
    rects.push({ x: origin + i * cell, y: origin + 3 * cell + gap, w: cell, h: strip, c: view.front[i] });
    rects.push({ x: 0, y: origin + i * cell, w: strip, h: cell, c: view.left[i] });
    rects.push({ x: origin + 3 * cell + gap, y: origin + i * cell, w: strip, h: cell, c: view.right[i] });
  }
  const total = 2 * origin + 3 * cell;
  return (
    <svg className="case-diagram" viewBox={`0 0 ${total} ${total}`} width={size} height={size} aria-hidden>
      {rects.map((r, i) => (
        <rect key={i} x={r.x + 0.4} y={r.y + 0.4} width={r.w - 0.8} height={r.h - 0.8} rx={1} fill={color(r.c)} stroke="var(--case-edge)" strokeWidth={0.4} />
      ))}
    </svg>
  );
}

// Isometric axes from the front-top-right corner O: along the top edge of F (to the left and up), along the
// top edge of R (to the right and up) and down.
const COS = Math.cos(Math.PI / 6);
const LEFT_UP: [number, number] = [-COS, -0.5];
const RIGHT_UP: [number, number] = [COS, -0.5];
const DOWN: [number, number] = [0, 1];

function F2lDiagram({ net, highlight, size }: { net: CubeNet; highlight: Record<"U" | "F" | "R", boolean[]>; size: number }) {
  const unit = 10;
  // U rises 3 units along each upward axis (3 × 0.5 + 3 × 0.5), so O sits 3 units below the top.
  const O: [number, number] = [3 * COS * unit + 1, 3 * unit + 1];
  const at = (a: [number, number], ka: number, b: [number, number], kb: number): string =>
    `${O[0] + (a[0] * ka + b[0] * kb) * unit},${O[1] + (a[1] * ka + b[1] * kb) * unit}`;
  const quad = (a: [number, number], a0: number, b: [number, number], b0: number) =>
    [at(a, a0, b, b0), at(a, a0 + 1, b, b0), at(a, a0 + 1, b, b0 + 1), at(a, a0, b, b0 + 1)].join(" ");

  const polys: { points: string; c: CubeColor | null }[] = [];
  const pick = (face: "U" | "F" | "R", i: number) => (highlight[face][i] ? net[face][i] : null);
  for (let i = 0; i < 9; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    // F: column 2 touches O. R: column 0 touches O. U: row 2 (front) and column 2 (right) touch O.
    polys.push({ points: quad(LEFT_UP, 2 - col, DOWN, row), c: pick("F", i) });
    polys.push({ points: quad(RIGHT_UP, col, DOWN, row), c: pick("R", i) });
    polys.push({ points: quad(LEFT_UP, 2 - col, RIGHT_UP, 2 - row), c: pick("U", i) });
  }
  const w = 6 * COS * unit + 2;
  const h = 6 * unit + 2;
  return (
    <svg className="case-diagram" viewBox={`0 0 ${w} ${h}`} width={size} height={size} aria-hidden>
      {polys.map((p, i) => (
        <polygon key={i} points={p.points} fill={p.c ? fill(p.c) : GRAY} stroke="var(--case-edge)" strokeWidth={0.8} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
