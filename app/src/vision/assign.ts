// Assigns a color to every scanned sticker so that each color gets exactly 9 stickers, minimising the total
// color distance (Hungarian algorithm). One ambiguous red/orange sticker gets fixed by the other 53.
// Two symmetric errors (a red read as orange and an orange read as red) keep the counts right and are
// caught later by the piece validation in cubeNet.ts.
import type { Lab } from "./color";
import { COLORS, type CubeColor, METRICS, type Metric } from "./classifier";

// Minimum-cost perfect matching on a square cost matrix. Returns, for each row, the assigned column.
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[col] = row matched to col (1-based)
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const result = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]) result[p[j] - 1] = j - 1;
  return result;
}

export interface StickerSample {
  lab: Lab;
  // Calibrated reference colors for the guide position this sticker was read at.
  refs: Record<CubeColor, Lab>;
}

// Returns the color of each sample with exactly `samples.length / 6` stickers per color.
export function assignColors(samples: StickerSample[], metric: Metric = "de76"): CubeColor[] {
  const perColor = samples.length / COLORS.length;
  if (!Number.isInteger(perColor)) throw new Error("O número de adesivos precisa ser múltiplo de 6.");
  const distance = METRICS[metric];
  // Column k*perColor + m is "the m-th sticker of color k".
  const cost = samples.map((s) => COLORS.flatMap((c) => Array(perColor).fill(distance(s.lab, s.refs[c]))));
  return hungarian(cost).map((col) => COLORS[Math.floor(col / perColor)]);
}
